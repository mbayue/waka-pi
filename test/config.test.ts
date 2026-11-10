import assert from "node:assert/strict";
import test from "node:test";
import { parseSetting } from "../src/config.js";

test("parseSetting reads standard ini keys", () => {
  const content = `
[settings]
api_key = waka_12345678-abcd
debug = true
proxy = https://proxy.local:8080

[other]
api_key = wrong_key
`;

  assert.equal(parseSetting(content, "settings", "api_key"), "waka_12345678-abcd");
  assert.equal(parseSetting(content, "settings", "debug"), "true");
  assert.equal(parseSetting(content, "settings", "proxy"), "https://proxy.local:8080");
  assert.equal(parseSetting(content, "other", "api_key"), "wrong_key");
  assert.equal(parseSetting(content, "settings", "non_existent"), undefined);
});

test("parseSetting handles comments and case-insensitive sections", () => {
  const content = `
# Comment at top
; Semicolon comment
[SETTINGS]
api_key = waka_key_value
# api_key = commented_out
`;

  assert.equal(parseSetting(content, "settings", "api_key"), "waka_key_value");
});
