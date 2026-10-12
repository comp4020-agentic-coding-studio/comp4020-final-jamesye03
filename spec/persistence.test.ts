import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// better-sqlite3 ships no types; src/db.js (allowJs, checkJs: false) is
// never type-checked so it never hits this, but this spec file is — same
// tradeoff tsconfig.json already documents for the rest of spec/.
// @ts-expect-error no declaration file for better-sqlite3
import Database from "better-sqlite3";
import { expect, it } from "vitest";

// README's actual claim: "restart the machine and a listing is still there."
// Every other spec file that touches the DB reads back what it wrote within
// the same open connection, in the same process — that proves the query
// logic works, not that the data survives a restart. This test is the one
// that does: it writes through src/db.js, closes that connection, then opens
// a second, independent connection to the same file (the same thing a fresh
// `node src/server.js` process does against the Fly volume) and reads the
// row back cold.
it("keeps a listing on disk after its connection closes and the file is reopened cold", async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "passingby-")), "test.db");
  process.env.DB_PATH = dbPath;
  const db = await import("../src/db.js");

  const id = db.createListing({
    origin: "Test Origin",
    destination: "Test Destination",
    item: "Test item",
    nickname: "tester",
    creatorSessionId: "tester-session",
    minutes: 30,
  });

  db.db.close();

  const reopened = new Database(dbPath);
  const row = reopened.prepare("SELECT id, item, creator_session_id FROM listings WHERE id = ?").get(id);
  reopened.close();

  expect(row).toEqual({ id, item: "Test item", creator_session_id: "tester-session" });
});
