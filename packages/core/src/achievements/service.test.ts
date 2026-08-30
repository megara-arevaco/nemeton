import assert from "node:assert/strict";
import test from "node:test";

import { parseSteamLibraryAchievements } from "./service.js";

test("parses and deduplicates Steam library achievements", () => {
  const result = parseSteamLibraryAchievements(
    JSON.stringify([
      [
        "achievements",
        {
          version: 2,
          data: {
            vecHighlight: [
              {
                strID: "FIRST",
                strName: "First",
                bAchieved: true,
                rtUnlocked: 1_700_000_000,
                flAchieved: 42.5,
              },
            ],
            vecAchievedHidden: [
              { strID: "FIRST", strName: "First", bAchieved: true, bHidden: true },
            ],
            vecUnachieved: [
              {
                strID: "SECOND",
                strName: "Second",
                strDescription: "Keep going",
                bAchieved: false,
              },
            ],
            nTotal: 2,
            nAchieved: 1,
          },
        },
      ],
    ]),
  );

  assert.equal(result.total, 2);
  assert.equal(result.unlocked, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, "FIRST");
  assert.ok(result.items[0]?.unlockedAt);
});
