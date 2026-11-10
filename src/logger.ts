/**
 * Logger for waka-pi plugin.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getLogFile, isDebugEnabled } from "./config.js";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export function log(level: LogLevel, message: string): void {
  if (level === "DEBUG" && !isDebugEnabled()) return;
  try {
    const file = getLogFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${new Date().toISOString()}][${level}] ${message}\n`);
  } catch {
    // Non-blocking fallback; never crash the agent runtime
  }
}

export function logException(level: LogLevel, error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  log(level, message);
}
