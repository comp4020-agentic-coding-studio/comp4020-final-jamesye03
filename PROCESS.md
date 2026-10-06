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
which is making already-open sessions agree with each other. Server-side
logging of what happened is still on the list for a future crit; nothing
here writes a log beyond SQLite's own rows.

## Crit 10 (best guess at the number — correct it if it's wrong): warmth, a brand mark, and a private unread count

Four things landed together this round: a fee hint on a listing (an
intentional, narrow carve-out of the "no payment" rule — see `CLAUDE.md`),
a warmer visual pass (rounded corners, soft shadows, a gradient header),
then a second pass adding a brand mark, an icon-library swap, and a way to
tell your own posts and unread messages apart from everyone else's.

**Icons moved from Lucide to Material Symbols (Rounded).** Lucide needed a
`lucide.createIcons()` call every time new markup landed in the DOM — once
on load, once after a WS-pushed card, once after a WS-pushed done banner —
and the one genuinely easy mistake was placing that first call on the wrong
side of an early-return guard, which would have silently skipped icons on
every page except the board and listing detail. Material Symbols is a font:
the glyph is just text content inside a styled `<span>`, so there's nothing
left to re-run after an insert. Rounded, not Outlined, to match the corner
radius already in use everywhere else.

**A brand mark needed `CLAUDE.md`'s color rule to say so explicitly.** The
rule already named the header as the one place allowed to carry an accent
fill, and said not to extend that without updating the rule first. Putting
a second, larger copy of the mark on the homepage is exactly that kind of
extension, so the rule now names two bounded exceptions instead of one,
each capped in size, neither allowed to grow into a hero band or a banner.

**Telling your own posts apart from everyone else's on the board sounds
simple and isn't**, because of how the board actually works: `new-listing`
events go out as one shared HTML string to every subscriber
(`broadcastBoard` in `src/server.js`), and `session_id` is this app's whole
identity mechanism — the same value that authenticates you as a listing's
runner or a thread's requester (ADR 0001). Putting another viewer's raw
`creator_session_id` into that shared payload would hand every visitor a
value they could paste into their own cookie and be that person. Instead
the server sends a one-way hash of the owner's id, and each browser hashes
its own id locally and compares — written up properly in
[`docs/adr/0002-hashed-owner-marker-on-board.md`](docs/adr/0002-hashed-owner-marker-on-board.md)
since it's a real security decision, not just a styling one.

**Unread badges are not the read receipts this file already rejected.** The
line above ("no read receipts... a stranger could infer something from")
was about a feature that tells the *other person* you've seen their
message — a new thing broadcast to someone else. What got built instead
only tells *you* how many messages you haven't opened yet, inside threads
you already have standing access to: a runner's count spans every thread on
their own listing, a requester's count only ever reflects their own one
thread, and nothing is shown to, or inferable by, anyone else. Different
feature, not a reversal.

**The badge above was wrong on the first pass: a page-load snapshot isn't
"real-time."** `GET /my` computed the count fresh each time, same as the
board's own listings looked real-time but weren't before crit 9 added the
WS push for them. Fixed the same way: a new `"me"` channel, scoped by
`session_id` exactly like the existing `"listing"` channel already is — the
server reads the cookie once at WS-connection time and keys a
`meSubscribers` map off it. A push on this channel only ever reaches
sockets that one session itself opened, carrying counts that session
already had standing access to — no new privacy boundary, just the same one
delivered live instead of waiting for a reload. Two trigger points: a
message landing (`POST /listings/:id/messages`, pushed to whichever party
didn't send it) and a listing being marked read (`GET /listings/:id`, so a
second open tab's badge clears without its own reload). Shows up in two
places: the total next to "My chats" in the nav, visible on every page, and
a card's own count in its top-right corner — originally built as a `/my`-only
thing, until the user asked for it on the board too (see below).

**The corner badge shipped with a real display bug: it showed an empty
circle even at zero.** `.badge-unread-corner`/`.badge-unread-nav` set
`display: flex`/`inline-flex` directly on the class, and a normal author
rule for a property always wins over the browser's own built-in
`[hidden] { display: none }` rule, regardless of selector specificity — so
the `hidden` attribute both badges were toggling never actually did
anything. Fixed by re-declaring `display: none` scoped to `[hidden]` on each
badge class, which out-specifies the plain class rule within the same
(author, normal) cascade tier.

**Per-card badges now render on the board, not just `/my`.** The user's
correction: the same live count should show up on every post on the
homepage too, not only inside "My chats". `listingCardHtml` (shared by the
SSR board render and the `new-listing` WS broadcast) takes an `unread` count
the same way the `/my` card already did; `GET /` computes it per listing
with the same `isInvolved` check the privacy model already uses everywhere
else, so a card you have no standing access to is simply always 0 — nothing
new is exposed, the board just surfaces a count you already had access to
query via `/my`. A freshly-posted listing always has 0 unread (nobody's had
time to message yet), so the one shared broadcast payload `broadcastBoard`
sends to every board subscriber (ADR 0002's constraint) never needed
per-viewer customization to begin with.

## A later correction: the name, the mark, and a link that read as decoration

"Passing By" was named after the moment the README's own argument turns on
— catching someone while they're genuinely passing by — but as a product
name on a nav bar it didn't carry that argument with it; a first-time
visitor had no way to recover the reasoning from the two words alone. The
app is now **DormRunner**, which borrows a word the code already used on
its own terms: `isRunner`, "a runner's post", "mark as done" are all about
the person doing the errand, so naming the product after that role rather
than after the moment of catching them is a smaller leap for a new visitor
to make. Every page title and the nav brand link changed; `PROCESS.md`'s
own history above keeps saying "Passing By" throughout, on purpose — it's
describing decisions as they were made at the time, the same way the
dorm-ID-verification correction earlier in this file stayed rather than got
edited away.

The brand mark's icon changed alongside it, from a plain walking-figure
glyph (`directions_walk`) to Material Symbols Rounded's `delivery_dining` —
a rider on a scooter, closer to what "someone running an errand for you"
actually looks like, and closer to what was asked: a food-delivery rider's
silhouette. "Silhouette" became a small, scoped CSS decision rather than a
new icon system: everywhere else in the app the icon font stays outline-style
(`"FILL" 0`, the existing global rule), but `.brand-mark .material-symbols-rounded`
now overrides `FILL` to `1` just for the two brand-mark copies, so the mark
reads as a solid shape against its accent fill instead of a thin outline.

Last in the same pass: the "back to the board" link on a listing's detail
page was small, plain text, easy to miss against the page's own content —
not a decoration most pages can afford to skip, since it's the one way back
to the board from a page that doesn't otherwise link there. It's now
rendered with the existing `.button-secondary` treatment (the same one
"Mark as done" already uses) plus a size bump past the usual button scale,
so it reads as the deliberate action it is rather than incidental styling.

## Crit 10, actually: what gets logged and where it's watched

The "Crit 10 (best guess at the number — correct it if it's wrong)" label
above was wrong — checking the course site directly made that clear. Crit
10 is the observability week: a structured server-side log line for each
thing a user does, a live way to watch those logs, and a "blind" demo where
classmates click the deployed app while the presenter narrates from the
logs alone. The rebrand, the live unread badges, and the About page above
are real project work, but none of it is what this crit actually asks for.

**Four events are logged, not every request.** `listing_posted`,
`listing_viewed`, `message_sent`, `listing_done` — the app's actual
mutating/standing actions. A plain `GET /`, `/my`, or `/about` is someone
browsing, not doing something; logging those too would bury the four that
matter in noise with no narration value.

**One function, three outputs.** `logEvent` in `src/db.js` writes one row
to a new `events` table and returns a shaped object; `src/server.js`'s
`recordEvent` takes that return value and does the other two things with
the exact same data: a `console.log`'d JSON line (so `flyctl logs` alone
already satisfies the literal "write one structured log line" requirement)
and a push to `/stats` over a new WebSocket channel. One call site per
action, so the three outputs can't drift apart from each other.

**"Who" is a short hash, not the raw `session_id` — see
[`docs/adr/0003-hashed-identifiers-in-logs.md`](docs/adr/0003-hashed-identifiers-in-logs.md).**
Logging "who" did something reopened the exact tradeoff ADR 0002 already
settled for the board: `session_id` is this app's whole credential, and a
log line is a new place it could leak — more so here, since `/stats` is a
page that will be open on a projector in front of the class during the
blind demo. The fix is the same shape as ADR 0002's, not a new one: hash it,
keep enough of the hash to read as "same person, different action," never
send the raw value anywhere but its owner's own browser.

**`/stats` is the live view, not a terminal tail.** Crit 10 explicitly
allows either; a page means the blind demo is just two browser tabs — the
live app a classmate clicks, and this one the presenter narrates from —
instead of a terminal window competing for screen space. It's built on the
WebSocket broadcast machinery crit 9 already added (one more subscriber
set, one more channel), not new real-time plumbing: all-time and
last-hour counts per event type, plus a recent-events feed that updates
live as events happen, both in page form.

**The optional creepy mirror lives on `/my`.** A small box — "What we've
recorded about you" — summing the same `events` table by the viewer's own
session hash. Same privacy boundary the unread badges already draw: only
ever a viewer's own standing data, server-computed, nothing new exposed to
anyone else.
