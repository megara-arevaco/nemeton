import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipSync } from "fflate";
import { withArchive } from "./archive.js";

test("rejects excessive expanded ZIP data before opening any entry stream", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nemeton-zip-limit-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "backup.zip");
  await fs.writeFile(filePath, zipSync({ "files/0": new Uint8Array(1024 * 1024) }));
  let opened = false;
  await assert.rejects(
    () =>
      withArchive(filePath, 1024, async () => {
        opened = true;
      }),
    /límites/,
  );
  assert.equal(opened, false);
});
