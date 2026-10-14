import { exportHandsBlob } from '@poker/persistence';

self.onmessage = async (event: MessageEvent<{ owner: string }>) => {
  try {
    const blob = await exportHandsBlob(event.data.owner, (completed, total) => self.postMessage({ type: 'progress', completed, total }));
    self.postMessage({ type: 'complete', blob });
  } catch {
    self.postMessage({ type: 'error' });
  }
};
