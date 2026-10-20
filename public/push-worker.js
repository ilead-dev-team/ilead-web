/* Push only: no fetch handler, offline cache, account content or auth tokens. */
const pushUuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const pushDestination = new RegExp(
  `^/(?:notifications|reports/${pushUuid}(?:#comments)?|roundtables/${pushUuid}(?:#issues)?|sessions/${pushUuid}|my-roundtable|issues|people/recovery(?:\\?request=${pushUuid})?|register-roundtable|dashboard(?:\\?stale=1)?|sessions/new\\?date=\\d{4}-\\d{2}-\\d{2})$`,
);
function safePushLink(value) {
  return typeof value === "string" && pushDestination.test(value)
    ? value
    : "/notifications";
}
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const value = event.data?.json();
    if (value && typeof value === "object" && !Array.isArray(value))
      payload = value;
  } catch {}
  // Fixed generic content also protects lock screens and delayed messages after account changes.
  event.waitUntil(
    self.registration.showNotification("iLead update", {
      body: "Open iLead to view your update.",
      icon: "/brand/push-192.png",
      ...(typeof payload.tag === "string" &&
      /^ilead-[0-9a-f-]{36}$/i.test(payload.tag)
        ? { tag: payload.tag }
        : {}),
      data: { link: safePushLink(payload.link) },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    safePushLink(event.notification.data?.link),
    self.location.origin,
  ).href;
  // New controlled navigation re-enters login and role/ownership checks; never mark read here.
  event.waitUntil(self.clients.openWindow(target));
});
self.addEventListener("pushsubscriptionchange", (event) => {
  // No cookies/keys are persisted or silently rebound by the worker. A visit reconciles state.
  if (event.newSubscription)
    event.waitUntil(event.newSubscription.unsubscribe());
});
