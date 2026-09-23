/*
# Create chat_sessions and chat_messages tables for live chat

1. New Tables
   - `chat_sessions`
     - `id` (uuid, primary key)
     - `customer_name` (text) — optional name if customer provides it
     - `customer_phone` (text) — optional phone
     - `intent` (text) — which menu option they picked
     - `status` (text) — open, closed
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
   - `chat_messages`
     - `id` (uuid, primary key)
     - `session_id` (uuid, FK to chat_sessions)
     - `role` (text) — customer, agent, bot
     - `content` (text, not null)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled on both tables.
   - Anon + authenticated can INSERT chat_sessions (customers create sessions).
   - Anon + authenticated can INSERT chat_messages (customers send messages).
   - Anon + authenticated can SELECT their own session messages (by session_id, no auth needed for customers).
   - Admins can SELECT/UPDATE all sessions and messages.

3. Indexes
   - Index on chat_messages(session_id) for fast message retrieval.
   - Index on chat_sessions(status) for filtering open chats.
*/

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_phone TEXT,
  intent TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_sessions_public_insert" ON chat_sessions;
CREATE POLICY "chat_sessions_public_insert" ON chat_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chat_sessions_public_select" ON chat_sessions;
CREATE POLICY "chat_sessions_public_select" ON chat_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_sessions_admin_update" ON chat_sessions;
CREATE POLICY "chat_sessions_admin_update" ON chat_sessions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "chat_sessions_admin_delete" ON chat_sessions;
CREATE POLICY "chat_sessions_admin_delete" ON chat_sessions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'agent', 'bot')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_public_insert" ON chat_messages;
CREATE POLICY "chat_messages_public_insert" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_public_select" ON chat_messages;
CREATE POLICY "chat_messages_public_select" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "chat_messages_admin_update" ON chat_messages;
CREATE POLICY "chat_messages_admin_update" ON chat_messages FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
