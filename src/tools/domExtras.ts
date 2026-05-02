/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 6.5 / 6.11: DOM/layout queries that the original tool surface
 * lacked, plus a multi-tab `broadcast_evaluate`.
 *
 * Lives in the existing `DEBUGGING` and `NAVIGATION` categories rather
 * than a new one — these are small extensions to existing flows.
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, defineTool} from './ToolDefinition.js';

export const queryAll = definePageTool({
  name: 'query_selector_all',
  description: `Returns matches for a CSS selector on the active page. Each match includes the snapshot uid (if the element is part of the current a11y snapshot), tagName, and a brief text excerpt. Useful for narrowing element targets before \`click\` / \`fill\`.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    selector: zod.string().min(1).describe('CSS selector.'),
    limit: zod
      .number()
      .int()
      .positive()
      .max(500)
      .optional()
      .describe('Default 50.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const limit = request.params.limit ?? 50;
    const matches = await request.page.pptrPage.evaluate(
      ({sel, lim}: {sel: string; lim: number}) => {
        const out: Array<{
          tagName: string;
          text: string;
          id?: string;
          classes?: string;
        }> = [];
        const list = document.querySelectorAll(sel);
        for (let i = 0; i < list.length && i < lim; i++) {
          const el = list[i] as HTMLElement;
          out.push({
            tagName: el.tagName.toLowerCase(),
            text: (el.textContent ?? '').trim().slice(0, 120),
            id: el.id || undefined,
            classes: el.className || undefined,
          });
        }
        return {
          total: list.length,
          returned: Math.min(list.length, lim),
          items: out,
        };
      },
      {sel: request.params.selector, lim: limit},
    );
    response.appendResponseLine(JSON.stringify(matches, null, 2));
  },
});

export const getComputedStyles = definePageTool({
  name: 'get_computed_styles',
  description:
    'Returns a subset of `getComputedStyle` for an element identified by uid. Filter to a property list to avoid the full dump.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string(),
    properties: zod
      .array(zod.string())
      .optional()
      .describe(
        'Property names to return (e.g. ["display", "color"]). If omitted, returns the full computed style object — large.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      const styles = await handle.evaluate(
        (el: Element, props: string[] | undefined) => {
          const cs = getComputedStyle(el);
          if (props && props.length) {
            const out: Record<string, string> = {};
            for (const p of props) {
              out[p] = cs.getPropertyValue(p);
            }
            return out;
          }
          const out: Record<string, string> = {};
          for (let i = 0; i < cs.length; i++) {
            const k = cs.item(i);
            out[k] = cs.getPropertyValue(k);
          }
          return out;
        },
        request.params.properties,
      );
      response.appendResponseLine(JSON.stringify(styles, null, 2));
    } finally {
      void handle.dispose();
    }
  },
});

export const getBoxModel = definePageTool({
  name: 'get_box_model',
  description:
    'Returns the box model (content/padding/border/margin quads, plus width/height) for an element by uid.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    uid: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      const box = await handle.evaluate(el => {
        const r = (el as Element).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          left: r.left,
        };
      });
      response.appendResponseLine(JSON.stringify(box, null, 2));
    } finally {
      void handle.dispose();
    }
  },
});

export const scrollIntoView = definePageTool({
  name: 'scroll_into_view',
  description: 'Scrolls the element identified by uid into the viewport.',
  annotations: {
    category: ToolCategory.INPUT,
    readOnlyHint: false,
  },
  schema: {
    uid: zod.string(),
    block: zod.enum(['start', 'center', 'end', 'nearest']).optional(),
    inline: zod.enum(['start', 'center', 'end', 'nearest']).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const handle = await request.page.getElementByUid(request.params.uid);
    try {
      await handle.evaluate(
        (el, b, i) => (el as Element).scrollIntoView({block: b, inline: i}),
        request.params.block ?? 'center',
        request.params.inline ?? 'nearest',
      );
      response.appendResponseLine(
        `Scrolled uid=${request.params.uid} into view.`,
      );
    } finally {
      void handle.dispose();
    }
  },
});

export const getLayoutMetrics = definePageTool({
  name: 'get_layout_metrics',
  description:
    'Returns viewport, content, and visual viewport metrics for the active page (CDP `Page.getLayoutMetrics`).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    // @ts-expect-error internal Puppeteer API
    const session = request.page.pptrPage._client();
    const result = await session.send('Page.getLayoutMetrics', {});
    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

export const broadcastEvaluate = defineTool({
  name: 'broadcast_evaluate',
  description: `Run the same JavaScript expression in every open page (or a filtered subset) and aggregate the results. Useful for cross-tab queries (e.g. "find all pages where the user is logged in").`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  schema: {
    expression: zod.string(),
    pageIds: zod
      .array(zod.number().int())
      .optional()
      .describe(
        'Restrict broadcast to these page ids. Default: every open page.',
      ),
    timeoutMs: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Per-page timeout. Default 5000.'),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    // Enumerate live pages by id. Page ids are dense starting from 1, so we
    // walk until we get the first miss after a hit. (No public listing
    // method on Context yet — adding one is its own refactor.)
    const candidates: Array<{
      pageId: number;
      page: ReturnType<typeof context.getPageById>;
    }> = [];
    for (let id = 1; id < 10000; id++) {
      try {
        const p = context.getPageById(id);
        candidates.push({pageId: id, page: p});
      } catch {
        if (candidates.length > 0) {
          break;
        }
      }
    }
    const filter = new Set(
      request.params.pageIds ?? candidates.map(c => c.pageId),
    );
    const timeoutMs = request.params.timeoutMs ?? 5000;
    const results = await Promise.all(
      candidates
        .filter(c => filter.has(c.pageId))
        .map(async ({pageId, page}) => {
          try {
            const result = await Promise.race([
              page.pptrPage.evaluate(
                `(async () => (${request.params.expression}))()`,
              ),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), timeoutMs),
              ),
            ]);
            return {pageId, ok: true, result};
          } catch (err) {
            return {
              pageId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
    );
    response.appendResponseLine(JSON.stringify({results}, null, 2));
  },
});
