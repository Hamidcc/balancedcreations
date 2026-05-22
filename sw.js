// sw.js — ClipCraft Service Worker (Push Notifications)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

self.addEventListener("push", e => {
  let data = {};
  try { data = e.data.json(); } catch (_) { data = { title: "New video on ClipCraft", body: "" }; }

  e.waitUntil(
    self.registration.showNotification(data.title || "ClipCraft", {
      body:    data.body    || "A channel you follow uploaded a new video.",
      icon:    data.icon    || "/logo.png",
      badge:   "/logo.png",
      image:   data.image   || undefined,
      data:    { url: data.url || "/index.html" },
      actions: [{ action: "watch", title: "Watch Now" }],
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || "/index.html";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
