/**
 * wakatime-cli binary dependency management and lifecycle.
 *
 * Downloads and updates wakatime-cli into ~/.wakatime/ without external npm dependencies.
 */

import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as tls from "node:tls";
import * as zlib from "node:zlib";

import { getSetting, getStateDir, getWakatimeDir, isWindows } from "./config.js";
import { log, logException } from "./logger.js";
import { VERSION } from "./version.js";

const GITHUB_DOWNLOAD_URL = "https://github.com/wakatime/wakatime-cli/releases/latest/download";
const GITHUB_RELEASES_URL = "https://api.github.com/repos/wakatime/wakatime-cli/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface EnsureCliOptions {
  checkLatest?: boolean;
  forceCheck?: boolean;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface JsonResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function execFile(file: string, args: string[], options: { timeout?: number } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFileCallback(file, args, { windowsHide: true, timeout: options.timeout }, (error, stdout, stderr) => {
      if (error) {
        const enriched = error as Error & { stdout?: string; stderr?: string };
        enriched.stdout = stdout ?? "";
        enriched.stderr = stderr ?? "";
        reject(enriched);
        return;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

export function mapOsName(platform: string): string {
  return platform === "win32" ? "windows" : platform;
}

export function mapArchitecture(arch: string): string {
  if (arch === "ia32" || arch.includes("32")) return "386";
  if (arch === "x64") return "amd64";
  return arch;
}

export function osName(): string {
  return mapOsName(os.platform());
}

export function architecture(): string {
  return mapArchitecture(os.arch());
}

export function compareVersions(left: string, right: string): number {
  const leftParts = String(left)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i++) {
    if ((leftParts[i] ?? 0) < (rightParts[i] ?? 0)) return -1;
    if ((leftParts[i] ?? 0) > (rightParts[i] ?? 0)) return 1;
  }
  return 0;
}

export function cliDownloadUrl(platform: string, arch: string): string {
  const combination = `${platform}-${arch}`;
  return `${GITHUB_DOWNLOAD_URL}/wakatime-cli-${combination}.zip`;
}

export function getCliLocation(): string {
  const ext = isWindows() ? ".exe" : "";
  return path.join(getWakatimeDir(), `wakatime-cli-${osName()}-${architecture()}${ext}`);
}

/**
 * Find an already installed wakatime-cli binary synchronously.
 */
export function findInstalledCli(): string | undefined {
  const local = getCliLocation();
  if (fs.existsSync(local)) return local;

  const alias = path.join(getWakatimeDir(), `wakatime-cli${isWindows() ? ".exe" : ""}`);
  if (fs.existsSync(alias)) return alias;

  return undefined;
}

export async function getCurrentCliVersion(cliPath: string): Promise<string> {
  const result = await execFile(cliPath, ["--version"], { timeout: 10_000 });
  return `${result.stdout}${result.stderr}`.trim();
}

/**
 * Ensures wakatime-cli is available, installing or updating when necessary.
 */
export async function ensureWakatimeCli(options: EnsureCliOptions = {}): Promise<string> {
  const cliPath = getCliLocation();
  fs.mkdirSync(getWakatimeDir(), { recursive: true });

  if (!fs.existsSync(cliPath)) {
    // If alias exists, copy/link it to target location
    const alias = path.join(getWakatimeDir(), `wakatime-cli${isWindows() ? ".exe" : ""}`);
    if (fs.existsSync(alias)) {
      try {
        fs.copyFileSync(alias, cliPath);
        return cliPath;
      } catch {
        // Fall back to install
      }
    }
    await installCli();
    return cliPath;
  }

  let currentVersion = "";
  try {
    currentVersion = await getCurrentCliVersion(cliPath);
    log("DEBUG", `Current wakatime-cli version is ${currentVersion}`);
  } catch (error) {
    logException("WARN", error);
    await installCli();
    return cliPath;
  }

  if (options.checkLatest === true && (options.forceCheck === true || shouldCheckForUpdate())) {
    await updateLastCheckAt();
    if (!(await isCliLatest(currentVersion))) {
      await installCli();
      return cliPath;
    }
  }

  ensureCliAlias(cliPath);
  return cliPath;
}

async function isCliLatest(currentVersion: string): Promise<boolean> {
  try {
    const latest = await getLatestCliVersion();
    if (!latest) return true;
    if (currentVersion.includes(latest.replace(/^v/, ""))) {
      log("DEBUG", "wakatime-cli is up to date");
      return true;
    }
    log("DEBUG", `Found updated wakatime-cli: ${latest}`);
    return false;
  } catch (error) {
    logException("WARN", error);
    return true;
  }
}

async function getLatestCliVersion(): Promise<string> {
  try {
    const response = await getJson(GITHUB_RELEASES_URL);
    if (response.statusCode !== 200) return "";
    return String(response.body?.tag_name ?? "");
  } catch {
    return "";
  }
}

async function installCli(): Promise<void> {
  const url = cliDownloadUrl(osName(), architecture());
  const zipFile = path.join(getWakatimeDir(), `wakatime-cli-temp-${Date.now()}.zip`);
  const cliPath = getCliLocation();
  const backupPath = `${cliPath}.backup`;

  log("DEBUG", `Downloading wakatime-cli from ${url}`);
  await downloadToFile(url, zipFile);

  try {
    if (fs.existsSync(cliPath)) {
      fs.renameSync(cliPath, backupPath);
    }
    extractZip(zipFile, getWakatimeDir());
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    if (!isWindows()) {
      fs.chmodSync(cliPath, 0o755);
    }
    ensureCliAlias(cliPath);
  } catch (error) {
    if (fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, cliPath);
    }
    throw error;
  } finally {
    try {
      if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
    } catch {
      // Best-effort cleanup
    }
  }
}

function ensureCliAlias(cliPath: string): void {
  const alias = path.join(getWakatimeDir(), `wakatime-cli${isWindows() ? ".exe" : ""}`);
  try {
    if (fs.existsSync(alias)) {
      if (!isWindows() && fs.lstatSync(alias).isSymbolicLink()) return;
      fs.unlinkSync(alias);
    }
    if (isWindows()) {
      fs.copyFileSync(cliPath, alias);
      return;
    }
    fs.symlinkSync(cliPath, alias);
  } catch {
    try {
      fs.copyFileSync(cliPath, alias);
      if (!isWindows()) fs.chmodSync(alias, 0o755);
    } catch {
      // Best effort
    }
  }
}

function lastUpdateCheckFile(): string {
  return path.join(getStateDir(), "last-update-check");
}

export function shouldCheckForUpdate(now = Date.now()): boolean {
  try {
    const raw = fs.readFileSync(lastUpdateCheckFile(), "utf-8").trim();
    const last = Number.parseInt(raw, 10);
    if (Number.isFinite(last) && now - last < UPDATE_CHECK_INTERVAL_MS) {
      return false;
    }
  } catch {
    // Check if missing
  }
  return true;
}

async function updateLastCheckAt(): Promise<void> {
  try {
    fs.mkdirSync(getStateDir(), { recursive: true });
    fs.writeFileSync(lastUpdateCheckFile(), String(Date.now()));
  } catch (error) {
    logException("WARN", error);
  }
}

async function downloadToFile(url: string, outputFile: string): Promise<void> {
  const response = await requestWithRedirects(url);
  const statusCode = response.statusCode ?? 0;
  if (statusCode < 200 || statusCode >= 300) {
    response.resume();
    throw new Error(`Download failed with status code ${statusCode}`);
  }

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(outputFile);
    response.pipe(stream);
    response.once("error", reject);
    stream.once("error", reject);
    stream.once("finish", resolve);
  });
}

async function getJson(url: string): Promise<JsonResponse> {
  const response = await requestWithRedirects(url);
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const bodyText = Buffer.concat(chunks).toString("utf-8");
  return {
    statusCode: response.statusCode ?? 0,
    body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : {},
  };
}

async function requestWithRedirects(url: string, redirectsLeft = 5): Promise<http.IncomingMessage> {
  const response = await sendRequest(url);
  const statusCode = response.statusCode ?? 0;
  const location = response.headers.location;

  if (statusCode >= 300 && statusCode < 400 && location && redirectsLeft > 0) {
    response.resume();
    return requestWithRedirects(new URL(location, url).toString(), redirectsLeft - 1);
  }

  return response;
}

async function sendRequest(url: string): Promise<http.IncomingMessage> {
  const targetUrl = new URL(url);
  const proxy = getSetting("settings", "proxy");
  const proxyUrl = proxy ? new URL(proxy) : undefined;
  const noSSLVerify = getSetting("settings", "no_ssl_verify") === "true";
  const rejectUnauthorized = !noSSLVerify;
  const headers: Record<string, string> = { "User-Agent": `waka-pi/${VERSION}` };

  if (proxyUrl && targetUrl.protocol === "https:") {
    const tunnel = await createProxyTunnel(proxyUrl, targetUrl, rejectUnauthorized);
    const secureSocket = tls.connect({
      socket: tunnel,
      servername: targetUrl.hostname,
      rejectUnauthorized,
    });
    return new Promise((resolve, reject) => {
      secureSocket.once("error", reject);
      const request = https.request(
        {
          host: targetUrl.hostname,
          port: targetUrl.port ? Number.parseInt(targetUrl.port, 10) : 443,
          path: `${targetUrl.pathname}${targetUrl.search}`,
          method: "GET",
          headers,
          agent: false,
          createConnection: () => secureSocket,
        },
        resolve,
      );
      request.once("error", reject);
      request.end();
    });
  }

  const isHttps = proxyUrl ? proxyUrl.protocol === "https:" : targetUrl.protocol === "https:";
  const requestUrl = proxyUrl ?? targetUrl;
  const authHeader = proxyUrl && proxyUrl.username ? getProxyAuthorizationHeader(proxyUrl) : undefined;

  const requestOptions: http.RequestOptions = {
    host: requestUrl.hostname,
    port: requestUrl.port ? Number.parseInt(requestUrl.port, 10) : isHttps ? 443 : 80,
    path: proxyUrl ? targetUrl.toString() : `${targetUrl.pathname}${targetUrl.search}`,
    method: "GET",
    headers: proxyUrl
      ? { Host: targetUrl.host, ...headers, ...(authHeader ? { "Proxy-Authorization": authHeader } : {}) }
      : headers,
  };

  if (isHttps) {
    return new Promise((resolve, reject) => {
      const request = https.request(
        { ...requestOptions, rejectUnauthorized, servername: requestUrl.hostname },
        resolve,
      );
      request.once("error", reject);
      request.end();
    });
  }

  return new Promise((resolve, reject) => {
    const request = http.request(requestOptions, resolve);
    request.once("error", reject);
    request.end();
  });
}

function createProxyTunnel(proxyUrl: URL, targetUrl: URL, rejectUnauthorized: boolean): Promise<net.Socket> {
  const proxyPort = proxyUrl.port ? Number.parseInt(proxyUrl.port, 10) : proxyUrl.protocol === "https:" ? 443 : 80;
  const baseSocket: net.Socket =
    proxyUrl.protocol === "https:"
      ? tls.connect({ host: proxyUrl.hostname, port: proxyPort, rejectUnauthorized, servername: proxyUrl.hostname })
      : net.connect(proxyPort, proxyUrl.hostname);

  return new Promise((resolve, reject) => {
    const auth = getProxyAuthorizationHeader(proxyUrl);
    let response = "";

    const cleanup = () => {
      baseSocket.removeListener("error", onError);
      baseSocket.removeListener("data", onData);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      response += chunk.toString("utf-8");
      if (!response.includes("\r\n\r\n")) return;

      cleanup();
      const statusLine = response.split("\r\n", 1)[0] ?? "";
      if (!statusLine.includes(" 200 ")) {
        baseSocket.destroy();
        reject(new Error(`Proxy CONNECT failed: ${statusLine}`));
        return;
      }
      resolve(baseSocket);
    };

    const connectRequest =
      `CONNECT ${targetUrl.hostname}:${targetUrl.port || 443} HTTP/1.1\r\n` +
      `Host: ${targetUrl.hostname}:${targetUrl.port || 443}\r\n` +
      (auth ? `Proxy-Authorization: ${auth}\r\n` : "") +
      "Connection: close\r\n\r\n";

    baseSocket.once("error", onError);
    baseSocket.on("data", onData);
    if (proxyUrl.protocol === "https:") {
      baseSocket.once("secureConnect", () => baseSocket.write(connectRequest));
    } else {
      baseSocket.once("connect", () => baseSocket.write(connectRequest));
    }
  });
}

function getProxyAuthorizationHeader(proxyUrl: URL): string | undefined {
  if (!proxyUrl.username && !proxyUrl.password) return undefined;
  const credentials = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/**
 * Minimal zero-dependency ZIP extractor for wakatime-cli release archives.
 */
export function extractZip(zipFile: string, outputDir: string): void {
  const buffer = fs.readFileSync(zipFile);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error("Invalid zip file: missing central directory");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid zip file: bad central directory header");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf-8", offset + 46, offset + 46 + fileNameLength);

    if (!fileName.endsWith("/")) {
      extractZipEntry(buffer, outputDir, fileName, method, compressedSize, localHeaderOffset);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
}

function extractZipEntry(
  buffer: Buffer,
  outputDir: string,
  fileName: string,
  method: number,
  compressedSize: number,
  localHeaderOffset: number,
): void {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid zip file: bad local file header");
  }

  const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
  let data: Buffer;

  if (method === 0) {
    data = compressed;
  } else if (method === 8) {
    data = zlib.inflateRawSync(compressed);
  } else {
    throw new Error(`Unsupported zip compression method: ${method}`);
  }

  const outputFile = safeJoin(outputDir, fileName);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, data);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

export function safeJoin(root: string, fileName: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, fileName);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to extract outside target directory: ${fileName}`);
  }
  return target;
}
