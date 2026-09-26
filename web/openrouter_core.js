// Pure picker logic for MyCustom_OpenRouter (openrouter.py); the DOM half is openrouter.js.
// Models come from /retodded/openrouter/models: {id, name, input_modalities,
// prompt_price, completion_price, created, context_length}; prices are dollars
// per 1M tokens, null when OpenRouter says the price varies.

export const TABS = ["TEXT2TEXT", "IMAGE2TEXT", "AUDIO2TEXT", "VIDEO2TEXT"];
const TAB_INPUT = { TEXT2TEXT: null, IMAGE2TEXT: "image", AUDIO2TEXT: "audio", VIDEO2TEXT: "video" };

// dir 1 = low to high / A to Z, -1 = high to low / newest first.
const SORT_KEYS = {
  name: { label: "name", key: (m) => m.name.toLowerCase(), dir: 1 },
  input: { label: "input cost", key: (m) => m.prompt_price, dir: 1 },
  output: { label: "output cost", key: (m) => m.completion_price, dir: 1 },
  released: { label: "released", key: (m) => m.created, dir: -1 },
  context: { label: "context", key: (m) => m.context_length, dir: -1 },
};
export const SORTS = Object.entries(SORT_KEYS).map(([value, s]) => ({ value, label: s.label }));

export const DEFAULT_STATE = { tab: "IMAGE2TEXT", sort: "name", reverse: false };

export function readState(stored) {
  return {
    tab: TABS.includes(stored?.tab) ? stored.tab : DEFAULT_STATE.tab,
    sort: stored?.sort in SORT_KEYS ? stored.sort : DEFAULT_STATE.sort,
    reverse: stored?.reverse === true,
  };
}

// Missing values always go last, whatever the direction.
function compare(a, b, sign) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (typeof a === "string" ? a.localeCompare(b) : a < b ? -1 : 1) * sign;
}

export function visibleModels(models, { tab, search, sort, reverse }, favorites) {
  const input = TAB_INPUT[tab];
  const query = (search ?? "").trim().toLowerCase();
  const { key, dir } = SORT_KEYS[sort] ?? SORT_KEYS.name;
  const sign = reverse ? -dir : dir;
  const fav = new Set(favorites);
  return models
    .filter((m) => !input || m.input_modalities.includes(input))
    .filter((m) => !query || m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    .sort((a, b) => fav.has(b.id) - fav.has(a.id) || compare(key(a), key(b), sign) || a.id.localeCompare(b.id));
}

export function toggleFavorite(favorites, id) {
  return favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
}

export function formatPrice(p) {
  if (p == null) return "varies";
  if (p === 0) return "free";
  // At least two decimals so the column lines up; up to four when the price needs them.
  if (p < 0.01) return String(Number(p.toPrecision(2)));
  return p.toFixed(4).replace(/0{1,2}$/, "");
}

export function formatContext(n) {
  if (n == null) return "—";
  if (n >= 1e6) return `${Number((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export function formatDate(created) {
  return created == null ? "—" : new Date(created * 1000).toISOString().slice(0, 10);
}
