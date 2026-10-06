# 0001: Chat is one private thread per requester, not a shared room

## Status

Accepted — crit 9.

## Context

A listing can draw more than one interested person at once: two different
residents might message the same runner about the same trip. Crit 9 adds
real messaging, so this has to be decided now, and it's exactly the kind of
multi-user behaviour the brief asks us to be deliberate about: what do two
people who both reach for the same listing at the same time actually see of
each other?

`README.md` is explicit about what this app is supposed to feel like:
asking a neighbour a favour, not gig work. That's why there are no ratings
("meant to feel like asking a neighbour a favour, not gig work with a star
rating attached") and no accounts beyond a self-chosen nickname. The same
"neighbour favour" framing is a live constraint on chat design, not just on
identity: when you text a friend to ask them to grab you a coffee, you don't
expect that message broadcast to every other friend who might ask them the
same thing. A favour asked privately that becomes a group thread by default
would break that expectation, and would expose details (a room number, "I'm
free to swing by in 5") to strangers who have no reason to see them — the
same exposure instinct that already ruled out ID verification in
`PROCESS.md`'s door-card-photo correction.

## Decision

Each person who messages a runner about a listing gets their own private
thread with that runner. The runner sees every thread on their own listing
(they're the one person who has to reconcile competing requests — "sorry,
already promised the last coffee" — so they need the full picture); a
requester sees only the thread they're part of. There is no view where two
requesters see each other's messages, or even know how many other threads
exist.

This is enforced by one function, `isInvolved(listing, sessionId)` in
`src/db.js`, used by both the HTTP route (`GET /listings/:id`) and the
WebSocket subscribe handler in `src/server.js`. A `message` event is only
pushed to the runner's connections and to the one subscriber whose session
matches that thread — the privacy rule holds on the live channel, not just
on page load, and it can't quietly diverge between the two code paths
because there's only one check.

Identity for this is the same anonymous `session_id` cookie used nowhere
else in the app: no accounts, consistent with `CLAUDE.md`.

## Alternatives considered

**One shared group chat per listing**, visible to the runner and everyone
who's messaged. Rejected because it's the opposite of how the favour this
app models actually works: a requester's message isn't a public comment,
it's a private ask, and a shared room means every requester performs for an
audience of strangers instead of just asking. It also leaks exact demand
("3 people already asked for coffee") to people who have no reason to see
it, and turns a casual ask into something closer to a public queue —
closer to the gig-work feel `README.md` explicitly rejects.

**Public comments directly on the listing**, like a visible comment thread
under a post. Rejected for the same exposure reason, more so: it's visible
to the runner, every requester, and everyone just browsing the board.

## Consequences

A requester can't see whether someone else already asked and got an
answer, so the same question ("can you grab me one too?") may land in the
runner's inbox more than once across separate threads. That cost is placed
entirely on the runner — the person already doing the favour, who has full
visibility across their own listing and can answer each thread
individually — rather than on requesters, who never need to coordinate
with strangers they didn't choose to involve. That's the trade this ADR
makes on purpose: privacy for requesters over message-volume efficiency for
the runner.
