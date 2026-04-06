import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyEnvEntries, loadEnvFile } from "./env.js";

test("loadEnvFile parses quoted values and ignores comments", () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-env-"));
  const filePath = join(dir, ".env");
  writeFileSync(filePath, [
    "# comment",
    "A=1",
    "B='two words'",
    'C="three words"',
    "",
  ].join("\n"), "utf8");

  assert.deepEqual(loadEnvFile(filePath), {
    A: "1",
    B: "two words",
    C: "three words",
  });
});

test("applyEnvEntries does not overwrite existing values", () => {
  const original = process.env.TEST_STABLE_ENV;
  process.env.TEST_STABLE_ENV = "kept";

  applyEnvEntries({
    TEST_STABLE_ENV: "changed",
    TEST_NEW_ENV: "new-value",
  });

  assert.equal(process.env.TEST_STABLE_ENV, "kept");
  assert.equal(process.env.TEST_NEW_ENV, "new-value");

  if (original === undefined) {
    delete process.env.TEST_STABLE_ENV;
  } else {
    process.env.TEST_STABLE_ENV = original;
  }

  delete process.env.TEST_NEW_ENV;
});