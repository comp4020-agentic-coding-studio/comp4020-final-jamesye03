import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";

// Unread badges (crit 10, PROCESS.md): not the read receipts crit 9
// deliberately skipped — this only ever tells a viewer about their own
// standing access, never broadcasts anything to anyone else. Checks
// src/db.js's markListingRead/unreadCount directly, the same functions
// src/server.js calls from GET /my and GET /listings/:id.
let db: typeof import("../src/db.js");

beforeAll(async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "passingby-")), "test.db");
  db = await import("../src/db.js");
});

function makeListing() {
  return db.createListing({
    origin: "Test Origin",
    destination: "Test Destination",
    item: "Test item",
    nickname: "runner",
    creatorSessionId: "runner-session",
    minutes: 30,
  });
}

it("a runner's unread count sums every requester's thread on their own listing", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });
  db.addMessage({ listingId: id, requesterSessionId: "bob", senderSessionId: "bob", nickname: "Bob", body: "hey" });

  expect(db.unreadCount(id, "runner-session", true)).toBe(2);
});

it("a requester's unread count only ever reflects their own thread", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });
  db.addMessage({
    listingId: id,
    requesterSessionId: "alice",
    senderSessionId: "runner-session",
    nickname: "runner",
    body: "sure, on my way",
  });
  db.addMessage({ listingId: id, requesterSessionId: "bob", senderSessionId: "bob", nickname: "Bob", body: "hey" });

  expect(db.unreadCount(id, "alice", false)).toBe(1); // only the runner's reply, not bob's thread
  expect(db.unreadCount(id, "bob", false)).toBe(0); // bob's own message never counts against himself
});

it("a sender's own messages never count as unread to themselves", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });

  expect(db.unreadCount(id, "alice", false)).toBe(0);
});

it("markListingRead zeroes the count back out, but only up to the moment it was called", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });
  expect(db.unreadCount(id, "runner-session", true)).toBe(1);

  db.markListingRead(id, "runner-session");
  expect(db.unreadCount(id, "runner-session", true)).toBe(0);

  // created_at/last_read_at are both millisecond timestamps; guarantee the
  // next message lands strictly after the read instead of racing the clock.
  const readAt = Date.now();
  while (Date.now() <= readAt) {
    /* spin */
  }
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "still there?" });
  expect(db.unreadCount(id, "runner-session", true)).toBe(1); // only the message after the read
});

it("totalUnreadCount sums unreadCount across every listing a session has standing access to", () => {
  // This file's db is shared across every `it` with no reset in between, and
  // "runner-session" is the fixture id every other test in here already uses
  // as a listing's creator — reusing it would make this sum pick up those
  // other tests' leftover unread messages too. A dedicated id keeps this
  // test's total about only the listings it itself creates.
  const totalsSessionId = "totals-runner-session";
  const ownListing = db.createListing({
    origin: "Totals Origin",
    destination: "Totals Destination",
    item: "Totals item",
    nickname: "runner",
    creatorSessionId: totalsSessionId,
    minutes: 30,
  });
  db.addMessage({ listingId: ownListing, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });
  db.addMessage({ listingId: ownListing, requesterSessionId: "bob", senderSessionId: "bob", nickname: "Bob", body: "hey" });

  const otherListing = db.createListing({
    origin: "Other Origin",
    destination: "Other Destination",
    item: "Other item",
    nickname: "someone-else",
    creatorSessionId: "totals-someone-else-session",
    minutes: 30,
  });
  db.addMessage({
    listingId: otherListing,
    requesterSessionId: totalsSessionId,
    senderSessionId: totalsSessionId,
    nickname: "runner",
    body: "I can help carry this",
  });
  db.addMessage({
    listingId: otherListing,
    requesterSessionId: totalsSessionId,
    senderSessionId: "totals-someone-else-session",
    nickname: "someone-else",
    body: "great, thanks!",
  });

  // 2 unread as the runner on ownListing + 1 unread as the requester on otherListing
  expect(db.totalUnreadCount(totalsSessionId)).toBe(3);
});

// Crit 10's event log (PROCESS.md's crit-10 section): logEvent/eventCounts/
// eventsForSession, the functions src/server.js's recordEvent and GET /stats,
// GET /my call. "Who" is always the short hash — never the raw session id,
// see ADR 0003 — so these tests check the hash, not the id, comes back out.
it("logEvent records a hash of the session id, never the id itself", () => {
  const row = db.logEvent({ type: "listing_posted", sessionId: "events-poster-session" });
  expect(row.sessionHash).toBe(db.sessionHash("events-poster-session"));
  expect(row.sessionHash).not.toContain("events-poster-session");
});

it("eventCounts groups by type, always including every known type", () => {
  const before = db.eventCounts(0);
  db.logEvent({ type: "message_sent", sessionId: "events-counts-session" });
  db.logEvent({ type: "message_sent", sessionId: "events-counts-session-2" });
  db.logEvent({ type: "listing_done", sessionId: "events-counts-session" });

  const after = db.eventCounts(0);
  expect(after.message_sent).toBe(before.message_sent + 2);
  expect(after.listing_done).toBe(before.listing_done + 1);
  expect(after.listing_posted).toBe(before.listing_posted); // untouched type still present, not undefined
});

it("eventsForSession only sums one session's own hash (the creepy mirror's boundary)", () => {
  const mySession = "events-mirror-session";
  const myHash = db.sessionHash(mySession);
  db.logEvent({ type: "listing_viewed", sessionId: mySession });
  db.logEvent({ type: "listing_viewed", sessionId: "events-mirror-someone-else" });

  const mine = db.eventsForSession(myHash);
  expect(mine.listing_viewed).toBe(1);
});
