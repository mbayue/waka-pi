import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
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
