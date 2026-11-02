// TrueCal — app-shell cache so the app installs and starts offline.
const CACHE_NAME = "truecal-shell-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/rules.js",
  "./js/scanner.js",
  "./js/app.js",
  "./js/vendor/zxing-library.min.js",
  "./data/rules.json",
  "./data/candidates.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png",
  "./icons/logo-full.png",
  "./docs/user-guide.html",
  "./docs/TrueCal-Sources-Roadmap.pdf",
  "./docs/guide-img/02-vehicle.png",
  "./docs/guide-img/03-review-card.png",
  "./docs/guide-img/04-sensors.png",
  "./docs/guide-img/05-ruling.png",
  "./docs/guide-img/06-report.png",
];

// Code, markup and rules change often — prefer the network so updates show up, fall back to the cache offline.
const NETWORK_FIRST = /\.(?:html|js|css|json|webmanifest)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // VIN lookups go straight to the network

  if (event.request.mode === "navigate" || NETWORK_FIRST.test(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
