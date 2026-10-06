# 0002: The board marks your own listings with a hash of your session id, never the id itself

## Status

Accepted — crit 10.

## Context

The board page pushes live updates over a single shared channel: every
subscriber connected to the `board` WebSocket channel receives the exact
same JSON payload for a `new-listing` event (`broadcastBoard` in
`src/server.js`), and the same shared HTML is also what a normal page load
renders via `renderHome`/`listingCardHtml`. There is no per-subscriber
rendering on this channel today — unlike the `listing` channel, which
already tracks each subscriber's `sessionId` and `isRunner` so it can keep
one requester's thread from reaching another (ADR 0001).

Visually marking "this is a listing you posted" on the board means the
client needs to tell, for each card, whether its `creator_session_id`
matches the viewer's own `session_id`. But `session_id` isn't a cosmetic
label — it's this app's entire identity and access-control mechanism
(`PROCESS.md`'s crit-9 section, ADR 0001): whoever presents a given
`session_id` *is*, as far as the app can tell, the person that id belongs
to. The cookie that carries it is intentionally not `HttpOnly`, because
`app.js` already reads `session_id` client-side to decide which chat
bubbles are "mine" within a thread — but that's always been the viewer
reading *their own* id back, never another person's.

Putting a listing's raw `creator_session_id` into the shared board payload
would change that: every visitor, including total strangers, would receive
every poster's real session id in plain text, just by having the board open.
Copying that value into a `session_id` cookie is enough to *be* that poster
as far as this app can tell — able to see their threads, reply as them, mark
their listing done. A styling feature would have quietly become a session-
hijacking vector.

## Decision

The server never sends a raw session id to anyone but its owner. Instead,
`ownerHash(sessionId)` in `src/views.js` computes a one-way SHA-256 hex
digest of a listing's `creator_session_id`, and `listingCardHtml` embeds
that digest as `data-owner-hash` on the card — the same function already
shared by SSR and the `new-listing` broadcast, so both paths get this for
free with no new state in `src/server.js`.

In the browser, `public/app.js` hashes the viewer's own `session_id` (read
from `<body data-session-id>`, same source `markMine` already uses) with
`crypto.subtle.digest("SHA-256", ...)`, hex-encodes it to match Node's
`createHash("sha256").digest("hex")` output, and compares it against each
card's `data-owner-hash`. A match adds a `.listing-card--mine` class. The
comparison is guarded (`window.crypto?.subtle`) so a non-secure context
(no HTTPS and not `localhost`) just skips the highlight instead of throwing.

A SHA-256 digest of a 122-bit random UUID (`randomUUID()`) cannot practically
be reversed back into the id it came from — this isn't a low-entropy secret
like a password or PIN, so an unsalted hash is adequate here.

## Alternatives considered

**Send the raw `creator_session_id` and compare client-side.** Rejected —
that's the impersonation risk described above. Visual sugar isn't worth
handing out the one value this app treats as a bearer token.

**Track each board subscriber's identity and personalize the broadcast per
connection**, the way `listingSubscribers` already does for the `listing`
channel. Rejected as unneeded complexity for this feature: it would mean
adding session tracking to `boardSubscribers` (currently a bare `Set<ws>`)
and computing a different payload per connection on every broadcast, purely
to avoid sending a value that a one-way hash already makes safe to share
with everyone. The hash gets the same visual outcome without that new state.

## Consequences

One small hashing function on the server, one small async check on the
client, no change to the session cookie itself (still not `HttpOnly`,
unchanged from before this ADR). The board's WebSocket payload is still one
shared broadcast to every subscriber — this ADR keeps that simple shape
rather than adding `boardSubscribers` state, by changing what's inside the
payload instead of who receives it.
