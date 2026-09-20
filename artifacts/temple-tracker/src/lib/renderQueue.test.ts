import { describe, it, expect } from "vitest";
import { createQueue, renderQueue } from "./renderQueue";

// Several Regenerate clicks at once overran one edge worker (HTTP 546), which
// killed every request in flight on it. Renders queue instead.

/** A task that resolves only when the test says so. */
function deferred() {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createQueue", () => {
  it("runs up to the limit at once and holds the rest back", async () => {
    // Arrange
    const queue = createQueue(2);
    const tasks = [deferred(), deferred(), deferred()];
    let started = 0;
    // Act
    tasks.forEach((t) => queue.run(() => { started++; return t.promise; }));
    await tick();
    // Assert
    expect(started).toBe(2);
    expect(queue.active).toBe(2);
    expect(queue.waiting).toBe(1);
    tasks.forEach((t) => t.resolve("done"));
  });

  it("starts the next one as soon as a slot frees", async () => {
    const queue = createQueue(1);
    const first = deferred();
    let secondStarted = false;
    queue.run(() => first.promise);
    const second = queue.run(async () => { secondStarted = true; return "second"; });
    await tick();
    expect(secondStarted).toBe(false);

    first.resolve("first");
    await tick();
    expect(secondStarted).toBe(true);
    await expect(second).resolves.toBe("second");
    expect(queue.active).toBe(0);
    expect(queue.waiting).toBe(0);
  });

  it("runs the queued tasks in the order they were clicked", async () => {
    const queue = createQueue(1);
    const order: number[] = [];
    const blocker = deferred();
    queue.run(() => blocker.promise);
    [1, 2, 3].forEach((n) => queue.run(async () => { order.push(n); }));
    blocker.resolve("go");
    await tick();
    await tick();
    expect(order).toEqual([1, 2, 3]);
  });

  it("frees the slot when a task rejects, and rejects its caller", async () => {
    // Arrange
    const queue = createQueue(1);
    // Act / Assert
    await expect(queue.run(async () => { throw new Error("render failed"); })).rejects.toThrow("render failed");
    expect(queue.active).toBe(0);
    await expect(queue.run(async () => "next runs anyway")).resolves.toBe("next runs anyway");
  });

  it("passes a task's value straight back to its caller", async () => {
    await expect(createQueue(2).run(async () => 42)).resolves.toBe(42);
  });

  it("treats a limit below one as one, never zero", async () => {
    const queue = createQueue(0);
    const held = deferred();
    queue.run(() => held.promise);
    queue.run(async () => "waited");
    await tick();
    expect(queue.active).toBe(1);
    expect(queue.waiting).toBe(1);
    held.resolve("done");
  });
});

describe("renderQueue", () => {
  it("is shared by the page and lets two renders run at once", async () => {
    const held = [deferred(), deferred()];
    held.forEach((h) => renderQueue.run(() => h.promise));
    await tick();
    expect(renderQueue.active).toBe(2);
    held.forEach((h) => h.resolve("done"));
    await tick();
    expect(renderQueue.active).toBe(0);
  });
});
