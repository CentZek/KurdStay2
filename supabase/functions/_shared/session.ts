import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Always validate the opaque session through the database. A supplied user ID
// or the public project API key is not proof of identity.
export function requestClient(req: Request) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: {
      "x-stay-session": req.headers.get("x-stay-session") || "",
      "x-stay-visitor": req.headers.get("x-stay-visitor") || "",
    } },
    auth: { persistSession: false },
  });
}

export async function authenticateUser(req: Request): Promise<{ id: string; role: string } | null> {
  const { data, error } = await requestClient(req).rpc("current_profile");
  return error ? null : data;
}
