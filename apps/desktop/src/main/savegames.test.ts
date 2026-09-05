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
test("purges a game's configuration and managed backups", async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "launcher-next-purge-saves-"),
  );

  try {
    const local = path.join(root, "local");
    const remote = path.join(root, "remote");
    await fs.promises.mkdir(local, { recursive: true });
    await fs.promises.writeFile(path.join(local, "slot1.sav"), "progress");
    const manager = new SavegameManager(path.join(root, "config.json"));
    await manager.addPath("game-1", local);
    await manager.setPolicy("game-1", { maxVersions: 5 });
    await manager.backup("game-1", "stable-source", remote);

    await manager.purgeGame("game-1", "Example", "stable-source", remote);

    assert.deepEqual(await manager.getPaths("game-1"), []);
    assert.equal((await manager.getPolicy("game-1")).maxVersions, 2);
    assert.equal(
      await fs.promises
        .stat(path.join(remote, "launcher-next-saves", "stable-source"))
        .catch(() => null),
      null,
    );
    assert.equal(
      await fs.promises.readFile(path.join(local, "slot1.sav"), "utf8"),
      "progress",
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

async function safetyFixture(context: {
  after: (callback: () => Promise<void>) => void;
}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nemeton-regression-"));
  context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const local = path.join(root, "local");
  const remote = path.join(root, "remote");
  await fs.promises.mkdir(local);
  const manager = new SavegameManager(path.join(root, "config.json"));
  await manager.addPath("game", local);
  return { root, local, remote, manager };
}

test("preserves distinct filenames that previously collided inside ZIP entries", async (context) => {
  const { local, remote, manager } = await safetyFixture(context);
  await fs.promises.writeFile(path.join(local, "slot 1.sav"), "one");
  await fs.promises.writeFile(path.join(local, "slot_1.sav"), "two");
  const version = await manager.backup("game", "source", remote);
  await manager.setPolicy("game", { exactRestore: true });
  await manager.restore("game", "source", remote, version!.id);
  assert.equal(
    await fs.promises.readFile(path.join(local, "slot 1.sav"), "utf8"),
    "one",
  );
  assert.equal(
    await fs.promises.readFile(path.join(local, "slot_1.sav"), "utf8"),
    "two",
  );
});

test("validates every file before changing current saves during exact restore", async (context) => {
  const { local, remote, manager } = await safetyFixture(context);
  await fs.promises.writeFile(path.join(local, "first.sav"), "old");
  await fs.promises.writeFile(path.join(local, "last.sav"), "old");
  const version = await manager.backup("game", "source", remote);
  const archivePath = path.join(
    remote,
    "launcher-next-saves/source/versions",
    `${version!.id}.zip`,
  );
  const archive = unzipSync(new Uint8Array(await fs.promises.readFile(archivePath)));
  archive["files/1"] = strToU8("bad");
  await fs.promises.writeFile(archivePath, zipSync(archive));
  await fs.promises.writeFile(path.join(local, "first.sav"), "current first");
  await fs.promises.writeFile(path.join(local, "last.sav"), "current last");
  await manager.setPolicy("game", { exactRestore: true });
  await assert.rejects(
    () => manager.restore("game", "source", remote, version!.id),
    /dañada/,
  );
  assert.equal(
    await fs.promises.readFile(path.join(local, "first.sav"), "utf8"),
    "current first",
  );
  assert.equal(
    await fs.promises.readFile(path.join(local, "last.sav"), "utf8"),
    "current last",
  );
});

test("rejects version traversal before opening external files", async (context) => {
  const { root, remote, manager } = await safetyFixture(context);
  const outside = path.join(root, "outside.json");
  await fs.promises.writeFile(outside, '{"pinned":false}');
  for (const id of ["../../outside", "..\\outside", "/outside", "C:\\outside"]) {
    await assert.rejects(() => manager.setPinned(remote, "source", id, true));
    await assert.rejects(() => manager.restore("game", "source", remote, id));
  }
  assert.equal(await fs.promises.readFile(outside, "utf8"), '{"pinned":false}');
});

test("rejects hostile manifest paths without deleting current files", async (context) => {
  const { local, remote, manager } = await safetyFixture(context);
  await fs.promises.writeFile(path.join(local, "save.sav"), "progress");
  const version = await manager.backup("game", "source", remote);
  const manifestPath = path.join(
    remote,
    "launcher-next-saves/source/snapshots",
    `${version!.id}.json`,
  );
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  manifest.files[0].relativePath = "../outside.sav";
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest));
  await manager.setPolicy("game", { exactRestore: true });
  await assert.rejects(
    () => manager.restore("game", "source", remote, version!.id),
    /ruta/,
  );
  assert.equal(
    await fs.promises.readFile(path.join(local, "save.sav"), "utf8"),
    "progress",
  );
});

test("reads ZIP-only backups and preserves the requested version during safety backup", async (context) => {
  const { local, remote, manager } = await safetyFixture(context);
  await manager.setPolicy("game", { maxVersions: 1 });
  await fs.promises.writeFile(path.join(local, "save.sav"), "old");
  const version = await manager.backup("game", "source", remote);
  await fs.promises.unlink(
    path.join(remote, "launcher-next-saves/source/snapshots", `${version!.id}.json`),
  );
  assert.equal((await manager.listVersions(remote, "source"))[0]!.id, version!.id);
  await fs.promises.writeFile(path.join(local, "save.sav"), "new");
  await manager.backup("game", "source", remote, version!.id);
  await manager.restore("game", "source", remote, version!.id);
  assert.equal(await fs.promises.readFile(path.join(local, "save.sav"), "utf8"), "old");
});

test("serializes simultaneous configuration changes", async (context) => {
  const { root, manager } = await safetyFixture(context);
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  await fs.promises.mkdir(a);
  await fs.promises.mkdir(b);
  await Promise.all([
    manager.addPath("game", a),
    manager.addPath("game", b),
    manager.setPolicy("game", { maxVersions: 5 }),
  ]);
  assert.equal((await manager.getPaths("game")).length, 3);
  assert.equal((await manager.getPolicy("game")).maxVersions, 5);
});
