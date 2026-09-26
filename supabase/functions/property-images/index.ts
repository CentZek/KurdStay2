import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { authenticateUser } from "../_shared/session.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info, X-Stay-Session, X-Stay-Visitor" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const user = await authenticateUser(req);
  if (!user) return respond({ error: "Not authenticated" }, 401);
  try {
    const file = (await req.formData()).get("file");
    const types: Record<string,string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    if (!(file instanceof File) || !types[file.type] || file.size > 10 * 1024 * 1024 || file.size === 0) {
      return respond({ error: "Upload a JPG, PNG, WebP or GIF image up to 10 MB." }, 400);
    }
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const path = `${user.id}/${crypto.randomUUID()}.${types[file.type]}`;
    const { error } = await client.storage.from("hotel-images").upload(path, file, { contentType: file.type });
    if (error) return respond({ error: "Upload failed" }, 500);
    return respond({ url: client.storage.from("hotel-images").getPublicUrl(path).data.publicUrl });
  } catch { return respond({ error: "Upload failed" }, 500); }
});
