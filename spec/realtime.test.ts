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

it("lets a stranger open an active listing to start a first message", async () => {
  const ws = new WebSocket(wsUrl());
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));

  const marker = `spec-rt-stranger-${Date.now()}`;
  const received = new Promise<{ id: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching new-listing event within 2s")), 2000);
    ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "new-listing" && typeof data.html === "string" && data.html.includes(marker)) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  // This fetch carries no cookie, so the server assigns it a fresh session —
  // standing in for "the person who posted", distinct from the stranger below.
  await fetch(new URL("/post", baseUrl), {
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

  const { id } = await received;
  ws.close();

  // A second, separately-cookied fetch: a stranger who never messaged and
  // isn't the runner. An active (not done) listing must still be reachable
  // to them — otherwise nobody could ever send a listing's first message.
  const res = await fetch(new URL(`/listings/${id}`, baseUrl));
  expect(res.status).toBe(200);
});

// Unread badges (PROCESS.md's crit-10 addendum): pushed live over a new
// "me" channel, scoped by the session cookie the same way "listing" already
// is — so this test, unlike the two above, needs a real cookie on the WS
// handshake itself, not just on the fetches around it.
it("pushes an unread count to the runner's own session when a stranger messages them, no reload", async () => {
  // A plain GET first, same as a real browser's first page load, so the
  // identity middleware's Set-Cookie isn't competing with /post's own
  // nickname Set-Cookie on the same response.
  const homeRes = await fetch(new URL("/", baseUrl));
  const runnerCookie = homeRes.headers.get("set-cookie")?.split(";")[0];
  expect(runnerCookie).toBeTruthy();

  const ws = new WebSocket(wsUrl(), { headers: { cookie: runnerCookie! } });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "subscribe", channel: "me" }));
  ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));

  const marker = `spec-rt-unread-${Date.now()}`;
  const newListing = new Promise<{ id: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching new-listing event within 2s")), 2000);
    ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "new-listing" && typeof data.html === "string" && data.html.includes(marker)) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  await fetch(new URL("/post", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: runnerCookie! },
    body: new URLSearchParams({
      origin: marker,
      destination: "Spec Destination",
      item: "spec item",
      nickname: "spec-bot",
      minutes: "15",
    }),
  });

  const { id: listingId } = await newListing;

  const received = new Promise<{ listingId: number; count: number; total: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no unread event within 2s")), 2000);
    ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "unread") {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  const startedAt = Date.now();

  // A stranger (no cookie reused — a fresh session) messages the runner.
  await fetch(new URL(`/listings/${listingId}/messages`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nickname: "spec-stranger", body: "is this still available?" }),
  });

  const event = await received;
  expect(event.listingId).toBe(listingId);
  expect(event.count).toBe(1);
  expect(event.total).toBeGreaterThanOrEqual(1);
  expect(Date.now() - startedAt).toBeLessThan(1000);

  ws.close();
});

// The unread badge was extended from /my-only to every board card too (same
// correction session as the live-push work above), gated by the same
// isInvolved() rule the privacy model already uses elsewhere: a card's
// server-rendered badge should only ever carry a nonzero count for the
// viewer who's actually involved in that listing, never for anyone else
// looking at the same board.
it("renders a board card's unread badge only for the viewer actually involved in it", async () => {
  const homeRes = await fetch(new URL("/", baseUrl));
  const runnerCookie = homeRes.headers.get("set-cookie")?.split(";")[0];
  expect(runnerCookie).toBeTruthy();

  const ws = new WebSocket(wsUrl());
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));

  const marker = `spec-rt-board-badge-${Date.now()}`;
  const newListing = new Promise<{ id: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching new-listing event within 2s")), 2000);
    ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === "new-listing" && typeof data.html === "string" && data.html.includes(marker)) {
        clearTimeout(timer);
        resolve(data);
      }
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  await fetch(new URL("/post", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: runnerCookie! },
    body: new URLSearchParams({
      origin: marker,
      destination: "Spec Destination",
      item: "spec item",
      nickname: "spec-bot",
      minutes: "15",
    }),
  });

  const { id: listingId } = await newListing;
  ws.close();

  await fetch(new URL(`/listings/${listingId}/messages`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nickname: "spec-stranger", body: "is this still available?" }),
  });

  const runnerBoardHtml = await (await fetch(new URL("/", baseUrl), { headers: { cookie: runnerCookie! } })).text();
  const runnerCard = runnerBoardHtml.slice(runnerBoardHtml.indexOf(`data-id="${listingId}"`));
  expect(runnerCard).toMatch(/<span class="badge-unread-corner">1<\/span>/);

  // A different, uninvolved viewer sees the same card with no badge at all.
  const strangerBoardHtml = await (await fetch(new URL("/", baseUrl))).text();
  const strangerCard = strangerBoardHtml.slice(strangerBoardHtml.indexOf(`data-id="${listingId}"`));
  expect(strangerCard).toMatch(/<span class="badge-unread-corner" hidden><\/span>/);
});
