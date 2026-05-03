/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3: persistent request interception, response mocking, header
 * injection, URL blocking, and HAR record/export. Backed by
 * `NetworkInterceptionManager` (registry) and `HarRecorder` (event
 * collection) on `McpContext`.
 */

import {HarRecorder} from '../HarRecorder.js';
import type {Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const ACTION_ENUM = zod.enum(['continue', 'abort', 'fulfill', 'modify']);

export const interceptNetwork = definePageTool({
  name: 'intercept_network',
  description: `Register a persistent request interceptor for the current page.

Returns the new \`interceptorId\`. Rules are evaluated in registration order; the first matching rule wins. Use \`mock_response\`, \`block_urls\`, or \`modify_request_headers\` for common cases — they are convenience wrappers around this tool.`,
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod
      .string()
      .describe(
        'URLPattern to match (e.g. `https://api.example.com/*` or `*://*/static/*`).',
      ),
    action: ACTION_ENUM.describe(
      '`continue` (no-op pass through), `abort` (block), `fulfill` (mock response), or `modify` (header / method / body overrides on the outgoing request).',
    ),
    abortReason: zod
      .string()
      .optional()
      .describe('For `abort`. Default `blockedbyclient`.'),
    status: zod
      .number()
      .int()
      .min(100)
      .max(599)
      .optional()
      .describe('For `fulfill`. Default 200.'),
    headers: zod
      .record(zod.string(), zod.string())
      .optional()
      .describe('For `fulfill`. Response headers.'),
    body: zod.string().optional().describe('For `fulfill`. Response body.'),
    contentType: zod
      .string()
      .optional()
      .describe('For `fulfill`. Convenience for the `Content-Type` header.'),
    latencyMs: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Artificial delay before the response is delivered.'),
    setHeaders: zod
      .record(zod.string(), zod.string())
      .optional()
      .describe(
        'For `modify`. Headers to set/override on the outgoing request.',
      ),
    removeHeaders: zod
      .array(zod.string())
      .optional()
      .describe(
        'For `modify`. Header names to drop from the outgoing request.',
      ),
    method: zod
      .string()
      .optional()
      .describe('For `modify`. Override HTTP method.'),
    postData: zod
      .string()
      .optional()
      .describe('For `modify`. Override outgoing request body.'),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const rule = await context
      .getInterceptionManager()
      .addRule(request.page.pptrPage as Page, pageIdOf(request.page.pptrPage), {
        urlPattern: request.params.urlPattern,
        action: request.params.action,
        abortReason: request.params.abortReason,
        status: request.params.status,
        headers: request.params.headers,
        body: request.params.body,
        contentType: request.params.contentType,
        latencyMs: request.params.latencyMs,
        setHeaders: request.params.setHeaders,
        removeHeaders: request.params.removeHeaders,
        method: request.params.method,
        postData: request.params.postData,
      });
    response.appendResponseLine(JSON.stringify({interceptor: rule}, null, 2));
  },
});

export const listInterceptors = definePageTool({
  name: 'list_interceptors',
  description: 'Lists all active network interceptors for the current page.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const pageId = pageIdOf(request.page.pptrPage);
    const rules = context.getInterceptionManager().listForPage(pageId);
    response.appendResponseLine(JSON.stringify({pageId, rules}, null, 2));
  },
});

export const removeInterceptor = definePageTool({
  name: 'remove_interceptor',
  description: 'Removes a single interceptor by id.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    interceptorId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const removed = await context
      .getInterceptionManager()
      .removeRule(
        request.page.pptrPage as Page,
        pageIdOf(request.page.pptrPage),
        request.params.interceptorId,
      );
    response.appendResponseLine(
      removed
        ? `Removed interceptor ${request.params.interceptorId}.`
        : `No interceptor ${request.params.interceptorId} found.`,
    );
  },
});

export const clearInterceptors = definePageTool({
  name: 'clear_interceptors',
  description: 'Removes all interceptors for the current page.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const n = await context
      .getInterceptionManager()
      .clearForPage(
        request.page.pptrPage as Page,
        pageIdOf(request.page.pptrPage),
      );
    response.appendResponseLine(`Cleared ${n} interceptor(s).`);
  },
});

// ── Convenience wrappers ─────────────────────────────────────────────────────

export const mockResponse = definePageTool({
  name: 'mock_response',
  description:
    'Convenience wrapper around `intercept_network` with `action: fulfill`. Returns the registered interceptorId.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod.string(),
    status: zod.number().int().min(100).max(599).optional(),
    headers: zod.record(zod.string(), zod.string()).optional(),
    body: zod.string().optional(),
    contentType: zod.string().optional(),
    latencyMs: zod.number().int().min(0).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const rule = await context
      .getInterceptionManager()
      .addRule(request.page.pptrPage as Page, pageIdOf(request.page.pptrPage), {
        urlPattern: request.params.urlPattern,
        action: 'fulfill',
        status: request.params.status,
        headers: request.params.headers,
        body: request.params.body,
        contentType: request.params.contentType,
        latencyMs: request.params.latencyMs,
      });
    response.appendResponseLine(JSON.stringify({interceptor: rule}, null, 2));
  },
});

export const modifyRequestHeaders = definePageTool({
  name: 'modify_request_headers',
  description:
    'Convenience wrapper around `intercept_network` with `action: modify`. Sets and/or removes headers on outgoing requests matching urlPattern.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    urlPattern: zod.string(),
    setHeaders: zod.record(zod.string(), zod.string()).optional(),
    removeHeaders: zod.array(zod.string()).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const rule = await context
      .getInterceptionManager()
      .addRule(request.page.pptrPage as Page, pageIdOf(request.page.pptrPage), {
        urlPattern: request.params.urlPattern,
        action: 'modify',
        setHeaders: request.params.setHeaders,
        removeHeaders: request.params.removeHeaders,
      });
    response.appendResponseLine(JSON.stringify({interceptor: rule}, null, 2));
  },
});

export const blockUrls = definePageTool({
  name: 'block_urls',
  description:
    'Block requests matching any of the provided URLPattern strings. Convenience wrapper around `intercept_network` with `action: abort`.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    patterns: zod.array(zod.string()).min(1),
    abortReason: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const ids: string[] = [];
    for (const urlPattern of request.params.patterns) {
      const rule = await context
        .getInterceptionManager()
        .addRule(
          request.page.pptrPage as Page,
          pageIdOf(request.page.pptrPage),
          {
            urlPattern,
            action: 'abort',
            abortReason: request.params.abortReason,
          },
        );
      ids.push(rule.id);
    }
    response.appendResponseLine(JSON.stringify({interceptorIds: ids}, null, 2));
  },
});

// ── HAR recording ────────────────────────────────────────────────────────────

export const recordHarStart = definePageTool({
  name: 'record_har_start',
  description:
    'Begin recording a HAR for the current page. Use `record_har_stop` (with the same `name`) to end the recording and get the HAR contents or write a file.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    name: zod
      .string()
      .min(1)
      .describe(
        'Logical name for this recording. Pass the same name to `record_har_stop`.',
      ),
    includeBodies: zod
      .boolean()
      .optional()
      .describe(
        'When true, response bodies up to 1 MiB are included in the HAR (utf-8 if textual, base64 otherwise).',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    if (context.getHarRecorder(request.params.name)) {
      throw new Error(
        `A HAR recording named "${request.params.name}" is already in progress.`,
      );
    }
    const recorder = new HarRecorder(request.page.pptrPage as Page, {
      name: request.params.name,
      pageId: pageIdOf(request.page.pptrPage),
      includeBodies: request.params.includeBodies ?? false,
    });
    context.setHarRecorder(request.params.name, recorder);
    response.appendResponseLine(
      `Started HAR recording "${request.params.name}" (includeBodies=${recorder.includeBodies}).`,
    );
  },
});

export const recordHarStop = definePageTool({
  name: 'record_har_stop',
  description:
    'Stops a HAR recording started with `record_har_start`. Either writes to `filePath` (with `.har` extension auto-applied) or returns the HAR JSON inline.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().min(1),
    filePath: zod
      .string()
      .optional()
      .describe(
        'Optional output path. If omitted, the HAR is returned inline.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const recorder = context.getHarRecorder(request.params.name);
    if (!recorder) {
      throw new Error(
        `No HAR recording named "${request.params.name}" is active.`,
      );
    }
    recorder.stop();
    const json = recorder.toHarJson();
    context.deleteHarRecorder(request.params.name);
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      const result = await context.saveFile(
        new TextEncoder().encode(json),
        request.params.filePath,
        '.json',
      );
      response.appendResponseLine(`Saved HAR to ${result.filename}.`);
    } else {
      response.appendResponseLine(json);
    }
  },
});

export const listHarRecordings = definePageTool({
  name: 'list_har_recordings',
  description: 'Lists in-progress HAR recordings.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (_request, response, context) => {
    const recorders = context.listHarRecorders().map(r => ({
      name: r.name,
      pageId: r.pageId,
      startedAt: r.startedAt,
      includeBodies: r.includeBodies,
    }));
    response.appendResponseLine(
      JSON.stringify({recordings: recorders}, null, 2),
    );
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a stable per-page id usable as a key in the interception
 * registry. The Puppeteer Page itself is the identity; we hash via target
 * id which is stable for the lifetime of the page.
 */
function pageIdOf(page: Page): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tgt = (page as any).target?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id: string | undefined = tgt?._targetId ?? (tgt as any)?.id?.();
  if (!id) {
    return 0;
  }
  // Hash to a stable number; we don't need it to be strictly unique across
  // sessions — just consistent for one page lifetime.
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return h;
}
