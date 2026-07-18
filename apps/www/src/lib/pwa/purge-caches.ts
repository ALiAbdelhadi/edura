const KEEP_ON_LOGOUT = new Set([
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-image-assets",
  "static-js-assets",
  "static-style-assets",
  "static-audio-assets",
  "static-video-assets",
  "next-static-js-assets",
  "next-image",
]);

export async function purgeUserScopedCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          !KEEP_ON_LOGOUT.has(name) && !name.startsWith("serwist-precache"),
      )
      .map((name) => caches.delete(name)),
  );
}
