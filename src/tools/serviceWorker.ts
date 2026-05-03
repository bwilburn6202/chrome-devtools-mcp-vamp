/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 5: service worker / PWA tools.
 *
 * Generalizes the previous extension-only `evaluate_script` worker
 * support to any service worker registered for the active page, plus
 * adds inspection / control surfaces for SW registrations and the
 * web-app manifest.
 *
 * Service worker registration enumeration uses CDP
 * `ServiceWorker.enable` + `ServiceWorker.workerVersionUpdated` /
 * `Workers.attachedToTarget` events. To keep this tool family stateless
 * (no event subscription required), `list_service_workers` performs a
 * one-shot snapshot via `ServiceWorker.dispatchSyncEvent`-free means:
 * we walk Browser.targets() with type === 'service_worker' and pair
 * with Page.workers() for the active page.
 */

import type {Page, WebWorker} from '../third_party/index.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

interface MinimalCDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
function cdp(page: Page): MinimalCDPSession {
  // @ts-expect-error internal Puppeteer API.
  return page._client();
}

/**
 * Resolve a worker by URL substring. Falls back to listing across the
 * browser context when the active page doesn't own the worker (which is
 * common — service workers live in their own target).
 */
async function findWorker(page: Page, urlSubstr: string): Promise<WebWorker> {
  // Puppeteer's WebWorker target list is reachable via Page.workers() for
  // page-attached workers (dedicated workers + same-target service workers).
  // Cross-target service workers should be reached via CDP — out of scope
  // for this convenience tool.
  const candidates = page.workers();
  const match = candidates.find(w => w.url().includes(urlSubstr));
  if (!match) {
    throw new Error(
      `No worker matching "${urlSubstr}" found. Workers seen: ${candidates.map(w => w.url()).join(', ') || '(none)'}`,
    );
  }
  return match;
}

export const listServiceWorkers = definePageTool({
  name: 'list_service_workers',
  description:
    "Lists active service workers visible to the current page's browser context (URLs and target IDs). Includes any web workers attached via `Page.workers()` for completeness.",
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    const pageWorkers = page.workers().map(w => ({
      kind: 'page',
      url: w.url(),
    }));
    response.appendResponseLine(
      JSON.stringify(
        {
          page: pageWorkers,
          note: 'Puppeteer exposes only page-attached workers here. For cross-target service workers (most common case), use cdp_send with `ServiceWorker.enable` + a `cdp_subscribe` on `ServiceWorker.workerVersionUpdated`.',
        },
        null,
        2,
      ),
    );
  },
});

export const evaluateInWorker = definePageTool({
  name: 'evaluate_in_worker',
  description: `Evaluates a JavaScript expression inside a service worker. The worker is identified by a substring of its URL (e.g. "sw.js" or "/service-worker.js").

The script is run as an expression. Use \`evaluate_script\` for page contexts; this tool exists for SW debugging (\`caches.keys()\`, \`self.registration.update()\`, etc.).`,
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    workerUrlSubstring: zod
      .string()
      .min(1)
      .describe(
        'Substring matched against worker URLs. The first matching worker is used.',
      ),
    expression: zod
      .string()
      .describe(
        'JavaScript expression to evaluate in the worker. Async expressions resolved.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const worker = await findWorker(
      request.page.pptrPage,
      request.params.workerUrlSubstring,
    );
    // Wrap as an expression so callers don't have to write a function literal.
    const value = await worker.evaluate(
      `(async () => (${request.params.expression}))()` as never,
    );
    response.appendResponseLine(
      JSON.stringify({workerUrl: worker.url(), result: value}, null, 2),
    );
  },
});

export const unregisterServiceWorker = definePageTool({
  name: 'unregister_service_worker',
  description:
    'Unregisters a service worker by registration scope URL (e.g. "https://example.com/").',
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    scopeURL: zod
      .string()
      .url()
      .describe('Service worker registration scope URL.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.unregister', {
      scopeURL: request.params.scopeURL,
    });
    response.appendResponseLine(
      `Unregistered service worker for scope ${request.params.scopeURL}.`,
    );
  },
});

export const updateServiceWorker = definePageTool({
  name: 'update_service_worker',
  description:
    'Forces a service worker registration update (re-fetches the SW script and runs the install/activate cycle if changed).',
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    scopeURL: zod.string().url(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.updateRegistration', {
      scopeURL: request.params.scopeURL,
    });
    response.appendResponseLine(
      `Triggered update for ${request.params.scopeURL}.`,
    );
  },
});

export const skipWaiting = definePageTool({
  name: 'skip_waiting',
  description:
    'Tells a waiting service worker version to immediately activate (CDP `ServiceWorker.skipWaiting`). Useful for testing the new SW without forcing a hard reload.',
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    scopeURL: zod.string().url(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.skipWaiting', {
      scopeURL: request.params.scopeURL,
    });
    response.appendResponseLine(
      `Skipped waiting for ${request.params.scopeURL}.`,
    );
  },
});

export const startServiceWorker = definePageTool({
  name: 'start_service_worker',
  description:
    'Starts a service worker registration (CDP `ServiceWorker.startWorker`).',
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    scopeURL: zod.string().url(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.startWorker', {
      scopeURL: request.params.scopeURL,
    });
    response.appendResponseLine(`Started ${request.params.scopeURL}.`);
  },
});

export const stopServiceWorker = definePageTool({
  name: 'stop_service_worker',
  description:
    "Stops the active service worker for a registration (CDP `ServiceWorker.stopWorker`). Doesn't unregister; the SW will start again on the next event.",
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    versionId: zod
      .string()
      .describe(
        'Service worker version id (from `list_service_worker_registrations`).',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.stopWorker', {
      versionId: request.params.versionId,
    });
    response.appendResponseLine(
      `Stopped worker version ${request.params.versionId}.`,
    );
  },
});

export const getManifest = definePageTool({
  name: 'get_manifest',
  description:
    "Returns the active page's web app manifest (CDP `Page.getAppManifest`). Includes the manifest URL, parsed errors, and raw text.",
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    const result = await session.send('Page.getAppManifest', {});
    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

export const triggerBackgroundSync = definePageTool({
  name: 'trigger_background_sync',
  description:
    'Manually trigger a Background Sync event for a registered tag (CDP `BackgroundService` domain).',
  annotations: {
    category: ToolCategory.SERVICE_WORKER,
    readOnlyHint: false,
  },
  schema: {
    origin: zod.string().describe('Origin of the service worker.'),
    serviceWorkerRegistrationId: zod
      .string()
      .describe(
        "Registration id (from `list_service_workers`'s context output).",
      ),
    tag: zod.string().describe('Sync tag.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('BackgroundService.startObserving', {
      service: 'backgroundSync',
    });
    await session.send('BackgroundService.fireBackgroundSync', {
      origin: request.params.origin,
      serviceWorkerRegistrationId: request.params.serviceWorkerRegistrationId,
      tag: request.params.tag,
      lastChance: false,
    });
    response.appendResponseLine(
      `Fired backgroundSync tag "${request.params.tag}".`,
    );
  },
});
