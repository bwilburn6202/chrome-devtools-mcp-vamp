/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 6.1: JavaScript & CSS coverage tools backed by Puppeteer's
 * `page.coverage` API. State is held module-side per page to avoid
 * threading another manager through Context — coverage start/stop pairs
 * are short-lived and tied to the live page.
 */

import {zod} from '../third_party/index.js';
import type {Page} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const jsActive = new WeakMap<Page, boolean>();
const cssActive = new WeakMap<Page, boolean>();

export const startJsCoverage = definePageTool({
  name: 'start_js_coverage',
  description:
    'Start collecting JavaScript code coverage on the active page. Stop with `stop_js_coverage` to retrieve the report.',
  annotations: {
    category: ToolCategory.COVERAGE,
    readOnlyHint: false,
  },
  schema: {
    detailed: zod
      .boolean()
      .optional()
      .describe(
        'When true, collect detailed coverage (every byte). When false, only function-level granularity. Default true.',
      ),
    reportAnonymousScripts: zod
      .boolean()
      .optional()
      .describe('Include anonymous scripts (e.g. eval). Default false.'),
    resetOnNavigation: zod
      .boolean()
      .optional()
      .describe('Reset coverage on navigation. Default true.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    if (jsActive.get(page)) {
      throw new Error('JS coverage is already running on this page.');
    }
    await page.coverage.startJSCoverage({
      includeRawScriptCoverage: request.params.detailed ?? true,
      reportAnonymousScripts: request.params.reportAnonymousScripts ?? false,
      resetOnNavigation: request.params.resetOnNavigation ?? true,
    });
    jsActive.set(page, true);
    response.appendResponseLine('Started JS coverage.');
  },
});

export const stopJsCoverage = definePageTool({
  name: 'stop_js_coverage',
  description:
    'Stop JS coverage and return the report. If `filePath` is set, the JSON is written to disk; otherwise the report is returned inline.',
  annotations: {
    category: ToolCategory.COVERAGE,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod.string().optional(),
    summaryOnly: zod
      .boolean()
      .optional()
      .describe(
        'Return only per-URL byte usage totals instead of full ranges. Default false.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const page = request.page.pptrPage;
    if (!jsActive.get(page)) {
      throw new Error(
        'JS coverage is not running. Call `start_js_coverage` first.',
      );
    }
    const entries = await page.coverage.stopJSCoverage();
    jsActive.delete(page);
    let payload: unknown = entries;
    if (request.params.summaryOnly) {
      payload = entries.map(e => {
        const total = e.text.length;
        const used = e.ranges.reduce((acc, r) => acc + (r.end - r.start), 0);
        return {
          url: e.url,
          totalBytes: total,
          usedBytes: used,
          unusedBytes: total - used,
        };
      });
    }
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      const result = await context.saveFile(
        new TextEncoder().encode(JSON.stringify(payload, null, 2)),
        request.params.filePath,
        '.json',
      );
      response.appendResponseLine(`Saved JS coverage to ${result.filename}.`);
    } else {
      response.appendResponseLine(JSON.stringify(payload, null, 2));
    }
  },
});

export const startCssCoverage = definePageTool({
  name: 'start_css_coverage',
  description: 'Start collecting CSS coverage on the active page.',
  annotations: {
    category: ToolCategory.COVERAGE,
    readOnlyHint: false,
  },
  schema: {
    resetOnNavigation: zod.boolean().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    if (cssActive.get(page)) {
      throw new Error('CSS coverage is already running on this page.');
    }
    await page.coverage.startCSSCoverage({
      resetOnNavigation: request.params.resetOnNavigation ?? true,
    });
    cssActive.set(page, true);
    response.appendResponseLine('Started CSS coverage.');
  },
});

export const stopCssCoverage = definePageTool({
  name: 'stop_css_coverage',
  description: 'Stop CSS coverage and return the report.',
  annotations: {
    category: ToolCategory.COVERAGE,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod.string().optional(),
    summaryOnly: zod.boolean().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const page = request.page.pptrPage;
    if (!cssActive.get(page)) {
      throw new Error(
        'CSS coverage is not running. Call `start_css_coverage` first.',
      );
    }
    const entries = await page.coverage.stopCSSCoverage();
    cssActive.delete(page);
    let payload: unknown = entries;
    if (request.params.summaryOnly) {
      payload = entries.map(e => {
        const total = e.text.length;
        const used = e.ranges.reduce((acc, r) => acc + (r.end - r.start), 0);
        return {
          url: e.url,
          totalBytes: total,
          usedBytes: used,
          unusedBytes: total - used,
        };
      });
    }
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      const result = await context.saveFile(
        new TextEncoder().encode(JSON.stringify(payload, null, 2)),
        request.params.filePath,
        '.json',
      );
      response.appendResponseLine(`Saved CSS coverage to ${result.filename}.`);
    } else {
      response.appendResponseLine(JSON.stringify(payload, null, 2));
    }
  },
});
