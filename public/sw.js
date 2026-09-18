const CACHE_NAME = "nutriscan-v3";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/variables.css",
  "/css/base.css",
  "/js/app.js",
  "/js/components/app-root.js",
  "/js/components/login-view.js",
  "/js/components/foods-view.js",
  "/js/components/food-detail.js",
  "/js/components/capture-view.js",
  "/js/components/loading-indicator.js",
  "/js/components/image-editor.js",
  "/js/components/review-view.js",
  "/js/components/success-view.js",
  "/js/components/recurring-food-view.js",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // NEVER cache state-changing requests (POST, PUT, DELETE)
  if (["POST", "PUT", "DELETE"].includes(event.request.method)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Always go to network for API calls
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Prefer fresh application assets, with the cache available for offline use.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          event.request.method === "GET" &&
          url.origin === self.location.origin
        ) {
          const copy = response.clone();
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .then(() => response);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
        throw new Error(`No cached response for ${url.pathname}`);
      }),
  );
});
