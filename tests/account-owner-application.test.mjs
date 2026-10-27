import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const db = new PGlite({ extensions: { pgcrypto } })
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value
async function identity(token = '') {
  await db.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-stay-session': token })])
  await db.exec('SET ROLE anon')
}

before(async () => {
  await db.exec(`
    CREATE EXTENSION pgcrypto;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE TABLE auth.users(id uuid PRIMARY KEY, instance_id uuid, email text, encrypted_password text,
      email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, role text, aud text,
      created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text);
    CREATE TABLE auth.identities(id uuid, user_id uuid, identity_data jsonb, provider text, provider_id text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid, bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public, storage TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `)
  for (const file of (await readdir('supabase/migrations')).filter(file => file.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
})

after(async () => { await db.close() })

test('account applicants resubmit the same info_requested application without weakening reviews', async () => {
  await db.query(`UPDATE profiles SET password_hash=crypt('admin-test-password',gen_salt('bf')) WHERE username='admin'`)
  await identity()
  const adminToken = (await value(`SELECT login('admin','admin-test-password') AS value`)).session_token
  const applicant = await value(`SELECT register_user('resubmit-host','password123','Resubmit Host') AS value`)
  const other = await value(`SELECT register_user('other-host','password123','Other Host') AS value`)

  await identity(applicant.session_token)
  const id = await value(`INSERT INTO accommodation_applications(applicant_id,property_name,city,address)
    VALUES($1,'Original Stay','Erbil','Old address') RETURNING id AS value`, [applicant.user.id])
  await identity(adminToken)
  const reviewTime = '2026-09-28T10:00:00Z'
  await db.query(`UPDATE accommodation_applications SET status='info_requested',admin_notes='Add a cover photo',
    reviewed_by=$1,reviewed_at=$2 WHERE id=$3`, [adminToken ? (await value(`SELECT current_profile() AS value`)).id : null, reviewTime, id])

  await identity(applicant.session_token)
  await assert.rejects(db.query(`UPDATE accommodation_applications SET status='pending',reviewed_by=NULL,admin_notes=NULL WHERE id=$1`, [id]), /Invalid application resubmission/)
  await assert.rejects(db.query(`UPDATE accommodation_applications SET id=gen_random_uuid(),status='pending' WHERE id=$1`, [id]), /Invalid application resubmission/)
  await identity(other.session_token)
  assert.equal((await db.query(`UPDATE accommodation_applications SET status='pending',property_name='Stolen' WHERE id=$1 RETURNING id`, [id])).rows.length, 0)

  await identity(applicant.session_token)
  const updated = await db.query(`UPDATE accommodation_applications SET status='pending',property_name='Improved Stay',
    address='New address',images=ARRAY['https://example.test/cover.jpg'] WHERE id=$1 AND status='info_requested'
    RETURNING id,status,property_name,reviewed_by,reviewed_at,admin_notes,applicant_id,hotel_id`, [id])
  assert.equal(updated.rows.length, 1)
  assert.equal(updated.rows[0].id, id)
  assert.equal(updated.rows[0].status, 'pending')
  assert.equal(updated.rows[0].property_name, 'Improved Stay')
  assert.equal(updated.rows[0].admin_notes, 'Add a cover photo')
  assert.equal(updated.rows[0].applicant_id, applicant.user.id)
  assert.equal(updated.rows[0].hotel_id, null)
  assert.ok(updated.rows[0].reviewed_by)
  assert.ok(updated.rows[0].reviewed_at)
  assert.equal(await value(`SELECT count(*)::int AS value FROM accommodation_applications WHERE applicant_id=$1`, [applicant.user.id]), 1)
  assert.equal((await db.query(`UPDATE accommodation_applications SET status='rejected' WHERE id=$1 RETURNING id`, [id])).rows.length, 0)

  await identity(adminToken)
  await db.query(`UPDATE accommodation_applications SET status='rejected' WHERE id=$1`, [id])
  await identity(applicant.session_token)
  assert.equal((await db.query(`UPDATE accommodation_applications SET status='pending' WHERE id=$1 RETURNING id`, [id])).rows.length, 0)
})
