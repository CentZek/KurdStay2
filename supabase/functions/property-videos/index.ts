import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { authenticateUser } from "../_shared/session.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info, X-Stay-Session, X-Stay-Visitor" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const types: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const user = await authenticateUser(req);
    if (!user) return respond({ error: "NOT_AUTHENTICATED" }, 401);
    const body = await req.json();
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bucket = client.storage.from("property-videos");
    if (body.action === "create") {
      if (!types[body.type] || !Number.isInteger(body.size) || body.size < 1 || body.size > 52428800) {
        return respond({ error: "INVALID_VIDEO" }, 400);
      }
      const id = crypto.randomUUID();
      const path = `${user.id}/${id}.${types[body.type]}`;
      const posterPath = `${user.id}/${id}.jpg`;
      const url = bucket.getPublicUrl(path).data.publicUrl;
      const poster = bucket.getPublicUrl(posterPath).data.publicUrl;
      const { error } = await client.rpc("reserve_property_video", {
        p_id: id, p_owner: user.id, p_path: path, p_url: url, p_poster: poster, p_size: body.size,
      });
      if (error) return respond({ error: error.message.includes("VIDEO_UPLOAD_LIMIT") ? "VIDEO_UPLOAD_LIMIT" : "UPLOAD_FAILED" }, error.message.includes("VIDEO_UPLOAD_LIMIT") ? 429 : 500);
      const [videoToken, posterToken] = await Promise.all([
        bucket.createSignedUploadUrl(path), bucket.createSignedUploadUrl(posterPath),
      ]);
      if (videoToken.error || posterToken.error) return respond({ error: "UPLOAD_FAILED" }, 500);
      return respond({ id, path, posterSignedUrl: posterToken.data.signedUrl, token: videoToken.data.token });
    }
    if (body.action === "complete" && typeof body.id === "string") {
      const { data: media, error } = await client.from("property_video_uploads").select("*").eq("id", body.id).eq("owner_id", user.id).maybeSingle();
      if (error || !media) return respond({ error: "NOT_FOUND" }, 404);
      if (!media.ready) {
        const { data: files, error: listError } = await bucket.list(user.id, { search: media.id });
        const video = files?.find(f => `${user.id}/${f.name}` === media.path);
        const poster = files?.find(f => f.name === `${media.id}.jpg`);
        if (listError || !video || !poster || Number(video.metadata?.size) !== media.size_bytes ||
          !types[video.metadata?.mimetype] || !media.path.endsWith(`.${types[video.metadata?.mimetype]}`) ||
          poster.metadata?.mimetype !== "image/jpeg" || Number(poster.metadata?.size) > 2097152 || Number(poster.metadata?.size) < 1) {
          return respond({ error: "INVALID_VIDEO" }, 400);
        }
        // Check signatures as well as Storage-enforced MIME and size limits.
        const signature = async (url: string) => {
          const response = await fetch(url, { headers: { Range: "bytes=0-15" } });
          if (!response.ok || !response.body) throw new Error("Unreadable upload");
          const reader = response.body.getReader();
          const { value } = await reader.read();
          await reader.cancel();
          return value?.slice(0,16) || new Uint8Array();
        };
        const [v, p] = await Promise.all([signature(media.url), signature(media.poster_url)]);
        const validVideo = media.path.endsWith(".mp4") ? new TextDecoder().decode(v.slice(4,8)) === "ftyp" :
          v[0] === 0x1a && v[1] === 0x45 && v[2] === 0xdf && v[3] === 0xa3;
        if (!validVideo || p[0] !== 0xff || p[1] !== 0xd8 || p[2] !== 0xff) return respond({ error: "INVALID_VIDEO" }, 400);
        const { error: readyError } = await client.from("property_video_uploads").update({ ready: true }).eq("id", media.id);
        if (readyError) throw readyError;
      }
      return respond({ url: media.url, poster: media.poster_url });
    }
    return respond({ error: "INVALID_ACTION" }, 400);
  } catch { return respond({ error: "UPLOAD_FAILED" }, 500); }
});
