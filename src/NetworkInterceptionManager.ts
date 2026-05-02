/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3: per-page network interception registry. Generalizes the
 * one-shot URLPattern allowlist pattern in `tools/pages.ts` into a
 * persistent, multi-rule system that survives across tool calls.
 *
 * Design:
 * - One Puppeteer `request` listener installed per Page (lazy on first
 *   rule, removed when the last rule for that page is cleared).
 * - Rules are walked in registration order. The first matching rule wins.
 * - Each rule's action is one of `continue` (no-op pass-through),
 *   `abort` (with reason), `fulfill` (mocked response), `modify`
 *   (header/method/body overrides on the outgoing request).
 *
 * URL patterns use the same URLPattern API used by the navigation
 * allowlist so callers can copy idioms.
 */

import type {HTTPRequest, Page} from './third_party/index.js';

export type InterceptorAction = 'continue' | 'abort' | 'fulfill' | 'modify';

export interface InterceptorRule {
  id: string;
  pageId: number;
  urlPattern: string;
  action: InterceptorAction;
  /** For action: 'abort'. Defaults to 'blockedbyclient'. */
  abortReason?: string;
  /** For action: 'fulfill'. */
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  /** Latency injected before the response is delivered (ms). */
  latencyMs?: number;
  /** For action: 'modify' — applied to the outgoing request before continuing. */
  setHeaders?: Record<string, string>;
  removeHeaders?: string[];
  method?: string;
  postData?: string;
  /** Optional creation timestamp for diagnostics. */
  createdAt: number;
}

interface PerPageState {
  rules: InterceptorRule[];
  listener: (req: HTTPRequest) => void;
  active: boolean;
}

export class NetworkInterceptionManager {
  #byPage = new Map<number, PerPageState>();
  #nextRuleId = 1;

  listForPage(pageId: number): InterceptorRule[] {
    return this.#byPage.get(pageId)?.rules.slice() ?? [];
  }

  listAll(): InterceptorRule[] {
    return [...this.#byPage.values()].flatMap(s => s.rules);
  }

  async addRule(
    page: Page,
    pageId: number,
    rule: Omit<InterceptorRule, 'id' | 'pageId' | 'createdAt'>,
  ): Promise<InterceptorRule> {
    // Validate URLPattern up-front so a bad rule fails on registration
    // rather than the next request.
    new URLPattern(rule.urlPattern);

    const id = `intc-${this.#nextRuleId++}`;
    const fullRule: InterceptorRule = {
      ...rule,
      id,
      pageId,
      createdAt: Date.now(),
    };
    let state = this.#byPage.get(pageId);
    if (!state) {
      const listener = this.#makeListener(pageId);
      state = {rules: [], listener, active: false};
      this.#byPage.set(pageId, state);
    }
    state.rules.push(fullRule);
    if (!state.active) {
      await page.setRequestInterception(true);
      page.on('request', state.listener);
      state.active = true;
    }
    return fullRule;
  }

  async removeRule(
    page: Page,
    pageId: number,
    ruleId: string,
  ): Promise<boolean> {
    const state = this.#byPage.get(pageId);
    if (!state) {
      return false;
    }
    const idx = state.rules.findIndex(r => r.id === ruleId);
    if (idx < 0) {
      return false;
    }
    state.rules.splice(idx, 1);
    if (state.rules.length === 0) {
      await this.#deactivate(page, pageId);
    }
    return true;
  }

  async clearForPage(page: Page, pageId: number): Promise<number> {
    const state = this.#byPage.get(pageId);
    if (!state) {
      return 0;
    }
    const n = state.rules.length;
    state.rules.length = 0;
    await this.#deactivate(page, pageId);
    return n;
  }

  async #deactivate(page: Page, pageId: number): Promise<void> {
    const state = this.#byPage.get(pageId);
    if (!state) {
      return;
    }
    if (state.active) {
      page.off('request', state.listener);
      try {
        await page.setRequestInterception(false);
      } catch {
        // Page may already be closed; ignore.
      }
      state.active = false;
    }
    this.#byPage.delete(pageId);
  }

  #makeListener(pageId: number) {
    return (req: HTTPRequest) => {
      const state = this.#byPage.get(pageId);
      if (!state || state.rules.length === 0) {
        void req.continue();
        return;
      }
      const url = req.url();
      const rule = state.rules.find(r => {
        try {
          return new URLPattern(r.urlPattern).test(url);
        } catch {
          return false;
        }
      });
      if (!rule) {
        void req.continue();
        return;
      }
      void this.#applyRule(req, rule);
    };
  }

  async #applyRule(req: HTTPRequest, rule: InterceptorRule): Promise<void> {
    if (rule.latencyMs && rule.latencyMs > 0) {
      await new Promise(r => setTimeout(r, rule.latencyMs));
    }
    try {
      switch (rule.action) {
        case 'continue':
          await req.continue();
          return;
        case 'abort':
          await req.abort((rule.abortReason ?? 'blockedbyclient') as never);
          return;
        case 'fulfill': {
          const headers: Record<string, string> = {...(rule.headers ?? {})};
          if (rule.contentType && !headers['content-type']) {
            headers['content-type'] = rule.contentType;
          }
          await req.respond({
            status: rule.status ?? 200,
            headers,
            body: rule.body ?? '',
            contentType: rule.contentType,
          });
          return;
        }
        case 'modify': {
          const overrides: {
            method?: string;
            postData?: string;
            headers?: Record<string, string>;
          } = {};
          if (rule.method) {
            overrides.method = rule.method;
          }
          if (rule.postData !== undefined) {
            overrides.postData = rule.postData;
          }
          const baseHeaders = req.headers();
          const merged: Record<string, string> = {...baseHeaders};
          for (const drop of rule.removeHeaders ?? []) {
            delete merged[drop.toLowerCase()];
          }
          for (const [k, v] of Object.entries(rule.setHeaders ?? {})) {
            merged[k.toLowerCase()] = v;
          }
          overrides.headers = merged;
          await req.continue(overrides);
          return;
        }
      }
    } catch {
      // The request may have already been handled / page closed; swallow.
    }
  }
}
