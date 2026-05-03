/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.3: real DevTools Issues panel.
 *
 * Backed by `IssueAggregator` (CDP `Audits.issueAdded` events) instead
 * of the legacy `FakeIssuesManager` stub. Each page is enabled lazily
 * the first time `list_issues` is called for it.
 *
 * Gated by `--experimentalIssues` (default off).
 */

import {zod} from '../third_party/index.js';
import {paginate} from '../utils/pagination.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const listIssues = definePageTool({
  name: 'list_issues',
  description: `Returns DevTools issues (CSP, mixed content, cookies, low-contrast, deprecation, …) collected from \`Audits.issueAdded\` events for the active page.

The first call enables the Audits domain on the page; subsequent calls return whatever's been buffered since.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalIssues'],
  },
  schema: {
    pageSize: zod.number().int().positive().optional(),
    pageIdx: zod.number().int().min(0).optional(),
    types: zod
      .array(zod.string())
      .optional()
      .describe(
        'Filter by issue code (e.g. "ContentSecurityPolicyIssue", "MixedContentIssue"). If omitted, all issues are returned.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const aggregator = context.getIssueAggregator();
    await aggregator.enableForPage(request.page.pptrPage);
    let entries = aggregator.listForPage(request.page.pptrPage);
    if (request.params.types?.length) {
      const set = new Set(request.params.types);
      entries = entries.filter(e => set.has(e.code));
    }
    const {items, totalPages, hasNextPage, currentPage} = paginate(entries, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });
    response.appendResponseLine(
      JSON.stringify(
        {
          totalIssues: entries.length,
          currentPage,
          totalPages,
          hasNextPage,
          issues: items,
        },
        null,
        2,
      ),
    );
  },
});

export const getIssue = definePageTool({
  name: 'get_issue',
  description:
    'Returns the full details for a single issue by id (from `list_issues`).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalIssues'],
  },
  schema: {
    issueId: zod.number().int(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const entry = context.getIssueAggregator().getById(request.params.issueId);
    if (!entry) {
      throw new Error(`No issue with id ${request.params.issueId} found.`);
    }
    response.appendResponseLine(JSON.stringify(entry, null, 2));
  },
});

export const clearIssues = definePageTool({
  name: 'clear_issues',
  description:
    'Clears the issue buffer for the active page. The aggregator stays enabled — subsequent issues will be captured.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalIssues'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const cleared = context
      .getIssueAggregator()
      .clearForPage(request.page.pptrPage);
    response.appendResponseLine(`Cleared ${cleared} issue(s).`);
  },
});
