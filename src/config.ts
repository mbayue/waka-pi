/**
 * WakaTime configuration and environment path helpers.
 *
 * Reads ~/.wakatime.cfg and handles proxy, api key, debug settings, and WAKATIME_HOME.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function isWindows(): boolean {
  return os.platform() === "win32";
}

export function getHomeDirectory(): string {
  const customHome = process.env.WAKATIME_HOME?.trim();
  if (customHome && fs.existsSync(customHome)) {
    return customHome;
  }
  return process.env[isWindows() ? "USERPROFILE" : "HOME"] || os.homedir() || process.cwd();
}

export function getConfigFile(): string {
  return path.join(getHomeDirectory(), ".wakatime.cfg");
}

export function getWakatimeDir(): string {
  return path.join(getHomeDirectory(), ".wakatime");
}

export function getStateDir(): string {
  return path.join(getWakatimeDir(), "waka-pi-state");
}

export function getLogFile(): string {
  return path.join(getWakatimeDir(), "waka-pi.log");
}

/**
 * Parse an INI-style setting from WakaTime configuration text.
 */
export function parseSetting(content: string, section: string, key: string): string | undefined {
  const targetSection = section.toLowerCase();
  let activeSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      activeSection = line.slice(1, -1).trim().toLowerCase();
      continue;
    }

    if (activeSection !== targetSection) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const currentKey = line.slice(0, eqIndex).trim();
    if (currentKey === key) {
      return line.slice(eqIndex + 1).trim().replace(/\0/g, "");
    }
  }

  return undefined;
}

/**
 * Read setting directly from ~/.wakatime.cfg.
 */
export function getSetting(section: string, key: string): string | undefined {
  try {
    const configPath = getConfigFile();
    if (!fs.existsSync(configPath)) return undefined;
    const content = fs.readFileSync(configPath, "utf-8");
    return parseSetting(content, section, key);
  } catch {
    return undefined;
  }
}

export function isDebugEnabled(): boolean {
  return getSetting("settings", "debug")?.toLowerCase() === "true";
}

export function isApiKeyConfigured(): boolean {
  return Boolean(getSetting("settings", "api_key"));
}

/**
 * Ensures child processes have proper environment variables set.
 */
export function getChildEnv(): NodeJS.ProcessEnv {
  if (isWindows() || process.env.HOME || process.env.WAKATIME_HOME) {
    return process.env;
  }
  return { ...process.env, WAKATIME_HOME: getHomeDirectory() };
}
