import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";

// CLAUDE.md: an expired listing is hidden from the app, not deleted from
// storage. This runs against a throwaway database in this process, not the
// deployed app — the deployed one runs in its own container in CI, so
// there's no shared file to reach into from here. A negative `minutes`
// stands in for "posted a while ago and its window has already closed",
// without a real 15-minute wait.
let db: typeof import("../src/db.js");

beforeAll(async () => {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "passingby-")), "test.db");
  db = await import("../src/db.js");
});

it("hides an expired listing from both queries, but keeps its row", () => {
  const id = db.createListing({
    origin: "Test Origin",
    destination: "Test Destination",
    item: "Test item",
    nickname: "tester",
    minutes: -1,
  });

  expect(db.activeListings().some((l: { id: number }) => l.id === id)).toBe(false);
  expect(db.activeListing(id)).toBeUndefined();

  const row = db.db.prepare("SELECT id FROM listings WHERE id = ?").get(id);
  expect(row).toBeDefined();
});

it("keeps an unexpired listing visible in both queries", () => {
  const id = db.createListing({
    origin: "Test Origin",
    destination: "Test Destination",
    item: "Test item",
    nickname: "tester",
    minutes: 30,
  });

  expect(db.activeListings().some((l: { id: number }) => l.id === id)).toBe(true);
  expect(db.activeListing(id)?.id).toBe(id);
});
