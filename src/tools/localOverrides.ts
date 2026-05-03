/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.5: local overrides. DevTools "Local overrides" UX —
 * file-backed response substitution. Builds on the Phase 3
 * `NetworkInterceptionManager`: every override is a fulfill rule with
 * `bodyFromPath` set, so disk edits to the override file take effect on
 * the next request without re-registering.
 *
 * Gated by `--experimentalLocalOverrides` (default off).
 */

import type {Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';
import {createIdGenerator} from '../utils/id.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

interface OverrideRecord {
  overrideId: string;
  interceptorId: string;
  pageId: number;
  urlPattern: string;
  contentPath: string;
  contentType?: string;
  status: number;
  enabled: boolean;
  createdAt: number;
}

const overrides = new Map<string, OverrideRecord>();
const idGen = createIdGenerator();

function makeOverrideId(): string {
  return `ovr-${idGen()}`;
}

function pageIdOf(page: Page): number {
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

export const addLocalOverride = definePageTool({
  name: 'add_local_override',
  description: `Register a local override: requests matching urlPattern are fulfilled with the contents of \`contentPath\` on disk. The file is re-read on every match so editing the file takes effect without re-registering.

Returns the new \`overrideId\`. Wraps Phase 3's \`intercept_network\` with \`action: fulfill\` + \`bodyFromPath\`.`,
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
    conditions: ['experimentalLocalOverrides'],
  },
  schema: {
    urlPattern: zod
      .string()
      .describe('URLPattern to match (e.g. `https://example.com/api/*`).'),
    contentPath: zod
      .string()
      .describe('Absolute path to the file whose contents serve the response.'),
    contentType: zod
      .string()
      .optional()
      .describe(
        'Response Content-Type. If omitted, no content-type header is set.',
      ),
    status: zod
      .number()
      .int()
      .min(100)
      .max(599)
      .optional()
      .describe('Response status code. Default 200.'),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    context.validatePath(request.params.contentPath);
    const overrideId = makeOverrideId();
    const pageId = pageIdOf(request.page.pptrPage);
    const rule = await context
      .getInterceptionManager()
      .addRule(request.page.pptrPage, pageId, {
        urlPattern: request.params.urlPattern,
        action: 'fulfill',
        bodyFromPath: request.params.contentPath,
        contentType: request.params.contentType,
        status: request.params.status ?? 200,
      });
    overrides.set(overrideId, {
      overrideId,
      interceptorId: rule.id,
      pageId,
      urlPattern: request.params.urlPattern,
      contentPath: request.params.contentPath,
      contentType: request.params.contentType,
      status: request.params.status ?? 200,
      enabled: true,
      createdAt: Date.now(),
    });
    response.appendResponseLine(
      JSON.stringify(
        {
          overrideId,
          interceptorId: rule.id,
          urlPattern: request.params.urlPattern,
          contentPath: request.params.contentPath,
        },
        null,
        2,
      ),
    );
  },
});

export const listOverrides = definePageTool({
  name: 'list_overrides',
  description: 'Lists all registered local overrides for the current page.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: true,
    conditions: ['experimentalLocalOverrides'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    const pageId = pageIdOf(request.page.pptrPage);
    const records = [...overrides.values()].filter(o => o.pageId === pageId);
    response.appendResponseLine(JSON.stringify({overrides: records}, null, 2));
  },
});

export const removeOverride = definePageTool({
  name: 'remove_override',
  description: 'Removes a single local override by id.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
    conditions: ['experimentalLocalOverrides'],
  },
  schema: {
    overrideId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const record = overrides.get(request.params.overrideId);
    if (!record) {
      response.appendResponseLine(
        `No override "${request.params.overrideId}" found.`,
      );
      return;
    }
    await context
      .getInterceptionManager()
      .removeRule(request.page.pptrPage, record.pageId, record.interceptorId);
    overrides.delete(request.params.overrideId);
    response.appendResponseLine(
      `Removed override ${request.params.overrideId}.`,
    );
  },
});

export const disableOverrides = definePageTool({
  name: 'disable_overrides',
  description:
    'Temporarily disables every override for the current page (the underlying interceptor rules are removed). Definitions are kept; call `enable_overrides` to re-register.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
    conditions: ['experimentalLocalOverrides'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const pageId = pageIdOf(request.page.pptrPage);
    let disabled = 0;
    for (const record of overrides.values()) {
      if (record.pageId !== pageId || !record.enabled) {
        continue;
      }
      await context
        .getInterceptionManager()
        .removeRule(request.page.pptrPage, pageId, record.interceptorId);
      record.enabled = false;
      disabled++;
    }
    response.appendResponseLine(
      `Disabled ${disabled} override(s) for the current page.`,
    );
  },
});

export const enableOverrides = definePageTool({
  name: 'enable_overrides',
  description:
    'Re-registers every override that was disabled by `disable_overrides`. New interceptorIds are issued.',
  annotations: {
    category: ToolCategory.INTERCEPTION,
    readOnlyHint: false,
    conditions: ['experimentalLocalOverrides'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const pageId = pageIdOf(request.page.pptrPage);
    let enabled = 0;
    for (const record of overrides.values()) {
      if (record.pageId !== pageId || record.enabled) {
        continue;
      }
      const rule = await context
        .getInterceptionManager()
        .addRule(request.page.pptrPage, pageId, {
          urlPattern: record.urlPattern,
          action: 'fulfill',
          bodyFromPath: record.contentPath,
          contentType: record.contentType,
          status: record.status,
        });
      record.interceptorId = rule.id;
      record.enabled = true;
      enabled++;
    }
    response.appendResponseLine(
      `Re-enabled ${enabled} override(s) for the current page.`,
    );
  },
});
