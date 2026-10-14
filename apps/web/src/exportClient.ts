export interface ExportProgress { completed: number; total: number }
export function startHandsExport(owner: string, onProgress: (progress: ExportProgress) => void): { result: Promise<Blob>; cancel(): void } {
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  let rejectResult!: (error: Error) => void;
  let finished = false;
  const result = new Promise<Blob>((resolve, reject) => {
    rejectResult = reject;
    worker.onmessage = (event: MessageEvent<ExportProgress & { type: string; blob?: Blob }>) => {
      if (finished) return;
      if (event.data.type === 'progress') onProgress({ completed: event.data.completed, total: event.data.total });
      else if (event.data.type === 'complete' && event.data.blob instanceof Blob) { finished = true; worker.terminate(); resolve(event.data.blob); }
      else { finished = true; worker.terminate(); reject(new Error('Export failed')); }
    };
    worker.onerror = worker.onmessageerror = () => {
      if (finished) return;
      finished = true; worker.terminate(); reject(new Error('Export worker failed'));
    };
    try { worker.postMessage({ owner }); }
    catch { finished = true; worker.terminate(); reject(new Error('Export could not start')); }
  });
  return { result, cancel() {
    if (finished) return;
    finished = true;
    worker.terminate();
    rejectResult(new DOMException('Export cancelled', 'AbortError'));
  } };
}
