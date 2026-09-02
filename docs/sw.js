/* オフライン用 Service Worker：一度開けば以後はネット無しでも起動する */
const CACHE = "trip-v1";

const SHELL = [
  "./",
  "./index.html",
  "./卒業旅行の栞.dc.html",
  "./support.js",
  "./supabase-config.js",
  "./map.html",
  "./uk-map.html",
  "./_ds/organic-47948af4-c1b6-4758-9bfd-5377968de67e/styles.css",
  "./_ds/organic-47948af4-c1b6-4758-9bfd-5377968de67e/_ds_bundle.js",
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js",
  "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&display=swap"
].concat(
  ["bg-lake"].concat(Array.from({ length: 14 }, (_, i) => "bg-" + (i + 1)))
    .map(n => "./" + n + ".png")
);

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 1件失敗しても install 全体を落とさない。
    // 外部CDNは CORS で取る（opaque だと SRI 検証に通らず React が読めない）。
    // add は 200 以外を拒否するので put を使う
    await Promise.all(SHELL.map(async u => {
      const cross = /^https?:\/\//.test(u) && new URL(u).origin !== self.location.origin;
      let res = await fetch(u, cross ? { mode: "cors", credentials: "omit" } : { cache: "reload" }).catch(() => null);
      if (cross && (!res || !res.ok)) res = await fetch(u, { mode: "no-cors" }).catch(() => null);
      if (res && (res.ok || res.type === "opaque")) await c.put(u, res).catch(() => {});
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isData = url =>
  /supabase\.co$/.test(url.hostname) || /\/(rest|auth|functions|realtime)\/v1\//.test(url.pathname);

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isData(url)) return; // データ通信はキャッシュしない

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ?v=... 付きの古いURLでも本体に当たるよう検索文字列は無視
    const hit = await cache.match(req, { ignoreSearch: true });
    // SRI 付き / CORS 要求のリクエストに opaque な保存分を返すと読み込みが失敗する
    const unusable = hit && hit.type === "opaque" && (req.integrity || req.mode === "cors");
    if (unusable) {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) { cache.put(req, fresh.clone()); return fresh; }
      } catch (e) {}
      return hit;
    }
    if (hit) {
      fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") {
        const page = await cache.match("./卒業旅行の栞.dc.html", { ignoreSearch: true });
        if (page) return page;
      }
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
