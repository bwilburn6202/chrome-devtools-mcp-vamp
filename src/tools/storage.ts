/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 2: storage management tools.
 *
 * Adds the on-by-default `STORAGE` category. Covers cookies, localStorage,
 * sessionStorage, IndexedDB, and CacheStorage — all of which were previously
 * inaccessible through this MCP and required ad-hoc `evaluate_script` hacks.
 *
 * Cookies use the BrowserContext-level Puppeteer API (the page-level API is
 * deprecated upstream). Web storage uses `page.evaluate` (the simplest
 * origin-scoped path; CDP DOMStorage works too but adds complexity for no
 * functional gain). IndexedDB and CacheStorage go through the CDP `IndexedDB`
 * and `CacheStorage` domains because Puppeteer doesn't expose them.
 */

import type {Page} from '../third_party/index.js';
import {zod} from '../third_party/index.js';
import {paginate} from '../utils/pagination.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

// Internal helper: get a CDP session for a Puppeteer Page. We use the cached
// internal session rather than creating a new one per call to avoid leaking
// sessions on every storage operation. Typed loosely because the Puppeteer
// CDPSession typing varies across versions and Phase 2 only needs send().
interface MinimalCDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
function cdp(page: Page): MinimalCDPSession {
  // @ts-expect-error internal Puppeteer API.
  return page._client();
}

function originForPage(page: Page, override?: string): string {
  if (override) {
    return override;
  }
  try {
    return new URL(page.url()).origin;
  } catch {
    throw new Error(
      `Cannot derive origin from page URL ${page.url()}. Pass an explicit origin.`,
    );
  }
}

// ─── Cookies ────────────────────────────────────────────────────────────────

export const listCookies = definePageTool({
  name: 'list_cookies',
  description:
    'Lists cookies for the active browser context. Optionally filter by URL(s); without a filter, returns all cookies in the active browser context.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    urls: zod
      .array(zod.string().url())
      .optional()
      .describe(
        'Optional list of URLs to filter cookies by. Cookies whose domain/path match any URL are returned. Default: all cookies.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    // BrowserContext.cookies() takes no args, but Page.cookies(...urls)
    // accepts a URL filter list. Use the page-level API for filtered
    // queries (still functional even though Puppeteer marks it deprecated).
    const cookies = request.params.urls?.length
      ? await request.page.pptrPage.cookies(...request.params.urls)
      : await request.page.pptrPage.browserContext().cookies();
    response.appendResponseLine(JSON.stringify({cookies}, null, 2));
  },
});

export const setCookie = definePageTool({
  name: 'set_cookie',
  description:
    'Sets a cookie in the active browser context. At least one of `url` or `domain` must be provided.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('Cookie name.'),
    value: zod.string().describe('Cookie value.'),
    url: zod
      .string()
      .url()
      .optional()
      .describe('URL for which the cookie applies (sets domain/path/secure).'),
    domain: zod.string().optional().describe('Cookie domain.'),
    path: zod.string().optional().describe('Cookie path. Default "/".'),
    expires: zod
      .number()
      .optional()
      .describe(
        'Expiration time in seconds since UNIX epoch. Omit for session cookie.',
      ),
    httpOnly: zod.boolean().optional(),
    secure: zod.boolean().optional(),
    sameSite: zod.enum(['Strict', 'Lax', 'None']).optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    if (!request.params.url && !request.params.domain) {
      throw new Error('At least one of `url` or `domain` is required.');
    }
    const ctx = request.page.pptrPage.browserContext();
    // CookieData is a discriminated union over url/domain. Build the param
    // dynamically and only include keys with defined values.
    const cookieParam: Record<string, unknown> = {
      name: request.params.name,
      value: request.params.value,
    };
    for (const [k, v] of Object.entries({
      url: request.params.url,
      domain: request.params.domain,
      path: request.params.path,
      expires: request.params.expires,
      httpOnly: request.params.httpOnly,
      secure: request.params.secure,
      sameSite: request.params.sameSite,
    })) {
      if (v !== undefined) {
        cookieParam[k] = v;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.setCookie(cookieParam as any);
    response.appendResponseLine(`Cookie ${request.params.name} set.`);
  },
});

export const deleteCookie = definePageTool({
  name: 'delete_cookie',
  description:
    'Deletes a single cookie matching the given filter from the active browser context.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('Cookie name.'),
    domain: zod.string().optional(),
    path: zod.string().optional(),
    url: zod.string().url().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const ctx = request.page.pptrPage.browserContext();
    const filter: Record<string, unknown> = {name: request.params.name};
    if (request.params.domain !== undefined) {
      filter.domain = request.params.domain;
    }
    if (request.params.path !== undefined) {
      filter.path = request.params.path;
    }
    if (request.params.url !== undefined) {
      filter.url = request.params.url;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.deleteMatchingCookies(filter as any);
    response.appendResponseLine(`Cookie ${request.params.name} deleted.`);
  },
});

export const clearCookies = definePageTool({
  name: 'clear_cookies',
  description:
    "Clears all cookies for the active page's origin (or a provided origin) via CDP `Storage.clearDataForOrigin`.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    origin: zod
      .string()
      .optional()
      .describe('Origin to clear cookies for. Default: current page origin.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    await cdp(request.page.pptrPage).send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'cookies',
    });
    response.appendResponseLine(`Cleared cookies for origin ${origin}.`);
  },
});

// ─── localStorage / sessionStorage ──────────────────────────────────────────

const webStorageReadHandler =
  (kind: 'localStorage' | 'sessionStorage') =>
  async (
    request: {page: {pptrPage: Page}; params: {origin?: string}},
    response: {appendResponseLine: (s: string) => void},
  ) => {
    const data = await request.page.pptrPage.evaluate(storageKind => {
      const out: Record<string, string> = {};
      const target =
        storageKind === 'localStorage' ? localStorage : sessionStorage;
      for (let i = 0; i < target.length; i++) {
        const k = target.key(i)!;
        out[k] = target.getItem(k) ?? '';
      }
      return out;
    }, kind);
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    response.appendResponseLine(
      JSON.stringify({origin, kind, items: data}, null, 2),
    );
  };

export const getLocalStorage = definePageTool({
  name: 'get_local_storage',
  description: "Returns all localStorage entries for the active page's origin.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    origin: zod
      .string()
      .optional()
      .describe(
        'Informational only — the page is not navigated. Default: page origin.',
      ),
  },
  blockedByDialog: false,
  handler: webStorageReadHandler('localStorage'),
});

export const getSessionStorage = definePageTool({
  name: 'get_session_storage',
  description:
    "Returns all sessionStorage entries for the active page's origin.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    origin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: webStorageReadHandler('sessionStorage'),
});

const webStorageWriteHandler =
  (kind: 'localStorage' | 'sessionStorage') =>
  async (
    request: {
      page: {pptrPage: Page};
      params: {key: string; value: string};
    },
    response: {appendResponseLine: (s: string) => void},
  ) => {
    await request.page.pptrPage.evaluate(
      ({k, v, storageKind}) => {
        const target =
          storageKind === 'localStorage' ? localStorage : sessionStorage;
        target.setItem(k, v);
      },
      {k: request.params.key, v: request.params.value, storageKind: kind},
    );
    response.appendResponseLine(`Set ${kind}["${request.params.key}"].`);
  };

export const setLocalStorage = definePageTool({
  name: 'set_local_storage',
  description: "Sets a localStorage entry on the active page's origin.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    key: zod.string(),
    value: zod.string(),
  },
  blockedByDialog: false,
  handler: webStorageWriteHandler('localStorage'),
});

export const setSessionStorage = definePageTool({
  name: 'set_session_storage',
  description: "Sets a sessionStorage entry on the active page's origin.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    key: zod.string(),
    value: zod.string(),
  },
  blockedByDialog: false,
  handler: webStorageWriteHandler('sessionStorage'),
});

const webStorageClearHandler =
  (kind: 'localStorage' | 'sessionStorage') =>
  async (
    request: {page: {pptrPage: Page}; params: {key?: string}},
    response: {appendResponseLine: (s: string) => void},
  ) => {
    await request.page.pptrPage.evaluate(
      ({key, storageKind}) => {
        const target =
          storageKind === 'localStorage' ? localStorage : sessionStorage;
        if (key) {
          target.removeItem(key);
        } else {
          target.clear();
        }
      },
      {key: request.params.key, storageKind: kind},
    );
    response.appendResponseLine(
      request.params.key
        ? `Removed ${kind}["${request.params.key}"].`
        : `Cleared ${kind}.`,
    );
  };

export const clearLocalStorage = definePageTool({
  name: 'clear_local_storage',
  description:
    "Clears localStorage on the active page's origin. If `key` is provided, removes only that key; otherwise removes everything.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    key: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: webStorageClearHandler('localStorage'),
});

export const clearSessionStorage = definePageTool({
  name: 'clear_session_storage',
  description:
    "Clears sessionStorage on the active page's origin (or a single key).",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    key: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: webStorageClearHandler('sessionStorage'),
});

// ─── IndexedDB ──────────────────────────────────────────────────────────────

export const listIndexedDbDatabases = definePageTool({
  name: 'list_indexeddb_databases',
  description: "Lists IndexedDB database names for the active page's origin.",
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    origin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    const session = cdp(request.page.pptrPage);
    await session.send('IndexedDB.enable');
    const result = await session.send('IndexedDB.requestDatabaseNames', {
      origin,
    });
    response.appendResponseLine(
      JSON.stringify({origin, databases: result.databaseNames}, null, 2),
    );
  },
});

export const getIndexedDbData = definePageTool({
  name: 'get_indexeddb_data',
  description:
    'Returns entries from an IndexedDB object store. Paginated via pageSize/pageIdx.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    database: zod.string().describe('Database name.'),
    objectStore: zod.string().describe('Object store name.'),
    indexName: zod
      .string()
      .optional()
      .describe('Optional index name. If omitted, queries the primary key.'),
    pageSize: zod.number().int().positive().optional(),
    pageIdx: zod.number().int().min(0).optional(),
    origin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    const session = cdp(request.page.pptrPage);
    await session.send('IndexedDB.enable');
    const pageSize = request.params.pageSize ?? 50;
    const pageIdx = request.params.pageIdx ?? 0;
    const result = await session.send('IndexedDB.requestData', {
      origin,
      databaseName: request.params.database,
      objectStoreName: request.params.objectStore,
      indexName: request.params.indexName ?? '',
      skipCount: pageIdx * pageSize,
      pageSize,
      keyRange: undefined,
    });
    response.appendResponseLine(
      JSON.stringify(
        {
          origin,
          database: request.params.database,
          objectStore: request.params.objectStore,
          hasMore: result.hasMore,
          entries: result.objectStoreDataEntries,
        },
        null,
        2,
      ),
    );
  },
});

export const deleteIndexedDbDatabase = definePageTool({
  name: 'delete_indexeddb_database',
  description: 'Deletes an IndexedDB database for the given origin.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    database: zod.string(),
    origin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    const session = cdp(request.page.pptrPage);
    await session.send('IndexedDB.enable');
    await session.send('IndexedDB.deleteDatabase', {
      origin,
      databaseName: request.params.database,
    });
    response.appendResponseLine(
      `Deleted IndexedDB database ${request.params.database} for origin ${origin}.`,
    );
  },
});

export const clearIndexedDbObjectStore = definePageTool({
  name: 'clear_indexeddb_object_store',
  description: 'Clears all entries from an IndexedDB object store.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    database: zod.string(),
    objectStore: zod.string(),
    origin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    const session = cdp(request.page.pptrPage);
    await session.send('IndexedDB.enable');
    await session.send('IndexedDB.clearObjectStore', {
      origin,
      databaseName: request.params.database,
      objectStoreName: request.params.objectStore,
    });
    response.appendResponseLine(
      `Cleared object store ${request.params.objectStore} in ${request.params.database}.`,
    );
  },
});

// ─── CacheStorage ───────────────────────────────────────────────────────────

export const listCaches = definePageTool({
  name: 'list_caches',
  description: 'Lists CacheStorage caches accessible from the active page.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    securityOrigin: zod.string().optional(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(
      request.page.pptrPage,
      request.params.securityOrigin,
    );
    const session = cdp(request.page.pptrPage);
    const result = await session.send('CacheStorage.requestCacheNames', {
      securityOrigin: origin,
    });
    response.appendResponseLine(
      JSON.stringify({origin, caches: result.caches}, null, 2),
    );
  },
});

export const getCacheEntries = definePageTool({
  name: 'get_cache_entries',
  description:
    'Returns entries (URL + response metadata) for a single cache. Paginated.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: true,
  },
  schema: {
    cacheId: zod.string().describe('cacheId obtained from `list_caches`.'),
    pageSize: zod.number().int().positive().optional(),
    pageIdx: zod.number().int().min(0).optional(),
    pathFilter: zod
      .string()
      .optional()
      .describe('Optional substring filter on request URL path.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    const pageSize = request.params.pageSize ?? 50;
    const pageIdx = request.params.pageIdx ?? 0;
    const result = await session.send('CacheStorage.requestEntries', {
      cacheId: request.params.cacheId,
      skipCount: pageIdx * pageSize,
      pageSize,
      pathFilter: request.params.pathFilter,
    });
    const {items, totalPages, hasNextPage} = paginate(result.cacheDataEntries, {
      pageSize,
      pageIdx: 0,
    });
    response.appendResponseLine(
      JSON.stringify(
        {
          cacheId: request.params.cacheId,
          totalPages,
          hasNextPage,
          returnedHasMore: result.returnCount > result.cacheDataEntries.length,
          entries: items,
        },
        null,
        2,
      ),
    );
  },
});

export const deleteCache = definePageTool({
  name: 'delete_cache',
  description: 'Deletes a CacheStorage cache by cacheId.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    cacheId: zod.string(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('CacheStorage.deleteCache', {
      cacheId: request.params.cacheId,
    });
    response.appendResponseLine(`Deleted cache ${request.params.cacheId}.`);
  },
});

export const deleteCacheEntry = definePageTool({
  name: 'delete_cache_entry',
  description:
    'Deletes a single entry (request URL) from a CacheStorage cache.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    cacheId: zod.string(),
    request: zod.string().describe('Request URL to remove from the cache.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    await session.send('CacheStorage.deleteEntry', {
      cacheId: request.params.cacheId,
      request: request.params.request,
    });
    response.appendResponseLine(
      `Deleted ${request.params.request} from cache ${request.params.cacheId}.`,
    );
  },
});

// ─── Origin-wide clear ──────────────────────────────────────────────────────

const STORAGE_TYPE_ENUM = zod.enum([
  'appcache',
  'cookies',
  'file_systems',
  'indexeddb',
  'local_storage',
  'shader_cache',
  'websql',
  'service_workers',
  'cache_storage',
  'all',
]);

export const clearAllStorage = definePageTool({
  name: 'clear_all_storage',
  description:
    'Clears one or more storage types for an origin via CDP `Storage.clearDataForOrigin`. Default: all storage types for the active page origin.',
  annotations: {
    category: ToolCategory.STORAGE,
    readOnlyHint: false,
  },
  schema: {
    origin: zod.string().optional(),
    types: zod
      .array(STORAGE_TYPE_ENUM)
      .optional()
      .describe(
        'Storage types to clear. If omitted, clears `all`. Common values: cookies, indexeddb, local_storage, cache_storage, service_workers.',
      ),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const origin = originForPage(request.page.pptrPage, request.params.origin);
    const types = (
      request.params.types?.length ? request.params.types : ['all']
    ).join(',');
    await cdp(request.page.pptrPage).send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: types,
    });
    response.appendResponseLine(
      `Cleared storage [${types}] for origin ${origin}.`,
    );
  },
});
