/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.3: per-page aggregator for `Audits.issueAdded` CDP events.
 *
 * Mirrors the lazy-init pattern used by `PageCollector`: a single CDP
 * listener installed per Page on first issue, removed when the page
 * closes. Buffer is capped (default 500 / page) to avoid unbounded
 * memory on noisy sites.
 *
 * Independent of the existing `FakeIssuesManager` in `DevtoolsUtils.ts`
 * — this aggregator doesn't try to dedupe / aggregate the way
 * DevTools' IssuesManager does. Callers that want richer aggregation
 * can run their own pass on the raw events.
 */

import {logger} from './logger.js';
import type {Browser, Page, Protocol, Target} from './third_party/index.js';

interface MinimalCDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, fn: (payload: unknown) => void): void;
  off(event: string, fn: (payload: unknown) => void): void;
}

export interface AggregatedIssueEntry {
  /** Stable id within this aggregator. */
  id: number;
  /** Server-side issue code (e.g. "ContentSecurityPolicyIssue"). */
  code: string;
  details: Protocol.Audits.InspectorIssueDetails;
  /** Timestamp the event was received. */
  receivedAt: number;
}

interface PerPageState {
  page: Page;
  buffer: AggregatedIssueEntry[];
  enabled: boolean;
  capacity: number;
  listener?: (payload: unknown) => void;
  closeListener?: () => void;
}

export class IssueAggregator {
  #byPage = new Map<Page, PerPageState>();
  #defaultCapacity: number;
  #nextId = 1;
  #browser?: Browser;
  #onTargetCreated?: (target: Target) => void;
  #onTargetDestroyed?: (target: Target) => void;

  constructor(opts: {capacity?: number} = {}) {
    this.#defaultCapacity = Math.max(1, opts.capacity ?? 500);
  }

  /**
   * Begin watching a browser for new pages. Subsequent pages will have
   * their listeners attached lazily; existing pages can be enabled by
   * calling `enableForPage` directly.
   */
  attach(browser: Browser): void {
    this.#browser = browser;
    this.#onTargetCreated = async target => {
      try {
        const page = await target.page();
        if (page) {
          await this.enableForPage(page);
        }
      } catch {
        // ignore
      }
    };
    this.#onTargetDestroyed = async target => {
      try {
        const page = await target.page();
        if (page) {
          this.#disableForPage(page);
        }
      } catch {
        // ignore
      }
    };
    browser.on('targetcreated', this.#onTargetCreated);
    browser.on('targetdestroyed', this.#onTargetDestroyed);
  }

  detach(): void {
    if (this.#browser && this.#onTargetCreated && this.#onTargetDestroyed) {
      this.#browser.off('targetcreated', this.#onTargetCreated);
      this.#browser.off('targetdestroyed', this.#onTargetDestroyed);
    }
    for (const page of this.#byPage.keys()) {
      this.#disableForPage(page);
    }
    this.#browser = undefined;
  }

  async enableForPage(page: Page, capacity?: number): Promise<void> {
    let state = this.#byPage.get(page);
    if (state?.enabled) {
      return;
    }
    if (!state) {
      state = {
        page,
        buffer: [],
        enabled: false,
        capacity: capacity ?? this.#defaultCapacity,
      };
      this.#byPage.set(page, state);
    }
    // @ts-expect-error internal Puppeteer API.
    const session = page._client() as MinimalCDPSession;
    const listener = (payload: unknown): void => {
      const evt = payload as Protocol.Audits.IssueAddedEvent;
      const code = evt.issue.code as string;
      const details = evt.issue.details ?? {};
      state!.buffer.push({
        id: this.#nextId++,
        code,
        details,
        receivedAt: Date.now(),
      });
      while (state!.buffer.length > state!.capacity) {
        state!.buffer.shift();
      }
    };
    state.listener = listener;
    state.closeListener = () => {
      this.#disableForPage(page);
    };
    session.on('Audits.issueAdded', listener);
    page.once('close', state.closeListener);
    try {
      await session.send('Audits.enable', {});
      state.enabled = true;
    } catch (err) {
      logger('IssueAggregator: failed to enable Audits domain', err);
    }
  }

  #disableForPage(page: Page): void {
    const state = this.#byPage.get(page);
    if (!state) {
      return;
    }
    if (state.listener) {
      try {
        // @ts-expect-error internal Puppeteer API.
        const session = page._client() as MinimalCDPSession;
        session.off('Audits.issueAdded', state.listener);
      } catch {
        // page may already be closed
      }
    }
    if (state.closeListener) {
      try {
        page.off('close', state.closeListener);
      } catch {
        // ignore
      }
    }
    state.enabled = false;
    state.listener = undefined;
    state.closeListener = undefined;
  }

  listForPage(page: Page): AggregatedIssueEntry[] {
    return this.#byPage.get(page)?.buffer.slice() ?? [];
  }

  clearForPage(page: Page): number {
    const state = this.#byPage.get(page);
    if (!state) {
      return 0;
    }
    const n = state.buffer.length;
    state.buffer.length = 0;
    return n;
  }

  getById(id: number): AggregatedIssueEntry | undefined {
    for (const state of this.#byPage.values()) {
      const found = state.buffer.find(e => e.id === id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
}
