// Process-level cap on concurrent headless-browser captures. Each capture opens
// two Chromium contexts; past a couple at once a warm instance runs out of
// memory, so extra work waits briefly in a short queue and is then refused.

const MAX_CONCURRENT = 2;
const MAX_WAITING = 4;
const MAX_WAIT_MS = 30_000;

export class CaptureBusyError extends Error {
  constructor() {
    super("We're reading a lot of pages right now. Try again in a minute.");
    this.name = "CaptureBusyError";
  }
}

interface Waiter {
  grant: () => void;
  fail: (err: Error) => void;
}

const store = globalThis as typeof globalThis & {
  __deslopCaptureSlots?: { active: number; queue: Waiter[] };
};

function slots() {
  store.__deslopCaptureSlots ??= { active: 0, queue: [] };
  return store.__deslopCaptureSlots;
}

/** True when a new capture would be refused right away. */
export function captureSaturated(): boolean {
  const s = slots();
  return s.active >= MAX_CONCURRENT && s.queue.length >= MAX_WAITING;
}

/** Waits for a capture slot; resolves with a release function (call once). */
export function acquireCaptureSlot(signal?: AbortSignal): Promise<() => void> {
  const s = slots();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = s.queue.shift();
    if (next) next.grant();
    else s.active -= 1;
  };

  if (s.active < MAX_CONCURRENT) {
    s.active += 1;
    return Promise.resolve(release);
  }
  if (s.queue.length >= MAX_WAITING) {
    return Promise.reject(new CaptureBusyError());
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const i = s.queue.indexOf(waiter);
      if (i >= 0) s.queue.splice(i, 1);
    };
    const waiter: Waiter = {
      // The slot is handed over directly: `active` stays the same.
      grant: () => {
        cleanup();
        resolve(release);
      },
      fail: (err) => {
        cleanup();
        reject(err);
      },
    };
    const timer = setTimeout(
      () => waiter.fail(new CaptureBusyError()),
      MAX_WAIT_MS,
    );
    const onAbort = () => {
      const err = new Error("The analysis was cancelled.");
      err.name = "AbortError";
      waiter.fail(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    s.queue.push(waiter);
  });
}
