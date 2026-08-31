import assert from "node:assert/strict";
import test from "node:test";
import { parseEmulatorIniAchievements, parseGoldbergAchievements } from "./service.js";
test("combines a Goldberg/GSE runtime save with its local schema", () => {
  const result = parseGoldbergAchievements(
    JSON.stringify({
      FIRST_WIN: { earned: true, earned_time: 1_700_000_000 },
      COLLECT_ALL: { earned: false, earned_time: 0 },
    }),
    JSON.stringify([
      {
        name: "FIRST_WIN",
        displayName: "Primera victoria",
        description: "Gana una partida",
        hidden: false,
      },
      {
        name: "COLLECT_ALL",
        displayName: "Coleccionista",
        description: "Encuéntralo todo",
        hidden: true,
      },
    ]),
  );

  assert.equal(result.total, 2);
  assert.equal(result.unlocked, 1);
  assert.equal(result.items[0]?.name, "Primera victoria");
  assert.equal(result.items[0]?.unlockedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(result.items[1]?.hidden, true);
});
test("parses common INI achievement sections", () => {
  const result = parseEmulatorIniAchievements(
    "[FIRST_WIN]\nAchieved=1\nUnlockTime=1700000000\n\n[COLLECT_ALL]\nHaveAchieved=false",
    JSON.stringify([
      { name: "FIRST_WIN", displayName: "Primera victoria" },
      { name: "COLLECT_ALL", displayName: "Coleccionista" },
    ]),
  );

  assert.equal(result.total, 2);
  assert.equal(result.unlocked, 1);
  assert.equal(result.items[0]?.name, "Primera victoria");
});
