/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.2: axe-core accessibility audits.
 *
 * Bundles axe-core as a runtime dependency. The minified source is read
 * once at module import time and injected into the page via
 * `page.addScriptTag({content})` for every audit. axe.run is then called
 * with the user-provided options.
 *
 * Gated by `--experimentalAxe` (default off).
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

// Resolve the axe-core bundle once at import. We use `createRequire` so the
// resolution survives both Node ESM and the rolled-up bundle layout.
const require = createRequire(import.meta.url);
const axePath = path.dirname(require.resolve('axe-core/package.json'));
const axeMinPath = path.join(axePath, 'axe.min.js');
const axeSource: string = fs.readFileSync(axeMinPath, 'utf-8');

const RESULT_TYPE_ENUM = zod.enum([
  'violations',
  'passes',
  'incomplete',
  'inapplicable',
]);

export const runAxeAudit = definePageTool({
  name: 'run_axe_audit',
  description: `Inject axe-core into the active page and run an accessibility audit. Returns axe's structured result (violations / passes / incomplete / inapplicable).

Use \`list_axe_rules\` to discover rule ids. \`includeOnly\` and \`exclude\` accept CSS selectors.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalAxe'],
  },
  schema: {
    rules: zod
      .array(zod.string())
      .optional()
      .describe(
        'Rule ids to enable (whitelist). If omitted, all default rules run.',
      ),
    includeOnly: zod
      .array(zod.string())
      .optional()
      .describe('CSS selectors. If set, axe only audits descendants of these.'),
    exclude: zod
      .array(zod.string())
      .optional()
      .describe('CSS selectors. Subtrees rooted at these are skipped.'),
    resultTypes: zod
      .array(RESULT_TYPE_ENUM)
      .optional()
      .describe(
        'Result kinds to return. Default ["violations", "incomplete"] to keep payload small.',
      ),
    runOnly: zod
      .array(zod.string())
      .optional()
      .describe(
        'WCAG / best-practice tag filter (e.g. ["wcag2a", "wcag2aa"]).',
      ),
  },
  blockedByDialog: true,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    // Inject axe if not already present. addScriptTag with `content` is
    // idempotent on the symbol level — multiple calls just reassign
    // window.axe — but skip if already loaded for performance.
    const alreadyLoaded = await page.evaluate(
      () => typeof (window as unknown as {axe?: unknown}).axe !== 'undefined',
    );
    if (!alreadyLoaded) {
      await page.addScriptTag({content: axeSource});
    }

    const opts: Record<string, unknown> = {};
    if (request.params.rules?.length) {
      opts.runOnly = {type: 'rule', values: request.params.rules};
    } else if (request.params.runOnly?.length) {
      opts.runOnly = {type: 'tag', values: request.params.runOnly};
    }
    opts.resultTypes = request.params.resultTypes ?? [
      'violations',
      'incomplete',
    ];

    let context: unknown = undefined;
    if (request.params.includeOnly?.length || request.params.exclude?.length) {
      context = {
        include: request.params.includeOnly,
        exclude: request.params.exclude,
      };
    }

    const result = await page.evaluate(
      async ({ctx, options}: {ctx: unknown; options: unknown}) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        return await axe.run(ctx ?? document, options);
      },
      {ctx: context ?? null, options: opts as unknown},
    );

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

export const listAxeRules = definePageTool({
  name: 'list_axe_rules',
  description:
    "Returns axe-core's built-in rule catalog (id, tags, impact, description, help, helpUrl). Use to pick targeted rules for `run_axe_audit`.",
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalAxe'],
  },
  schema: {
    tag: zod
      .string()
      .optional()
      .describe(
        'Optional tag filter (e.g. "wcag2a", "best-practice", "section508").',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    const alreadyLoaded = await page.evaluate(
      () => typeof (window as unknown as {axe?: unknown}).axe !== 'undefined',
    );
    if (!alreadyLoaded) {
      await page.addScriptTag({content: axeSource});
    }
    const rules = await page.evaluate((tag: string | undefined) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axe = (window as any).axe;
      return axe.getRules(tag ? [tag] : undefined);
    }, request.params.tag);
    response.appendResponseLine(JSON.stringify({rules}, null, 2));
  },
});

export const getAxeRule = definePageTool({
  name: 'get_axe_rule',
  description:
    'Returns details for a single axe-core rule by id (description, help, helpUrl, tags).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalAxe'],
  },
  schema: {
    ruleId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    const alreadyLoaded = await page.evaluate(
      () => typeof (window as unknown as {axe?: unknown}).axe !== 'undefined',
    );
    if (!alreadyLoaded) {
      await page.addScriptTag({content: axeSource});
    }
    const rule = await page.evaluate((id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axe = (window as any).axe;
      return axe.getRules().find((r: {ruleId: string}) => r.ruleId === id);
    }, request.params.ruleId);
    if (!rule) {
      throw new Error(`No axe rule with id "${request.params.ruleId}" found.`);
    }
    response.appendResponseLine(JSON.stringify(rule, null, 2));
  },
});
