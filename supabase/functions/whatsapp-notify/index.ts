import { authenticateUser, requestClient } from "../_shared/session.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Stay-Session, X-Stay-Visitor",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Twilio sender ──────────────────────────────────────────────────

async function sendTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>,
): Promise<{ sent: boolean; error?: string; twilioStatus?: number; retryable: boolean }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !fromNumber) {
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_WHATSAPP_FROM",
    ].filter(Boolean);
    return { sent: false, error: `Missing env vars: ${missing.join(", ")}`, retryable: false };
  }

  if (!contentSid) {
    return { sent: false, error: "No ContentSid provided", retryable: false };
  }

  const toFmt = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const fromFmt = fromNumber.startsWith("whatsapp:")
    ? fromNumber
    : `whatsapp:${fromNumber}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.append("To", toFmt);
  params.append("From", fromFmt);
  params.append("ContentSid", contentSid);
  params.append("ContentVariables", JSON.stringify(variables));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Twilio error (${response.status}):`, errorBody);
      return {
        sent: false, error: errorBody, twilioStatus: response.status,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    const result = await response.json();
    console.log(`WhatsApp template sent to ${toFmt}, SID: ${result.sid}`);
    return { sent: true, retryable: false };
  } catch (err) {
    console.error("Failed to send WhatsApp:", err);
    return { sent: false, error: (err as Error).message, retryable: true };
  }
}

// ── Phone normalisation ─────────────────────────────────────────────

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("00")) {
      cleaned = "+" + cleaned.slice(2);
    } else if (cleaned.startsWith("0")) {
      cleaned = "+964" + cleaned.slice(1);
    } else {
      cleaned = "+" + cleaned;
    }
  }
  return cleaned;
}

// ── Data helpers ────────────────────────────────────────────────────

async function getBookingDetails(bookingId: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, customer_name, customer_phone, customer_email, check_in_date, check_out_date, guests, rooms, final_price_total, status, notes, hotel_id, room_type_id, hotels(id, name, city, phone, currency), room_types(name)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) console.error("getBookingDetails error:", error);
  return data;
}

async function getHotelManagerPhones(hotelId: string): Promise<string[]> {
  const { data } = await supabase
    .from("hotel_managers")
    .select("profile_id, profiles(phone)")
    .eq("hotel_id", hotelId);

  const phones: string[] = [];
  if (data) {
    for (const manager of data) {
      const profile = (manager as any).profiles;
      if (profile?.phone) phones.push(profile.phone);
    }
  }

  const { data: hotel } = await supabase
    .from("hotels")
    .select("phone")
    .eq("id", hotelId)
    .maybeSingle();

  if (hotel?.phone && !phones.includes(hotel.phone)) {
    phones.push(hotel.phone);
  }
  return phones;
}

function formatPrice(amount: number, currency: string): string {
  if (currency === "IQD") return `${Math.round(amount).toLocaleString()} IQD`;
  return `$${Math.round(amount)}`;
}

// ── Notification handlers ───────────────────────────────────────────

async function handleBookingCreated(bookingId: string) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found", retryable: false, results: [] };

  const hotel = (booking as any).hotels;
  const roomType = (booking as any).room_types;
  const managerPhones = await getHotelManagerPhones(booking.hotel_id);
  const results: { recipient: string; sent: boolean; error?: string; twilioStatus?: number; retryable: boolean }[] = [];

  const tplPending = Deno.env.get("TWILIO_TPL_BOOKING_PENDING") || "HXfc04cd14ac10e8f656b0d6d2fffa888a";
  if (booking.customer_phone) {
    const normalized = normalizePhone(booking.customer_phone);
    const res = await sendTemplate(normalized, tplPending, {
      "1": booking.customer_name,
      "2": hotel?.name || "",
      "3": booking.check_in_date,
      "4": booking.check_out_date,
    });
    results.push({ recipient: `customer(${normalized})`, ...res });
  } else {
    results.push({ recipient: "customer", sent: false, error: "No customer phone", retryable: false });
  }

  const tplManager = Deno.env.get("TWILIO_TPL_NEW_BOOKING_MANAGER") || "HX118d94bd96372a619d241a3af835a796";
  if (managerPhones.length === 0) {
    results.push({ recipient: "manager", sent: false, error: "No manager phones found", retryable: false });
  }
  for (const phone of managerPhones) {
    const normalized = normalizePhone(phone);
    const res = await sendTemplate(normalized, tplManager, {
      "1": hotel?.name || "",
      "2": booking.customer_name,
      "3": booking.check_in_date,
      "4": booking.check_out_date,
    });
    results.push({ recipient: `manager(${normalized})`, ...res });
  }

  return {
    success: results.every(result => result.sent), booking_id: bookingId, results,
    retryable: results.every(result => !result.sent) && results.some(result => result.retryable),
    error: results.filter(result => !result.sent).map(result => `${result.recipient}: ${result.error}`).join("; ") || undefined,
  };
}

async function handleBookingConfirmed(bookingId: string) {
  const booking = await getBookingDetails(bookingId);
  if (!booking) return { success: false, error: "Booking not found", retryable: false, results: [] };

  const hotel = (booking as any).hotels;
  const roomType = (booking as any).room_types;
  const price = formatPrice(booking.final_price_total, hotel?.currency || "USD");

  const tplConfirmed = Deno.env.get("TWILIO_TPL_BOOKING_CONFIRMED") || "HX41493c47f6d586964b7ca4ecc44f9299";
  if (!booking.customer_phone) {
    return { success: false, error: "No customer phone number", retryable: false, results: [] };
  }

  const normalized = normalizePhone(booking.customer_phone);
  const res = await sendTemplate(normalized, tplConfirmed, {
    "1": booking.customer_name,
    "2": hotel?.name || "",
    "3": hotel?.city || "",
    "4": roomType?.name || "",
    "5": booking.check_in_date,
    "6": booking.check_out_date,
    "7": `${booking.guests}`,
    "8": `${booking.rooms}`,
    "9": price,
  });

  return {
    success: res.sent, booking_id: bookingId, retryable: res.retryable,
    error: res.error, results: [{ recipient: `customer(${normalized})`, ...res }],
  };
}

// ── Test handler ───────────────────────────────────────────────────

async function handleTest(phone: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  const diagnostics: Record<string, string | boolean> = {
    has_account_sid: !!accountSid,
    account_sid_prefix: accountSid ? accountSid.substring(0, 6) + "..." : "MISSING",
    has_auth_token: !!authToken,
    has_from_number: !!fromNumber,
    from_number: fromNumber || "MISSING",
  };

  const tplPending = Deno.env.get("TWILIO_TPL_BOOKING_PENDING") || "HXfc04cd14ac10e8f656b0d6d2fffa888a";
  const normalized = normalizePhone(phone);

  const res = await sendTemplate(normalized, tplPending, {
    "1": "Test User",
    "2": "Test Hotel",
    "3": "2026-09-01",
    "4": "2026-09-03",
  });

  return { diagnostics, normalized_phone: normalized, template_sid: tplPending, result: res };
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const scoped = requestClient(req);
    const user = await authenticateUser(req);
    if (payload.type === "test" && user?.role !== "admin") return jsonResp({ error: "Not authorized" }, 403);
    if (payload.type !== "test") {
      const { data: booking } = await scoped.from("bookings").select("id, hotel_id, status").eq("id", payload.booking_id).maybeSingle();
      if (!booking) return jsonResp({ error: "Not authorized" }, 403);
      if (payload.type === "booking_confirmed") {
        const { data: manages } = await scoped.rpc("app_manages_hotel", { target: booking.hotel_id });
        if (!manages || booking.status !== "confirmed") return jsonResp({ error: "Not authorized" }, 403);
      }
    }

    if (payload.type === "test") {
      const result = await handleTest(payload.phone || "+9647505392863");
      return jsonResp(result);
    }

    if (!payload.type || !payload.booking_id) {
      return jsonResp({ error: "Missing type or booking_id" }, 400);
    }

    if (!["booking_created", "booking_confirmed"].includes(payload.type)) return jsonResp({ error: "Unknown notification type" }, 400);
    const { data: claimed, error: claimError } = await supabase.rpc("claim_booking_notification_v2", {
      p_booking: payload.booking_id, p_kind: payload.type,
    });
    if (claimError) return jsonResp({ error: "Notification unavailable" }, 500);
    if (!claimed) {
      const { data: state } = await supabase.rpc("booking_notification_status_v2", {
        p_booking: payload.booking_id, p_kind: payload.type,
      });
      if (state?.status === "sent") return jsonResp({ success: true, already_processed: true });
      return jsonResp({
        success: false, error: state?.status === "sending" ? "Notification already in progress" : "Notification is not ready for retry",
        notification: state ? { status: state.status, next_retry_at: state.next_retry_at } : null,
      }, 409);
    }

    let result;
    try {
      switch (payload.type) {
        case "booking_created":
          result = await handleBookingCreated(payload.booking_id);
          break;
        case "booking_confirmed":
          result = await handleBookingConfirmed(payload.booking_id);
          break;
        default:
          return jsonResp({ error: `Unknown type: ${payload.type}` }, 400);
      }
    } catch (err) {
      await supabase.rpc("complete_booking_notification_v2", {
        p_booking: payload.booking_id, p_kind: payload.type, p_success: false,
        p_error: (err as Error).message, p_retryable: false,
      });
      throw err;
    }

    const { data: completed, error: completionError } = await supabase.rpc("complete_booking_notification_v2", {
      p_booking: payload.booking_id, p_kind: payload.type, p_success: result.success,
      p_error: result.error || null, p_retryable: result.retryable,
    });
    if (completionError || !completed) return jsonResp({ success: false, error: "Could not save notification result" }, 500);
    return jsonResp({
      success: result.success, booking_id: payload.booking_id,
      results: result.results.map(({ sent, retryable }) => ({ sent, retryable })),
      error: result.success ? undefined : "Notification could not be sent", retryable: result.retryable,
    });
  } catch (err) {
    console.error("Notification error:", err);
    return jsonResp({ error: (err as Error).message }, 500);
  }
});
