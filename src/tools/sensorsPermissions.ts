/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 6.3: permissions overrides, sensor emulation, idle/vision/motion
 * emulation. Lives alongside the existing `EMULATION` category.
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

const PERMISSION_ENUM = zod.enum([
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'background-sync',
  'ambient-light-sensor',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'accessibility-events',
  'clipboard-read',
  'clipboard-write',
  'payment-handler',
  'persistent-storage',
  'push',
  'midi',
  'midi-sysex',
  'speaker-selection',
  'idle-detection',
  'window-management',
  'local-fonts',
  'storage-access',
]);

export const overridePermissions = definePageTool({
  name: 'override_permissions',
  description:
    "Grants the listed permissions for the active page's origin. Until reset, the browser auto-grants these without prompting.",
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    permissions: zod
      .array(PERMISSION_ENUM)
      .min(1)
      .describe('Permissions to grant.'),
    origin: zod
      .string()
      .url()
      .optional()
      .describe('Origin to grant for. Default: current page origin.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const page = request.page.pptrPage;
    const origin = request.params.origin ?? new URL(page.url()).origin;
    // Puppeteer's Permission type is narrower than the spec; cast through
    // the loose enum to accept emerging permission names.
    await page
      .browserContext()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .overridePermissions(origin, request.params.permissions as any);
    response.appendResponseLine(
      `Granted [${request.params.permissions.join(', ')}] for ${origin}.`,
    );
  },
});

export const resetPermissions = definePageTool({
  name: 'reset_permissions',
  description:
    'Clears any permission overrides for the current browser context, restoring default prompt behavior.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    await request.page.pptrPage.browserContext().clearPermissionOverrides();
    response.appendResponseLine('Cleared permission overrides.');
  },
});

const SENSOR_TYPE_ENUM = zod.enum([
  'absolute-orientation',
  'accelerometer',
  'ambient-light',
  'gravity',
  'gyroscope',
  'linear-acceleration',
  'magnetometer',
  'proximity',
  'relative-orientation',
]);

export const emulateSensor = definePageTool({
  name: 'emulate_sensor',
  description:
    'Override readings for a Web Sensor API sensor (CDP `Emulation.setSensorOverrideEnabled` + `setSensorOverrideReadings`).',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    type: SENSOR_TYPE_ENUM,
    enabled: zod
      .boolean()
      .optional()
      .describe('Default true. Pass false to disable the override.'),
    x: zod.number().optional(),
    y: zod.number().optional(),
    z: zod.number().optional(),
    alpha: zod
      .number()
      .optional()
      .describe('For orientation sensors (degrees).'),
    beta: zod.number().optional(),
    gamma: zod.number().optional(),
    illuminance: zod.number().optional().describe('Lux, for ambient-light.'),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    const session = cdp(request.page.pptrPage);
    const enabled = request.params.enabled ?? true;
    await session.send('Emulation.setSensorOverrideEnabled', {
      type: request.params.type,
      enabled,
    });
    if (enabled) {
      const reading: Record<string, number> = {};
      for (const k of [
        'x',
        'y',
        'z',
        'alpha',
        'beta',
        'gamma',
        'illuminance',
      ] as const) {
        const v = request.params[k];
        if (v !== undefined) {
          reading[k] = v;
        }
      }
      await session.send('Emulation.setSensorOverrideReadings', {
        type: request.params.type,
        reading: {xyz: reading},
      });
    }
    response.appendResponseLine(
      `Sensor ${request.params.type} ${enabled ? 'overridden' : 'disabled'}.`,
    );
  },
});

export const emulateIdleState = definePageTool({
  name: 'emulate_idle_state',
  description:
    'Override the IdleDetector state (CDP `Emulation.setIdleOverride`).',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    isUserActive: zod.boolean(),
    isScreenUnlocked: zod.boolean(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    await cdp(request.page.pptrPage).send('Emulation.setIdleOverride', {
      isUserActive: request.params.isUserActive,
      isScreenUnlocked: request.params.isScreenUnlocked,
    });
    response.appendResponseLine('Idle state overridden.');
  },
});

export const clearIdleStateOverride = definePageTool({
  name: 'clear_idle_state_override',
  description: 'Clear the IdleDetector override.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {},
  blockedByDialog: false,
  handler: async (request, response) => {
    await cdp(request.page.pptrPage).send('Emulation.clearIdleOverride', {});
    response.appendResponseLine('Cleared idle state override.');
  },
});

const VISION_DEFICIENCY_ENUM = zod.enum([
  'none',
  'achromatopsia',
  'blurredVision',
  'deuteranopia',
  'protanopia',
  'tritanopia',
  'reducedContrast',
]);

export const emulateVisionDeficiency = definePageTool({
  name: 'emulate_vision_deficiency',
  description:
    'Emulate a CSS vision deficiency for accessibility testing (CDP `Emulation.setEmulatedVisionDeficiency`).',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    type: VISION_DEFICIENCY_ENUM,
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    await cdp(request.page.pptrPage).send(
      'Emulation.setEmulatedVisionDeficiency',
      {type: request.params.type},
    );
    response.appendResponseLine(
      `Emulating vision deficiency: ${request.params.type}.`,
    );
  },
});

export const emulateReducedMotion = definePageTool({
  name: 'emulate_reduced_motion',
  description:
    'Emulate `prefers-reduced-motion: reduce` via media-feature override.',
  annotations: {
    category: ToolCategory.EMULATION,
    readOnlyHint: false,
  },
  schema: {
    enabled: zod.boolean(),
  },
  blockedByDialog: false,
  handler: async (request, response) => {
    await request.page.pptrPage.emulateMediaFeatures([
      {
        name: 'prefers-reduced-motion',
        value: request.params.enabled ? 'reduce' : 'no-preference',
      },
    ]);
    response.appendResponseLine(
      `prefers-reduced-motion: ${request.params.enabled ? 'reduce' : 'no-preference'}.`,
    );
  },
});
