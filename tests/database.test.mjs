import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const db = new PGlite({ extensions: { pgcrypto } })
const hotel = '10000000-0000-0000-0000-000000000001'
const room = '20000000-0000-0000-0000-000000000001'
const otherHotel = '10000000-0000-0000-0000-000000000002'
const visitor = 'guest-secret-with-at-least-thirty-two-characters'
let adminToken, ownerToken, customerToken, customerId, bookingId
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value
async function identity(token = '', guest = visitor) {
  await db.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-stay-session': token, 'x-stay-visitor': guest })])
  await db.exec('SET ROLE anon')
}
const quoteSQL = `SELECT get_booking_quote($1,$2,current_date+10,current_date+12,$3,$4) AS value`
const createSQL = `SELECT create_booking($1,$2,$3,current_date+10,current_date+12,2,1,'Guest','guest@example.test','', '', $4) AS value`

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
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  await db.exec(`
    UPDATE profiles SET password_hash = crypt('test-admin-password', gen_salt('bf')) WHERE username = 'admin';
    UPDATE profiles SET password_hash = crypt('test-owner-password', gen_salt('bf')) WHERE username = 'hotel';
    INSERT INTO hotels(id,name,location,city,owner_id,profit_margin_percentage) VALUES
      ('${hotel}','Test hotel','Center','Erbil','b0000000-0000-0000-0000-000000000002',10),
      ('${otherHotel}','Other hotel','Center','Erbil',NULL,10);
    INSERT INTO room_types(id,hotel_id,name,max_guests,base_price) VALUES ('${room}','${hotel}','Double',2,100);
    INSERT INTO room_availability(room_type_id,date,available_rooms,base_price_override)
      VALUES ('${room}',current_date+10,2,150),('${room}',current_date+11,2,NULL);
  `)
  await identity()
  adminToken = (await value(`SELECT login('admin','test-admin-password') AS value`)).session_token
  ownerToken = (await value(`SELECT login('hotel','test-owner-password') AS value`)).session_token
  const customer = await value(`SELECT register_user('guest','password123','Guest') AS value`)
  customerToken = customer.session_token
  customerId = customer.user.id
})
after(async () => { await db.close() })

test('anonymous callers cannot read profiles, passwords or bookings, or mutate hotels', async () => {
  await identity()
  assert.equal((await db.query('SELECT id FROM profiles')).rows.length, 0)
  assert.equal((await db.query('SELECT id FROM bookings')).rows.length, 0)
  await assert.rejects(db.query('SELECT password_hash FROM profiles'), /permission denied/)
  await assert.rejects(db.query('SELECT plain_password FROM profiles'), /permission denied/)
  assert.equal((await db.query(`UPDATE hotels SET name='Hacked' RETURNING id`)).rows.length, 0)
  await assert.rejects(value(`SELECT register_user('evil','password123','Evil',NULL,NULL,'admin') AS value`), /Not authorized/)
  await assert.rejects(value(`SELECT register_user('evil','password123','Evil',NULL,NULL,'hotel_owner') AS value`), /Not authorized/)
  await assert.rejects(value(`SELECT update_user_credentials($1,'guest','Evil',NULL,'changed') AS value`, [customerId]), /Not authorized/)
})

test('validated sessions scope profiles, manager access and role changes', async () => {
  await identity('forged-session-with-at-least-thirty-two-characters')
  assert.equal(await value('SELECT current_profile() AS value'), null)
  await identity(customerToken)
  assert.equal((await value('SELECT current_profile() AS value')).id, customerId)
  await assert.rejects(db.query(`UPDATE profiles SET role='admin' WHERE id=$1`, [customerId]), /Cannot change role/)
  await identity(ownerToken)
  assert.equal(await value('SELECT app_manages_hotel($1) AS value', [hotel]), true)
  assert.equal(await value('SELECT app_manages_hotel($1) AS value', [otherHotel]), false)
  await assert.rejects(db.query(`INSERT INTO room_types(hotel_id,name,base_price) VALUES($1,'Intruder',1)`, [otherHotel]), /row-level security/)
  await identity(adminToken)
  assert.equal((await value(`SELECT register_user('newmanager','password123','Manager',NULL,NULL,'hotel_owner') AS value`)).success, true)
})

test('quotes include nightly overrides, margin and multi-room guest capacity', async () => {
  await identity()
  const quote = await value(quoteSQL, [hotel, room, 4, 2])
  assert.equal(quote.nights, 2)
  assert.equal(quote.basePriceTotal, 500)
  assert.equal(quote.finalPriceTotal, 550)
  await assert.rejects(value(quoteSQL, [hotel, room, 3, 1]), /INVALID_CAPACITY/)
  await assert.rejects(value(quoteSQL, [hotel, room, 2, 0]), /INVALID_CAPACITY/)
  await assert.rejects(value(`SELECT get_booking_quote($1,$2,current_date-1,current_date+1,2,1) AS value`, [hotel,room]), /INVALID_DATES/)
  await assert.rejects(value(`SELECT get_booking_quote($1,$2,current_date+10,current_date+13,2,1) AS value`, [hotel,room]), /ROOM_UNAVAILABLE/)
  await assert.rejects(value(quoteSQL, [otherHotel, room, 2, 1]), /PROPERTY_UNAVAILABLE/)
})

test('booking creation rejects forged prices, retries once, and does not oversell', async () => {
  await identity(customerToken)
  const request = '30000000-0000-0000-0000-000000000001'
  await assert.rejects(value(createSQL, [request,hotel,room,1]), /PRICE_CHANGED/)
  bookingId = await value(createSQL, [request,hotel,room,275])
  assert.equal(await value(createSQL, [request,hotel,room,275]), bookingId)
  assert.equal((await db.query('SELECT id FROM bookings')).rows.length, 1)
  await identity('', 'another-guest-secret-with-thirty-two-characters')
  assert.equal((await db.query('SELECT id FROM bookings')).rows.length, 0)
  await assert.rejects(value(createSQL, [request,hotel,room,275]), /Not authorized/)
  await value(createSQL, ['30000000-0000-0000-0000-000000000002',hotel,room,275])
  await assert.rejects(value(createSQL, ['30000000-0000-0000-0000-000000000003',hotel,room,275]), /ROOM_UNAVAILABLE/)
})

test('cancelling releases inventory; historical bookings can still be completed', async () => {
  await identity(ownerToken)
  await db.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [bookingId])
  assert.equal((await value(quoteSQL,[hotel,room,2,1])).availableRooms, 1)
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO bookings(hotel_id,room_type_id,customer_name,customer_email,check_in_date,check_out_date,
    base_price_total,margin_percentage,margin_amount,final_price_total,status) VALUES
    ($1,$2,'Past','past@example.test',current_date-10,current_date-8,200,10,20,220,'confirmed')`,[hotel,room])
  await identity(ownerToken)
  const result = await db.query(`UPDATE bookings SET status='completed' WHERE customer_email='past@example.test' RETURNING id`)
  assert.equal(result.rows.length, 1)
})

test('guest chats are private and guests cannot impersonate agents', async () => {
  await identity()
  const chat = await value(`INSERT INTO chat_sessions(intent) VALUES('other') RETURNING id AS value`)
  await db.query(`INSERT INTO chat_messages(session_id,role,content) VALUES($1,'customer','Hello')`, [chat])
  await assert.rejects(db.query(`INSERT INTO chat_messages(session_id,role,content) VALUES($1,'agent','Fake agent')`, [chat]), /row-level security/)
  await identity('', 'another-guest-secret-with-thirty-two-characters')
  assert.equal((await db.query(`SELECT id FROM chat_messages WHERE session_id=$1`,[chat])).rows.length, 0)
  await identity(adminToken)
  assert.equal((await db.query(`SELECT id FROM chat_messages WHERE session_id=$1`,[chat])).rows.length, 1)
})

test('logout invalidates the session server-side', async () => {
  await identity(customerToken)
  await db.query('SELECT logout()')
  assert.equal(await value('SELECT current_profile() AS value'), null)
})

test('owners can update their images without changing another property', async () => {
  await identity(ownerToken)
  await db.query(`SELECT set_hotel_images($1, ARRAY['https://example.test/photo.jpg'])`, [hotel])
  await assert.rejects(db.query(`SELECT set_hotel_images($1, ARRAY['https://example.test/photo.jpg'])`, [otherHotel]), /Not authorized/)
  await assert.rejects(db.query(`UPDATE room_availability SET available_rooms=0 WHERE room_type_id=$1`, [room]), /lower than reserved/)
})

test('application approval is atomic and idempotent', async () => {
  await identity(adminToken)
  const app = await value(`INSERT INTO accommodation_applications(applicant_id,property_name,city) VALUES($1,'New Stay','Erbil') RETURNING id AS value`, [customerId])
  const id = await value(`SELECT approve_accommodation($1,'Approved') AS value`, [app])
  assert.equal(await value(`SELECT approve_accommodation($1,'Approved') AS value`, [app]), id)
  assert.equal((await db.query(`SELECT id FROM hotels WHERE name='New Stay'`)).rows.length, 1)
  assert.equal((await db.query(`SELECT profile_id FROM hotel_managers WHERE hotel_id=$1`, [id])).rows[0].profile_id, customerId)
})

test('phone codes are rate limited, attempt limited and cannot be reused', async () => {
  await identity()
  await assert.rejects(value(`SELECT prepare_phone_verification($1,'+9647500000000','hash') AS value`, [customerId]), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  assert.equal(await value(`SELECT prepare_phone_verification($1,'+9647500000000','good-hash') AS value`, [customerId]), true)
  assert.equal(await value(`SELECT prepare_phone_verification($1,'+9647500000000','good-hash') AS value`, [customerId]), false)
  for (let i=0;i<5;i++) assert.equal(await value(`SELECT consume_phone_verification($1,'bad-hash') AS value`, [customerId]), false)
  assert.equal(await value(`SELECT consume_phone_verification($1,'good-hash') AS value`, [customerId]), false)
  await db.exec('RESET ROLE')
  await db.query(`UPDATE phone_verifications SET created_at=now()-interval '2 minutes' WHERE profile_id=$1`, [customerId])
  await db.exec('SET ROLE service_role')
  assert.equal(await value(`SELECT prepare_phone_verification($1,'+9647500000000','new-hash') AS value`, [customerId]), true)
  assert.equal(await value(`SELECT consume_phone_verification($1,'new-hash') AS value`, [customerId]), true)
  assert.equal(await value(`SELECT consume_phone_verification($1,'new-hash') AS value`, [customerId]), false)
})

test('notifications can only be claimed once by the trusted service', async () => {
  await identity()
  await assert.rejects(value(`SELECT claim_booking_notification($1,'booking_created') AS value`, [bookingId]), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification($1,'booking_created') AS value`, [bookingId]), true)
  assert.equal(await value(`SELECT claim_booking_notification($1,'booking_created') AS value`, [bookingId]), false)
})

test('reconciled security migrations preserve existing sessions, reservations and verification state', async () => {
  await db.exec('RESET ROLE')
  const tables = ['private.app_sessions', 'private.login_attempts', 'private.booking_notifications',
    'public.profiles', 'public.bookings', 'public.room_availability', 'public.phone_verifications']
  const snapshot = async () => Promise.all(tables.map(async table =>
    (await db.query(`SELECT row_to_json(t)::text AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows))
  const before = await snapshot()
  for (const file of (await readdir('supabase/migrations')).filter(f => /^2026092617.*\.sql$/.test(f)).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  }
  assert.deepEqual(await snapshot(), before)
  await identity(adminToken)
  assert.equal((await value('SELECT current_profile() AS value')).role, 'admin')
  await identity('', 'fresh-browser-secret-with-no-prior-reservations')
  assert.equal((await db.query('SELECT id FROM bookings')).rows.length, 0)
  await assert.rejects(db.query('SELECT password_hash FROM profiles'), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification($1,'booking_created') AS value`, [bookingId]), false)
})
