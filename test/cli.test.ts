import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  formatProgressBar,
  formatTodaySummary,
  mapArchitecture,
  mapOsName,
  safeJoin,
} from "../src/cli.js";

test("mapOsName normalizes OS names", () => {
  assert.equal(mapOsName("win32"), "windows");
  assert.equal(mapOsName("darwin"), "darwin");
  assert.equal(mapOsName("linux"), "linux");
});

test("mapArchitecture maps Node architectures to Go arch tags", () => {
  assert.equal(mapArchitecture("x64"), "amd64");
  assert.equal(mapArchitecture("ia32"), "386");
  assert.equal(mapArchitecture("arm64"), "arm64");
});

test("compareVersions compares semver-like strings", () => {
  assert.equal(compareVersions("1.2.0", "1.2.0"), 0);
  assert.equal(compareVersions("1.3.0", "1.2.0"), 1);
  assert.equal(compareVersions("1.2.0", "1.3.0"), -1);
  assert.equal(compareVersions("v2.28.4", "v2.28.3"), 1);
});

test("safeJoin prevents zip directory traversal", () => {
  const root = process.cwd();
  assert.throws(() => {
    safeJoin(root, "../../etc/passwd");
  }, /Refusing to extract outside target directory/);
});

test("formatProgressBar creates filled and empty boxes properly", () => {
  assert.equal(formatProgressBar(0), "□□□□□□□□□□");
  assert.equal(formatProgressBar(50), "■■■■■□□□□□");
  assert.equal(formatProgressBar(100), "■■■■■■■■■■");
  assert.equal(formatProgressBar(-10), "□□□□□□□□□□");
  assert.equal(formatProgressBar(120), "■■■■■■■■■■");
});

test("formatTodaySummary formats full stats summary", () => {
  const summary = formatTodaySummary({
    range: { text: "Wed Nov 11th 2026" },
    grand_total: { text: "1 hr 38 mins", total_seconds: 5932 },
    projects: [
      { name: "wakaPi", percent: 60, text: "1 hr" },
      { name: "really-long-project-name-exceeding-limit", percent: 40, text: "38 mins" },
    ],
    languages: [{ name: "TypeScript", percent: 100, text: "1 hr 38 mins" }],
    categories: [{ name: "AI Coding", percent: 99.8, text: "1 hr 38 mins" }],
  });

  assert.match(summary, /Today's WakaTime: 1 hr 38 mins \(Wed Nov 11th 2026\)/);
  assert.match(summary, /Projects/);
  assert.match(summary, /wakaPi/);
  assert.match(summary, /really-long-p…/);
  assert.match(summary, /Languages/);
  assert.match(summary, /TypeScript/);
  assert.match(summary, /Categories/);
  assert.match(summary, /AI Coding/);
});

test("formatTodaySummary handles zero activity gracefully", () => {
  const summary = formatTodaySummary({
    range: { text: "Wed Nov 11th 2026" },
    grand_total: { text: "0 secs", total_seconds: 0 },
  });

  assert.match(summary, /Today's WakaTime: 0 secs \(Wed Nov 11th 2026\)/);
  assert.match(summary, /No activity recorded yet today\./);
});
