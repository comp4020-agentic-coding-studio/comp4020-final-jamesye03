import Database from "better-sqlite3";
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

const insertListing = db.prepare(`
  INSERT INTO listings (origin, destination, item, nickname, created_at, expires_at)
  VALUES (@origin, @destination, @item, @nickname, @created_at, @expires_at)
`);

export function createListing({ origin, destination, item, nickname, minutes }) {
  const created_at = Date.now();
  const expires_at = created_at + minutes * 60_000;
  const { lastInsertRowid } = insertListing.run({
    origin,
    destination,
    item,
    nickname,
    created_at,
    expires_at,
  });
  return lastInsertRowid;
}

// CLAUDE.md: expired listings are hidden by this filter, never deleted.
export function activeListings() {
  return db
    .prepare(`SELECT * FROM listings WHERE expires_at > ? ORDER BY created_at DESC`)
    .all(Date.now());
}

export function activeListing(id) {
  return db.prepare(`SELECT * FROM listings WHERE id = ? AND expires_at > ?`).get(id, Date.now());
}
