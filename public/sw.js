const CACHE_NAME = "nutriscan-v1";
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
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
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

  // Cache-first for shell assets
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
