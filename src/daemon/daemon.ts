#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import {createServer, type Server} from 'node:net';
import path from 'node:path';
import process from 'node:process';

import {logger} from '../logger.js';
import {
  Client,
  PipeTransport,
  StdioClientTransport,
} from '../third_party/index.js';
import {VERSION} from '../version.js';

import type {DaemonMessage} from './types.js';
import {
  DAEMON_CLIENT_NAME,
  getPidFilePath,
  getRuntimeHome,
  getSocketPath,
  INDEX_SCRIPT_PATH,
  IS_WINDOWS,
  isDaemonRunning,
} from './utils.js';

// Phase 1.5: tunables for the daemon watchdog and subprocess stderr capture.
const WATCHDOG_INTERVAL_MS = Number(
  process.env.CHROME_DEVTOOLS_MCP_WATCHDOG_INTERVAL_MS ?? 30_000,
);
const WATCHDOG_MAX_MISSED = Number(
  process.env.CHROME_DEVTOOLS_MCP_WATCHDOG_MAX_MISSED ?? 2,
);
const WATCHDOG_PING_TIMEOUT_MS = Number(
  process.env.CHROME_DEVTOOLS_MCP_WATCHDOG_PING_TIMEOUT_MS ?? 10_000,
);
const SUBPROCESS_LOG_MAX_BYTES = Number(
  process.env.CHROME_DEVTOOLS_MCP_SUBPROCESS_LOG_MAX_BYTES ?? 5 * 1024 * 1024,
);

const sessionId = process.env.CHROME_DEVTOOLS_MCP_SESSION_ID || '';
logger(`Daemon sessionId: ${sessionId}`);
if (isDaemonRunning(sessionId)) {
  logger('Another daemon process is running.');
  process.exit(1);
}
const pidFilePath = getPidFilePath(sessionId);
fs.mkdirSync(path.dirname(pidFilePath), {
  recursive: true,
});
fs.writeFileSync(pidFilePath, process.pid.toString());
logger(`Writing ${process.pid.toString()} to ${pidFilePath}`);

const socketPath = getSocketPath(sessionId);

const startDate = new Date();
const mcpServerArgs = process.argv.slice(2);

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let server: Server | null = null;
let mcpLogStream: fs.WriteStream | null = null;
let mcpLogBytes = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveMisses = 0;
let restartingSubprocess = false;
let shuttingDown = false;

const subprocessLogPath = path.join(getRuntimeHome(sessionId), 'mcp.log');

function ensureLogStream(): fs.WriteStream | null {
  if (shuttingDown) {
    return null;
  }
  if (mcpLogStream) {
    return mcpLogStream;
  }
  try {
    fs.mkdirSync(path.dirname(subprocessLogPath), {recursive: true});
    if (fs.existsSync(subprocessLogPath)) {
      try {
        const stat = fs.statSync(subprocessLogPath);
        mcpLogBytes = stat.size;
      } catch {
        mcpLogBytes = 0;
      }
    } else {
      mcpLogBytes = 0;
    }
    mcpLogStream = fs.createWriteStream(subprocessLogPath, {flags: 'a'});
    return mcpLogStream;
  } catch (err) {
    logger('Failed to open subprocess log:', err);
    return null;
  }
}

function rotateLogIfNeeded(): void {
  if (mcpLogBytes < SUBPROCESS_LOG_MAX_BYTES) {
    return;
  }
  try {
    mcpLogStream?.end();
    mcpLogStream = null;
    const rotated = `${subprocessLogPath}.1`;
    if (fs.existsSync(rotated)) {
      fs.unlinkSync(rotated);
    }
    if (fs.existsSync(subprocessLogPath)) {
      fs.renameSync(subprocessLogPath, rotated);
    }
    mcpLogBytes = 0;
  } catch (err) {
    logger('Failed to rotate subprocess log:', err);
  }
}

function appendSubprocessLog(prefix: string, chunk: Buffer | string): void {
  const stream = ensureLogStream();
  if (!stream) {
    return;
  }
  const ts = new Date().toISOString();
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
  const line = `[${ts}] [${prefix}] ${text}${text.endsWith('\n') ? '' : '\n'}`;
  stream.write(line);
  mcpLogBytes += Buffer.byteLength(line);
  rotateLogIfNeeded();
}

async function setupMCPClient() {
  console.log('Setting up MCP client connection...');
  appendSubprocessLog(
    'daemon',
    `Spawning MCP subprocess: ${process.execPath} ${INDEX_SCRIPT_PATH} ${mcpServerArgs.join(' ')}`,
  );

  // Create stdio transport for chrome-devtools-mcp.
  // Phase 1.5: request 'pipe' for stderr so we can capture subprocess
  // diagnostics into a rotating log instead of dropping them.
  mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [INDEX_SCRIPT_PATH, ...mcpServerArgs],
    env: process.env as Record<string, string>,
    stderr: 'pipe',
  });
  // The MCP SDK exposes the spawned child's stderr stream after construction.
  const stderr = (mcpTransport as unknown as {stderr?: NodeJS.ReadableStream})
    .stderr;
  if (stderr) {
    stderr.on('data', (chunk: Buffer) => {
      appendSubprocessLog('mcp:stderr', chunk);
    });
    stderr.on('error', err => {
      appendSubprocessLog('mcp:stderr-error', String(err));
    });
  }
  mcpClient = new Client(
    {
      name: DAEMON_CLIENT_NAME,
      version: VERSION,
    },
    {
      capabilities: {},
    },
  );
  await mcpClient.connect(mcpTransport);

  console.log('MCP client connected');
  appendSubprocessLog('daemon', 'MCP subprocess connected');
}

async function restartMCPClient(reason: string): Promise<void> {
  if (restartingSubprocess || shuttingDown) {
    return;
  }
  restartingSubprocess = true;
  appendSubprocessLog('daemon', `Restarting MCP subprocess: ${reason}`);
  logger(`Restarting MCP subprocess: ${reason}`);
  try {
    try {
      await mcpClient?.close();
    } catch (err) {
      logger('Error closing client during restart:', err);
    }
    try {
      await mcpTransport?.close();
    } catch (err) {
      logger('Error closing transport during restart:', err);
    }
    mcpClient = null;
    mcpTransport = null;
    await setupMCPClient();
    consecutiveMisses = 0;
  } catch (err) {
    appendSubprocessLog('daemon', `Restart failed: ${String(err)}`);
    logger('Failed to restart MCP subprocess:', err);
  } finally {
    restartingSubprocess = false;
  }
}

function startWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
  }
  if (WATCHDOG_INTERVAL_MS <= 0) {
    return;
  }
  watchdogTimer = setInterval(() => {
    void (async () => {
      if (!mcpClient || restartingSubprocess || shuttingDown) {
        return;
      }
      const ping = mcpClient.listTools().then(
        () => true,
        err => {
          appendSubprocessLog('daemon', `Watchdog ping failed: ${String(err)}`);
          return false;
        },
      );
      const timeout = new Promise<boolean>(resolve =>
        setTimeout(() => resolve(false), WATCHDOG_PING_TIMEOUT_MS),
      );
      const ok = await Promise.race([ping, timeout]);
      if (ok) {
        consecutiveMisses = 0;
      } else {
        consecutiveMisses++;
        appendSubprocessLog(
          'daemon',
          `Watchdog miss ${consecutiveMisses}/${WATCHDOG_MAX_MISSED}`,
        );
        if (consecutiveMisses >= WATCHDOG_MAX_MISSED) {
          consecutiveMisses = 0;
          await restartMCPClient('watchdog timeout');
        }
      }
    })();
  }, WATCHDOG_INTERVAL_MS);
  // Don't keep the event loop alive purely for the watchdog.
  watchdogTimer.unref?.();
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpResult {
  content?: McpContent[] | string;
  text?: string;
}
async function handleRequest(msg: DaemonMessage) {
  try {
    if (msg.method === 'invoke_tool') {
      if (!mcpClient) {
        throw new Error('MCP client not initialized');
      }
      const {tool, args} = msg;

      const result = (await mcpClient.callTool({
        name: tool,
        arguments: args || {},
      })) as McpResult | McpContent[];

      return {
        success: true,
        result: JSON.stringify(result),
      };
    } else if (msg.method === 'stop') {
      // Ensure we are not interrupting in-progress starting.
      await started;
      // Trigger cleanup asynchronously.
      setImmediate(() => {
        void cleanup();
      });
      return {
        success: true,
        message: 'stopping',
      };
    } else if (msg.method === 'status') {
      return {
        success: true,
        result: JSON.stringify({
          pid: process.pid,
          socketPath,
          startDate: startDate.toISOString(),
          version: VERSION,
          args: mcpServerArgs,
        }),
      };
    }
    {
      return {
        success: false,
        error: `Unknown method: ${JSON.stringify(msg, null, 2)}`,
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function startSocketServer() {
  // Remove existing socket file if it exists (only on non-Windows)
  if (!IS_WINDOWS) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore errors.
    }
  }

  return await new Promise<void>((resolve, reject) => {
    server = createServer(socket => {
      const transport = new PipeTransport(socket, socket);
      transport.onmessage = async (message: string) => {
        logger('onmessage', message);
        const response = await handleRequest(JSON.parse(message));
        transport.send(JSON.stringify(response));
        socket.end();
      };
      socket.on('error', error => {
        logger('Socket error:', error);
      });
    });

    server.listen(
      {
        path: socketPath,
        readableAll: false,
        writableAll: false,
      },
      async () => {
        console.log(`Daemon server listening on ${socketPath}`);

        try {
          // Setup MCP client
          await setupMCPClient();
          startWatchdog();
          resolve();
        } catch (err) {
          reject(err);
        }
      },
    );

    server.on('error', error => {
      logger('Server error:', error);
      reject(error);
    });
  });
}

async function cleanup() {
  console.log('Cleaning up daemon...');
  shuttingDown = true;
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }

  try {
    await mcpClient?.close();
  } catch (error) {
    logger('Error closing MCP client:', error);
  }
  try {
    await mcpTransport?.close();
  } catch (error) {
    logger('Error closing MCP transport:', error);
  }
  if (server) {
    await new Promise<void>(resolve => {
      server!.close(() => resolve());
    });
  }
  if (!IS_WINDOWS) {
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // ignore errors
    }
  }
  logger(`unlinking ${pidFilePath}`);
  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
  }
  try {
    mcpLogStream?.end();
  } catch {
    // ignore
  }
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => {
  void cleanup();
});
process.on('SIGINT', () => {
  void cleanup();
});
process.on('SIGHUP', () => {
  void cleanup();
});

// Handle uncaught errors
process.on('uncaughtException', error => {
  logger('Uncaught exception:', error);
});
process.on('unhandledRejection', error => {
  logger('Unhandled rejection:', error);
});

// Start the server
const started = startSocketServer().catch(error => {
  logger('Failed to start daemon server:', error);
  process.exit(1);
});
