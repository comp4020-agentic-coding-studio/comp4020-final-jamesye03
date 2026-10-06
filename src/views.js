import { createHash } from "node:crypto";

const DEADLINE_OPTIONS = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
];

export function isValidDeadline(minutes) {
  return DEADLINE_OPTIONS.some((o) => o.minutes === minutes);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// One-way marker for "this listing is yours", safe to broadcast to every
// board viewer — see ADR 0002. Never send the raw session id itself.
function ownerHash(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function layout({ title, body, page = "", sessionId = "", navUnread = 0 }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,0,0" />
<link rel="stylesheet" href="/style.css" />
</head>
<body data-page="${escapeHtml(page)}" data-session-id="${escapeHtml(sessionId)}">
<header class="site-header">
  <a class="brand" href="/"><span class="brand-mark"><span class="material-symbols-rounded" aria-hidden="true">delivery_dining</span></span> DormRunner</a>
  <nav class="site-nav">
    <a href="/about"><span class="material-symbols-rounded" aria-hidden="true">help</span> How it works</a>
    <a href="/stats"><span class="material-symbols-rounded" aria-hidden="true">monitoring</span> Activity</a>
    <a href="/my">My chats<span class="badge-unread-nav" id="nav-unread"${navUnread ? "" : " hidden"}>${navUnread || ""}</span></a>
    <a class="button button-primary" href="/post"><span class="material-symbols-rounded" aria-hidden="true">add</span> Post</a>
  </nav>
</header>
<main>
${body}
</main>
<script src="/app.js" defer></script>
</body>
</html>`;
}

function timeLeft(expiresAt, now = Date.now()) {
  const ms = expiresAt - now;
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min left`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h left` : `${hours}h ${rem}m left`;
}

function timeAgo(createdAt, now = Date.now()) {
  const mins = Math.round((now - createdAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

// Shared between the SSR board render and the "new-listing" WS broadcast
// (src/server.js), so a card looks identical how ever it reached the page.
// `unread` defaults to 0 because the WS broadcast call always means "just
// created" (nobody's had time to message yet), so that caller never needs
// to pass one — a real per-viewer count only ever comes from the SSR path,
// same as the /my card below, and only for listings this viewer is actually
// involved in (src/server.js checks isInvolved before computing it).
export function listingCardHtml(l, { unread = 0 } = {}) {
  return `<li class="listing-card" data-id="${l.id}" data-owner-hash="${ownerHash(l.creator_session_id)}">
      <span class="badge-unread-corner"${unread ? "" : " hidden"}>${unread || ""}</span>
      <a href="/listings/${l.id}">
        <div class="listing-route">${escapeHtml(l.origin)} <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span> ${escapeHtml(l.destination)}</div>
        <div class="listing-item">${escapeHtml(l.item)}</div>
        ${l.fee ? `<div class="listing-fee"><span class="material-symbols-rounded" aria-hidden="true">payments</span> ${escapeHtml(l.fee)}</div>` : ""}
        <div class="listing-meta">
          <span>${escapeHtml(l.nickname)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>${timeAgo(l.created_at)}</span>
          <span aria-hidden="true">&middot;</span>
          <span class="listing-countdown-wrap"><span class="material-symbols-rounded" aria-hidden="true">schedule</span> <span class="listing-countdown" data-expires-at="${l.expires_at}">${timeLeft(l.expires_at)}</span></span>
        </div>
      </a>
    </li>`;
}

export function renderHome(listings, { sessionId = "", navUnread = 0 } = {}) {
  const items = listings.length
    ? listings.map((l) => listingCardHtml(l, { unread: l.unread })).join("\n")
    : `<p class="empty-state"><span class="material-symbols-rounded" aria-hidden="true">inbox</span> Nobody's out running errands right now. Be the first &mdash; <a href="/post">post one</a>.</p>`;

  return layout({
    title: "DormRunner",
    page: "board",
    sessionId,
    navUnread,
    body: `<div class="brand-mark brand-mark--hero"><span class="material-symbols-rounded" aria-hidden="true">delivery_dining</span></div>
    <h1>Who's out right now</h1>
    <ul class="listing-list" id="board-list">${items}</ul>`,
  });
}

export function renderPostForm({ nickname = "", fee = "", error = "", sessionId = "", navUnread = 0 } = {}) {
  const options = DEADLINE_OPTIONS.map((o) => `<option value="${o.minutes}">${o.label}</option>`).join("");

  return layout({
    title: "Post a run — DormRunner",
    sessionId,
    navUnread,
    body: `<h1>Post a run</h1>
    ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/post" class="listing-form">
      <label for="origin">From</label>
      <input id="origin" name="origin" required maxlength="60" />

      <label for="destination">To</label>
      <input id="destination" name="destination" required maxlength="60" />

      <label for="item">What can you bring</label>
      <input id="item" name="item" required maxlength="120" />

      <label for="fee">What you'd like to earn (optional)</label>
      <input id="fee" name="fee" maxlength="40" value="${escapeHtml(fee)}" />

      <label for="nickname">Your nickname</label>
      <input id="nickname" name="nickname" required maxlength="30" value="${escapeHtml(nickname)}" placeholder="how people should ask for you" />

      <label for="minutes">How long is this open</label>
      <select id="minutes" name="minutes">${options}</select>

      <button type="submit" class="button button-primary"><span class="material-symbols-rounded" aria-hidden="true">add</span> Post it</button>
    </form>`,
  });
}

// Shared between SSR and the WS "message"/"done" broadcasts (src/server.js).
// Who a message is "from" is decided client-side (app.js compares
// data-sender against the viewer's own data-session-id on <body>): the same
// markup means something different to the runner than to a requester, so it
// can't be baked in server-side without rendering it twice.
export function messageHtml(m) {
  return `<li class="chat-msg" data-sender="${escapeHtml(m.sender_session_id)}">
      <div class="chat-msg-meta"><span class="chat-msg-name">${escapeHtml(m.nickname)}</span> <span class="chat-msg-time">${timeAgo(m.created_at)}</span></div>
      <div class="chat-msg-body">${escapeHtml(m.body)}</div>
    </li>`;
}

function chatForm({ listingId, thread = "", nickname = "" }) {
  return `<form method="post" action="/listings/${listingId}/messages" class="chat-form">
      ${thread ? `<input type="hidden" name="thread" value="${escapeHtml(thread)}" />` : ""}
      <input name="nickname" value="${escapeHtml(nickname)}" maxlength="30" required placeholder="your nickname" />
      <input name="body" maxlength="500" required placeholder="say something…" />
      <button type="submit" class="button button-primary"><span class="material-symbols-rounded" aria-hidden="true">send</span> Send</button>
    </form>`;
}

// isRunner: one thread section per requester, labelled by that thread's own
// latest nickname (there's no account to label it with instead).
// !isRunner: the viewer's own thread, which may not exist yet (empty + a
// form is how a stranger starts one).
function threadSectionHtml({ listingId, requesterSessionId, messages, heading, nickname = "" }) {
  const list = messages.length
    ? messages.map(messageHtml).join("\n")
    : `<p class="empty-state"><span class="material-symbols-rounded" aria-hidden="true">chat_bubble</span> No messages yet.</p>`;
  return `<section class="chat-thread" data-thread="${escapeHtml(requesterSessionId)}">
      ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ""}
      <ul class="chat-messages">${list}</ul>
      ${chatForm({ listingId, thread: heading ? requesterSessionId : "", nickname })}
    </section>`;
}

export function doneBannerHtml() {
  return `<p class="done-banner" data-done-banner><span class="material-symbols-rounded" aria-hidden="true">check_circle</span> Marked done — off the public board now, but this page still works for everyone who was already talking here.</p>`;
}

export function renderListing({ listing, sessionId, isRunner, threads, nickname = "", navUnread = 0 }) {
  const threadsHtml = isRunner
    ? threads.length
      ? threads
          .map((t) =>
            threadSectionHtml({
              listingId: listing.id,
              requesterSessionId: t.requesterSessionId,
              messages: t.messages,
              heading: t.messages.at(-1)?.nickname ?? "Someone",
              nickname,
            }),
          )
          .join("\n")
      : `<p class="empty-state"><span class="material-symbols-rounded" aria-hidden="true">chat_bubble</span> No one's messaged you yet.</p>`
    : threadSectionHtml({
        listingId: listing.id,
        requesterSessionId: sessionId,
        messages: threads[0]?.messages ?? [],
        nickname,
      });

  return layout({
    title: `${listing.origin} to ${listing.destination} — DormRunner`,
    page: "listing",
    sessionId,
    navUnread,
    body: `<p class="back-link"><a href="/" class="button button-secondary"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span> Back to the board</a></p>
    <h1>${escapeHtml(listing.origin)} <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span> ${escapeHtml(listing.destination)}</h1>
    <p class="listing-item-full">${escapeHtml(listing.item)}</p>
    <dl class="listing-detail">
      <dt>Posted by</dt><dd>${escapeHtml(listing.nickname)}</dd>
      ${listing.fee ? `<dt><span class="material-symbols-rounded" aria-hidden="true">payments</span> Fee</dt><dd>${escapeHtml(listing.fee)}</dd>` : ""}
      <dt>Posted</dt><dd>${timeAgo(listing.created_at)}</dd>
      <dt><span class="material-symbols-rounded" aria-hidden="true">schedule</span> Open for</dt><dd>${timeLeft(listing.expires_at)}</dd>
    </dl>
    <div id="done-banner-slot">${listing.done_at ? doneBannerHtml() : ""}</div>
    ${
      isRunner && !listing.done_at
        ? `<form method="post" action="/listings/${listing.id}/done" class="done-form">
      <button type="submit" class="button button-secondary"><span class="material-symbols-rounded" aria-hidden="true">check</span> Mark as done</button>
    </form>`
        : ""
    }
    <h2>${isRunner ? "Messages" : `Message ${escapeHtml(listing.nickname)}`}</h2>
    <div id="chat-threads" data-listing-id="${listing.id}" data-is-runner="${isRunner ? "1" : "0"}">
      ${threadsHtml}
    </div>`,
  });
}

function profileFormHtml(nickname) {
  return `<form method="post" action="/my" class="profile-form">
      <input name="nickname" value="${escapeHtml(nickname)}" maxlength="30" required placeholder="how people should ask for you" />
      <button type="submit" class="button button-secondary"><span class="material-symbols-rounded" aria-hidden="true">person</span> Save</button>
    </form>`;
}

// The optional "creepy mirror" (crit 10): the same events table that feeds
// /stats, filtered to this one viewer's own hash — never anyone else's, same
// boundary the unread badges already draw. Only rendered when there's
// something to show, so a brand-new visitor doesn't see an empty box.
function myActivityHtml(myActivity) {
  const total = Object.values(myActivity).reduce((a, b) => a + b, 0);
  if (!total) return "";
  return `<div class="my-activity">
      <h2>What we've recorded about you</h2>
      <p>${myActivity.listing_posted} posted, ${myActivity.message_sent} messages sent,
      ${myActivity.listing_viewed} listings viewed, ${myActivity.listing_done} marked done.
      That's everything — see <a href="/stats">Activity</a> for what's logged about everyone.</p>
    </div>`;
}

export function renderMyChats({ sessionId, listings, nickname = "", navUnread = 0, myActivity = null }) {
  const items = listings.length
    ? listings
        .map((l) => {
          const mine = l.creator_session_id === sessionId;
          return `<li class="listing-card" data-id="${l.id}">
      <span class="badge-unread-corner"${l.unread ? "" : " hidden"}>${l.unread || ""}</span>
      <a href="/listings/${l.id}">
        <div class="listing-route">${escapeHtml(l.origin)} <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span> ${escapeHtml(l.destination)}</div>
        <div class="listing-item">${escapeHtml(l.item)}</div>
        <div class="listing-meta">
          <span>${mine ? "You posted this" : "You messaged about this"}</span>
          <span aria-hidden="true">&middot;</span>
          <span>${l.done_at ? "done" : timeLeft(l.expires_at)}</span>
        </div>
      </a>
    </li>`;
        })
        .join("\n")
    : `<p class="empty-state"><span class="material-symbols-rounded" aria-hidden="true">inbox</span> Nothing yet — post a run or message someone on the <a href="/">board</a>.</p>`;

  return layout({
    title: "My chats — DormRunner",
    page: "my-chats",
    sessionId,
    navUnread,
    body: `<h1>My chats</h1>
    <h2>Your nickname</h2>
    ${profileFormHtml(nickname)}
    <ul class="listing-list">${items}</ul>
    ${myActivity ? myActivityHtml(myActivity) : ""}`,
  });
}

// Plain-language orientation for a first-time visitor — deliberately not the
// same thing as /readme/ (which serves README.md's own project write-up, in
// the voice that's aimed at a marker, not a BNG resident deciding whether to
// tap "Post"). CLAUDE.md: English only, so this stays English even though
// the ask for it came through in Chinese.
export function renderAbout({ sessionId = "", navUnread = 0 } = {}) {
  return layout({
    title: "How it works — DormRunner",
    page: "about",
    sessionId,
    navUnread,
    body: `<h1>How this works</h1>
    <p>DormRunner is a simple board for people living in BNG. If you're
    heading out and don't mind grabbing something for someone, post it. If
    you need something, check the board and message whoever's already
    heading out.</p>

    <ol class="about-steps">
      <li><strong>Heading out?</strong> Tap "Post", say where you're going,
        what you can bring back, and how long before you're back. It shows
        up on the board right away.</li>
      <li><strong>Need something?</strong> Open the board, find someone
        going somewhere useful, and tap their post to send them a
        message.</li>
      <li><strong>Chatting is live.</strong> No need to refresh — replies
        just show up on the page.</li>
      <li><strong>Errand done?</strong> Whoever posted it marks it "done".
        It comes off the board, but the chat stays open for anyone already
        talking there.</li>
      <li><strong>Posts don't last forever.</strong> Each one shows a
        countdown and disappears on its own once the time's up.</li>
      <li><strong>"My chats"</strong> keeps track of everything you've
        posted or messaged about, with a number next to it whenever there's
        something new to read.</li>
    </ol>

    <h2>Good to know</h2>
    <ul class="about-notes">
      <li>No sign-up, no account — just open the site and go.</li>
      <li>No ratings, and no payment built into the app. If money's
        changing hands, sort it out directly with the other person, the
        same way you would with a friend.</li>
    </ul>`,
  });
}

const EVENT_LABELS = {
  listing_posted: "Posted a run",
  listing_viewed: "Viewed a listing",
  message_sent: "Sent a message",
  listing_done: "Marked done",
};

function statsCountsHtml(counts, windowName) {
  return `<dl class="stats-counts">
    ${Object.entries(counts)
      .map(
        ([type, c]) =>
          `<dt>${EVENT_LABELS[type] ?? type}</dt><dd data-type="${type}" data-window="${windowName}">${c}</dd>`,
      )
      .join("\n")}
  </dl>`;
}

function statsEventHtml(e) {
  return `<li data-type="${e.type}">
      <span class="stats-event-label">${EVENT_LABELS[e.type] ?? e.type}</span>
      <span class="stats-event-who">${e.sessionHash}</span>
      ${e.listingLabel ? `<a href="/listings/${e.listingId}">${escapeHtml(e.listingLabel)}</a>` : ""}
      <span class="stats-event-time">${timeAgo(e.createdAt)}</span>
    </li>`;
}

// Crit 10's "live view" — a log tail or a simple stats page both count, no
// heavyweight tooling needed. Built on the same WS broadcast machinery crit
// 9 already added (a new "stats" channel, see src/server.js), so counts and
// the recent-events feed below update live with no polling. "Who" is always
// the short hash from db.js's sessionHash — see ADR 0003 for why not the
// raw session id.
export function renderStats({ allTime, lastHour, recent, sessionId = "", navUnread = 0 } = {}) {
  return layout({
    title: "Activity — DormRunner",
    page: "stats",
    sessionId,
    navUnread,
    body: `<h1>Activity</h1>
    <p>What people have done on DormRunner, logged as it happens. "Who" is
    shown as a short one-way code, never anyone's real identity — see
    <a href="/readme/">the write-up</a> for why.</p>

    <h2>Last hour</h2>
    ${statsCountsHtml(lastHour, "hour")}

    <h2>All time</h2>
    ${statsCountsHtml(allTime, "all")}

    <h2>Recent activity</h2>
    <ul class="stats-feed" id="stats-feed">${recent.map(statsEventHtml).join("\n")}</ul>`,
  });
}

export function renderNotFound({ sessionId = "", navUnread = 0 } = {}) {
  return layout({
    title: "Not found — DormRunner",
    sessionId,
    navUnread,
    body: `<h1>Not found</h1><p>This listing doesn't exist, or its window's closed. <a href="/">Back to the board</a>.</p>`,
  });
}

export function renderReadme(bodyHtml, { sessionId = "", navUnread = 0 } = {}) {
  return layout({
    title: "About — DormRunner",
    sessionId,
    navUnread,
    body: `<article class="readme">${bodyHtml}</article>`,
  });
}
