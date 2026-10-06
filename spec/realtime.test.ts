import { expect, inject, it } from "vitest";
import WebSocket from "ws";

// Crit 9's actual contract: "a change one person makes must appear in every
// other open session ... within about a second", with no reload. This hits
// the RUNNING app (spec/global-setup.ts finds it) over both HTTP and the
// `/ws` channel src/server.js serves, the same way two real browser tabs
// would — one posts, the other is already listening.
const baseUrl = inject("baseUrl");

function wsUrl(): URL {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url;
}

it("pushes a new listing to board subscribers in well under a second, no reload", async () => {
  const ws = new WebSocket(wsUrl());
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));

  const marker = `spec-rt-${Date.now()}`;
  const received = new Promise<{ type: string; html: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching new-listing event within 2s")), 2000);
    ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "new-listing" && typeof data.html === "string" && data.html.includes(marker)) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  // Let the subscribe message land before triggering the event it's waiting for.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const startedAt = Date.now();

  const res = await fetch(new URL("/post", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      origin: marker,
      destination: "Spec Destination",
      item: "spec item",
      nickname: "spec-bot",
      minutes: "15",
    }),
  });
  expect(res.ok).toBe(true);

  const event = await received;
  expect(event.type).toBe("new-listing");
  expect(Date.now() - startedAt).toBeLessThan(1000);

  ws.close();
});

// ADR 0001 (private per-requester threads) is enforced by src/db.js's
// `isInvolved`, which both the HTTP route and this WS subscribe handler call
// — spec/threads.test.ts proves that rule directly where it lives, rather
// than re-deriving it here through a slower, more fragile multi-socket dance.
