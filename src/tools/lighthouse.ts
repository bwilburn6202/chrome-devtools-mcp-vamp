/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

import {
  snapshot,
  navigation,
  generateReport,
  zod,
  type Flags,
  type RunnerResult,
  type OutputMode,
} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {startTrace} from './performance.js';
import {definePageTool} from './ToolDefinition.js';

export const lighthouseAudit = definePageTool({
  name: 'lighthouse_audit',
  description: `Get Lighthouse score and reports. By default audits accessibility, SEO and best practices. Pass \`categories\` to include other audits — pass \`['performance']\` for the performance audit (or use ${startTrace.name} for trace-level analysis).`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    mode: zod
      .enum(['navigation', 'snapshot'])
      .default('navigation')
      .describe(
        '"navigation" reloads & audits. "snapshot" analyzes current state.',
      ),
    device: zod
      .enum(['desktop', 'mobile'])
      .default('desktop')
      .describe('Device to emulate.'),
    outputDirPath: zod
      .string()
      .optional()
      .describe('Directory for reports. If omitted, uses temporary files.'),
    // Phase 6.9: opt-in performance + arbitrary category selection.
    categories: zod
      .array(
        zod.enum([
          'accessibility',
          'seo',
          'best-practices',
          'performance',
          'pwa',
        ]),
      )
      .optional()
      .describe(
        "Lighthouse audit categories to run. Default ['accessibility', 'seo', 'best-practices'].",
      ),
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    const page = request.page;
    const categories = request.params.categories ?? [
      'accessibility',
      'seo',
      'best-practices',
    ];
    const formats = ['json', 'html'] as OutputMode[];
    const {
      mode = 'navigation',
      device = 'desktop',
      outputDirPath,
    } = request.params;

    context.validatePath(outputDirPath);

    const flags: Flags = {
      onlyCategories: categories,
      output: formats,
      // Phase 1.6: configurable via --lighthouseMaxWaitMs (default 30000).
      maxWaitForLoad: context.getTuning().lighthouseMaxWaitMs,
    };

    if (device === 'desktop') {
      flags.formFactor = 'desktop';
      flags.screenEmulation = {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      };
    } else {
      flags.formFactor = 'mobile';
      flags.screenEmulation = {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      };
    }

    let result: RunnerResult | undefined;
    try {
      if (mode === 'navigation') {
        result = await navigation(page.pptrPage, page.pptrPage.url(), {
          flags,
        });
      } else {
        result = await snapshot(page.pptrPage, {
          flags,
        });
      }

      if (!result) {
        throw new Error('Lighthouse audit failed.');
      }
    } finally {
      await context.restoreEmulation(page);
    }

    const lhr = result.lhr;
    const reportPaths: string[] = [];

    const encoder = new TextEncoder();
    for (const format of formats) {
      const report = generateReport(lhr, format);
      const data = encoder.encode(report);
      if (outputDirPath) {
        const reportPath = path.join(outputDirPath, `report`);
        const {filename} = await context.saveFile(
          data,
          reportPath,
          `.${format}`,
        );
        reportPaths.push(filename);
      } else {
        const {filepath} = await context.saveTemporaryFile(
          data,
          `report.${format}`,
        );
        reportPaths.push(filepath);
      }
    }

    const categoryScores = Object.values(lhr.categories).map(c => ({
      id: c.id,
      title: c.title,
      score: c.score,
    }));

    const failedAudits = Object.values(lhr.audits).filter(
      a => a.score !== null && a.score < 1,
    ).length;

    const passedAudits = Object.values(lhr.audits).filter(
      a => a.score === 1,
    ).length;

    const output = {
      summary: {
        mode,
        device,
        url: lhr.mainDocumentUrl,
        scores: categoryScores,
        audits: {
          failed: failedAudits,
          passed: passedAudits,
        },
        timing: {
          total: lhr.timing.total,
        },
      },
      reports: reportPaths,
    };

    response.attachLighthouseResult(output);
  },
});
