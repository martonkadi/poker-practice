import { GUEST_OWNER } from '@poker/persistence';

export const PREFERENCE_LOCK = `poker-preference-${GUEST_OWNER}`;
const CHANNEL = 'poker-local-data';
const listeners = new Set<() => void>();

/** Request synchronously so the browser queues each intent before a later deletion. */
export async function withPreferenceLock<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!navigator.locks) return Promise.reject(new Error('Web Locks unavailable'));
  return navigator.locks.request(PREFERENCE_LOCK, signal ? { signal } : {}, work);
}

export function subscribeLocalDeletion(listener: () => void): () => void {
  listeners.add(listener);
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  if (channel) channel.onmessage = event => { if (event.data === 'deleted') listener(); };
  return () => { listeners.delete(listener); channel?.close(); };
}

export function notifyLocalDeletion(): void {
  for (const listener of listeners) listener();
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('deleted');
    channel.close();
  }
}
