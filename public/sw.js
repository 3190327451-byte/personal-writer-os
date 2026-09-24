const CACHE_NAME = "personal-writer-os-v9";
const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1", "::1"].includes(
  self.location.hostname,
);
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/cursors/fountain-pen.png",
  "/cursors/pencil.png",
  "/cursors/dip-pen.png",
  "/cursors/quill.png",
];

self.addEventListener("install", (event) => {
  if (IS_LOCAL_PREVIEW) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const shell = await cache.match("/");
        if (!shell) return;
        const html = await shell.text();
        const buildAssets = Array.from(
          new Set(html.match(/\/assets\/[^\"'<>\s]+/g) ?? []),
        );
        await Promise.allSettled(buildAssets.map((path) => cache.add(path)));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) =>
              IS_LOCAL_PREVIEW
                ? key.startsWith("personal-writer-os-")
                : key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_PREVIEW) return;

  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match("/"));
        }),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && !contentType.includes("text/html")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
