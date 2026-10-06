# Process overview

## From brief to concept

The brief's two hard requirements — genuinely multi-user, genuinely
real-time, not decorated with them — ruled out most of the first ideas we
tried. A shared to-do list or a study-room finder can be built single-user
and retrofitted with "sharing" later; that's the median answer the brief
warns against. Passing By came out of a real annoyance before it came out of
the brief: living in BNG, wanting someone to grab something on their way
back, and the one friend free enough to ask being the exception rather than
the rule. Opening that same ask up to the whole building is what makes it
work as a brief response too — it can't function without a second,
differently-motivated person acting inside a closing window: a runner's post
is only worth anything while their trip is still happening, and only if
someone else notices in time to act on it.

## A correction worth recording

The first version of the identity design asked residents to upload a photo
of their dorm's door-access card plus a selfie, to verify they actually
lived in the building. I already had a quiet doubt about that before I said
it out loud — handling real ID photos felt like more than this app should
take on — but I proposed it anyway without raising the doubt first. Talking
it through with the agent, and hearing the case laid out concretely (this
repo goes public; there's no real verification pipeline behind the upload,
so it wouldn't actually catch anyone; real ID and face photos sitting in a
student project is a lot of exposure for what the feature buys) turned that
vague doubt into an actual decision. We replaced it with an invite link plus
a self-chosen nickname: social trust instead of a verification system nobody
asked for. `CLAUDE.md` now fixes that decision as a standing rule
([`dd4084a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/dd4084a)).

## Stack, chosen on purpose

Crit 7's stack was Astro with a Node adapter. We didn't carry it forward:
crit 9 needs a long-lived WebSocket connection for in-app chat, and Astro's
static-first rendering model fights that more than it helps. Plain Express
plus `better-sqlite3`, server-rendered HTML with no client framework, keeps
the whole app inside the 256 MB/one-machine envelope and gives crit 9's chat
a normal place to attach a `ws` server next week.

## Page design, agreed before building (crit 8)

Before writing any app code we fixed: three separate pages (board, post
form, listing detail) reached by full navigations rather than a modal; the
board sorted newest-first; a runner-set deadline capped at two hours; a
naturally-expired listing disappearing from the board entirely rather than
being marked closed; and a restrained orange accent rather than a themed
UI. The scaffold in
[`d4168b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/d4168b1)
builds exactly that, plus the expiry contract as a spec test in
[`cc4eb26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/cc4eb26).

## Crit 9: identity, chat, and what "real-time" means here

Chat needs some notion of "who's asking", without accounts. We added one
opaque `session_id` cookie, set on first visit and never tied to anything a
person types in — it's a second cookie next to the existing cosmetic
`nickname` one, and it's the only thing that makes "this thread belongs to
this browser" meaningful. That single id is also what decides who can see a
thread: `isInvolved(listing, sessionId)` in `src/db.js` is the one place
that rule is written, and both the page route and the WebSocket subscribe
handler call it, so the privacy guarantee can't quietly diverge between the
two
([`72cf8fd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/72cf8fd)).

That privacy shape — one private thread per requester, the runner sees all
of theirs — is this week's required multi-user decision, written up as
[`docs/adr/0001-private-threads-per-requester.md`](docs/adr/0001-private-threads-per-requester.md)
([`c14a352`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/c14a352)).
It's grounded in README's own definition of "good" — this is meant to feel
like asking a neighbour a favour, not gig work — which is also why a shared
group chat per listing was the live alternative we rejected: it would make
every requester's ask visible to every other stranger who asked the same
runner, which is a worse fit for what the app is supposed to feel like, not
just a different implementation of the same thing.

"Real-time" here means something narrower than "always pushing": a
countdown ticking down is just time passing, and the client already knows a
listing's deadline, so it counts down locally with no server round-trip.
What actually needs a push is *someone else's action* landing in a session
that's already open — a new listing appearing on the board, a message
arriving in a thread, a listing flipping to done — because those are the
moments the brief's "within about a second, no reload" requirement is
actually about. We picked WebSocket over SSE or polling because it's
bidirectional on the same connection the client already needs for nothing
else, it attaches to the same HTTP server Express already runs (one Fly
machine, one process), and crit 8's stack choice was already made with this
in mind. Every user-initiated change, though, still goes through a plain
HTML `<form method="post">` with a full-page redirect — the actor driving
the form gets their new state the normal way; WebSocket only pushes to the
*other* sessions that are already sitting on the page. That split meant we
never had to intercept a form submit with JavaScript, and the HTML pushed
over the socket is rendered by the exact same `views.js` functions the
server uses for a normal page load, so there's one template for a listing
card or a chat message, not two that could drift apart.

"My chats" (`/my`) was the one page added that the spec didn't name
directly: once messaging exists, a resident needs somewhere to find a
thread again without re-finding the original listing on the board — doubly
so once a listing is done and has dropped off the board entirely. It's
intentionally thin: a list of listings you posted or messaged on, nothing
graphical.

## Deliberately not this week

No read receipts, no typing indicators, no "N people are looking at this"
counts — none of that is needed to prove the real-time requirement, and
each one is a new thing a session would have to broadcast and a stranger
could infer something from. No way for a requester to see that someone else
already asked (that's the cost ADR 0001 accepts on purpose, not an
oversight). No notifications when the app isn't open in a tab — that's a
service-worker-and-permissions problem on top of what crit 9 asks for,
which is making already-open sessions agree with each other. Crit 10 adds
server-side logging of what happened; nothing here writes a log beyond
SQLite's own rows.
