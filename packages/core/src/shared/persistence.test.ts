import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeJsonAtomically, withFileLock } from "./persistence.js";

test("does not rewrite unchanged JSON and resumes after a rejected transaction", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-persistence-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "state.json");
  await writeJsonAtomically(filePath, { value: 1 });
  const previous = await fs.stat(filePath);
  assert.equal(await writeJsonAtomically(filePath, { value: 1 }), false);
  assert.equal((await fs.stat(filePath)).mtimeMs, previous.mtimeMs);
  const results = await Promise.allSettled([
    withFileLock(filePath, async () => {
      throw new Error("expected failure");
    }),
    withFileLock(filePath, () => writeJsonAtomically(filePath, { value: 2 })),
  ]);
  assert.equal(results[0]!.status, "rejected");
  assert.equal(results[1]!.status, "fulfilled");
  assert.equal(JSON.parse(await fs.readFile(filePath, "utf8")).value, 2);
});
