/** FIFO Web Locks model, including cancellation of waiting (but not granted) requests. */
export class TestLocks {
  private held = new Set<string>();
  private tails = new Map<string, Promise<void>>();
  async request<T>(name: string, options: { ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: { name: string } | null) => Promise<T>): Promise<T> {
    if (options.ifAvailable && this.held.has(name)) return callback(null);
    const prior = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>(resolve => { release = resolve; });
    this.tails.set(name, prior.then(() => done));
    await prior;
    try {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      this.held.add(name);
      return await callback({ name });
    } finally { this.held.delete(name); release(); }
  }
}
