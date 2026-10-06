import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// /data is the one thing that survives a restart or redeploy (fly.toml);
// DB_PATH is only overridden for local dev, where there's no volume.
const DB_PATH = process.env.DB_PATH ?? "/data/app.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    item TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);

// Added for crit 9. ALTER .. ADD COLUMN rather than a fresh CREATE so rows
// from the crit-8 deploy survive the upgrade (CLAUDE.md: never delete for a
// schema change any more than for an expiry).
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("listings", "creator_session_id", "creator_session_id TEXT NOT NULL DEFAULT ''");
ensureColumn("listings", "done_at", "done_at INTEGER");
// Optional, free-text "what I'd like to earn" hint — not a payment field,
// see CLAUDE.md's carve-out. Nullable like done_at: existing rows and any
// caller that omits it read back null, never an empty string.
ensureColumn("listings", "fee", "fee TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    requester_session_id TEXT NOT NULL,
    sender_session_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const insertListing = db.prepare(`
  INSERT INTO listings (origin, destination, item, nickname, creator_session_id, fee, created_at, expires_at)
  VALUES (@origin, @destination, @item, @nickname, @creator_session_id, @fee, @created_at, @expires_at)
`);

export function createListing({ origin, destination, item, nickname, minutes, creatorSessionId, fee = "" }) {
  const created_at = Date.now();
  const expires_at = created_at + minutes * 60_000;
  const { lastInsertRowid } = insertListing.run({
    origin,
    destination,
    item,
    nickname,
    creator_session_id: creatorSessionId,
    fee: fee || null,
    created_at,
    expires_at,
  });
  return lastInsertRowid;
}

// CLAUDE.md: expired listings are hidden by this filter, never deleted. Done
// listings are hidden here too (crit 9: done = off the public board), but
// `activeListing` below still finds them, because the people actually
// involved keep access past "done".
export function activeListings() {
  return db
    .prepare(`SELECT * FROM listings WHERE expires_at > ? AND done_at IS NULL ORDER BY created_at DESC`)
    .all(Date.now());
}

export function activeListing(id) {
  return db.prepare(`SELECT * FROM listings WHERE id = ? AND expires_at > ?`).get(id, Date.now());
}

export function markDone(id) {
  db.prepare(`UPDATE listings SET done_at = ? WHERE id = ?`).run(Date.now(), id);
}

const insertMessage = db.prepare(`
  INSERT INTO messages (listing_id, requester_session_id, sender_session_id, nickname, body, created_at)
  VALUES (@listing_id, @requester_session_id, @sender_session_id, @nickname, @body, @created_at)
`);

export function addMessage({ listingId, requesterSessionId, senderSessionId, nickname, body }) {
  const created_at = Date.now();
  insertMessage.run({
    listing_id: listingId,
    requester_session_id: requesterSessionId,
    sender_session_id: senderSessionId,
    nickname,
    body,
    created_at,
  });
  return created_at;
}

// One thread per requester session: everything they and the runner said to
// each other on this listing, in order.
export function messagesForThread(listingId, requesterSessionId) {
  return db
    .prepare(
      `SELECT * FROM messages WHERE listing_id = ? AND requester_session_id = ? ORDER BY created_at ASC`,
    )
    .all(listingId, requesterSessionId);
}

// The runner's view: every thread this listing has, newest activity first.
export function threadsForListing(listingId) {
  const requesterIds = db
    .prepare(
      `SELECT requester_session_id FROM messages WHERE listing_id = ?
       GROUP BY requester_session_id ORDER BY MAX(created_at) DESC`,
    )
    .all(listingId)
    .map((r) => r.requester_session_id);
  return requesterIds.map((requesterSessionId) => ({
    requesterSessionId,
    messages: messagesForThread(listingId, requesterSessionId),
  }));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS listing_reads (
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    viewer_session_id TEXT NOT NULL,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (listing_id, viewer_session_id)
  )
`);

// One row per (listing, viewer), not per thread: a viewer's role is fixed
// per listing — the runner's id is the same across every thread they can
// see on their own listing, and a requester only ever has one thread here.
export function markListingRead(listingId, viewerSessionId) {
  db.prepare(`
    INSERT INTO listing_reads (listing_id, viewer_session_id, last_read_at)
    VALUES (?, ?, ?)
    ON CONFLICT (listing_id, viewer_session_id)
    DO UPDATE SET last_read_at = excluded.last_read_at
  `).run(listingId, viewerSessionId, Date.now());
}

// isRunner decides the scope: a runner's count spans every thread on their
// own listing (same access threadsForListing already grants them); a
// requester's count is pinned to their own thread by requester_session_id,
// which can never match anyone else's — see ADR 0002.
export function unreadCount(listingId, viewerSessionId, isRunner) {
  const lastRead =
    db
      .prepare(`SELECT last_read_at FROM listing_reads WHERE listing_id = ? AND viewer_session_id = ?`)
      .get(listingId, viewerSessionId)?.last_read_at ?? 0;

  return isRunner
    ? db
        .prepare(
          `SELECT COUNT(*) c FROM messages WHERE listing_id = ? AND sender_session_id != ? AND created_at > ?`,
        )
        .get(listingId, viewerSessionId, lastRead).c
    : db
        .prepare(
          `SELECT COUNT(*) c FROM messages
           WHERE listing_id = ? AND requester_session_id = ? AND sender_session_id != ? AND created_at > ?`,
        )
        .get(listingId, viewerSessionId, viewerSessionId, lastRead).c;
}

export function hasThread(listingId, sessionId) {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM messages WHERE listing_id = ? AND requester_session_id = ? LIMIT 1`)
      .get(listingId, sessionId),
  );
}

// ADR 0001: a listing stays reachable, past "done", only for the runner and
// whoever already has a thread on it — nobody else, done or not.
export function isInvolved(listing, sessionId) {
  return listing.creator_session_id === sessionId || hasThread(listing.id, sessionId);
}

// "My chats": everything a session posted or messaged into, while it's still
// within its own window — expired drops out of every query alike, this one
// included, per the same CLAUDE.md rule `activeListings` follows.
export function listingsForSession(sessionId) {
  return db
    .prepare(
      `SELECT * FROM listings
       WHERE expires_at > ?
         AND (creator_session_id = ? OR id IN (
           SELECT DISTINCT listing_id FROM messages WHERE requester_session_id = ?
         ))
       ORDER BY created_at DESC`,
    )
    .all(Date.now(), sessionId, sessionId);
}

// The nav-wide badge: same scoping as the per-listing count, just summed
// across every listing this session has standing access to.
export function totalUnreadCount(sessionId) {
  return listingsForSession(sessionId).reduce(
    (sum, l) => sum + unreadCount(l.id, sessionId, l.creator_session_id === sessionId),
    0,
  );
}

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    session_hash TEXT NOT NULL,
    listing_id INTEGER,
    detail TEXT,
    created_at INTEGER NOT NULL
  )
`);

const EVENT_TYPES = ["listing_posted", "listing_viewed", "message_sent", "listing_done"];

// Short, not the full-length hash `ownerHash` in views.js uses: that one has
// to match a client-recomputed value exactly, this one only has to read as
// "same person, different action" in a log line or on the stats page. See
// ADR 0003 — session_id is this app's whole auth credential (ADR 0002), and
// a log line is a new place that could leak it, now doubly so once it's
// shown live on a page during the crit demo.
export function sessionHash(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
}

const insertEvent = db.prepare(`
  INSERT INTO events (type, session_hash, listing_id, detail, created_at)
  VALUES (@type, @session_hash, @listing_id, @detail, @created_at)
`);

// Logs only the app's actual mutating/standing actions — a listing posted,
// viewed, messaged, or marked done — never a plain page browse. Returns the
// shaped row so the caller (src/server.js) can console.log and broadcast the
// exact same data it just persisted, instead of re-deriving it.
export function logEvent({ type, sessionId, listingId = null, detail = null }) {
  const created_at = Date.now();
  const session_hash = sessionHash(sessionId);
  insertEvent.run({
    type,
    session_hash,
    listing_id: listingId,
    detail: detail ? JSON.stringify(detail) : null,
    created_at,
  });
  return { type, sessionHash: session_hash, listingId, detail, createdAt: created_at };
}

// All four types always present, defaulted to 0, so callers (the stats page)
// never have to guard for a type with no rows yet.
export function eventCounts(sinceMs = 0) {
  const rows = db
    .prepare(`SELECT type, COUNT(*) c FROM events WHERE created_at > ? GROUP BY type`)
    .all(sinceMs);
  const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]));
  for (const r of rows) counts[r.type] = r.c;
  return counts;
}

// Newest first — the "log tail" bar, in page form (src/views.js renderStats).
export function recentEvents(limit = 50) {
  return db.prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT ?`).all(limit);
}

// The creepy mirror: one session's own counts, same shape as eventCounts.
export function eventsForSession(sessionHashValue) {
  const rows = db
    .prepare(`SELECT type, COUNT(*) c FROM events WHERE session_hash = ? GROUP BY type`)
    .all(sessionHashValue);
  const counts = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0]));
  for (const r of rows) counts[r.type] = r.c;
  return counts;
}
