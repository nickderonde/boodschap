// Eenvoudige async-mutex (FIFO). Gebruikt door Repository (§9.2) en de Publisher-lock per lijst (§6.6).

export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  private depth = 0;

  get held(): boolean {
    return this.depth > 0;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    this.depth++;
    try {
      return await fn();
    } finally {
      this.depth--;
      release();
    }
  }
}
