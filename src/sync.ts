/**
 * Synchronization and heartbeat handling for WakaTime.
 *
 * Inspired by official WakaTime agent plugins (claude-code-wakatime, opencode-wakatime).
 */

import { execFileSync, spawn } from "node:child_process";
import * as path from "node:path";
import { findInstalledCli } from "./cli.js";
import { getChildEnv, getSetting } from "./config.js";
import { log, logException } from "./logger.js";
import { VERSION } from "./version.js";

const SYNC_INTERVAL_MS = 60_000;
let lastSyncAt = 0;
let syncQueue: Promise<void> = Promise.resolve();

const FILE_EDIT_TOOLS = new Set([
  "apply_patch",
  "create",
  "edit",
  "insert",
  "multi_edit",
  "notebookedit",
  "patch",
  "replace",
  "str_replace",
  "update",
  "write",
]);

export function isFileEditTool(toolName: string): boolean {
  const name = String(toolName ?? "").toLowerCase();
  if (!name) return false;
  return FILE_EDIT_TOOLS.has(name) || Array.from(FILE_EDIT_TOOLS).some((t) => name.includes(t));
}

export function extractFilePath(input?: Record<string, unknown>, cwd?: string): string | undefined {
  if (!input) return undefined;

  const rawPath =
    input.path ||
    input.filePath ||
    input.file_path ||
    input.target_file ||
    input.filename ||
    input.file;

  if (typeof rawPath === "string" && rawPath.trim()) {
    const trimmed = rawPath.trim();
    if (path.isAbsolute(trimmed)) return trimmed;
    if (cwd) return path.resolve(cwd, trimmed);
    return trimmed;
  }

  return undefined;
}

const cachedHostVersion: Record<string, string> = {};

export function getHostVersion(editorName: string): string {
  if (cachedHostVersion[editorName]) return cachedHostVersion[editorName];

  try {
    const bin = editorName === "oh-my-pi" || editorName === "omp" ? "omp" : "pi";
    const output = execFileSync(bin, ["--version"], {
      timeout: 2000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const match = output.match(/\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/);
    if (match) {
      cachedHostVersion[editorName] = match[0];
      return match[0];
    }
  } catch {
    // Best-effort: host binary may not be in PATH
  }

  cachedHostVersion[editorName] = "unknown";
  return "unknown";
}

export function getUserAgent(agentName = "pi"): string {
  // 1. Explicit environment variable override
  if (process.env.WAKA_PI_USER_AGENT?.trim()) {
    return process.env.WAKA_PI_USER_AGENT.trim();
  }

  // 2. Setting from ~/.wakatime.cfg ([waka-pi] user_agent = ... or editor = ...)
  const configuredAgent = getSetting("waka-pi", "user_agent");
  if (configuredAgent?.trim()) {
    return configuredAgent.trim();
  }

  // 3. Resolve canonical editor name ("omp" or "pi")
  // Using "omp" unifies telemetry with wakatime-cli's native OMP parser
  const customEditor = getSetting("waka-pi", "editor");
  const isOmp =
    agentName.toLowerCase().includes("omp") ||
    agentName.toLowerCase().includes("oh-my-pi");

  const editor = customEditor?.trim() || (isOmp ? "omp" : "pi");
  const version = getHostVersion(editor);

  return `${editor}/${version} waka-pi/${VERSION}`;
}

function formatCommand(binary: string, args: string[]): string {
  return [binary, ...args]
    .map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    .join(" ");
}

/**
 * Queue a wakatime-cli invocation so concurrent syncs do not collide.
 */
function queueCommand(cliPath: string, args: string[], detached = false): boolean {
  log("DEBUG", `Running wakatime-cli: ${formatCommand(cliPath, args)}`);

  if (detached) {
    try {
      const child = spawn(cliPath, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: getChildEnv(),
      });
      child.unref();
      return true;
    } catch (error) {
      logException("WARN", error);
      return false;
    }
  }

  const run = syncQueue.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          const child = spawn(cliPath, args, {
            windowsHide: true,
            stdio: "ignore",
            env: getChildEnv(),
          });
          child.once("close", () => resolve());
          child.once("error", (error) => {
            logException("WARN", error);
            resolve();
          });
        } catch (error) {
          logException("WARN", error);
          resolve();
        }
      }),
  );

  syncQueue = run.catch(() => {});
  return true;
}

/**
 * Trigger background AI activity sync.
 */
export function triggerSync(cwd?: string, force = false, agentName = "pi", detached = false): boolean {
  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) {
    return false;
  }

  const cliPath = findInstalledCli();
  if (!cliPath) {
    log("WARN", "wakatime-cli not found; skipped sync.");
    return false;
  }

  lastSyncAt = now;
  log("INFO", `Triggered AI activity sync for ${cwd || "workspace"}${force ? " (forced)" : ""}`);

  const args = ["--sync-ai-activity", "--plugin", getUserAgent(agentName)];
  if (cwd) {
    args.push("--project-folder", cwd);
  }

  return queueCommand(cliPath, args, detached);
}

/**
 * Send an immediate write heartbeat for an edited file.
 */
export function sendFileHeartbeat(
  filePath: string,
  cwd?: string,
  agentName = "pi",
): boolean {
  const cliPath = findInstalledCli();
  if (!cliPath) return false;

  const args = [
    "--entity",
    filePath,
    "--write",
    "--category",
    "ai coding",
    "--plugin",
    getUserAgent(agentName),
  ];

  if (cwd) {
    args.push("--project-folder", cwd);
  }

  log("INFO", `Sent file write heartbeat: ${filePath}`);
  return queueCommand(cliPath, args, false);
}
