// ComfyUI sends `Cache-Control: no-store` for .js only (middleware/cache_middleware.py).
// Any other extension is cached by the browser for hours, so after an update a
// fresh .js imports a stale helper and the whole extension fails to load.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

test("web/ holds only .js files", () => {
  const others = readdirSync(new URL("../web/", import.meta.url)).filter((f) => !f.endsWith(".js"));
  assert.deepEqual(others, []);
});
