// Fuuud service worker: shows reminders pushed by the server, opens the plan on click.
self.addEventListener("push", (event) => {
  let data = { title: "Fuuud", body: "", url: "/calendar" };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { url: data.url }, tag: data.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/calendar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => c.url.includes(url));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
