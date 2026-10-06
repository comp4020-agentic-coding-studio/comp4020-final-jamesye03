# Passing By

A lightweight errand board for BNG. I live here, and more than once I've
wanted someone to grab something on the way back — a friend, ideally, except
the friend I'd actually ask is usually busy or already out. This opens the
same ask up to the whole building: someone heading out posts what they can
bring back and by when, and anyone stuck in their room can see who's
genuinely out right now and get in touch before that window closes.

## Why this needs more than one person and one moment

Picture it: it's 9pm, you're in your room, you want something from Union
Court, and everyone you'd normally text is either out or not answering. Then
someone posts that they're at the food court right now, heading back in
twenty minutes. Miss that post, or reply a minute too late, and the
opportunity isn't delayed — it's just gone. That's not a feature bolted onto
a to-do list; it's the entire mechanic. The board has to update as things
actually happen — postings appearing, expiring, ending — because the value
is in catching someone while they're genuinely passing by.

Multi-user shows up the same way, not as an afterthought: a runner's post is
worthless without a requester to notice it, and a requester's request is
worthless without a runner already committed to a trip. Neither side does
anything alone.

## What's live this week

Posting and browsing, persisted properly — restart the machine and a listing
is still there until it actually expires. A runner names where they are, what
they can carry back, and picks a deadline of up to two hours; anyone can
browse the open board, newest first, and open a listing for the full detail.

Anyone can message a runner about their listing, and the runner replies right
there — each person who messages gets their own private thread with the
runner; nobody sees anyone else's ([ADR 0001](docs/adr/0001-private-threads-per-requester.md)).
A runner can mark their own listing done, which drops it off the public
board but keeps the page working for everyone already talking on it. None of
this needs a reload: a new listing, a new message, or a done mark shows up in
every other open tab within about a second, over a WebSocket connection.

## What's deliberately not here

- **No accounts, no photos, no ID checks.** A nickname is all the identity
  this needs. A real deployment would sit behind an invite link BNG
  residents already pass around — social trust, not a verification system
  nobody asked for. This public demo skips even the invite link, so a
  stranger can try it without anything to sign up for.
- **No ratings.** This is meant to feel like asking a neighbour a favour, not
  gig work with a star rating attached.
- **No tipping on the platform.** That stays between the two people
  involved, off to the side, however they want to handle it.

## Coming next

Crit 10 adds server-side logging of what happened.

## Try it

Post a listing, then come back later: it's still there. Let it pass its
deadline: it disappears on its own.
