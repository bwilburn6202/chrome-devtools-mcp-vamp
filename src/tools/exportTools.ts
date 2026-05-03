/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 6.4: page export. PDF (`Page.printToPDF`), MHTML
 * (`Page.captureSnapshot`), and DOM HTML (`document.documentElement.outerHTML`).
 *
 * Adds the `EXPORT` category. File extensions `.pdf`, `.mhtml`, and
 * `.html` are written via `context.saveTemporaryFile` so the existing
 * file sandbox / path-validation logic still applies.
 */

import type {Page} from '../third_party/index.js';
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

export const printToPdf = definePageTool({
  name: 'print_to_pdf',
  description:
    'Export the active page as a PDF (CDP `Page.printToPDF`). Returns the saved file path.',
  annotations: {
    category: ToolCategory.EXPORT,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod
      .string()
      .optional()
      .describe('Output path. Defaults to a temp file.'),
    landscape: zod.boolean().optional(),
    printBackground: zod
      .boolean()
      .optional()
      .describe('Include background colors / images. Default true.'),
    paperFormat: zod
      .enum([
        'letter',
        'legal',
        'tabloid',
        'ledger',
        'a0',
        'a1',
        'a2',
        'a3',
        'a4',
        'a5',
        'a6',
      ])
      .optional()
      .describe('Standard paper size. Mutually exclusive with width/height.'),
    width: zod.string().optional().describe('e.g. "8.5in", "210mm".'),
    height: zod.string().optional(),
    marginTop: zod.string().optional(),
    marginRight: zod.string().optional(),
    marginBottom: zod.string().optional(),
    marginLeft: zod.string().optional(),
    scale: zod.number().min(0.1).max(2).optional(),
    pageRanges: zod
      .string()
      .optional()
      .describe('e.g. "1-3,5". Default: all pages.'),
    headerTemplate: zod
      .string()
      .optional()
      .describe(
        'HTML for header. Use classes `date title url pageNumber totalPages`.',
      ),
    footerTemplate: zod.string().optional(),
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const buffer = await request.page.pptrPage.pdf({
      landscape: request.params.landscape,
      printBackground: request.params.printBackground ?? true,
      format: request.params.paperFormat,
      width: request.params.width,
      height: request.params.height,
      margin: {
        top: request.params.marginTop,
        right: request.params.marginRight,
        bottom: request.params.marginBottom,
        left: request.params.marginLeft,
      },
      scale: request.params.scale,
      pageRanges: request.params.pageRanges,
      headerTemplate: request.params.headerTemplate,
      footerTemplate: request.params.footerTemplate,
      displayHeaderFooter: Boolean(
        request.params.headerTemplate || request.params.footerTemplate,
      ),
    });
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      // .pdf isn't currently in SupportedExtensions; saveTemporaryFile handles it.
      const {filepath} = await context.saveTemporaryFile(
        new Uint8Array(buffer),
        'page.pdf',
      );
      response.appendResponseLine(`Saved PDF to ${filepath}.`);
      return;
    }
    const {filepath} = await context.saveTemporaryFile(
      new Uint8Array(buffer),
      'page.pdf',
    );
    response.appendResponseLine(`Saved PDF to ${filepath}.`);
  },
});

export const saveMhtml = definePageTool({
  name: 'save_mhtml',
  description:
    'Save the active page as an MHTML archive (CDP `Page.captureSnapshot` with format `mhtml`).',
  annotations: {
    category: ToolCategory.EXPORT,
    readOnlyHint: false,
  },
  schema: {},
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const result = (await cdp(request.page.pptrPage).send(
      'Page.captureSnapshot',
      {format: 'mhtml'},
    )) as {data: string};
    const {filepath} = await context.saveTemporaryFile(
      new TextEncoder().encode(result.data),
      'page.mhtml',
    );
    response.appendResponseLine(`Saved MHTML to ${filepath}.`);
  },
});

export const exportDomHtml = definePageTool({
  name: 'export_dom_html',
  description:
    "Save the active page's serialized DOM (document.documentElement.outerHTML).",
  annotations: {
    category: ToolCategory.EXPORT,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod.string().optional(),
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const html = await request.page.pptrPage.evaluate(
      () => document.documentElement.outerHTML,
    );
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      const result = await context.saveFile(
        new TextEncoder().encode(html),
        request.params.filePath,
        '.html',
      );
      response.appendResponseLine(`Saved HTML to ${result.filename}.`);
    } else {
      const {filepath} = await context.saveTemporaryFile(
        new TextEncoder().encode(html),
        'page.html',
      );
      response.appendResponseLine(`Saved HTML to ${filepath}.`);
    }
  },
});
