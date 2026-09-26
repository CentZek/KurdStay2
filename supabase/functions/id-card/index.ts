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

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResp(msg: string, status = 400) {
  return jsonResp({ error: msg }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const user = await authenticateUser(req);
    if (!user) {
      return errorResp("Not authenticated", 401);
    }

    if (action === "upload" && req.method === "POST") {
      return await handleUpload(req, user);
    }

    if (action === "view") {
      return await handleView(req, user);
    }

    return errorResp("Invalid action");
  } catch (err) {
    console.error("id-card error:", err);
    return errorResp((err as Error).message, 500);
  }
});

async function handleUpload(
  req: Request,
  user: { id: string; role: string },
) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const targetUserId = formData.get("user_id") as string | null;

  if (!file) {
    return errorResp("No file provided");
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return errorResp("Only JPEG, PNG, and WebP images are allowed");
  }

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return errorResp("File must be smaller than 10 MB");
  }

  const ownerId = targetUserId && user.role === "admin" ? targetUserId : user.id;

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${ownerId}/id-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from("id-cards")
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (upErr) {
    console.error("Upload error:", upErr);
    return errorResp("Failed to upload file", 500);
  }

  const { error: saveErr } = await supabase
    .from("profiles")
    .update({ id_card_url: path })
    .eq("id", ownerId);

  if (saveErr) {
    console.error("Profile update error:", saveErr);
    return errorResp("Failed to save file reference", 500);
  }

  const { data: signed } = await supabase.storage
    .from("id-cards")
    .createSignedUrl(path, 3600);

  return jsonResp({
    success: true,
    path,
    signed_url: signed?.signedUrl || null,
  });
}

async function handleView(
  req: Request,
  user: { id: string; role: string },
) {
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("user_id");

  const viewingId = targetUserId || user.id;

  if (viewingId !== user.id && user.role !== "admin") {
    return errorResp("You can only view your own ID card", 403);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id_card_url")
    .eq("id", viewingId)
    .maybeSingle();

  if (!profile?.id_card_url) {
    return jsonResp({ signed_url: null });
  }

  const { data: signed } = await supabase.storage
    .from("id-cards")
    .createSignedUrl(profile.id_card_url, 3600);

  return jsonResp({
    signed_url: signed?.signedUrl || null,
  });
}
