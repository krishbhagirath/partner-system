import { describe, expect, it } from "vitest";

import { createTaskQueue } from "./queue.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

// Flush the microtask + timer queues so queued task bodies get a chance to run.
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createTaskQueue", () => {
  it("never runs more than maxConcurrency tasks at once", async () => {
    const queue = createTaskQueue(2);
    const gates = Array.from({ length: 5 }, () => deferred());
    const started: number[] = [];
    let peakActive = 0;

    const results = gates.map((gate, index) =>
      queue.enqueue(async () => {
        started.push(index);
        peakActive = Math.max(peakActive, queue.active);
        await gate.promise;

        return index;
      }),
    );

    await tick();
    expect(started).toEqual([0, 1]);
    expect(queue.active).toBe(2);
    expect(queue.pending).toBe(3);

    gates[0]?.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);

    gates[1]?.resolve();
    gates[2]?.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2, 3, 4]);

    for (const gate of gates) {
      gate.resolve();
    }
    await Promise.all(results);

    expect(peakActive).toBeLessThanOrEqual(2);
    expect(queue.active).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it("starts queued tasks in FIFO order", async () => {
    const queue = createTaskQueue(1);
    const gates = Array.from({ length: 4 }, () => deferred());
    const started: number[] = [];

    const results = gates.map((gate, index) =>
      queue.enqueue(async () => {
        started.push(index);
        await gate.promise;
      }),
    );

    for (let index = 0; index < gates.length; index += 1) {
      await tick();
      gates[index]?.resolve();
    }
    await Promise.all(results);

    expect(started).toEqual([0, 1, 2, 3]);
  });

  it("isolates a failing task and keeps processing the queue", async () => {
    const queue = createTaskQueue(1);
    const outcomes: string[] = [];

    const failing = queue.enqueue(() => Promise.reject(new Error("boom")));
    const following = queue.enqueue(() => {
      outcomes.push("ran");

      return Promise.resolve("ok");
    });

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("ok");
    expect(outcomes).toEqual(["ran"]);
    expect(queue.active).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it("rejects an invalid maxConcurrency", () => {
    expect(() => createTaskQueue(0)).toThrow();
    expect(() => createTaskQueue(-1)).toThrow();
    expect(() => createTaskQueue(1.5)).toThrow();
  });
});
