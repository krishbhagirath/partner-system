export type TaskQueue = {
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  readonly pending: number;
  readonly active: number;
};

// In-process, concurrency-capped FIFO queue. On a single VM this caps how many
// Chromium instances run at once so the worker can't exhaust RAM; overflow
// waits in insertion order and starts as running slots free up.
export function createTaskQueue(maxConcurrency: number): TaskQueue {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error(`maxConcurrency must be an integer >= 1, got "${maxConcurrency}".`);
  }

  let active = 0;
  const waiters: Array<() => void> = [];

  function schedule() {
    while (active < maxConcurrency && waiters.length > 0) {
      const wake = waiters.shift();

      if (!wake) {
        break;
      }

      active += 1;
      wake();
    }
  }

  function acquire() {
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
      schedule();
    });
  }

  function release() {
    active -= 1;
    schedule();
  }

  async function enqueue<T>(task: () => Promise<T>): Promise<T> {
    await acquire();

    try {
      return await task();
    } finally {
      // Freed in finally so a thrown task still releases its slot and never
      // wedges the queue.
      release();
    }
  }

  return {
    enqueue,
    get active() {
      return active;
    },
    get pending() {
      return waiters.length;
    },
  };
}
