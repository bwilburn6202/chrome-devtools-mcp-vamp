/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

export class MutexAcquireTimeoutError extends Error {
  constructor(timeoutMs: number, holderHint?: string) {
    super(
      `Failed to acquire mutex within ${timeoutMs}ms${
        holderHint ? ` (holder: ${holderHint})` : ''
      }. The previous tool call may have failed to release the lock.`,
    );
    this.name = 'MutexAcquireTimeoutError';
  }
}

export class Mutex {
  static Guard = class Guard {
    #mutex: Mutex;
    #released = false;
    constructor(mutex: Mutex) {
      this.#mutex = mutex;
    }
    dispose(): void {
      if (this.#released) {
        return;
      }
      this.#released = true;
      this.#mutex.release();
    }
  };

  #locked = false;
  #acquirers: Array<{resolve: () => void; reject: (e: Error) => void}> = [];
  #holderHint?: string;

  get queueDepth(): number {
    return this.#acquirers.length;
  }

  get isLocked(): boolean {
    return this.#locked;
  }

  // This is FIFO.
  async acquire(options?: {
    timeoutMs?: number;
    holderHint?: string;
  }): Promise<InstanceType<typeof Mutex.Guard>> {
    if (!this.#locked) {
      this.#locked = true;
      this.#holderHint = options?.holderHint;
      return new Mutex.Guard(this);
    }
    const {resolve, reject, promise} = Promise.withResolvers<void>();
    const entry = {resolve, reject};
    this.#acquirers.push(entry);

    const timeoutMs = options?.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        const idx = this.#acquirers.indexOf(entry);
        if (idx >= 0) {
          this.#acquirers.splice(idx, 1);
          reject(new MutexAcquireTimeoutError(timeoutMs, this.#holderHint));
        }
      }, timeoutMs);
    }

    try {
      await promise;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.#holderHint = options?.holderHint;
    return new Mutex.Guard(this);
  }

  release(): void {
    const next = this.#acquirers.shift();
    if (!next) {
      this.#locked = false;
      this.#holderHint = undefined;
      return;
    }
    next.resolve();
  }
}

/**
 * Per-key mutex map. Lazily creates a Mutex per key so unrelated keys
 * (e.g. different page ids) never block each other.
 */
export class MutexMap<K> {
  #mutexes = new Map<K, Mutex>();

  get(key: K): Mutex {
    let m = this.#mutexes.get(key);
    if (!m) {
      m = new Mutex();
      this.#mutexes.set(key, m);
    }
    return m;
  }

  /**
   * Drop the mutex for a key once it's no longer in use (caller must ensure
   * it's not currently locked).
   */
  delete(key: K): void {
    const m = this.#mutexes.get(key);
    if (m && (m.isLocked || m.queueDepth > 0)) {
      return;
    }
    this.#mutexes.delete(key);
  }

  get size(): number {
    return this.#mutexes.size;
  }
}
