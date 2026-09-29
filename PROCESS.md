# Process overview

## From brief to concept

The brief's two hard requirements — genuinely multi-user, genuinely
real-time, not decorated with them — ruled out most of the first ideas we
tried. A shared to-do list or a study-room finder can be built single-user
and retrofitted with "sharing" later; that's the median answer the brief
warns against. Passing By came out of asking what already can't work
without a second, differently-motivated person acting inside a closing
window: a runner's post is only worth anything while their trip is still
happening, and only if someone else notices in time to act on it.

## A correction worth recording

The first version of the identity design asked residents to upload a photo
of their dorm's door-access card plus a selfie, to verify they actually
lived in the building. I pushed back on that in the same conversation: this
repo goes public, there's no real verification pipeline behind the upload
(so it wouldn't actually catch anyone), and the privacy exposure — real
photos of ID and faces, sitting in a student project — was out of proportion
to what the feature bought. We replaced it with an invite link plus a
self-chosen nickname: social trust instead of a verification system nobody
asked for. `CLAUDE.md` now fixes that decision as a standing rule
([`dd4084a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/dd4084a)).

## Stack, chosen on purpose

Crit 7's stack was Astro with a Node adapter. We didn't carry it forward:
crit 9 needs a long-lived WebSocket connection for in-app chat, and Astro's
static-first rendering model fights that more than it helps. Plain Express
plus `better-sqlite3`, server-rendered HTML with no client framework, keeps
the whole app inside the 256 MB/one-machine envelope and gives crit 9's chat
a normal place to attach a `ws` server next week.

## Page design, agreed before building

Before writing any app code we fixed: three separate pages (board, post
form, listing detail) reached by full navigations rather than a modal; the
board sorted newest-first; a runner-set deadline capped at two hours; a
naturally-expired listing disappearing from the board entirely rather than
being marked closed; and a restrained orange accent rather than a themed
UI. The scaffold in
[`d4168b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/d4168b1)
builds exactly that, plus the expiry contract as a spec test in
[`cc4eb26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-jamesye03/commit/cc4eb26).

## Deliberately not this week

The listing detail page is view-only. The rule that a runner marking a
listing "done" makes it visible only to the people involved depends on
chat/relationship data that doesn't exist yet — building it now would mean
guessing at a data model crit 9 might not need. Both land together next
week, alongside the required multi-user behaviour decision.
