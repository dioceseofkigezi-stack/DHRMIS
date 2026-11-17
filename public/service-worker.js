const CACHE_NAME = "dhrmis-static-v3";
const SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/favicon-192x192.png",
  "/favicon-512x512.png",
];

async function precacheEntryAssets(cache) {
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;

  const html = await response.text();
  const assetPaths = new Set();
  const assetPattern = /(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g;
  for (const match of html.matchAll(assetPattern)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
      assetPaths.add(url.href);
    }
  }

  await Promise.allSettled([...assetPaths].map((assetUrl) => cache.add(assetUrl)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES);
    await precacheEntryAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("dhrmis-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/storage/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone())));
      }
      return response;
    }).catch(() => caches.match("/")));
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/favicon") || url.pathname === "/apple-touch-icon.png") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
      }
      return response;
    })));
  }
});
