/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 7.1: JavaScript debugger surface.
 *
 * Tools wrap CDP `Debugger.*` and `DOMDebugger.*` domains. State is held
 * module-side in a per-pageId map (mirrors the Phase 4 cdp.ts pattern):
 *
 * - `enabled`: whether `Debugger.enable` was sent.
 * - `breakpoints`: registered breakpointIds keyed by our internal id so
 *   we can list/remove them.
 * - `lastPaused`: cached `Debugger.paused` event so `get_call_stack` and
 *   friends can read the current frames without re-querying CDP (which
 *   would race with `resume`).
 *
 * Gated by `--experimentalDebugger` (default off).
 */

import {logger} from '../logger.js';
import type {Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';
import {createIdGenerator} from '../utils/id.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

interface RawCDP {
  send(method: string, params?: Record<string, unknown>): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  on(event: string, fn: (payload: unknown) => void): void;
  off(event: string, fn: (payload: unknown) => void): void;
}

function rawCdp(page: Page): RawCDP {
  // @ts-expect-error internal Puppeteer API.
  return page._client() as RawCDP;
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

interface BreakpointInfo {
  id: string;
  cdpBreakpointId: string;
  url: string;
  lineNumber: number;
  columnNumber?: number;
  condition?: string;
  createdAt: number;
}

interface DebuggerState {
  enabled: boolean;
  breakpoints: Map<string, BreakpointInfo>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastPaused?: any;
  pausedListener?: (payload: unknown) => void;
  resumedListener?: (payload: unknown) => void;
}

const states = new Map<number, DebuggerState>();
const idGen = createIdGenerator();

function makeBreakpointId(): string {
  return `bp-${idGen()}`;
}

function getOrInit(pageId: number): DebuggerState {
  let state = states.get(pageId);
  if (!state) {
    state = {enabled: false, breakpoints: new Map()};
    states.set(pageId, state);
  }
  return state;
}

async function ensureEnabled(page: Page): Promise<DebuggerState> {
  const state = getOrInit(pageIdOf(page));
  if (state.enabled) {
    return state;
  }
  const cdp = rawCdp(page);
  await cdp.send('Debugger.enable', {});
  state.pausedListener = (payload: unknown) => {
    state.lastPaused = payload;
  };
  state.resumedListener = () => {
    state.lastPaused = undefined;
  };
  cdp.on('Debugger.paused', state.pausedListener);
  cdp.on('Debugger.resumed', state.resumedListener);
  state.enabled = true;
  return state;
}

export const debuggerEnable = definePageTool({
  name: 'debugger_enable',
  description:
    'Enables CDP `Debugger.*` domain on the active page. Idempotent. Required before any other debugger tool runs.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    await ensureEnabled(request.page.pptrPage);
    response.appendResponseLine('Debugger enabled.');
  },
});

export const setBreakpoint = definePageTool({
  name: 'set_breakpoint',
  description:
    'Set a JS breakpoint by URL + line (CDP `Debugger.setBreakpointByUrl`).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    url: zod
      .string()
      .describe('Source URL (or url-regex via the `urlRegex` field).'),
    lineNumber: zod.number().int().min(0),
    columnNumber: zod.number().int().min(0).optional(),
    condition: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const state = await ensureEnabled(request.page.pptrPage);
    const cdp = rawCdp(request.page.pptrPage);
    const result = await cdp.send('Debugger.setBreakpointByUrl', {
      url: request.params.url,
      lineNumber: request.params.lineNumber,
      columnNumber: request.params.columnNumber,
      condition: request.params.condition,
    });
    const id = makeBreakpointId();
    state.breakpoints.set(id, {
      id,
      cdpBreakpointId: result.breakpointId as string,
      url: request.params.url,
      lineNumber: request.params.lineNumber,
      columnNumber: request.params.columnNumber,
      condition: request.params.condition,
      createdAt: Date.now(),
    });
    response.appendResponseLine(
      JSON.stringify({breakpointId: id, locations: result.locations}, null, 2),
    );
  },
});

export const removeBreakpoint = definePageTool({
  name: 'remove_breakpoint',
  description: 'Remove a previously-registered breakpoint by id.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    breakpointId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const pageId = pageIdOf(request.page.pptrPage);
    const state = states.get(pageId);
    const bp = state?.breakpoints.get(request.params.breakpointId);
    if (!bp) {
      response.appendResponseLine(
        `No breakpoint "${request.params.breakpointId}" found.`,
      );
      return;
    }
    try {
      await rawCdp(request.page.pptrPage).send('Debugger.removeBreakpoint', {
        breakpointId: bp.cdpBreakpointId,
      });
    } catch (err) {
      logger('removeBreakpoint failed', err);
    }
    state!.breakpoints.delete(request.params.breakpointId);
    response.appendResponseLine(`Removed ${request.params.breakpointId}.`);
  },
});

export const listBreakpoints = definePageTool({
  name: 'list_breakpoints',
  description:
    'Lists all currently-registered breakpoints for the active page.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalDebugger'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    const state = states.get(pageIdOf(request.page.pptrPage));
    const list = state ? [...state.breakpoints.values()] : [];
    response.appendResponseLine(JSON.stringify({breakpoints: list}, null, 2));
  },
});

export const setXhrBreakpoint = definePageTool({
  name: 'set_xhr_breakpoint',
  description:
    'Pause whenever an XHR/fetch URL contains the given substring (CDP `DOMDebugger.setXHRBreakpoint`).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    urlSubstring: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    await ensureEnabled(request.page.pptrPage);
    await rawCdp(request.page.pptrPage).send('DOMDebugger.setXHRBreakpoint', {
      url: request.params.urlSubstring,
    });
    response.appendResponseLine(
      `XHR breakpoint set for substring "${request.params.urlSubstring}".`,
    );
  },
});

export const setDomBreakpoint = definePageTool({
  name: 'set_dom_breakpoint',
  description:
    'Pause when a DOM mutation occurs on the element with the given uid. type: subtree-modified | attribute-modified | node-removed.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    uid: zod.string(),
    type: zod.enum(['subtree-modified', 'attribute-modified', 'node-removed']),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    await ensureEnabled(request.page.pptrPage);
    const ax = request.page.getAXNodeByUid(request.params.uid);
    const backendNodeId = ax?.backendNodeId;
    if (!backendNodeId) {
      throw new Error(
        `No backendNodeId for uid "${request.params.uid}" — make sure the snapshot is up to date.`,
      );
    }
    const cdpType =
      request.params.type === 'subtree-modified'
        ? 'subtree-modified'
        : request.params.type === 'attribute-modified'
          ? 'attribute-modified'
          : 'node-removed';
    await rawCdp(request.page.pptrPage).send('DOMDebugger.setDOMBreakpoint', {
      nodeId: backendNodeId,
      type: cdpType,
    });
    response.appendResponseLine(
      `DOM breakpoint set on uid=${request.params.uid} (${cdpType}).`,
    );
  },
});

export const debuggerPause = definePageTool({
  name: 'pause',
  description: 'Force the JS debugger to pause at the next statement.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    await ensureEnabled(request.page.pptrPage);
    await rawCdp(request.page.pptrPage).send('Debugger.pause', {});
    response.appendResponseLine('Pause requested.');
  },
});

export const debuggerResume = definePageTool({
  name: 'resume',
  description: 'Resume execution after a pause.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    await ensureEnabled(request.page.pptrPage);
    await rawCdp(request.page.pptrPage).send('Debugger.resume', {});
    response.appendResponseLine('Resumed.');
  },
});

function makeStepTool(name: string, method: string, description: string) {
  return definePageTool({
    name,
    description,
    annotations: {
      category: ToolCategory.DEBUGGING,
      readOnlyHint: false,
      conditions: ['experimentalDebugger'],
    },
    schema: {},
    blockedByDialog: false,
    handler: async (request, response) => {
      await ensureEnabled(request.page.pptrPage);
      await rawCdp(request.page.pptrPage).send(method, {});
      response.appendResponseLine(`${name} sent.`);
    },
  });
}

export const stepOver = makeStepTool(
  'step_over',
  'Debugger.stepOver',
  'Step over the current statement.',
);
export const stepInto = makeStepTool(
  'step_into',
  'Debugger.stepInto',
  'Step into the next function call.',
);
export const stepOut = makeStepTool(
  'step_out',
  'Debugger.stepOut',
  'Step out of the current function.',
);

export const getCallStack = definePageTool({
  name: 'get_call_stack',
  description:
    'Returns the call stack from the most recent `Debugger.paused` event. Empty if not paused.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalDebugger'],
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    const state = states.get(pageIdOf(request.page.pptrPage));
    const paused = state?.lastPaused;
    if (!paused) {
      response.appendResponseLine(
        JSON.stringify({paused: false, callFrames: []}, null, 2),
      );
      return;
    }
    response.appendResponseLine(
      JSON.stringify(
        {paused: true, reason: paused.reason, callFrames: paused.callFrames},
        null,
        2,
      ),
    );
  },
});

export const getScopeVariables = definePageTool({
  name: 'get_scope_variables',
  description:
    'Return the properties of a scope object from the current paused call stack. Use `get_call_stack` first to find callFrameId / scopeIndex.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    callFrameId: zod.string(),
    scopeIndex: zod.number().int().min(0),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const state = states.get(pageIdOf(request.page.pptrPage));
    const paused = state?.lastPaused;
    if (!paused) {
      throw new Error('Debugger is not currently paused.');
    }
    const frame = paused.callFrames.find(
      (f: {callFrameId: string}) =>
        f.callFrameId === request.params.callFrameId,
    );
    if (!frame) {
      throw new Error(`No call frame "${request.params.callFrameId}".`);
    }
    const scope = frame.scopeChain?.[request.params.scopeIndex];
    if (!scope?.object?.objectId) {
      throw new Error(
        `No scope at index ${request.params.scopeIndex} for call frame.`,
      );
    }
    const result = await rawCdp(request.page.pptrPage).send(
      'Runtime.getProperties',
      {
        objectId: scope.object.objectId,
        ownProperties: true,
      },
    );
    response.appendResponseLine(
      JSON.stringify({scopeType: scope.type, ...result}, null, 2),
    );
  },
});

export const evaluateInScope = definePageTool({
  name: 'evaluate_in_scope',
  description:
    'Evaluate an expression in the context of a paused call frame (CDP `Debugger.evaluateOnCallFrame`).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['experimentalDebugger'],
  },
  schema: {
    callFrameId: zod.string(),
    expression: zod.string(),
    returnByValue: zod.boolean().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const result = await rawCdp(request.page.pptrPage).send(
      'Debugger.evaluateOnCallFrame',
      {
        callFrameId: request.params.callFrameId,
        expression: request.params.expression,
        returnByValue: request.params.returnByValue ?? true,
      },
    );
    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});
