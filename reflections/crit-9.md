# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough wasn't a design decision, it was deciding not to trust that
the privacy feature was actually done just because the test suite said so.
Everything — typecheck, the realtime tests, the thread-privacy tests — was
green. But those tests all run as one process talking to itself; they never
actually proved that two *different* people would see two different things.
So I opened the app in one browser, posted a listing, then opened the same
listing in a separate incognito window instead of a second tab — a same-
browser tab would have shared the same cookie and just been me again, not a
second person. The incognito window got a 404 on a listing that was still
open, for a stranger who hadn't even sent a first message yet. The actual
bug was `isInvolved()` being applied one line too broadly, fixed in
`f166aba`. The breakthrough wasn't finding that one bug — it was noticing
that "all tests pass" and "this works for two real people" aren't the same
claim, and the gap between them is exactly where a privacy bug hides.

## What did this work change about who I want to be as a software developer?

It made me distrust a green test suite as proof that a multi-user feature
actually works for multiple users, especially when every existing test
happens to run from inside one process pretending to be two people. I want
to keep the habit of asking "would this actually survive two separate
browsers, two separate humans" before calling something done — not instead
of tests, but as the thing tests alone don't cover until someone writes a
new one. The fix itself was small; noticing it needed checking by hand, not
assuming automation already covered it, is the part I want to keep doing.
