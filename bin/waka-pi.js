#!/usr/bin/env node
import { ensureWakatimeCli, findInstalledCli, getCliLocation, getCurrentCliVersion } from "../dist/cli.js";
import { getConfigFile, getHomeDirectory, getLogFile, isApiKeyConfigured } from "../dist/config.js";
import { logException } from "../dist/logger.js";
import { triggerSync } from "../dist/sync.js";
import { VERSION } from "../dist/version.js";

const args = process.argv.slice(2);
const flag = args[0]?.toLowerCase();

async function main() {
  try {
    if (!flag || flag === "--help" || flag === "-h") {
      console.log(`waka-pi v${VERSION} — WakaTime CLI integration for Pi & Oh-My-Pi`);
      console.log(`
Usage:
  waka-pi --status              Check installation and API key status
  waka-pi --sync [dir]          Trigger AI activity sync for project directory
  waka-pi --install             Download or update wakatime-cli binary
  waka-pi --version             Show waka-pi plugin version
`);
      return;
    }

    if (flag === "--version" || flag === "-v") {
      console.log(VERSION);
      return;
    }

    if (flag === "--install" || flag === "--update") {
      console.log("Installing/updating wakatime-cli…");
      const cliPath = await ensureWakatimeCli({ checkLatest: true, forceCheck: true });
      const cliVer = (await getCurrentCliVersion(cliPath).catch(() => "")) || "unknown";
      console.log(`wakatime-cli ${cliVer} ready at: ${cliPath}`);
      return;
    }

    if (flag === "--sync") {
      const targetDir = args[1] || process.cwd();
      console.log(`Syncing AI activity for: ${targetDir}…`);
      const started = triggerSync(targetDir, true, "cli", true);
      console.log(started ? "Sync triggered in background." : "Could not trigger sync.");
      return;
    }

    if (flag === "--status") {
      const installed = findInstalledCli();
      const cliPath = installed ?? getCliLocation();
      let cliVer = "not installed";
      if (installed) {
        cliVer = (await getCurrentCliVersion(cliPath).catch(() => "")) || "unknown";
      }

      console.log(`waka-pi:       v${VERSION}`);
      console.log(`wakatime-cli:  ${cliVer} (${cliPath})`);
      console.log(`api_key:       ${isApiKeyConfigured() ? "configured" : `missing — configure in ${getConfigFile()}`}`);
      console.log(`wakatime home: ${getHomeDirectory()}`);
      console.log(`log file:      ${getLogFile()}`);
      return;
    }

    console.error(`Unknown argument: ${flag}. Use --help for usage.`);
    process.exitCode = 1;
  } catch (err) {
    logException("ERROR", err);
    console.error(`waka-pi error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

void main();
