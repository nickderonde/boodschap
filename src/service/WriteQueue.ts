// FIFO-schrijfwachtrij van de facade (§9.3, E-6, I-1). Elke taak draait in één repo.tx en draagt alleen haar delta.
import type { ListDelta } from '../core/types';
import type { Repository, SqlTx } from '../storage';

interface Task<T> {
  listId: string | null;
  delta: ListDelta | null;
  run: (tx: SqlTx) => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export class TaskRejected extends Error {
  constructor(readonly listId: string | null) {
    super('taak-afgewezen');
  }
}

export class WriteQueue {
  private readonly tasks: Task<unknown>[] = [];
  private running = false;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly repo: Repository,
    /** Na een commitfout: lijst opnieuw laden uit de DB ⊔ de deltas die nog in de wachtrij staan. */
    private readonly onFailure: (listId: string | null, error: unknown, pending: ListDelta[]) => Promise<void>,
  ) {}

  enqueue<T>(listId: string | null, delta: ListDelta | null, run: (tx: SqlTx) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.tasks.push({ listId, delta, run, resolve: resolve as (v: unknown) => void, reject } as Task<unknown>);
      void this.pump();
    });
  }

  /** Deltas van nog niet gecommitte taken voor een lijst (cache = db ⊔ deze deltas). */
  pendingDeltas(listId: string): ListDelta[] {
    return this.tasks.filter((t) => t.listId === listId && t.delta).map((t) => t.delta!);
  }

  get size(): number {
    return this.tasks.length + (this.running ? 1 : 0);
  }

  async idle(): Promise<void> {
    if (!this.running && this.tasks.length === 0) return;
    await new Promise<void>((r) => this.idleWaiters.push(r));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.tasks.length > 0) {
        const task = this.tasks.shift()!;
        try {
          const v = await this.repo.tx(task.run);
          task.resolve(v);
        } catch (e) {
          task.reject(e);
          // Alle nog niet gecommitte lokale taken van dezelfde lijst worden ook afgewezen (§9.3).
          // Remote merges (zonder delta) blijven staan: die zijn onafhankelijk geldig (I-1).
          if (task.listId !== null) {
            for (let i = this.tasks.length - 1; i >= 0; i--) {
              if (this.tasks[i].listId === task.listId && this.tasks[i].delta) {
                this.tasks[i].reject(new TaskRejected(task.listId));
                this.tasks.splice(i, 1);
              }
            }
          }
          try {
            await this.onFailure(task.listId, e, task.listId ? this.pendingDeltas(task.listId) : []);
          } catch {
            // herladen mislukte ook; de volgende start herstelt vanuit de database
          }
        }
      }
    } finally {
      this.running = false;
      const w = this.idleWaiters;
      this.idleWaiters = [];
      for (const r of w) r();
    }
  }
}
