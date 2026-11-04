import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SavegameManager } from "../apps/desktop/src/main/savegames";
import {
  canonicalizeContext,
  describeRoot,
  findSteamUserdata,
  resolvePortable,
  validateDestination,
  type PathContext,
} from "../apps/desktop/src/main/savegames/destinations";
import { rewriteArchiveManifest } from "../apps/desktop/src/main/savegames/archive";

test("portable destinations restore two roots into a fresh second PC, survive reordering and remember custom mappings", async () => {
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-mapping-"),
  );

  try {
    const sync = path.join(directory, "drive");
    const a = new SavegameManager(
      path.join(directory, "pc-a", "nemeton-data", "config.json"),
    );
    const configB = path.join(directory, "pc-b", "nemeton-data", "config.json");
    const b = new SavegameManager(configB);
    const context = (pc: string): PathContext => ({
      platform: "windows",
      anchors: {
        local: path.join(directory, pc, "AppData", "Local"),
        documents: path.join(directory, pc, "Documents"),
      },
    });
    a.setPathContext("game", context("pc-a"));
    b.setPathContext("game", context("pc-b"));
    const aLocal = path.join(context("pc-a").anchors.local!, "Example", "Saved");
    const aDocuments = path.join(context("pc-a").anchors.documents!, "Example");

    for (const root of [aLocal, aDocuments]) {
      await fs.mkdir(root, { recursive: true });
      await a.addPath("game", root);
    }
    await fs.writeFile(path.join(aLocal, "slot.sav"), "appdata progress");
    await fs.writeFile(path.join(aDocuments, "slot.sav"), "documents progress");
    const version = (await a.backup("game", "source", sync))!;
    const plan = await b.getRestorePlan("game", "source", sync, version.id);
    expect(plan).toHaveLength(2);
    expect(plan.every((entry) => entry.destination === null)).toBe(true);
    const bLocal = path.join(context("pc-b").anchors.local!, "Example", "Saved");
    const bDocuments = path.join(context("pc-b").anchors.documents!, "Example");
    expect(plan.map((entry) => entry.suggestion)).toEqual([bLocal, bDocuments]);
    await expect(b.restore("game", "source", sync, version.id)).rejects.toThrow(
      "Configura primero",
    );
    const selections = Object.fromEntries(
      plan.map((entry) => [entry.id, entry.suggestion!]),
    );
    await expect(
      b.bindRestoreDestinations("game", "source", sync, version.id, {
        [plan[0]!.id]: bLocal,
        [plan[1]!.id]: bLocal,
      }),
    ).rejects.toThrow("destino distinto");
    expect(await fs.stat(bLocal).catch(() => null)).toBeNull();
    await b.bindRestoreDestinations("game", "source", sync, version.id, selections);
    await b.restore("game", "source", sync, version.id);
    expect(await fs.readFile(path.join(bLocal, "slot.sav"), "utf8")).toBe(
      "appdata progress",
    );
    expect(await fs.readFile(path.join(bDocuments, "slot.sav"), "utf8")).toBe(
      "documents progress",
    );
    // The index in the local configuration must not decide which save goes where.
    const config = JSON.parse(await fs.readFile(configB, "utf8"));
    config.games.game.reverse();
    await fs.writeFile(configB, JSON.stringify(config));
    const restarted = new SavegameManager(configB);
    expect(
      (await restarted.getRestorePlan("game", "source", sync, version.id)).map(
        (entry) => entry.destination,
      ),
    ).toEqual([bLocal, bDocuments]);
    expect(
      await restarted.currentMatchesLatest("game", version, undefined, sync, "source"),
    ).toBe(true);
    await fs.writeFile(path.join(bLocal, "slot.sav"), "local divergent progress");
    const safety = (await restarted.backup("game", "source", sync, version.id))!;
    expect(safety.id).not.toBe(version.id);
    await restarted.restore("game", "source", sync, version.id);
    expect(await fs.readFile(path.join(bLocal, "slot.sav"), "utf8")).toBe(
      "appdata progress",
    );
    await restarted.restore("game", "source", sync, safety.id);
    expect(await fs.readFile(path.join(bLocal, "slot.sav"), "utf8")).toBe(
      "local divergent progress",
    );
    // Restoring an older copy must leave unrelated configured roots alone, even in exact mode.
    const unrelated = path.join(directory, "pc-b", "other-save");
    await fs.mkdir(unrelated);
    await fs.writeFile(path.join(unrelated, "keep.sav"), "keep");
    await restarted.addPath("game", unrelated);
    await restarted.setPolicy("game", { exactRestore: true });
    await restarted.restore("game", "source", sync, version.id);
    expect(await fs.readFile(path.join(unrelated, "keep.sav"), "utf8")).toBe("keep");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a custom destination needs an explicit association and survives a device restart", async () => {
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-custom-"),
  );

  try {
    const a = new SavegameManager(path.join(directory, "config-a", "savegames.json"));
    const configB = path.join(directory, "config-b", "savegames.json");
    const b = new SavegameManager(configB);
    const source = path.join(directory, "a", "saves");
    const destination = path.join(directory, "b", "different-name");
    const sync = path.join(directory, "drive");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "slot.sav"), "custom progress");
    await a.addPath("game", source);
    const version = (await a.backup("game", "source", sync))!;
    const [entry] = await b.getRestorePlan("game", "source", sync, version.id);
    expect(entry).toMatchObject({ destination: null, suggestion: null });
    await b.bindRestoreDestinations("game", "source", sync, version.id, {
      [entry!.id]: destination,
    });
    const restarted = new SavegameManager(configB);
    await restarted.restore("game", "source", sync, version.id);
    expect(await fs.readFile(path.join(destination, "slot.sav"), "utf8")).toBe(
      "custom progress",
    );
    await restarted.removePath("game", destination);
    expect(
      (await restarted.getRestorePlan("game", "source", sync, version.id))[0]!
        .destination,
    ).toBeNull();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("an incomplete Drive copy cannot create or change a destination", async () => {
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-partial-"),
  );

  try {
    const a = new SavegameManager(path.join(directory, "config-a", "savegames.json"));
    const b = new SavegameManager(path.join(directory, "config-b", "savegames.json"));
    const source = path.join(directory, "source");
    const destination = path.join(directory, "new-destination");
    const sync = path.join(directory, "drive");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "slot.sav"), "progress");
    await a.addPath("game", source);
    const version = (await a.backup("game", "source", sync))!;
    const [entry] = await b.getRestorePlan("game", "source", sync, version.id);
    const archive = path.join(
      sync,
      "launcher-next-saves",
      "source",
      "versions",
      `${version.id}.zip`,
    );
    await fs.truncate(archive, 25);
    await expect(
      b.bindRestoreDestinations("game", "source", sync, version.id, {
        [entry!.id]: destination,
      }),
    ).rejects.toThrow("incompleta o dañada");
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
    expect(await b.getPaths("game")).toEqual([]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("legacy copies with colliding folder names require separate destinations instead of falling back to root order", async () => {
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-legacy-"),
  );

  try {
    const a = new SavegameManager(path.join(directory, "config-a", "savegames.json"));
    const b = new SavegameManager(path.join(directory, "config-b", "savegames.json"));
    const sync = path.join(directory, "drive");
    const roots = [
      path.join(directory, "first", "saves"),
      path.join(directory, "second", "saves"),
    ];

    for (const [index, root] of roots.entries()) {
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(path.join(root, "slot.sav"), `progress-${index}`);
      await a.addPath("game", root);
    }

    const version = (await a.backup("game", "source", sync))!;
    const archive = path.join(
      sync,
      "launcher-next-saves",
      "source",
      "versions",
      `${version.id}.zip`,
    );
    const temporary = `${archive}.legacy`;
    const legacy = await rewriteArchiveManifest(archive, temporary, (value) => {
      const manifest = value as Record<string, unknown>;
      delete manifest.roots;
      return manifest;
    });
    await fs.rename(temporary, archive);
    await fs.writeFile(
      path.join(
        sync,
        "launcher-next-saves",
        "source",
        "snapshots",
        `${version.id}.json`,
      ),
      JSON.stringify(legacy),
    );
    const plan = await b.getRestorePlan("game", "source", sync, version.id);
    expect(plan).toHaveLength(2);
    expect(plan[0]!.id).not.toBe(plan[1]!.id);
    const destinations = [
      path.join(directory, "b-first"),
      path.join(directory, "b-second"),
    ];
    await b.bindRestoreDestinations(
      "game",
      "source",
      sync,
      version.id,
      Object.fromEntries(plan.map((entry, index) => [entry.id, destinations[index]!])),
    );
    await b.restore("game", "source", sync, version.id);
    for (const [index, destination] of destinations.entries()) {
      expect(await fs.readFile(path.join(destination, "slot.sav"), "utf8")).toBe(
        `progress-${index}`,
      );
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("portable roots refuse cross-platform guesses and unsafe paths", async () => {
  const context: PathContext = {
    platform: "windows",
    anchors: { local: path.resolve("fixture", "AppData", "Local") },
  };
  const root = describeRoot(
    path.join(context.anchors.local!, "Example", "Saved"),
    context,
  )!;
  expect(root.label).toBe("<local>/Example/Saved");
  expect(
    resolvePortable(root, { platform: "linux", anchors: context.anchors }),
  ).toBeNull();
  expect(() =>
    resolvePortable(
      { ...root, portable: { ...root.portable!, relative: "../escape" } },
      context,
    ),
  ).toThrow("ruta no válida");
  expect(describeRoot(context.anchors.local!, context)).toBeNull();
  expect(describeRoot(path.resolve("unrelated"), context)).toBeNull();
});

test("destination validation rejects symlink ancestors", async () => {
  test.skip(
    process.platform === "win32",
    "Creating symlinks requires privileges on Windows",
  );
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-links-"),
  );

  try {
    const target = path.join(directory, "target");
    await fs.mkdir(target);
    const link = path.join(directory, "link");
    await fs.symlink(target, link, "dir");
    await expect(validateDestination(path.join(link, "new-save"))).rejects.toThrow(
      "enlace",
    );
    expect(await fs.stat(path.join(target, "new-save")).catch(() => null)).toBeNull();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Steam userdata resolves the local account and refuses several possible accounts", async () => {
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-steam-saves-"),
  );

  try {
    const steamA = path.join(directory, "steam-a");
    const steamB = path.join(directory, "steam-b");
    await fs.mkdir(path.join(steamA, "userdata", "111"), { recursive: true });
    await fs.mkdir(path.join(steamB, "userdata", "222"), { recursive: true });
    const source = (await findSteamUserdata("12345", [steamA]))!;
    const destination = (await findSteamUserdata("12345", [steamB]))!;
    const descriptor = describeRoot(path.join(source, "remote"), {
      platform: "windows",
      anchors: { "steam-userdata": source },
    })!;
    expect(
      resolvePortable(descriptor, {
        platform: "linux",
        anchors: { "steam-userdata": destination },
      }),
    ).toBe(path.join(destination, "remote"));
    await fs.mkdir(path.join(steamB, "userdata", "333"));
    expect(await findSteamUserdata("12345", [steamB])).toBeUndefined();
    expect(await findSteamUserdata("../bad", [steamA])).toBeUndefined();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Proton and OS folder redirections resolve to a canonical base before creating a first save", async () => {
  test.skip(
    process.platform === "win32",
    "Creating symlinks requires privileges on Windows",
  );
  const directory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "nemeton-proton-documents-"),
  );

  try {
    const documents = path.join(directory, "host-documents");
    await fs.mkdir(documents);
    const profile = path.join(directory, "pfx", "drive_c", "users", "steamuser");
    await fs.mkdir(profile, { recursive: true });
    await fs.symlink(documents, path.join(profile, "Documents"), "dir");
    const context = await canonicalizeContext({
      platform: "windows",
      anchors: {
        documents: path.join(profile, "Documents"),
        local: path.join(profile, "AppData", "Local"),
      },
    });
    expect(context.anchors.documents).toBe(documents);
    expect(context.anchors.local).toBe(path.join(profile, "AppData", "Local"));
    const root = {
      id: "portable-test",
      label: "<documents>/Example/Saved",
      portable: {
        platform: "windows" as const,
        anchor: "documents" as const,
        relative: "Example/Saved",
      },
    };
    const destination = resolvePortable(root, context)!;
    expect(destination).toBe(path.join(documents, "Example", "Saved"));
    await expect(validateDestination(destination)).resolves.toBeUndefined();
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
