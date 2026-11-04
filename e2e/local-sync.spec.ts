import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LibraryStore } from "../packages/core/src/library/store";
import { FolderSyncService } from "../apps/desktop/src/main/folder-sync";
import { SettingsStore } from "../apps/desktop/src/main/settings";
import { AchievementService } from "../apps/desktop/src/main/achievements";
import { SavegameManager } from "../apps/desktop/src/main/savegames";

for (const firstSourceId of ["aaa", "zzz"]) {
  test(`local games installed independently share hours, sessions and save versions (${firstSourceId})`, async () => {
    const directory = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "nemeton-local-sync-"),
    );

    try {
      const sync = path.join(directory, "sync");
      await fs.mkdir(sync);
      const devices = await Promise.all(
        ["a", "b"].map(async (name, index) => {
          const root = path.join(directory, name);
          const store = new LibraryStore(path.join(root, "library.json"));
          const saves = new SavegameManager(path.join(root, "savegames.json"));
          const service = new FolderSyncService(
            store,
            new SettingsStore(path.join(root, "settings.json")),
            new AchievementService(path.join(root, "achievements.json")),
          );
          const snapshot = await store.addLocal({
            title: "Enshrouded",
            executablePath: path.join(root, "enshrouded.exe"),
          });
          const game = snapshot.games[0]!;
          game.sourceId = index === 0 ? firstSourceId : "mmm";
          game.playtimeMinutes = index === 0 ? 125 : 0;
          game.trackedPlaytimeSeconds = game.playtimeMinutes * 60;
          snapshot.sessions =
            index === 0
              ? [
                  {
                    id: "session-a",
                    gameId: game.id,
                    startedAt: "2026-01-01T12:00:00.000Z",
                    endedAt: "2026-01-01T12:05:00.000Z",
                    durationSeconds: 300,
                    origin: "launcher",
                  },
                ]
              : [];
          await fs.writeFile(path.join(root, "library.json"), JSON.stringify(snapshot));
          const savePath = path.join(root, "saves");
          await fs.mkdir(savePath);
          await fs.writeFile(path.join(savePath, "progress.sav"), name);
          await saves.addPath(game.id, savePath);
          await saves.backup(game.id, game.sourceId, sync);
          return { store, saves, service, game, savePath };
        }),
      );
      const [a, b] = devices as [(typeof devices)[number], (typeof devices)[number]];
      await a.service.sync(sync);
      await b.service.sync(sync);
      await a.service.sync(sync);
      await b.service.sync(sync);
      for (const device of devices) {
        const snapshot = await device.store.read();
        expect(snapshot.games).toHaveLength(1);
        const game = snapshot.games[0]!;
        expect(game.id).toBe(device.game.id);
        expect(game.installPath).toBe(device.game.installPath);
        expect(game.sourceId).toBe([firstSourceId, "mmm"].sort()[0]);
        expect(game.playtimeMinutes).toBe(125);
        expect(snapshot.sessions).toHaveLength(1);
        expect(snapshot.sessions[0]?.gameId).toBe(game.id);
        const versions = await device.saves.listVersions(sync, game.sourceId);
        expect(versions).toHaveLength(2);
        for (const version of versions) {
          expect(
            await device.saves.verifyVersion(sync, game.sourceId, version.id),
          ).toBe("verified");
        }
      }
      await b.store.addPlaytime(b.game.id, 600);
      await a.store.addPlaytime(a.game.id, 1200);
      await b.service.sync(sync);
      await a.service.sync(sync);
      await b.service.sync(sync);
      await a.service.sync(sync);
      expect((await a.store.read()).games[0]?.playtimeMinutes).toBe(155);
      expect((await b.store.read()).games[0]?.playtimeMinutes).toBe(155);
      // Installing an imported entry attaches the executable to the same identity.
      const c = new LibraryStore(path.join(directory, "c", "library.json"));
      await c.mergeRemoteManual(await a.store.exportManualHistory());
      const imported = (await c.read()).games[0]!;
      const attached = await c.addLocal({
        title: "enshrouded",
        executablePath: path.join(directory, "c", "game.exe"),
      });
      expect(attached.games).toHaveLength(1);
      expect(attached.games[0]?.sourceId).toBe(imported.sourceId);
      expect(attached.games[0]?.playtimeMinutes).toBe(155);
      expect(attached.games[0]?.installed).toBe(true);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
}
