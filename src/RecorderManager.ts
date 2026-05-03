/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.4: in-memory user-action recorder.
 *
 * Designed to be lean for v1: callers explicitly add steps via
 * `recordStep`, plus an automatic listener for navigations on the
 * primary page. Deep instrumentation of every input tool is out of
 * scope for this phase — a follow-up can add hooks at `definePageTool`
 * level once the schema is confirmed.
 *
 * The recording schema is a small subset of the DevTools Recorder
 * format:
 *   { name, startedAt, finishedAt?, steps: Step[] }
 * Each step is one of `navigate`, `click`, `dblClick`, `fill`,
 * `press_key`, `type_text`, `drag`, `upload_file`, `wait_for`,
 * `custom`. Unknown step types are tolerated for forward compatibility.
 */

export type RecorderStep =
  | {type: 'navigate'; url: string}
  | {type: 'click'; selector?: string; uid?: string; dblClick?: boolean}
  | {type: 'fill'; selector?: string; uid?: string; value: string}
  | {type: 'press_key'; key: string}
  | {type: 'type_text'; text: string; submitKey?: string}
  | {type: 'drag'; fromUid?: string; toUid?: string}
  | {type: 'upload_file'; uid?: string; filePath: string}
  | {type: 'wait_for'; text: string[]}
  | {type: 'custom'; description: string; payload?: unknown};

export interface RecorderEntry {
  step: RecorderStep;
  recordedAt: number;
}

export interface Recording {
  name: string;
  startedAt: number;
  finishedAt?: number;
  steps: RecorderEntry[];
}

export class RecorderManager {
  #recordings = new Map<string, Recording>();

  start(name: string): Recording {
    if (this.#recordings.has(name)) {
      throw new Error(`Recording "${name}" already exists.`);
    }
    const rec: Recording = {name, startedAt: Date.now(), steps: []};
    this.#recordings.set(name, rec);
    return rec;
  }

  recordStep(step: RecorderStep): void {
    if (this.#recordings.size === 0) {
      return;
    }
    const entry: RecorderEntry = {step, recordedAt: Date.now()};
    for (const rec of this.#recordings.values()) {
      if (rec.finishedAt === undefined) {
        rec.steps.push(entry);
      }
    }
  }

  stop(name: string): Recording {
    const rec = this.#recordings.get(name);
    if (!rec) {
      throw new Error(`No recording named "${name}".`);
    }
    rec.finishedAt = Date.now();
    this.#recordings.delete(name);
    return rec;
  }

  get(name: string): Recording | undefined {
    return this.#recordings.get(name);
  }

  list(): Recording[] {
    return [...this.#recordings.values()];
  }

  isAnyActive(): boolean {
    for (const rec of this.#recordings.values()) {
      if (rec.finishedAt === undefined) {
        return true;
      }
    }
    return false;
  }
}

/** Serialize a Recording as the JSON wire format. */
export function recordingToJson(rec: Recording): string {
  return JSON.stringify(
    {
      name: rec.name,
      startedAt: rec.startedAt,
      finishedAt: rec.finishedAt,
      steps: rec.steps,
    },
    null,
    2,
  );
}

/**
 * Convert a Recording to an executable Puppeteer script (rough-cut).
 * Steps that need a uid → selector resolution that we don't have are
 * emitted as TODO comments so users can fill in.
 */
export function recordingToPuppeteer(rec: Recording): string {
  const lines: string[] = [];
  lines.push("import puppeteer from 'puppeteer';");
  lines.push('');
  lines.push('(async () => {');
  lines.push('  const browser = await puppeteer.launch();');
  lines.push('  const page = await browser.newPage();');
  for (const {step} of rec.steps) {
    switch (step.type) {
      case 'navigate':
        lines.push(`  await page.goto(${JSON.stringify(step.url)});`);
        break;
      case 'click':
        if (step.selector) {
          lines.push(
            `  await page.click(${JSON.stringify(step.selector)}${
              step.dblClick ? ', { count: 2 }' : ''
            });`,
          );
        } else {
          lines.push(
            `  // TODO: click on uid ${step.uid} — provide a selector.`,
          );
        }
        break;
      case 'fill':
        if (step.selector) {
          lines.push(
            `  await page.locator(${JSON.stringify(step.selector)}).fill(${JSON.stringify(step.value)});`,
          );
        } else {
          lines.push(
            `  // TODO: fill uid ${step.uid} with ${JSON.stringify(step.value)}.`,
          );
        }
        break;
      case 'press_key':
        lines.push(`  await page.keyboard.press(${JSON.stringify(step.key)});`);
        break;
      case 'type_text':
        lines.push(`  await page.keyboard.type(${JSON.stringify(step.text)});`);
        if (step.submitKey) {
          lines.push(
            `  await page.keyboard.press(${JSON.stringify(step.submitKey)});`,
          );
        }
        break;
      case 'wait_for':
        for (const t of step.text) {
          lines.push(
            `  await page.waitForFunction((s) => document.body.innerText.includes(s), {}, ${JSON.stringify(t)});`,
          );
        }
        break;
      case 'drag':
        lines.push(
          `  // TODO: drag from ${step.fromUid} to ${step.toUid} — uids only.`,
        );
        break;
      case 'upload_file':
        lines.push(`  // TODO: upload ${step.filePath} to uid ${step.uid}.`);
        break;
      case 'custom':
        lines.push(`  // custom: ${step.description}`);
        break;
    }
  }
  lines.push('  await browser.close();');
  lines.push('})();');
  lines.push('');
  return lines.join('\n');
}

export function recordingToPlaywright(rec: Recording): string {
  // Same shape as Puppeteer, with the playwright import.
  return recordingToPuppeteer(rec)
    .replace(
      "import puppeteer from 'puppeteer';",
      "import {chromium} from '@playwright/test';",
    )
    .replace('puppeteer.launch()', 'chromium.launch()');
}
