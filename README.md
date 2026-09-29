# Passing By

A lightweight errand board for one dorm building. Someone heading out — to
the shop, the food court, wherever — posts what they can bring back and by
when. Anyone stuck in their room can see who's out right now and get in touch
before that window closes.

## Why this needs more than one person and one moment

The whole premise only exists because two strangers happen to be free at the
same time. A runner's post is only useful for the next hour or two — once
their trip is over, the opportunity is gone whether or not anyone took it.
That's not a feature bolted onto a to-do list; it's the entire mechanic. The
board has to update as things actually happen — postings appearing, expiring,
ending — because the value is in catching someone while they're genuinely
passing by, not in a static list you check once a day.

Multi-user shows up the same way, not as an afterthought: a runner's post is
worthless without a requester to notice it, and a requester's request is
worthless without a runner already committed to a trip. Neither side does
anything alone.

## What's live this week

Posting and browsing, persisted properly — restart the machine and a listing
is still there until it actually expires. A runner names where they are, what
they can carry back, and picks a deadline of up to two hours; anyone can
browse the open board, newest first, and open a listing for the full detail.
There's no chat yet — that's next.

## What's deliberately not here

- **No accounts, no photos, no ID checks.** A nickname is all the identity
  this needs. A real deployment would sit behind an invite link the
  building's residents already pass around — social trust, not a
  verification system nobody asked for. This public demo skips even the
  invite link, so a stranger can try it without anything to sign up for.
- **No ratings.** This is meant to feel like asking a neighbour a favour, not
  gig work with a star rating attached.
- **No tipping on the platform.** That stays between the two people
  involved, off to the side, however they want to handle it.

## Coming next

Crit 9 adds real messaging inside the app — right now a listing is
view-only — plus the rule that a listing a runner marks done disappears from
the public board and stays visible only to the people who were actually
involved. Crit 10 adds server-side logging of what happened.

## Try it

Post a listing, then come back later: it's still there. Let it pass its
deadline: it disappears on its own.
