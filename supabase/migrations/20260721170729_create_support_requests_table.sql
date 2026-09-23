/*
# Create support_requests table

1. New Tables
   - `support_requests`
     - `id` (uuid, primary key)
     - `email` (text, nullable) — customer email
     - `whatsapp` (text, nullable) — customer WhatsApp number
     - `question` (text, not null) — the customer's question
     - `category` (text) — auto-classified category from the chatbot
     - `status` (text) — open, in_progress, resolved
     - `created_at` (timestamptz)

2. Security
   - RLS enabled.
   - Public (anon + authenticated) can INSERT (customers submit from chatbot).
   - Only authenticated admins can SELECT/UPDATE (agents review requests).
*/

CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  whatsapp TEXT,
  question TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT at_least_one_contact CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_requests_public_insert" ON support_requests;
CREATE POLICY "support_requests_public_insert" ON support_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "support_requests_admin_select" ON support_requests;
CREATE POLICY "support_requests_admin_select" ON support_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "support_requests_admin_update" ON support_requests;
CREATE POLICY "support_requests_admin_update" ON support_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "support_requests_admin_delete" ON support_requests;
CREATE POLICY "support_requests_admin_delete" ON support_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
