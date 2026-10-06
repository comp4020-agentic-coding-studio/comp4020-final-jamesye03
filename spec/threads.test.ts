import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";

// ADR 0001: chat is one private thread per requester, not a shared room.
// This checks the access rule that promise rests on (src/db.js:isInvolved),
// the same function src/server.js uses for both the HTTP route and the WS
// subscribe handler.
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

it("lets the runner and done status each stand on their own", () => {
  const id = makeListing();
  const listing = db.activeListing(id)!;

  expect(db.isInvolved(listing, "runner-session")).toBe(true);
  expect(db.isInvolved(listing, "a-stranger")).toBe(false);
});

it("a message creates a thread that only its own requester and the runner can see", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });

  const listing = db.activeListing(id)!;
  expect(db.isInvolved(listing, "alice")).toBe(true);
  expect(db.isInvolved(listing, "bob")).toBe(false); // bob never messaged — not involved

  db.addMessage({ listingId: id, requesterSessionId: "bob", senderSessionId: "bob", nickname: "Bob", body: "hey, still around?" });

  const threads = db.threadsForListing(id);
  expect(threads.map((t: { requesterSessionId: string }) => t.requesterSessionId).sort()).toEqual(["alice", "bob"]);
  // alice's thread never contains bob's message or vice versa
  expect(
    db.messagesForThread(id, "alice").every((m: { requester_session_id: string }) => m.requester_session_id === "alice"),
  ).toBe(true);
  expect(
    db.messagesForThread(id, "bob").every((m: { requester_session_id: string }) => m.requester_session_id === "bob"),
  ).toBe(true);
});

it("done hides a listing from the board but keeps it reachable for the runner and an existing thread", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });
  db.markDone(id);

  expect(db.activeListings().some((l: { id: number }) => l.id === id)).toBe(false); // off the board

  const listing = db.activeListing(id)!; // the row itself is still there, unexpired
  expect(listing.done_at).not.toBeNull();
  expect(db.isInvolved(listing, "runner-session")).toBe(true);
  expect(db.isInvolved(listing, "alice")).toBe(true);
  expect(db.isInvolved(listing, "a-stranger-who-never-messaged")).toBe(false);
});

it("appears in My chats for the runner and anyone who messaged, while unexpired", () => {
  const id = makeListing();
  db.addMessage({ listingId: id, requesterSessionId: "alice", senderSessionId: "alice", nickname: "Alice", body: "hi" });

  expect(db.listingsForSession("runner-session").some((l: { id: number }) => l.id === id)).toBe(true);
  expect(db.listingsForSession("alice").some((l: { id: number }) => l.id === id)).toBe(true);
  expect(db.listingsForSession("a-stranger").some((l: { id: number }) => l.id === id)).toBe(false);
});
