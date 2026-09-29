import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { handRecordSchema, type HandRecord } from '@poker/contracts';
import { acknowledgeBookmark, acknowledgeSync, cacheCloudHands, pendingBookmarks, pendingSync, reconcileCloudBookmarks } from '@poker/persistence';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud: SupabaseClient | null = url && key ? createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
}) : null;
function deviceId(): string {
  let id = localStorage.getItem('poker-device-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('poker-device-id', id); }
  return id;
}

export async function signInWithGoogle(): Promise<void> {
  if (!cloud) throw new Error('Google sign-in is unavailable in this build');
  sessionStorage.setItem('poker-return-to', location.pathname === '/auth/callback' ? '/play' : location.pathname);
  const { error } = await cloud.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } });
  if (error) throw error;
}

export async function signedInUser(): Promise<User | null> {
  if (!cloud) return null;
  const { data, error } = await cloud.auth.getUser();
  if (error) return null;
  return data.user;
}

async function syncOnce(owner: string): Promise<{ uploaded: number; downloaded: number }> {
  if (!cloud || !navigator.onLine) throw new Error('Saved on this device; cloud sync unavailable.');
  const user = await signedInUser();
  if (!user || user.id !== owner) throw new Error('Sign in again to synchronize.');
  let uploaded = 0;
  const waiting = await pendingSync(owner);
  const groups = new Map<string, HandRecord[]>();
  for (const record of waiting) groups.set(record.sessionId, [...(groups.get(record.sessionId) ?? []), record]);
  for (const [sessionId, records] of groups) {
    const first = records[0]!;
    const { error: startError } = await cloud.rpc('start_sync_session', { p_session_id: sessionId, p_difficulty: first.difficulty, p_bot_version: first.botVersion, p_device_id: deviceId(), p_started_at: first.sessionStartedAt });
    if (startError) throw startError;
    for (let offset = 0; offset < records.length; offset += 10) {
      const batch = records.slice(offset, offset + 10);
      const { data, error } = await cloud.rpc('sync_session_batch', { p_session_id: sessionId, p_hands: batch, p_device_id: deviceId() });
      if (error) throw error;
      const acknowledged = Number((data as { acknowledged_sequence: number }).acknowledged_sequence);
      if (!Number.isSafeInteger(acknowledged)) throw new Error('Invalid synchronization acknowledgment');
      await acknowledgeSync(owner, sessionId, acknowledged);
      uploaded += batch.filter(x => x.sequence <= acknowledged).length;
    }
  }
  let downloaded = 0;
  const retainedIds = new Set<string>();
  for (let offset = 0; ; offset += 50) {
    const { data, error } = await cloud.from('hands').select('record').order('completed_at', { ascending: false }).range(offset, offset + 49);
    if (error) throw error;
    const records = (data ?? []).map(row => handRecordSchema.parse(row.record) as HandRecord);
    for (const record of records) retainedIds.add(record.id);
    await cacheCloudHands(owner, records);
    downloaded += records.length;
    if (records.length < 50) break;
  }
  const { data: existingMarks, error: existingMarkError } = await cloud.from('bookmarks').select('hand_id');
  if (existingMarkError) throw existingMarkError;
  const cloudMarks = new Set((existingMarks ?? []).map(x => x.hand_id as string));
  for (const mark of await pendingBookmarks(owner)) {
    if (retainedIds.has(mark.handId)) {
      if (mark.bookmarked && !cloudMarks.has(mark.handId)) {
        const { error } = await cloud.from('bookmarks').insert({ user_id: owner, hand_id: mark.handId });
        if (error) throw error;
        cloudMarks.add(mark.handId);
      } else if (!mark.bookmarked && cloudMarks.has(mark.handId)) {
        const { error } = await cloud.from('bookmarks').delete().eq('hand_id', mark.handId);
        if (error) throw error;
        cloudMarks.delete(mark.handId);
      }
    }
    await acknowledgeBookmark(owner, mark.handId, mark.bookmarked);
  }
  await reconcileCloudBookmarks(owner, [...cloudMarks]);
  return { uploaded, downloaded };
}

export async function synchronize(owner: string): Promise<{ uploaded: number; downloaded: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await syncOnce(owner); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = /fetch|network|timeout|temporar|502|503|504/i.test(message);
      if (!navigator.onLine || !transient || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw new Error('Cloud synchronization unavailable');
}

export async function deleteAccount(): Promise<void> {
  if (!cloud) throw new Error('Cloud is unavailable');
  const { error } = await cloud.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await cloud.auth.signOut();
}
