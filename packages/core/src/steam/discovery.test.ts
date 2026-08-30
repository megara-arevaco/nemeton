import assert from "node:assert/strict";
import test from "node:test";

import { parseVdf } from "./discovery.js";

test("parses nested Steam VDF data", () => {
  assert.deepEqual(parseVdf('"AppState" { "appid" "620" "name" "Portal 2" }'), {
    AppState: { appid: "620", name: "Portal 2" },
  });
});

test("ignores VDF comments", () => {
  assert.deepEqual(parseVdf('// comment\n"root" { "path" "D:\\\\Steam" }'), {
    root: { path: "D:\\Steam" },
  });
});
