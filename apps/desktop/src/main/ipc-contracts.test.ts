import { isTrustedDocument } from "./ipc/document.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ipcContracts } from "../shared/ipc-contracts.js";

test("rejects hostile IPC identifiers, non-finite limits and unsafe artwork schemes", () => {
  assert.equal(
    ipcContracts["savegames:set-pinned"].safeParse(["game", "../../outside", true])
      .success,
    false,
  );
  assert.equal(
    ipcContracts["savegames:set-policy"].safeParse(["game", { maxSizeMb: NaN }])
      .success,
    false,
  );
  assert.equal(
    ipcContracts["library:add-local"].safeParse([
      { title: "Game", executablePath: "", coverUrl: "javascript:alert(1)" },
    ]).success,
    false,
  );
  assert.equal(ipcContracts["window:close"].safeParse(["unexpected"]).success, false);
  assert.equal(
    ipcContracts["library:add-local"].safeParse([{ title: "Game", executablePath: "" }])
      .success,
    true,
  );
});

test("trusts only the exact application document", () => {
  assert.equal(
    isTrustedDocument("file:///app/index.html#library", "file:///app/index.html"),
    true,
  );
  for (const url of [
    "https://evil.example/",
    "file:///app/other.html",
    "file:///app/index.html?untrusted",
    "file:///app/index.html.evil",
  ]) {
    assert.equal(isTrustedDocument(url, "file:///app/index.html"), false);
  }
});
