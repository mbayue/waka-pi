import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import { extractFilePath, isFileEditTool, getUserAgent } from "../src/sync.js";

test("isFileEditTool correctly detects file modifying tools", () => {
  assert.equal(isFileEditTool("write"), true);
  assert.equal(isFileEditTool("edit"), true);
  assert.equal(isFileEditTool("apply_patch"), true);
  assert.equal(isFileEditTool("str_replace"), true);
  assert.equal(isFileEditTool("create"), true);
  assert.equal(isFileEditTool("insert"), true);
  assert.equal(isFileEditTool("read"), false);
  assert.equal(isFileEditTool("bash"), false);
  assert.equal(isFileEditTool("browse"), false);
});

test("extractFilePath handles multiple argument shapes", () => {
  assert.equal(extractFilePath({ path: "/foo/bar.ts" }), "/foo/bar.ts");
  assert.equal(extractFilePath({ filePath: "/bar/baz.js" }), "/bar/baz.js");
  assert.equal(extractFilePath({ file_path: "/test.txt" }), "/test.txt");
  assert.equal(extractFilePath({ target_file: "/sub/file.py" }), "/sub/file.py");
  
  const testCwd = process.cwd();
  assert.equal(
    extractFilePath({ filename: "rel.txt" }, testCwd),
    path.resolve(testCwd, "rel.txt")
  );
  assert.equal(extractFilePath(undefined), undefined);
});

test("getUserAgent formats editor name and plugin version", () => {
  assert.match(getUserAgent("omp"), /^oh-my-pi\/[^\s]+ waka-pi\/1\.\d+\.\d+/);
  assert.match(getUserAgent("pi"), /^pi\/[^\s]+ waka-pi\/1\.\d+\.\d+/);
});
