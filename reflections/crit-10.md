# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was noticing that "add logging" wasn't actually a new kind
of problem — it reopened a decision I thought was already closed. ADR 0002
settled, back in crit 10's first pass, that `session_id` is this app's
entire credential and can never leave the server raw. The moment "who" was
one of the three things this crit's log line has to carry, that same
boundary was back on the table, just in a new place: stdout, a database
table, and now a page that's going to be open on a screen in front of the
whole class during the blind demo. It would have been easy to treat logging
as plumbing — pipe the request through, print whatever's convenient — and
only notice the problem once a demo audience could see a literal session
token scroll past. Catching it before writing the first log line, by asking
"where else does this app already have an answer for this," was the actual
work; the hash itself is two lines of code.

## What did this work change about who I want to be as a software developer?

It made me want to look for a feature's precedent before designing it from
scratch. A clean-slate instinct — "logging is its own thing, figure out
logging's own rules" — would have cost nothing to follow and quietly
reopened a risk the project had already paid down once. I'd rather get in
the habit of asking whether today's feature is actually a rerun of an
earlier decision before inventing a new argument for it, especially for
anything touching identity or privacy, where the second time a mistake
gets made is a lot less forgivable than the first.
