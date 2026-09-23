import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

async function handleSend(profileId: string, rawPhone: string) {
  if (!profileId || !rawPhone) {
    return json({ success: false, error: "Missing profile or phone" }, 400);
  }

  const phone = normalizePhone(rawPhone);

  await supabase.from("profiles").update({ phone }).eq("id", profileId);

  // Invalidate old codes for this profile+phone
  await supabase
    .from("phone_verification_codes")
    .update({ verified: true })
    .eq("profile_id", profileId)
    .eq("phone", phone)
    .eq("verified", false);

  const code = generateCode();

  const { error: insertError } = await supabase
    .from("phone_verification_codes")
    .insert({ profile_id: profileId, phone, code });

  if (insertError) {
    console.error("Failed to store verification code:", insertError);
    return json({ success: false, error: "Could not generate verification code." }, 500);
  }

  const result = await sendWhatsAppCode(phone, code);

  if (!result.success) {
    if (result.error === "not_configured") {
      return json({
        success: false,
        code: "not_configured",
        error: "WhatsApp verification is not set up yet.",
      }, 503);
    }
    return json({
      success: false,
      error: result.error || "Could not send verification. Check the number and try again.",
    }, 502);
  }

  return json({ success: true, phone });
}

async function handleVerify(profileId: string, userCode: string, rawPhone: string) {
  if (!profileId || !userCode) {
    return json({ success: false, error: "Missing profile or code" }, 400);
  }

  let phone = rawPhone;
  if (!phone) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", profileId)
      .maybeSingle();
    phone = profile?.phone;
  }

  if (!phone) {
    return json({ success: false, error: "No phone number found. Please request a new code." }, 400);
  }

  phone = normalizePhone(phone);

  const { data: record } = await supabase
    .from("phone_verification_codes")
    .select("id, code, expires_at")
    .eq("profile_id", profileId)
    .eq("phone", phone)
    .eq("verified", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!record) {
    return json({ success: false, error: "No pending verification. Please request a new code." }, 400);
  }

  if (new Date(record.expires_at) < new Date()) {
    await supabase
      .from("phone_verification_codes")
      .update({ verified: true })
      .eq("id", record.id);
    return json({ success: false, error: "Code expired. Please request a new one." }, 400);
  }

  if (record.code !== userCode.trim()) {
    return json({ success: false, error: "Incorrect code. Please try again." }, 400);
  }

  // Mark code as used
  await supabase
    .from("phone_verification_codes")
    .update({ verified: true })
    .eq("id", record.id);

  // Mark phone as verified in the profile
  await supabase
    .from("profiles")
    .update({ phone_verified: true, phone_verified_at: new Date().toISOString(), phone })
    .eq("id", profileId);

  return json({ success: true, phone });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "send") {
      return await handleSend(body.profile_id, body.phone);
    }
    if (action === "verify") {
      return await handleVerify(body.profile_id, body.code, body.phone);
    }
    return json({ success: false, error: "Unknown action" }, 400);
  } catch (err) {
    console.error("phone-verification error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
