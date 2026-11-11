/**
 * waka-pi — WakaTime extension for Pi and Oh-My-Pi (omp) coding agents.
 */

import * as fs from "node:fs";
import { ensureWakatimeCli, findInstalledCli, getCliLocation, getCurrentCliVersion, getTodaySummary, getTodayTime } from "./cli.js";
import { getConfigFile, getHomeDirectory, getLogFile, isApiKeyConfigured } from "./config.js";
import { log, logException } from "./logger.js";
import { extractFilePath, isFileEditTool, sendFileHeartbeat, triggerSync } from "./sync.js";
import type { ExtensionAPI, ExtensionContext, ToolResultEvent } from "./types.js";
import { VERSION } from "./version.js";

let apiKeyWarned = false;

function detectAgentName(): string {
  const execPath = (process.argv[1] || "").toLowerCase();
  if (execPath.includes("omp") || execPath.includes("oh-my-pi")) {
    return "omp";
  }
  return "pi";
}

function notify(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI && ctx.ui) {
    ctx.ui.notify(message, "info");
  } else {
    log("INFO", message.replace(/\n/g, " | "));
  }
}

async function handleStatusCommand(ctx: ExtensionContext, agentName: string): Promise<void> {
  const installed = findInstalledCli();
  const cliPath = installed ?? getCliLocation();
  let cliVersion = "not installed";
  let todayTime = "unavailable";

  if (installed) {
    try {
      cliVersion = (await getCurrentCliVersion(cliPath)) || "unknown";
      todayTime = await getTodayTime(cliPath);
    } catch {
      cliVersion = "unknown";
    }
  }

  log("INFO", `Status checked via /wakatime status`);
  notify(
    ctx,
    [
      `waka-pi/${VERSION} · running on ${agentName}`,
      `today's coding: ${todayTime}`,
      `wakatime-cli: ${cliVersion} (${cliPath})`,
      `api_key: ${isApiKeyConfigured() ? "configured" : `missing — add it to ${getConfigFile()}`}`,
      `wakatime home: ${getHomeDirectory()}`,
      `log: ${getLogFile()}`,
    ].join("\n"),
  );
}

export default function wakaExtension(pi: ExtensionAPI): void {
  const agentName = detectAgentName();
  log("INFO", `Initializing waka-pi v${VERSION} for ${agentName}`);

  // 1. Session start: ensure CLI is installed, check for updates in background
  pi.on("session_start", () => {
    void ensureWakatimeCli({ checkLatest: true }).catch((error) => {
      logException("WARN", error);
    });

    if (!apiKeyWarned && !isApiKeyConfigured()) {
      apiKeyWarned = true;
      log("WARN", `No api_key configured in ${getConfigFile()}. Get one at https://wakatime.com/settings/api-key`);
    }
  });

  // 2. User prompt submitted
  pi.on("before_agent_start", (event, ctx) => {
    if (event.messageType === "user" || !event.messageType) {
      triggerSync(ctx.cwd, false, agentName);
    }
  });

  // 3. Tool executed: track file modifications
  pi.on("tool_result", (event: ToolResultEvent, ctx) => {
    if (isFileEditTool(event.toolName)) {
      const filePath = extractFilePath(event.input, ctx.cwd);
      if (filePath) {
        sendFileHeartbeat(filePath, ctx.cwd, agentName);
      }
      triggerSync(ctx.cwd, false, agentName);
    }
  });

  // 4. Session shutdown: final flush sync (detached so child survives exit)
  pi.on("session_shutdown", (_event, ctx) => {
    triggerSync(ctx.cwd, true, agentName, true);
  });

  // 5. Slash command /wakatime
  pi.registerCommand("wakatime", {
    description: "WakaTime: status, manual sync, and wakatime-cli management",
    handler: async (args: string, ctx) => {
      const subcommand = args.trim().split(/\s+/)[0]?.toLowerCase() || "status";
      try {
        switch (subcommand) {
          case "sync": {
            const started = triggerSync(ctx.cwd, true, agentName);
            notify(
              ctx,
              started
                ? "WakaTime sync triggered"
                : "wakatime-cli is not installed yet; run /wakatime install",
            );
            return;
          }

          case "install":
          case "update": {
            notify(ctx, "Installing / updating wakatime-cli…");
            const cliPath = await ensureWakatimeCli({ checkLatest: true, forceCheck: true });
            const version = await getCurrentCliVersion(cliPath).catch(() => "");
            notify(ctx, `wakatime-cli ${version || "installed"} at ${cliPath}`);
            return;
          }

          case "today": {
            const installed = findInstalledCli();
            if (!installed) {
              notify(ctx, "wakatime-cli is not installed yet; run /wakatime install");
              return;
            }
            const summary = await getTodaySummary(installed);
            notify(ctx, summary);
            return;
          }

          case "log": {
            const logPath = getLogFile();
            if (!fs.existsSync(logPath)) {
              notify(ctx, `No log found yet: ${logPath}`);
              return;
            }
            const tail = fs
              .readFileSync(logPath, "utf-8")
              .trimEnd()
              .split("\n")
              .slice(-20)
              .join("\n");
            notify(ctx, `${logPath} (last 20 lines):\n${tail}`);
            return;
          }

          case "status":
          default: {
            await handleStatusCommand(ctx, agentName);
            return;
          }
        }
      } catch (error) {
        logException("ERROR", error);
        notify(
          ctx,
          `WakaTime command failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
