# 0003: Structured logs and the stats page identify a session by a short hash, never the raw id

## Status

Accepted — crit 10.

## Context

Crit 10 calls for a structured log line, written server-side, for each
meaningful thing a user does — "who, what, when" — plus a live way to watch
those logs. `src/server.js` now logs four events (`listing_posted`,
`listing_viewed`, `message_sent`, `listing_done`) through one `logEvent`
call in `src/db.js`, which does three things with the same data: writes a
JSON line to stdout (picked up by Fly's log collector, readable via
`flyctl logs`), inserts a row into a new `events` table, and pushes it live
to a new `/stats` page over a WebSocket channel.

ADR 0002 already established that `session_id` is this app's entire
identity and access-control credential — whoever presents it *is*, as far
as the app can tell, the person it belongs to. A log line that includes
"who" is a second, new place that same value could end up. It's actually a
higher-exposure surface than the board marker ADR 0002 covers: stdout logs
persist in Fly's log history and are reachable by anyone with deploy
access, and `/stats` is a page that will be open and on-screen in front of
the whole class during the crit's "blind" demo format.

## Decision

`sessionHash(sessionId)` in `src/db.js` computes `SHA-256(session_id)` and
keeps only the first 8 hex characters. Every event the app logs — the
stdout line, the `events` table row, and the `/stats` broadcast — carries
this short hash, never the raw `session_id`. It's deliberately shorter than
`ownerHash` in `src/views.js` (ADR 0002's full-length digest): that one has
to match a value the browser recomputes and compares byte-for-byte, where
this one only has to read, to a human watching the stats feed, as "same
person, two different actions" — eight hex characters is already enough for
that at this app's traffic.

## Alternatives considered

**Log the raw `session_id`.** Rejected for the same reason ADR 0002
rejected it on the board: it would print this app's entire bearer-token
credential into a place with a wider audience than the owning session
itself — stdout/`flyctl logs`, and now a page shown to a room full of
classmates during the demo.

**Log nothing that identifies the actor at all.** Rejected — it would
satisfy the letter of "write a log line" while losing the "who" the brief
explicitly asks for, and would make the blind demo's own premise (narrating
"this person did X, then Y" from the logs) impossible.

## Consequences

The hash can't be reversed back into a real `session_id` without already
having it (same one-way argument ADR 0002 makes). Two different real
people could in principle collide on the same 8 hex characters, which is
accepted here as low-stakes: nothing privileged is ever decided by a hash
match in logs or on `/stats` — it's narration, not access control.
