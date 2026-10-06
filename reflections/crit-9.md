# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realising the multi-user decision this crit asks for
wasn't a technical question first — it was a question about what kind of
app this is supposed to feel like. Once two people could message the same
runner, the obvious default was a shared thread everyone sees. But
`README.md` already says this is meant to feel like asking a neighbour a
favour, not gig work, and a shared thread fails that test immediately: you'd
never expect your text to a friend broadcast to every other friend who might
ask them the same thing. Seeing that the "good" I'd already written down for
this app in crit 7 was enough, on its own, to pick between the two designs —
without needing a new argument invented for the occasion — is what made
private-per-requester threads feel like the right call rather than just a
defensible one. That's also what let me accept the tradeoff it creates
(a requester can't see that someone already asked the same thing) instead of
quietly designing it away.

## What did this work change about who I want to be as a software developer?

It made me more comfortable keeping a decision's cost visible instead of
hiding it. It would have been easy to add a small feature to soften the
duplicate-question problem and call the ADR "solved," but that cost is the
actual price of the privacy the app is supposed to have, and I'd rather be
able to say exactly what it costs and why it's worth it than pretend the
tradeoff isn't there. I want to keep writing decisions down while I can
still argue both sides, not after I've already committed and started
rationalising.
