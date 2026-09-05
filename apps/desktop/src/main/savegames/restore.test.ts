import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { restoreDirectories, recoverRestore } from "./restore.js";

test("recovers the original directory after an interrupted swap", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-recovery-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "saves");
  const stage = await fs.mkdtemp(path.join(directory, ".nemeton-restore-"));
  const previous = `${stage}.previous`;
  await fs.mkdir(previous);
  await fs.writeFile(path.join(previous, "save.sav"), "original");
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, "save.sav"), "incomplete");
  const journal = path.join(directory, "journal.json");
  await fs.writeFile(
    journal,
    JSON.stringify({ committed: false, directories: [{ root, stage, previous }] }),
  );
  await recoverRestore(journal);
  assert.equal(await fs.readFile(path.join(root, "save.sav"), "utf8"), "original");
  assert.equal(await fs.stat(journal).catch(() => null), null);
});

test("rolls back all roots if committing a later directory fails", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-rollback-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const roots = [path.join(directory, "a"), path.join(directory, "b")];

  for (const root of roots) {
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, "save"), "original");
  }
  await assert.rejects(() =>
    restoreDirectories(
      roots,
      true,
      path.join(directory, "journal.json"),
      async (stages) => {
        await fs.writeFile(path.join(stages[0]!, "save"), "replacement");
        await fs.rm(stages[1]!, { recursive: true });
      },
    ),
  );
  for (const root of roots) {
    assert.equal(await fs.readFile(path.join(root, "save"), "utf8"), "original");
  }
});
