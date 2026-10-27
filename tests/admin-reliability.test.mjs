import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const db = new PGlite({ extensions: { pgcrypto } })
const hotel = '10000000-0000-0000-0000-000000000101'
const room = '20000000-0000-0000-0000-000000000101'
const bookings = [
  '30000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000102',
  '30000000-0000-0000-0000-000000000103',
  '30000000-0000-0000-0000-000000000104',
]
let adminToken, customerToken
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
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')) }
    catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  await db.exec(`
    UPDATE profiles SET password_hash = crypt('test-admin-password', gen_salt('bf')) WHERE username = 'admin';
    INSERT INTO hotels(id,name,location,city,currency,profit_margin_percentage)
      VALUES('${hotel}','Aggregate hotel','Center','Erbil','USD',10);
    INSERT INTO room_types(id,hotel_id,name,max_guests,base_price) VALUES('${room}','${hotel}','Double',2,100);
  `)
  await identity()
  adminToken = (await value(`SELECT login('admin','test-admin-password') AS value`)).session_token
  customerToken = (await value(`SELECT register_user('reliabilityguest','password123','Guest') AS value`)).session_token
  await db.exec('RESET ROLE')
  const statuses = ['confirmed', 'completed', 'pending', 'cancelled']
  for (let i = 0; i < statuses.length; i++) {
    await db.query(`INSERT INTO bookings(id,hotel_id,room_type_id,customer_name,customer_email,check_in_date,check_out_date,
      base_price_total,margin_percentage,margin_amount,final_price_total,status,created_at)
      VALUES($1,$2,$3,$4,'guest@example.test',current_date+10,current_date+12,100,10,$5,110,$6,now()+($7 || ' minutes')::interval)`,
      [bookings[i], hotel, room, `Guest ${i + 1}`, 10 + i, statuses[i], String(i)])
  }
  await db.exec(`SET ROLE anon`)
})

after(async () => { await db.close() })

test('admin dashboard uses exact counts and confirmed plus completed commission', async () => {
  await identity(customerToken)
  await assert.rejects(value('SELECT admin_dashboard_stats() AS value'), /Not authorized/)
  await identity(adminToken)
  const stats = await value('SELECT admin_dashboard_stats() AS value')
  assert.equal(stats.bookings, 4)
  assert.equal(stats.pending, 1)
  assert.equal(stats.confirmed, 2)
  assert.equal(stats.hotels, 1)
  assert.deepEqual(stats.commission, [{
    hotel_id: hotel, hotel_name: 'Aggregate hotel', currency: 'USD', confirmed_count: 2, total_commission: 21,
  }])
})

test('admin booking pages are stable, searchable and have exact aggregate counts', async () => {
  await identity(adminToken)
  const first = await value(`SELECT admin_list_bookings('all','',2,0) AS value`)
  const second = await value(`SELECT admin_list_bookings('all','',2,2) AS value`)
  assert.equal(first.total, 4)
  assert.deepEqual(first.status_counts, { all: 4, pending: 1, confirmed: 1, cancelled: 1, completed: 1 })
  assert.deepEqual([...first.items, ...second.items].map(item => item.id), [bookings[3], bookings[2], bookings[1], bookings[0]])
  const completed = await value(`SELECT admin_list_bookings('completed','Guest 2',25,0) AS value`)
  assert.equal(completed.total, 1)
  assert.equal(completed.items[0].id, bookings[1])
  assert.equal(completed.status_counts.all, 1)
})

test('chat session RPC returns paginated metadata without per-session queries', async () => {
  await db.exec('RESET ROLE')
  const first = await value(`INSERT INTO chat_sessions(intent,status,updated_at) VALUES('other','open',now()) RETURNING id AS value`)
  const second = await value(`INSERT INTO chat_sessions(intent,status,updated_at) VALUES('feedback','closed',now()-interval '1 minute') RETURNING id AS value`)
  await db.query(`INSERT INTO chat_messages(session_id,role,content,created_at) VALUES
    ($1,'customer','older',now()-interval '1 minute'),($1,'agent','latest',now()),($2,'customer','closed message',now())`, [first, second])
  await identity(adminToken)
  const page = await value(`SELECT admin_list_chat_sessions('all',1,0) AS value`)
  assert.equal(page.total, 2)
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0].last_message, 'latest')
  assert.equal(page.items[0].message_count, 2)
  const closed = await value(`SELECT admin_list_chat_sessions('closed',25,0) AS value`)
  assert.equal(closed.total, 1)
  assert.equal(closed.items[0].id, second)
})

test('hotel import creates owner, manager, hotel and rooms atomically after admin authorization', async () => {
  const payload = {
    hotel: { name: 'Imported hotel', city: 'Erbil', location: 'Center', profit_margin_percentage: 12, images: ['https://example.test/cover.jpg'] },
    rooms: [{ name: 'Suite', base_price: 150, max_guests: 3, amenities: ['WiFi'] }],
    owner: { username: 'importedowner', password: 'password123', name: 'Imported Owner', phone: '+9647500000101' },
  }
  await identity(customerToken)
  await assert.rejects(value(`SELECT admin_import_hotel($1,$2,$3,false) AS value`, [payload.hotel, payload.rooms, payload.owner]), /Not authorized/)
  await identity(adminToken)
  const result = await value(`SELECT admin_import_hotel($1,$2,$3,false) AS value`, [payload.hotel, payload.rooms, payload.owner])
  assert.equal(result.success, true)
  assert.equal(result.credentials.username, 'importedowner')
  assert.equal(result.credentials.password, 'password123')
  const saved = await value(`SELECT jsonb_build_object('owner_id',h.owner_id,'manager',m.profile_id,'rooms',count(r.id)) AS value
    FROM hotels h JOIN hotel_managers m ON m.hotel_id=h.id LEFT JOIN room_types r ON r.hotel_id=h.id WHERE h.id=$1 GROUP BY h.owner_id,m.profile_id`, [result.hotel_id])
  assert.equal(saved.owner_id, result.owner_id)
  assert.equal(saved.manager, result.owner_id)
  assert.equal(saved.rooms, 1)
  await identity()
  assert.equal((await value(`SELECT login('importedowner','password123') AS value`)).success, true)

  await identity(adminToken)
  const failedHotel = { ...payload.hotel, name: 'Rolled back hotel' }
  const failedOwner = { ...payload.owner, username: 'rolledbackowner' }
  await assert.rejects(value(`SELECT admin_import_hotel($1,$2,$3,false) AS value`,
    [failedHotel, [{ name: 'Invalid', base_price: 0, max_guests: 2 }], failedOwner]), /Invalid room details/)
  assert.equal(await value(`SELECT count(*)::int AS value FROM hotels WHERE name='Rolled back hotel'`), 0)
  assert.equal(await value(`SELECT count(*)::int AS value FROM profiles WHERE username='rolledbackowner'`), 0)
})

test('notification failures are retryable, bounded and preserve single-claim semantics', async () => {
  await identity()
  await assert.rejects(value(`SELECT complete_booking_notification_v2($1,'booking_created',false,'failed',true) AS value`, [bookings[0]]), /permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[0]]), true)
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[0]]), false)
  assert.equal(await value(`SELECT complete_booking_notification_v2($1,'booking_created',false,'provider timeout',true) AS value`, [bookings[0]]), true)
  let state = await value(`SELECT booking_notification_status_v2($1,'booking_created') AS value`, [bookings[0]])
  assert.equal(state.status, 'failed')
  assert.equal(state.attempts, 1)
  assert.equal(state.last_error, 'provider timeout')
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[0]]), false)
  await db.exec('RESET ROLE')
  await db.query(`UPDATE private.booking_notifications SET next_retry_at=now()-interval '1 second' WHERE booking_id=$1 AND kind='booking_created'`, [bookings[0]])
  await db.exec('SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[0]]), true)
  await db.exec('RESET ROLE')
  await db.query(`UPDATE private.booking_notifications SET attempts=max_attempts WHERE booking_id=$1 AND kind='booking_created'`, [bookings[0]])
  await db.exec('SET ROLE service_role')
  await value(`SELECT complete_booking_notification_v2($1,'booking_created',false,'still unavailable',true) AS value`, [bookings[0]])
  await db.exec('RESET ROLE')
  await db.query(`UPDATE private.booking_notifications SET next_retry_at=now()-interval '1 second' WHERE booking_id=$1 AND kind='booking_created'`, [bookings[0]])
  await db.exec('SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[0]]), false)

  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_confirmed') AS value`, [bookings[0]]), true)
  assert.equal(await value(`SELECT complete_booking_notification_v2($1,'booking_confirmed',true) AS value`, [bookings[0]]), true)
  state = await value(`SELECT booking_notification_status_v2($1,'booking_confirmed') AS value`, [bookings[0]])
  assert.equal(state.status, 'sent')
  assert.ok(state.next_retry_at === null)
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_confirmed') AS value`, [bookings[0]]), false)
})


test('a lost import response can be retried without duplicate properties, rooms or owners', async () => {
  await identity(adminToken)
  const request = '40000000-0000-0000-0000-000000000101'
  const input = { name: 'Retry hotel', city: 'Erbil', profit_margin_percentage: 10 }
  const rooms = [{ name: 'Double', base_price: 100, max_guests: 2 }]
  const owner = { username: 'retryowner', password: 'password123', name: 'Retry Owner' }
  const query = 'SELECT admin_import_hotel($1,$2,$3,false,$4) AS value'
  const first = await value(query, [input, rooms, owner, request])
  assert.deepEqual(await value(query, [input, rooms, owner, request]), first)
  assert.equal(await value(`SELECT count(*)::int AS value FROM hotels WHERE id=$1`, [first.hotel_id]), 1)
  assert.equal(await value(`SELECT count(*)::int AS value FROM room_types WHERE hotel_id=$1`, [first.hotel_id]), 1)
  await assert.rejects(value(query, [{ ...input, name: 'Changed' }, rooms, owner, request]), /different details/)
  await assert.rejects(value(query, [input, rooms, { ...owner, password: 'changed123' }, request]), /different details/)
  await identity(customerToken)
  await assert.rejects(value(query, [input, rooms, owner, request]), /Not authorized/)
})

test('capabilities enable the upgraded screens only after migration and legacy notification claims remain compatible', async () => {
  await identity()
  assert.deepEqual(await value('SELECT app_capabilities() AS value'), {
    bookingSearch: true, adminReliability: true, applicationResubmit: true,
  })
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE service_role')
  assert.equal(await value(`SELECT claim_booking_notification($1,'booking_created') AS value`, [bookings[1]]), true)
  assert.equal((await value(`SELECT booking_notification_status_v2($1,'booking_created') AS value`, [bookings[1]])).status, 'sent')
  assert.equal(await value(`SELECT claim_booking_notification_v2($1,'booking_created') AS value`, [bookings[1]]), false)
  await db.exec('RESET ROLE')
})
