// ComfyUI sends `Cache-Control: no-store` for .js only (middleware/cache_middleware.py).
// Any other script extension is cached by the browser for hours, so after an update a
// fresh .js imports a stale helper and the whole extension fails to load.
// Non-script files (the clone's icons, its licence) are fine.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

test("every script under web/ is a .js file", () => {
  const files = readdirSync(new URL("../web/", import.meta.url), { recursive: true });
  const others = files.filter((f) => /\.(mjs|cjs|ts|mts)$/.test(f));
  assert.deepEqual(others, []);
});
