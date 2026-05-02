/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ToolCategory {
  INPUT = 'input',
  NAVIGATION = 'navigation',
  EMULATION = 'emulation',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  DEBUGGING = 'debugging',
  EXTENSIONS = 'extensions',
  IN_PAGE = 'experimentalInPage',
  MEMORY = 'memory',
  // Phase 2: cookies, localStorage, sessionStorage, IndexedDB, CacheStorage.
  STORAGE = 'storage',
  // Phase 3: persistent request interception, mocking, header injection, HAR.
  INTERCEPTION = 'interception',
  // Phase 5: service workers and PWA-related capabilities.
  SERVICE_WORKER = 'serviceWorker',
}

export const labels = {
  [ToolCategory.INPUT]: 'Input automation',
  [ToolCategory.NAVIGATION]: 'Navigation automation',
  [ToolCategory.EMULATION]: 'Emulation',
  [ToolCategory.PERFORMANCE]: 'Performance',
  [ToolCategory.NETWORK]: 'Network',
  [ToolCategory.DEBUGGING]: 'Debugging',
  [ToolCategory.EXTENSIONS]: 'Extensions',
  [ToolCategory.IN_PAGE]: 'In-page tools',
  [ToolCategory.MEMORY]: 'Memory',
  [ToolCategory.STORAGE]: 'Storage',
  [ToolCategory.INTERCEPTION]: 'Network interception',
  [ToolCategory.SERVICE_WORKER]: 'Service workers / PWA',
};

export const OFF_BY_DEFAULT_CATEGORIES = [
  ToolCategory.EXTENSIONS,
  ToolCategory.IN_PAGE,
];
