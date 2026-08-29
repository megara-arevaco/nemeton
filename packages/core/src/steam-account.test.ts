import assert from "node:assert/strict";
import test from "node:test";

import { accountIdToSteamId64 } from "./steam-account.js";

test("converts a Steam account id to SteamID64", () => {
  assert.equal(accountIdToSteamId64("20772248"), "76561197981037976");
  assert.equal(accountIdToSteamId64("invalid"), null);
});
