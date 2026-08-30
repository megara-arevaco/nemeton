import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";

import { SavegameManager } from "./savegames.js";

test("versions, deduplicates and restores manual save files", async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "launcher-next-saves-"),
  );
  try {
    const local = path.join(root, "local");
    const remote = path.join(root, "remote");
    await fs.promises.mkdir(local, { recursive: true });
    await fs.promises.writeFile(path.join(local, "slot1.sav"), "first");
    const manager = new SavegameManager(path.join(root, "config.json"));
    await manager.addPath("game-1", local);

    const first = await manager.backup("game-1", "stable-source", remote);
    const duplicate = await manager.backup("game-1", "stable-source", remote);
    assert.equal(first?.id, duplicate?.id);

    await fs.promises.writeFile(path.join(local, "slot1.sav"), "second");
    await manager.backup("game-1", "stable-source", remote);
    assert.equal((await manager.listVersions(remote, "stable-source")).length, 2);

    await manager.restore("game-1", "stable-source", remote, first!.id);
    assert.equal(
      await fs.promises.readFile(path.join(local, "slot1.sav"), "utf8"),
      "first",
    );
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("detects nested save folders and explains the confidence", async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "launcher-next-detection-"),
  );
  try {
    const roaming = path.join(root, "profile", "AppData", "Roaming");
    const saves = path.join(
      root,
      "profile",
      "Documents",
      "My Games",
      "Example Game",
      "Saves",
    );
    await fs.promises.mkdir(roaming, { recursive: true });
    await fs.promises.mkdir(saves, { recursive: true });
    await fs.promises.writeFile(path.join(saves, "slot1.sav"), "progress");
    const manager = new SavegameManager(path.join(root, "config.json"));

    const suggestions = await manager.suggestPaths("Example Game", roaming);

    assert.equal(suggestions[0]?.path, saves);
    assert.equal(suggestions[0]?.confidence, "high");
    assert.match(suggestions[0]?.reason ?? "", /archivos de partida/);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("enforces retention and rejects a corrupted backup", async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "launcher-next-safety-"),
  );
  try {
    const local = path.join(root, "local");
    const remote = path.join(root, "remote");
    await fs.promises.mkdir(local, { recursive: true });
    const manager = new SavegameManager(path.join(root, "config.json"));
    await manager.addPath("game", local);
    await manager.setPolicy("game", { maxVersions: 2 });
    for (const content of ["one", "two", "three"]) {
      await fs.promises.writeFile(path.join(local, "save.sav"), content);
      await manager.backup("game", "source", remote);
    }
    const versions = await manager.listVersions(remote, "source");
    assert.equal(versions.length, 2);
    const archivePath = path.join(
      remote,
      "launcher-next-saves",
      "source",
      "versions",
      `${versions[0]!.id}.zip`,
    );
    const archive = unzipSync(new Uint8Array(await fs.promises.readFile(archivePath)));
    const manifest = JSON.parse(
      Buffer.from(archive["manifest.json"]!).toString("utf8"),
    ) as { files: Array<{ archivePath: string }> };
    archive[manifest.files[0]!.archivePath] = strToU8("corrupt");
    await fs.promises.writeFile(archivePath, zipSync(archive));
    await assert.rejects(
      () => manager.restore("game", "source", remote, versions[0]!.id),
      /dañada/,
    );
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("detects changes that conflict with another device's latest version", async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "launcher-next-conflict-"),
  );
  try {
    const remote = path.join(root, "remote");
    const firstLocal = path.join(root, "first-local");
    const secondLocal = path.join(root, "second-local");
    await fs.promises.mkdir(firstLocal, { recursive: true });
    await fs.promises.mkdir(secondLocal, { recursive: true });
    await fs.promises.writeFile(path.join(firstLocal, "slot1.sav"), "remote-progress");
    await fs.promises.writeFile(path.join(secondLocal, "slot1.sav"), "local-progress");

    const firstDevice = new SavegameManager(path.join(root, "first-config.json"));
    await firstDevice.addPath("game", firstLocal);
    const remoteVersion = await firstDevice.backup("game", "source", remote);

    const secondDevice = new SavegameManager(path.join(root, "second-config.json"));
    await secondDevice.addPath("game", secondLocal);
    const conflict = await secondDevice.detectExternalConflict(
      "game",
      "source",
      remote,
    );

    assert.equal(conflict?.remoteVersion.id, remoteVersion?.id);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
