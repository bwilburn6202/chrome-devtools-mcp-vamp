/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4: raw Chrome DevTools Protocol passthrough.
 *
 * This is the unblock-everything tool: any CDP capability not yet wrapped
 * by a bespoke MCP tool can be reached through `cdp_send` / `cdp_subscribe`.
 *
 * Gated behind `--experimentalCdpPassthrough` because of its breadth.
 * A small allowlist of "dangerous" methods (browser-wide actions like
 * Browser.close, Target.disposeBrowserContext) requires the additional
 * `--experimentalCdpDangerous` flag.
 *
 * Subscriptions buffer events in a per-subscription ring buffer (default
 * 1000 events). MCP doesn't support push, so callers poll via `cdp_poll`.
 */

import type {CDPSession, Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';
import {createIdGenerator} from '../utils/id.js';

import {ToolCategory} from './categories.js';
import {definePageTool, defineTool} from './ToolDefinition.js';

const RING_BUFFER_DEFAULT = 1000;

const DANGEROUS_METHODS = new Set<string>([
  'Browser.close',
  'Browser.crash',
  'Browser.crashGpuProcess',
  'Target.closeTarget',
  'Target.disposeBrowserContext',
  'Target.exposeDevToolsProtocol',
  'Page.close',
  'Page.crash',
  'Storage.clearDataForOrigin',
  'Storage.clearTrustTokens',
  'Storage.clearCookies',
  'Network.clearBrowserCache',
  'Network.clearBrowserCookies',
  'Debugger.evaluateOnCallFrame',
  'Runtime.runIfWaitingForDebugger',
]);

interface CdpSubscription {
  id: string;
  pageId: number;
  event: string;
  buffer: unknown[];
  capacity: number;
  totalDropped: number;
  unsubscribe: () => void;
}

// Module-scoped state. There's no way to thread per-server state through
// definePageTool without a refactor, and CDP subscriptions are inherently
// keyed by the live MCP server lifetime, so a module-scoped registry is
// acceptable here. Disposed when the process exits.
const subscriptions = new Map<string, CdpSubscription>();
const idGen = createIdGenerator();

function makeSubscriptionId(): string {
  return `cdp-sub-${idGen()}`;
}

/**
 * Wide-typed CDP session shim. The Puppeteer CDPSession type signature
 * for send/on changes between versions; this MCP only needs the loose
 * surface and validates strings at the tool layer.
 */
interface RawCDP {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, fn: (payload: unknown) => void): void;
  off(event: string, fn: (payload: unknown) => void): void;
}

function rawCdp(page: Page): RawCDP {
  // @ts-expect-error internal Puppeteer API.
  return page._client() as RawCDP;
}

function pageId(page: Page): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tgt = (page as any).target?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id: string | undefined = tgt?._targetId ?? (tgt as any)?.id?.();
  if (!id) {
    return 0;
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return h;
}

export const cdpSend = definePageTool(args => ({
  name: 'cdp_send',
  description: `Send a raw Chrome DevTools Protocol command to the active page's CDP session.

Returns the raw JSON response. Use this when no bespoke MCP tool exists for the capability you need (e.g. "Page.printToPDF", "Debugger.setBreakpointByUrl", "Animation.getPlaybackRate"). Reference: https://chromedevtools.github.io/devtools-protocol/`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalCdpPassthrough'],
  },
  schema: {
    method: zod
      .string()
      .min(1)
      .describe(
        'CDP method, e.g. "Runtime.evaluate", "Page.captureScreenshot".',
      ),
    params: zod
      .record(zod.string(), zod.unknown())
      .optional()
      .describe('CDP parameters object. Default {}.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const method = request.params.method;
    if (DANGEROUS_METHODS.has(method) && !args?.experimentalCdpDangerous) {
      throw new Error(
        `CDP method ${method} is on the dangerous allowlist. Pass --experimentalCdpDangerous to enable.`,
      );
    }
    const result = await rawCdp(request.page.pptrPage).send(
      method,
      (request.params.params ?? {}) as Record<string, unknown>,
    );
    response.appendResponseLine(JSON.stringify({method, result}, null, 2));
  },
}));

export const cdpSubscribe = definePageTool({
  name: 'cdp_subscribe',
  description: `Subscribe to a raw CDP event for the active page. Returns a \`subscriptionId\`.

Events are buffered (ring buffer, default 1000 entries). Poll with \`cdp_poll\` to drain. The subscription persists until \`cdp_unsubscribe\` is called or the page closes.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalCdpPassthrough'],
  },
  schema: {
    event: zod
      .string()
      .min(1)
      .describe('CDP event name, e.g. "Network.requestWillBeSent".'),
    bufferSize: zod
      .number()
      .int()
      .positive()
      .max(100_000)
      .optional()
      .describe(`Ring buffer capacity. Default ${RING_BUFFER_DEFAULT}.`),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const subId = makeSubscriptionId();
    const capacity = request.params.bufferSize ?? RING_BUFFER_DEFAULT;
    const buffer: unknown[] = [];
    const eventName = request.params.event;
    const cdp = rawCdp(request.page.pptrPage);
    const handler = (payload: unknown): void => {
      buffer.push(payload);
      while (buffer.length > capacity) {
        buffer.shift();
        const sub = subscriptions.get(subId);
        if (sub) {
          sub.totalDropped++;
        }
      }
    };
    cdp.on(eventName, handler);
    subscriptions.set(subId, {
      id: subId,
      pageId: pageId(request.page.pptrPage),
      event: eventName,
      buffer,
      capacity,
      totalDropped: 0,
      unsubscribe: () => cdp.off(eventName, handler),
    });
    response.appendResponseLine(
      JSON.stringify(
        {subscriptionId: subId, event: eventName, capacity},
        null,
        2,
      ),
    );
  },
});

export const cdpPoll = defineTool({
  name: 'cdp_poll',
  description: `Drain buffered events for a CDP subscription created via \`cdp_subscribe\`. Returns the events accumulated since the last poll and clears the buffer.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalCdpPassthrough'],
  },
  schema: {
    subscriptionId: zod.string(),
    maxEvents: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Cap on events returned this poll. Default: drain everything.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const sub = subscriptions.get(request.params.subscriptionId);
    if (!sub) {
      throw new Error(
        `No subscription "${request.params.subscriptionId}" found. (May have been removed by cdp_unsubscribe or the page closing.)`,
      );
    }
    const max = request.params.maxEvents ?? sub.buffer.length;
    const events = sub.buffer.splice(0, max);
    response.appendResponseLine(
      JSON.stringify(
        {
          subscriptionId: sub.id,
          event: sub.event,
          totalDropped: sub.totalDropped,
          remaining: sub.buffer.length,
          events,
        },
        null,
        2,
      ),
    );
  },
});

export const cdpUnsubscribe = defineTool({
  name: 'cdp_unsubscribe',
  description: 'Remove a CDP event subscription created via `cdp_subscribe`.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalCdpPassthrough'],
  },
  schema: {
    subscriptionId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const sub = subscriptions.get(request.params.subscriptionId);
    if (!sub) {
      response.appendResponseLine(
        `No subscription "${request.params.subscriptionId}" found.`,
      );
      return;
    }
    try {
      sub.unsubscribe();
    } catch {
      // Page may already be closed.
    }
    subscriptions.delete(request.params.subscriptionId);
    response.appendResponseLine(
      `Unsubscribed ${request.params.subscriptionId}.`,
    );
  },
});

export const cdpListSubscriptions = defineTool({
  name: 'cdp_list_subscriptions',
  description: 'List active CDP event subscriptions.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalCdpPassthrough'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (_request, response) => {
    const subs = [...subscriptions.values()].map(s => ({
      id: s.id,
      pageId: s.pageId,
      event: s.event,
      capacity: s.capacity,
      buffered: s.buffer.length,
      totalDropped: s.totalDropped,
    }));
    response.appendResponseLine(JSON.stringify({subscriptions: subs}, null, 2));
  },
});

// Re-export type for external test/use only — keeps CDPSession import alive
// in case linters complain about unused imports otherwise.
export type {CDPSession};
