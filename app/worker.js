// Parsing worker: inflating and decoding a 25 MB save is a second or two of solid CPU, which on the main
// thread is a tab that cannot paint. Only the finished summary (and the 64x64 thumbnail) cross back.
import { read } from "./container.js";
import { summarize } from "./tw1.js";

const ROOT = new URL("../", import.meta.url);
let dbPromise = null;
const loadDb = () => (dbPromise ??= Promise.all(["items", "baseitems", "spells", "marketcat"].map(async (n) => [n, await (await fetch(new URL(`db_tw1/${n}.json`, ROOT))).json()])).then(Object.fromEntries));

self.addEventListener("message", async ({ data }) => {
  const { id, buf } = data;
  try {
    const save = await read(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const summary = summarize(save, await loadDb());
    self.postMessage({ id, ok: true, result: { summary, thumb: save.thumb } });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
});
