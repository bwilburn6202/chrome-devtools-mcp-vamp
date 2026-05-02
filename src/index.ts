/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';

import type {parseArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {setStackTraceMaxLines} from './formatters/ConsoleFormatter.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex, MutexMap} from './Mutex.js';
import {SlimMcpResponse} from './SlimMcpResponse.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {bucketizeLatency} from './telemetry/metricUtils.js';
import {
  McpServer,
  type CallToolResult,
  SetLevelRequestSchema,
  ListRootsResultSchema,
  RootsListChangedNotificationSchema,
} from './third_party/index.js';
import type {ToolCategory} from './tools/categories.js';
import {labels, OFF_BY_DEFAULT_CATEGORIES} from './tools/categories.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {pageIdSchema} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {VERSION} from './version.js';

export function buildFlag(category: ToolCategory) {
  return `category${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

function buildDisabledMessage(
  toolName: string,
  flag: string,
  categoryLabel?: string,
): string {
  const reason = categoryLabel
    ? `is in category ${categoryLabel} which`
    : `requires experimental feature ${flag} and`;

  return `Tool ${toolName} ${reason} is currently disabled. Enable it by running chrome-devtools start ${flag}=true. For more information check the README.`;
}

function getCategoryStatus(
  category: ToolCategory,
  serverArgs: ReturnType<typeof parseArguments>,
): {categoryFlag?: string; disabled: boolean} {
  const categoryFlag = buildFlag(category);

  const flagValue = serverArgs[categoryFlag];

  const isDisabled = OFF_BY_DEFAULT_CATEGORIES.includes(category)
    ? !flagValue
    : flagValue === false;

  if (isDisabled) {
    return {
      categoryFlag,
      disabled: true,
    };
  }

  return {
    disabled: false,
  };
}

function getConditionStatus(
  condition: string,
  serverArgs: ReturnType<typeof parseArguments>,
): {conditionFlag?: string; disabled: boolean} {
  if (condition && !serverArgs[condition]) {
    return {conditionFlag: condition, disabled: true};
  }

  return {disabled: false};
}

function getToolStatusInfo(
  tool: ToolDefinition | DefinedPageTool,
  serverArgs: ReturnType<typeof parseArguments>,
): {disabled: boolean; reason?: string} {
  const category = tool.annotations.category;
  const categoryCheck = getCategoryStatus(category, serverArgs);

  if (category && categoryCheck.disabled) {
    if (!categoryCheck.categoryFlag) {
      throw new Error(
        'when the category is disabled there should always be a flag set',
      );
    }

    return {
      disabled: true,
      reason: buildDisabledMessage(
        tool.name,
        `--${categoryCheck.categoryFlag}`,
        labels[category!],
      ),
    };
  }

  for (const condition of tool.annotations.conditions || []) {
    const conditionCheck = getConditionStatus(condition, serverArgs);
    if (conditionCheck.disabled) {
      if (!conditionCheck.conditionFlag) {
        throw new Error(
          'when the condition is disabled there should always be a flag set',
        );
      }

      return {
        disabled: true,
        reason: buildDisabledMessage(
          tool.name,
          `--${conditionCheck.conditionFlag}`,
        ),
      };
    }
  }

  return {disabled: false};
}

export async function createMcpServer(
  serverArgs: ReturnType<typeof parseArguments>,
  options: {
    logFile?: fs.WriteStream;
  },
) {
  let clearcutLogger: ClearcutLogger | undefined;
  if (serverArgs.usageStatistics) {
    clearcutLogger = new ClearcutLogger({
      logFile: serverArgs.logFile,
      appVersion: VERSION,
      clearcutEndpoint: serverArgs.clearcutEndpoint,
      clearcutForceFlushIntervalMs: serverArgs.clearcutForceFlushIntervalMs,
      clearcutIncludePidHeader: serverArgs.clearcutIncludePidHeader,
    });
  }

  const server = new McpServer(
    {
      name: 'chrome_devtools',
      title: 'Chrome DevTools MCP server',
      version: VERSION,
    },
    {capabilities: {logging: {}}},
  );
  server.server.setRequestHandler(SetLevelRequestSchema, () => {
    return {};
  });

  const updateRoots = async () => {
    if (!server.server.getClientCapabilities()?.roots) {
      return;
    }
    try {
      const roots = await server.server.request(
        {method: 'roots/list'},
        ListRootsResultSchema,
      );
      context?.setRoots(roots.roots);
    } catch (e) {
      logger('Failed to list roots', e);
    }
  };

  server.server.oninitialized = () => {
    const clientName = server.server.getClientVersion()?.name;
    if (clientName) {
      clearcutLogger?.setClientName(clientName);
    }
    if (server.server.getClientCapabilities()?.roots) {
      void updateRoots();
      server.server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        () => {
          void updateRoots();
        },
      );
    }
  };

  let context: McpContext;
  async function getContext(): Promise<McpContext> {
    const chromeArgs: string[] = (serverArgs.chromeArg ?? []).map(String);
    const ignoreDefaultChromeArgs: string[] = (
      serverArgs.ignoreDefaultChromeArg ?? []
    ).map(String);
    if (serverArgs.proxyServer) {
      chromeArgs.push(`--proxy-server=${serverArgs.proxyServer}`);
    }
    const devtools = serverArgs.experimentalDevtools ?? false;
    const browser =
      serverArgs.browserUrl || serverArgs.wsEndpoint || serverArgs.autoConnect
        ? await ensureBrowserConnected({
            browserURL: serverArgs.browserUrl,
            wsEndpoint: serverArgs.wsEndpoint,
            wsHeaders: serverArgs.wsHeaders,
            // Important: only pass channel, if autoConnect is true.
            channel: serverArgs.autoConnect
              ? (serverArgs.channel as Channel)
              : undefined,
            userDataDir: serverArgs.userDataDir,
            devtools,
          })
        : await ensureBrowserLaunched({
            headless: serverArgs.headless,
            executablePath: serverArgs.executablePath,
            channel: serverArgs.channel as Channel,
            isolated: serverArgs.isolated ?? false,
            userDataDir: serverArgs.userDataDir,
            logFile: options.logFile,
            viewport: serverArgs.viewport,
            chromeArgs,
            ignoreDefaultChromeArgs,
            acceptInsecureCerts: serverArgs.acceptInsecureCerts,
            devtools,
            enableExtensions: serverArgs.categoryExtensions,
            viaCli: serverArgs.viaCli,
          });

    if (context?.browser !== browser) {
      context = await McpContext.from(browser, logger, {
        experimentalDevToolsDebugging: devtools,
        experimentalIncludeAllPages: serverArgs.experimentalIncludeAllPages,
        performanceCrux: serverArgs.performanceCrux,
        heapSnapshotCacheSize: serverArgs.heapSnapshotCacheSize,
        traceHistoryLimit: serverArgs.traceHistoryLimit,
        tuning: {
          dragDelayMs: serverArgs.dragDelayMs,
          fileChooserTimeoutMs: serverArgs.fileChooserTimeoutMs,
          fillCharMultiplierMs: serverArgs.fillCharMultiplierMs,
          lighthouseMaxWaitMs: serverArgs.lighthouseMaxWaitMs,
          slimNavigateTimeoutMs: serverArgs.slimNavigateTimeoutMs,
          performanceAutoStopMs: serverArgs.performanceAutoStopMs,
          screenshotInlineLimitBytes: serverArgs.screenshotInlineLimitBytes,
          snapshotMaxNodes: serverArgs.snapshotMaxNodes,
          consoleStackMaxFrames: serverArgs.consoleStackMaxFrames,
          stackTraceTimeoutMs: serverArgs.stackTraceTimeoutMs,
        },
      });
      await updateRoots();
    }
    return context;
  }

  // Phase 1.6: apply console-stack tunable once at server creation. This is
  // a module-level setter rather than per-call to keep ConsoleFormatter
  // stateless from the caller's perspective.
  if (serverArgs.consoleStackMaxFrames) {
    setStackTraceMaxLines(serverArgs.consoleStackMaxFrames);
  }

  // Serializes context initialization and the page-resolution step so we can
  // safely pick the per-page mutex without racing.
  const contextInitMutex = new Mutex();
  // Per-page (and one "global" slot for non-page-scoped tools) mutexes.
  // Different pages no longer block each other.
  const pageMutexes = new MutexMap<number | 'global'>();
  const toolMutexTimeoutMs = serverArgs.toolMutexTimeoutMs ?? 0;

  function registerTool(tool: ToolDefinition | DefinedPageTool): void {
    const {disabled, reason: disabledReason} = getToolStatusInfo(
      tool,
      serverArgs,
    );

    if (disabled && !serverArgs.viaCli) {
      return;
    }

    const schema =
      'pageScoped' in tool &&
      tool.pageScoped &&
      serverArgs.experimentalPageIdRouting &&
      !serverArgs.slim
        ? {...tool.schema, ...pageIdSchema}
        : tool.schema;

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        if (disabledReason) {
          return {
            content: [
              {
                type: 'text',
                text: disabledReason,
              },
            ],
            isError: true,
          };
        }

        // Phase 1.1: per-page mutex. We briefly hold the context-init mutex to
        // resolve the page id, then transfer to a per-page mutex so unrelated
        // pages can run in parallel. Non-page-scoped tools serialize on a
        // shared 'global' slot.
        const initGuard = await contextInitMutex.acquire({
          timeoutMs: toolMutexTimeoutMs,
          holderHint: `${tool.name}:init`,
        });
        let pageGuard: InstanceType<typeof Mutex.Guard> | undefined;
        const startTime = Date.now();
        let success = false;
        try {
          logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
          const context = await getContext();
          logger(`${tool.name} context: resolved`);

          let mutexKey: number | 'global' = 'global';
          if ('pageScoped' in tool && tool.pageScoped) {
            try {
              const resolvedPage =
                serverArgs.experimentalPageIdRouting && params.pageId
                  ? context.getPageById(params.pageId)
                  : context.getSelectedMcpPage();
              mutexKey = resolvedPage.id;
            } catch {
              // Fall back to the global slot if page resolution fails here;
              // the real error will resurface inside the handler below.
            }
          }
          pageGuard = await pageMutexes.get(mutexKey).acquire({
            timeoutMs: toolMutexTimeoutMs,
            holderHint: `${tool.name}:page=${mutexKey}`,
          });
          // Release the init lock now that the per-page lock is held.
          initGuard.dispose();

          await context.detectOpenDevToolsWindows();
          const response = serverArgs.slim
            ? new SlimMcpResponse(serverArgs)
            : new McpResponse(serverArgs);

          response.setRedactNetworkHeaders(serverArgs.redactNetworkHeaders);
          try {
            const page =
              serverArgs.experimentalPageIdRouting &&
              params.pageId &&
              !serverArgs.slim
                ? context.getPageById(params.pageId)
                : context.getSelectedMcpPage();
            response.setPage(page);
            if (tool.blockedByDialog) {
              page.throwIfDialogOpen();
            }
            if ('pageScoped' in tool && tool.pageScoped) {
              await tool.handler(
                {
                  params,
                  page,
                },
                response,
                context,
              );
            } else {
              await tool.handler(
                // @ts-expect-error types do not match.
                {
                  params,
                },
                response,
                context,
              );
            }
          } catch (err) {
            response.setError(err);
          }
          const {content, structuredContent} = await response.handle(
            tool.name,
            context,
          );
          const result: CallToolResult & {
            structuredContent?: Record<string, unknown>;
          } = {
            content,
          };
          if (response.error) {
            result.isError = true;
          }
          success = true;
          if (serverArgs.experimentalStructuredContent) {
            result.structuredContent = structuredContent as Record<
              string,
              unknown
            >;
          }
          return result;
        } catch (err) {
          logger(`${tool.name} error:`, err, err?.stack);
          let errorText = err && 'message' in err ? err.message : String(err);
          if ('cause' in err && err.cause) {
            errorText += `\nCause: ${err.cause.message}`;
          }
          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
            isError: true,
          };
        } finally {
          void clearcutLogger?.logToolInvocation({
            toolName: tool.name,
            params,
            schema,
            success,
            latencyMs: bucketizeLatency(Date.now() - startTime),
          });
          // Release whichever locks we still hold. initGuard is idempotent,
          // so calling dispose twice is a no-op if it was already released.
          initGuard.dispose();
          pageGuard?.dispose();
        }
      },
    );
  }

  const tools = createTools(serverArgs);
  for (const tool of tools) {
    registerTool(tool);
  }

  await loadIssueDescriptions();

  return {server, clearcutLogger};
}

export const logDisclaimers = (args: ReturnType<typeof parseArguments>) => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );

  if (!args.slim && args.performanceCrux) {
    console.error(
      `Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.`,
    );
  }

  if (!args.slim && args.usageStatistics) {
    console.error(
      `
Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
For more details, visit: https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics`,
    );
  }
};
