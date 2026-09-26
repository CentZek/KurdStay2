import { authenticateUser } from "../_shared/session.ts";
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    if (cleaned.startsWith("00")) {
      cleaned = "+" + cleaned.slice(2);
    } else if (cleaned.startsWith("0")) {
      cleaned = "+964" + cleaned.slice(1);
    } else if (cleaned.startsWith("964")) {
      cleaned = "+" + cleaned;
    } else {
      cleaned = "+964" + cleaned;
    }
  }
  return cleaned;
}

function generateCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

async function sendWhatsAppCode(phone: string, code: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const contentSid = Deno.env.get("TWILIO_TPL_VERIFICATION_CODE");

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "not_configured" };
  }

  const toFmt = `whatsapp:${phone}`;
  const fromFmt = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append("To", toFmt);
  params.append("From", fromFmt);

  if (contentSid) {
    params.append("ContentSid", contentSid);
    params.append("ContentVariables", JSON.stringify({ "1": code }));
  } else {
    params.append("Body", `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Twilio send error (${response.status}):`, errorBody);
      return { success: false, error: `WhatsApp send failed (${response.status}): ${errorBody}` };
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to send WhatsApp:", err);
    return { success: false, error: (err as Error).message };
  }
}

async function codeHash(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function handleSend(profileId: string, rawPhone: string) {
  if (typeof rawPhone !== "string") return json({ error: "Invalid phone" }, 400);
  const phone = normalizePhone(rawPhone);
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return json({ error: "Invalid phone" }, 400);
  const code = generateCode();
  const { data, error } = await supabase.rpc("prepare_phone_verification", {
    p_profile: profileId, p_phone: phone, p_hash: await codeHash(code),
  });
  if (error) return json({ error: "Verification unavailable" }, 500);
  if (!data) return json({ error: "Please wait before trying again, or use a different number." }, 429);
  const result = await sendWhatsAppCode(phone, code);
  if (!result.success) return json({ success: false, code: result.error === "not_configured" ? "not_configured" : "send_failed",
    error: "Could not send verification. Please try again later." }, 503);
  return json({ success: true, phone });
}

async function handleVerify(profileId: string, code: string) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return json({ error: "Enter a six-digit code" }, 400);
  const { data, error } = await supabase.rpc("consume_phone_verification", {
    p_profile: profileId, p_hash: await codeHash(code.trim()),
  });
  if (error) return json({ error: "Verification unavailable" }, 500);
  if (!data) return json({ error: "Invalid or expired code. Request a new code after five attempts." }, 400);
  return json({ success: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const user = await authenticateUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);
    const body = await req.json();
    const action = body.action;

    if (action === "send") {
      return await handleSend(user.id, body.phone);
    }
    if (action === "verify") {
      return await handleVerify(user.id, body.code);
    }
    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    console.error("phone-verification error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
