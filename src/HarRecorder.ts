/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3: minimal HAR 1.2 recorder. Subscribes to Puppeteer's
 * `request` / `response` / `requestfinished` / `requestfailed` events and
 * accumulates entries. Emits a HAR file via `stop({filePath})`.
 *
 * This is a pragmatic implementation: header redaction follows the same
 * rules as `NetworkFormatter` (when redaction is enabled by the caller),
 * but request/response bodies are only captured if `includeBodies` is
 * set, and only for non-binary responses small enough to fit in memory.
 */

import type {HTTPRequest, HTTPResponse, Page} from './third_party/index.js';
import {VERSION} from './version.js';

const MAX_BODY_BYTES = 1_000_000; // 1 MB cap per response body in HAR.

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{name: string; value: string}>;
    queryString: Array<{name: string; value: string}>;
    cookies: Array<{name: string; value: string}>;
    headersSize: number;
    bodySize: number;
    postData?: {mimeType: string; text: string};
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{name: string; value: string}>;
    cookies: Array<{name: string; value: string}>;
    content: {size: number; mimeType: string; text?: string; encoding?: string};
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {send: number; wait: number; receive: number};
  serverIPAddress?: string;
  pageref?: string;
  _failureText?: string;
}

interface InternalRecord {
  startTimeMs: number;
  request: HTTPRequest;
  response?: HTTPResponse;
  failure?: string;
  finishedAt?: number;
}

export interface HarRecording {
  name: string;
  startedAt: number;
  finishedAt?: number;
  pageId: number;
  pageUrl: string;
  includeBodies: boolean;
  entries: HarEntry[];
}

export class HarRecorder {
  readonly name: string;
  readonly pageId: number;
  readonly startedAt: number;
  readonly includeBodies: boolean;
  #pageUrl: string;
  #records = new Map<HTTPRequest, InternalRecord>();
  #completed: HarEntry[] = [];
  #listeners: Array<{event: string; fn: (...args: unknown[]) => void}> = [];
  #page: Page;
  #stopped = false;

  constructor(
    page: Page,
    opts: {name: string; pageId: number; includeBodies?: boolean},
  ) {
    this.#page = page;
    this.name = opts.name;
    this.pageId = opts.pageId;
    this.includeBodies = opts.includeBodies ?? false;
    this.startedAt = Date.now();
    this.#pageUrl = page.url();
    this.#install();
  }

  #install(): void {
    const onRequest = (req: HTTPRequest) => {
      this.#records.set(req, {startTimeMs: Date.now(), request: req});
    };
    const onResponse = (res: HTTPResponse) => {
      const rec = this.#records.get(res.request());
      if (rec) {
        rec.response = res;
      }
    };
    const onFinished = (req: HTTPRequest) => {
      void this.#finalize(req);
    };
    const onFailed = (req: HTTPRequest) => {
      const rec = this.#records.get(req);
      if (rec) {
        rec.failure = req.failure()?.errorText ?? 'failed';
      }
      void this.#finalize(req);
    };
    this.#page.on('request', onRequest);
    this.#page.on('response', onResponse);
    this.#page.on('requestfinished', onFinished);
    this.#page.on('requestfailed', onFailed);
    this.#listeners.push(
      {event: 'request', fn: onRequest as never},
      {event: 'response', fn: onResponse as never},
      {event: 'requestfinished', fn: onFinished as never},
      {event: 'requestfailed', fn: onFailed as never},
    );
  }

  async #finalize(req: HTTPRequest): Promise<void> {
    const rec = this.#records.get(req);
    if (!rec) {
      return;
    }
    rec.finishedAt = Date.now();
    try {
      this.#completed.push(await this.#buildEntry(rec));
    } catch {
      // Skip entries we can't serialize (e.g. response body unavailable).
    }
    this.#records.delete(req);
  }

  async #buildEntry(rec: InternalRecord): Promise<HarEntry> {
    const req = rec.request;
    const res = rec.response;
    const url = req.url();
    const urlObj = (() => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    })();
    const queryString = urlObj
      ? [...urlObj.searchParams.entries()].map(([name, value]) => ({
          name,
          value,
        }))
      : [];
    const reqHeaders = req.headers();
    const resHeaders = res?.headers() ?? {};
    const time = (rec.finishedAt ?? Date.now()) - rec.startTimeMs;

    let postData: HarEntry['request']['postData'];
    const reqBody = req.postData();
    if (reqBody !== undefined) {
      postData = {
        mimeType: reqHeaders['content-type'] ?? 'application/octet-stream',
        text: reqBody,
      };
    }

    let content: HarEntry['response']['content'] = {
      size: 0,
      mimeType: resHeaders['content-type'] ?? '',
    };
    if (this.includeBodies && res) {
      try {
        const buf = await res.buffer();
        if (buf.byteLength <= MAX_BODY_BYTES) {
          // Heuristic: treat as utf-8 text if Content-Type smells textual.
          const ct = (resHeaders['content-type'] ?? '').toLowerCase();
          const isTextual =
            ct.startsWith('text/') ||
            ct.includes('json') ||
            ct.includes('xml') ||
            ct.includes('javascript');
          content = {
            size: buf.byteLength,
            mimeType: resHeaders['content-type'] ?? '',
            ...(isTextual
              ? {text: buf.toString('utf-8')}
              : {text: buf.toString('base64'), encoding: 'base64'}),
          };
        } else {
          content = {
            size: buf.byteLength,
            mimeType: resHeaders['content-type'] ?? '',
          };
        }
      } catch {
        // body unavailable
      }
    }

    return {
      startedDateTime: new Date(rec.startTimeMs).toISOString(),
      time,
      request: {
        method: req.method(),
        url,
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(reqHeaders).map(([name, value]) => ({
          name,
          value,
        })),
        queryString,
        cookies: [],
        headersSize: -1,
        bodySize: reqBody ? Buffer.byteLength(reqBody) : 0,
        ...(postData ? {postData} : {}),
      },
      response: {
        status: res?.status() ?? 0,
        statusText: res?.statusText() ?? rec.failure ?? '',
        httpVersion: 'HTTP/1.1',
        headers: Object.entries(resHeaders).map(([name, value]) => ({
          name,
          value,
        })),
        cookies: [],
        content,
        redirectURL: resHeaders['location'] ?? '',
        headersSize: -1,
        bodySize: content.size,
      },
      cache: {},
      timings: {send: 0, wait: time, receive: 0},
      ...(rec.failure ? {_failureText: rec.failure} : {}),
    };
  }

  stop(): HarRecording {
    if (this.#stopped) {
      return this.#snapshot();
    }
    for (const {event, fn} of this.#listeners) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.#page.off(event as any, fn as any);
      } catch {
        // ignore
      }
    }
    this.#listeners.length = 0;
    this.#stopped = true;
    return this.#snapshot();
  }

  #snapshot(): HarRecording {
    return {
      name: this.name,
      startedAt: this.startedAt,
      finishedAt: this.#stopped ? Date.now() : undefined,
      pageId: this.pageId,
      pageUrl: this.#pageUrl,
      includeBodies: this.includeBodies,
      entries: this.#completed.slice(),
    };
  }

  toHarJson(): string {
    const snapshot = this.#snapshot();
    const har = {
      log: {
        version: '1.2',
        creator: {name: 'chrome-devtools-mcp-vamp', version: VERSION},
        pages: [
          {
            startedDateTime: new Date(snapshot.startedAt).toISOString(),
            id: `page-${snapshot.pageId}`,
            title: snapshot.pageUrl,
            pageTimings: {onContentLoad: -1, onLoad: -1},
          },
        ],
        entries: snapshot.entries.map(e => ({
          ...e,
          pageref: `page-${snapshot.pageId}`,
        })),
      },
    };
    return JSON.stringify(har, null, 2);
  }
}
