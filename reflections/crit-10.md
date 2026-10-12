# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The first version of the unread badge was technically correct and I almost
accepted it as done: `GET /my` counted a session's unread messages fresh on
every page load, the number was always right, nothing was broken. The
breakthrough was refusing to accept that as "real-time" just because the
number itself was accurate — the rest of the app had already set a higher
bar than that. A new listing, a new message, a done mark: none of those wait
for a reload, because crit 9 built the WebSocket push specifically so an
already-open session agrees with reality without being told to refresh. A
badge that only updates when you happen to reload the page is the exact
thing that bar was supposed to rule out, even though it would have passed
any test that just checked the count was correct at the moment it rendered.
Saying so out loud is what turned it into the actual crit 10 work: a new
`"me"` WebSocket channel, scoped by session the same way `"listing"` already
is, so the badge updates the same way everything else in the app already
does.

## What did this work change about who I want to be as a software developer?

It made me define "done" by the standard the project already set for itself
in an earlier crit, not by whatever the current feature's own acceptance
criteria happened to say. A correct-but-static number is an easy thing to
ship and call finished, especially late in a session, and nothing about it
looks broken from the outside. I want to keep comparing a new feature
against the best thing already in the app, not against the lowest bar that
feature could clear on its own — that's a more honest test of "good" than
whatever the feature's own spec says is good enough.
