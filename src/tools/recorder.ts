/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.4: user-action recorder.
 *
 * v1 surface: explicit step recording + start/stop/list/get/replay.
 * Auto-instrumentation of every input tool is left for a follow-up
 * (would require a hook layer in `definePageTool`).
 *
 * Gated by `--experimentalRecorder` (default off).
 */

import fs from 'node:fs/promises';

import {
  recordingToJson,
  recordingToPlaywright,
  recordingToPuppeteer,
} from '../RecorderManager.js';
import type {Recording, RecorderStep} from '../RecorderManager.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const STEP_TYPE_ENUM = zod.enum([
  'navigate',
  'click',
  'fill',
  'press_key',
  'type_text',
  'drag',
  'upload_file',
  'wait_for',
  'custom',
]);

export const recorderStart = definePageTool({
  name: 'recorder_start',
  description:
    'Begin a new in-memory user-action recording. Multiple recordings can be active at once (keyed by `name`).',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
    conditions: ['experimentalRecorder'],
  },
  schema: {
    name: zod.string().min(1),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    context.getRecorderManager().start(request.params.name);
    response.appendResponseLine(`Recording "${request.params.name}" started.`);
  },
});

export const recorderRecordStep = definePageTool({
  name: 'recorder_record_step',
  description: `Append a step to all active recordings. Use this from the orchestrator (LLM) before / after invoking input tools to build a replayable script.

The free-form \`payload\` field carries the per-step parameters (e.g. {url} for navigate, {selector, value} for fill). The receiving recordings preserve it verbatim.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
    conditions: ['experimentalRecorder'],
  },
  schema: {
    type: STEP_TYPE_ENUM,
    payload: zod.record(zod.string(), zod.unknown()).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const step = {
      type: request.params.type,
      ...(request.params.payload ?? {}),
    } as unknown as RecorderStep;
    context.getRecorderManager().recordStep(step);
    response.appendResponseLine(`Recorded ${request.params.type} step.`);
  },
});

export const recorderStop = definePageTool({
  name: 'recorder_stop',
  description:
    'Stop a recording and return / save it. Supported export formats: `json`, `puppeteer`, `playwright`.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
    conditions: ['experimentalRecorder'],
  },
  schema: {
    name: zod.string().min(1),
    exportFormat: zod
      .enum(['json', 'puppeteer', 'playwright'])
      .optional()
      .describe('Default `json`.'),
    filePath: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const rec = context
      .getRecorderManager()
      .stop(request.params.name) as unknown as Recording;
    const format = request.params.exportFormat ?? 'json';
    const text = renderRecording(rec, format);
    if (request.params.filePath) {
      context.validatePath(request.params.filePath);
      const ext =
        format === 'json'
          ? '.json'
          : format === 'playwright'
            ? '.html'
            : '.html'; // .ts not in SupportedExtensions; user supplies their own
      const result = await context.saveFile(
        new TextEncoder().encode(text),
        request.params.filePath,
        ext as never,
      );
      response.appendResponseLine(
        `Saved ${format} recording "${rec.name}" to ${result.filename}.`,
      );
    } else {
      response.appendResponseLine(text);
    }
  },
});

export const listRecordings = definePageTool({
  name: 'list_recordings',
  description: 'Lists all active recordings.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
    conditions: ['experimentalRecorder'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (_request, response, context) => {
    const recs = context.getRecorderManager().list();
    response.appendResponseLine(JSON.stringify({recordings: recs}, null, 2));
  },
});

export const getRecording = definePageTool({
  name: 'get_recording',
  description: 'Peek at an active recording without stopping it.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
    conditions: ['experimentalRecorder'],
  },
  schema: {
    name: zod.string().min(1),
    exportFormat: zod.enum(['json', 'puppeteer', 'playwright']).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response, context) => {
    const rec = context.getRecorderManager().get(request.params.name);
    if (!rec) {
      throw new Error(`No recording named "${request.params.name}".`);
    }
    response.appendResponseLine(
      renderRecording(rec as Recording, request.params.exportFormat ?? 'json'),
    );
  },
});

export const replayRecording = definePageTool({
  name: 'replay_recording',
  description: `Load a JSON recording from disk and replay it through the existing input/navigation tools.

Replay is best-effort: only \`navigate\`, \`press_key\`, \`type_text\`, and \`wait_for\` steps run unconditionally. Selector-only steps that lack a selector (e.g. uid-only \`click\`) are logged and skipped — the LLM that generated the recording is expected to convert uids to selectors before saving.`,
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
    conditions: ['experimentalRecorder'],
  },
  schema: {
    recordingPath: zod.string(),
  },
  blockedByDialog: true,
  handler: async (request, response, context) => {
    context.validatePath(request.params.recordingPath);
    const raw = await fs.readFile(request.params.recordingPath, 'utf-8');
    const parsed = JSON.parse(raw) as Recording;
    if (!Array.isArray(parsed.steps)) {
      throw new Error('Recording missing `steps` array.');
    }
    const page = request.page.pptrPage;
    const log: string[] = [];
    for (const entry of parsed.steps) {
      const step = entry.step ?? entry;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = step as any;
      try {
        switch (s.type) {
          case 'navigate':
            await page.goto(s.url, {waitUntil: 'load'});
            log.push(`navigate ${s.url}`);
            break;
          case 'press_key':
            await page.keyboard.press(s.key);
            log.push(`press_key ${s.key}`);
            break;
          case 'type_text':
            await page.keyboard.type(s.text);
            if (s.submitKey) {
              await page.keyboard.press(s.submitKey);
            }
            log.push(`type_text ${JSON.stringify(s.text)}`);
            break;
          case 'click':
            if (s.selector) {
              await page.click(s.selector, s.dblClick ? {count: 2} : {});
              log.push(`click ${s.selector}`);
            } else {
              log.push(`SKIPPED click (no selector, uid=${s.uid})`);
            }
            break;
          case 'fill':
            if (s.selector) {
              await page
                .locator(s.selector)
                .fill(typeof s.value === 'string' ? s.value : String(s.value));
              log.push(`fill ${s.selector}`);
            } else {
              log.push(`SKIPPED fill (no selector, uid=${s.uid})`);
            }
            break;
          case 'wait_for':
            if (Array.isArray(s.text)) {
              await page.waitForFunction(
                (texts: string[]) =>
                  texts.some(t => document.body.innerText.includes(t)),
                {},
                s.text,
              );
              log.push(`wait_for ${s.text.join('|')}`);
            }
            break;
          default:
            log.push(`SKIPPED ${s.type ?? 'unknown'}`);
        }
      } catch (err) {
        log.push(
          `FAILED ${s.type}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    response.appendResponseLine(JSON.stringify({log}, null, 2));
  },
});

function renderRecording(
  rec: Recording,
  format: 'json' | 'puppeteer' | 'playwright',
): string {
  switch (format) {
    case 'json':
      return recordingToJson(rec);
    case 'puppeteer':
      return recordingToPuppeteer(rec);
    case 'playwright':
      return recordingToPlaywright(rec);
  }
}
