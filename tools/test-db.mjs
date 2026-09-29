import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function status() {
  try {
    const output = execFileSync(process.platform === 'win32' ? 'node_modules\\.bin\\supabase.cmd' : 'node_modules/.bin/supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
    return Object.fromEntries(output.split(/\r?\n/).map(line => line.match(/^([A-Z_]+)="?([^"\r\n]+)"?$/)).filter(Boolean).map(([, key, value]) => [key, value]));
  } catch { throw new Error('Start local Supabase with `pnpm exec supabase start`, then run `pnpm exec supabase db reset`.'); }
}
const env = status();
const url = env.API_URL ?? 'http://127.0.0.1:54321';
const anon = env.ANON_KEY;
const service = env.SERVICE_ROLE_KEY;
if (!anon || !service) throw new Error('Local Supabase keys are unavailable');
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const users = [];
const device = crypto.randomUUID();
function assert(condition, message) { if (!condition) throw new Error(message); }
async function makeUser(label) {
  const email = `poker-test-${label}-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + 'Aa1!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error('User creation failed');
  users.push(created.data.user.id);
  const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, client };
}
function record(sessionId, sessionStartedAt, sequence, difficulty = 'standard') {
  return { schemaVersion: 1, id: crypto.randomUUID(), sessionId, sessionStartedAt, sequence, difficulty,
    botVersion: `${difficulty}-v1`, completedAt: new Date().toISOString(), heroNet: 50,
    reachedShowdown: false, heroWonShowdown: false, decisions: [], finalBoard: [] };
}
try {
  const testAuth = await admin.from('service_controls').update({ require_google: false }).eq('singleton', true);
  assert(!testAuth.error, 'Could not enable local authorization fixtures');
  const a = await makeUser('a');
  const b = await makeUser('b');
  const sessionId = crypto.randomUUID();
  const sessionStartedAt = new Date().toISOString();
  const started = await a.client.rpc('start_sync_session', { p_session_id: sessionId, p_difficulty: 'standard', p_bot_version: 'standard-v1', p_device_id: device, p_started_at: sessionStartedAt });
  assert(!started.error, `start session: ${started.error?.message}`);
  const expired = await a.client.rpc('start_sync_session', { p_session_id: crypto.randomUUID(), p_difficulty: 'standard', p_bot_version: 'standard-v1', p_device_id: device, p_started_at: new Date(Date.now() - 31 * 86400_000).toISOString() });
  assert(!!expired.error, 'Expired upload session was recreated');
  const wrongDevice = await a.client.rpc('start_sync_session', { p_session_id: sessionId, p_difficulty: 'standard', p_bot_version: 'standard-v1', p_device_id: crypto.randomUUID(), p_started_at: sessionStartedAt });
  assert(!!wrongDevice.error, 'Second device was allowed to produce session');
  const first = record(sessionId, sessionStartedAt, 0);
  const tooEarly = await a.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [record(sessionId, sessionStartedAt, 1)], p_device_id: device });
  assert(!!tooEarly.error, 'Out-of-order upload was accepted');
  const upload = await a.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [first], p_device_id: device });
  assert(!upload.error && upload.data.acknowledged_sequence === 0, `upload failed: ${upload.error?.message}`);
  const retry = await a.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [first], p_device_id: device });
  assert(!retry.error && retry.data.acknowledged_sequence === 0, 'Idempotent retry failed');
  const conflict = await a.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [{ ...first, heroNet: 999 }], p_device_id: device });
  assert(!!conflict.error, 'Conflicting retained hand was accepted');
  const foreignRead = await b.client.from('hands').select('id').eq('id', first.id);
  assert(!foreignRead.error && foreignRead.data.length === 0, 'Another user read private hand');
  const anonymous = createClient(url, anon, { auth: { persistSession: false } });
  const anonymousRead = await anonymous.from('hands').select('id');
  assert(!anonymousRead.error && anonymousRead.data.length === 0, 'Anonymous client read private hand');
  const foreignWrite = await b.client.from('hands').insert({ id: crypto.randomUUID(), user_id: a.id, session_id: sessionId, sequence: 9, completed_at: new Date().toISOString(), byte_count: 1, record: {} });
  assert(!!foreignWrite.error, 'Direct client write bypassed sync');
  const foreignRpc = await b.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [record(sessionId, sessionStartedAt, 1)], p_device_id: device });
  assert(!!foreignRpc.error, 'Another user synchronized the session');
  const stats = await a.client.from('stat_totals').select('hands,net_chips').eq('difficulty', 'standard').single();
  assert(!stats.error && stats.data.hands === 1 && stats.data.net_chips === 50, 'Aggregate counted retry twice');
  const controls = await admin.from('service_controls').update({ max_hands: 2 }).eq('singleton', true);
  assert(!controls.error, 'Could not set test retention limit');
  const more = await a.client.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: [record(sessionId, sessionStartedAt, 1), record(sessionId, sessionStartedAt, 2)], p_device_id: device });
  assert(!more.error, `Retention upload failed: ${more.error?.message}`);
  const retained = await a.client.from('hands').select('id');
  assert(!retained.error && retained.data.length === 2, 'Retention did not prune to two hands');
  console.log('Database authorization, ordering, retry, conflict, aggregate and pruning checks passed.');
} finally {
  await admin.from('service_controls').update({ max_hands: 500, require_google: true }).eq('singleton', true);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
