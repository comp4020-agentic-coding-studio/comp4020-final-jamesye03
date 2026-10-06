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

function layout({ title, body, page = "", sessionId = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css" />
</head>
<body data-page="${escapeHtml(page)}" data-session-id="${escapeHtml(sessionId)}">
<header class="site-header">
  <a class="brand" href="/">Passing By</a>
  <nav class="site-nav">
    <a href="/my">My chats</a>
    <a class="button button-primary" href="/post">Post</a>
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
export function listingCardHtml(l) {
  return `<li class="listing-card" data-id="${l.id}">
      <a href="/listings/${l.id}">
        <div class="listing-route">${escapeHtml(l.origin)} &rarr; ${escapeHtml(l.destination)}</div>
        <div class="listing-item">${escapeHtml(l.item)}</div>
        <div class="listing-meta">
          <span>${escapeHtml(l.nickname)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>${timeAgo(l.created_at)}</span>
          <span aria-hidden="true">&middot;</span>
          <span class="listing-countdown" data-expires-at="${l.expires_at}">${timeLeft(l.expires_at)}</span>
        </div>
      </a>
    </li>`;
}

export function renderHome(listings, { sessionId = "" } = {}) {
  const items = listings.length
    ? listings.map(listingCardHtml).join("\n")
    : `<p class="empty-state">Nobody's out running errands right now. Be the first &mdash; <a href="/post">post one</a>.</p>`;

  return layout({
    title: "Passing By",
    page: "board",
    sessionId,
    body: `<h1>Who's out right now</h1>
    <ul class="listing-list" id="board-list">${items}</ul>`,
  });
}

export function renderPostForm({ nickname = "", error = "" } = {}) {
  const options = DEADLINE_OPTIONS.map((o) => `<option value="${o.minutes}">${o.label}</option>`).join("");

  return layout({
    title: "Post a run — Passing By",
    body: `<h1>Post a run</h1>
    ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/post" class="listing-form">
      <label for="origin">Where you're at</label>
      <input id="origin" name="origin" required maxlength="60" placeholder="e.g. Union Court Maccas" />

      <label for="destination">Where you're headed back to</label>
      <input id="destination" name="destination" required maxlength="60" placeholder="e.g. BNG Block C" />

      <label for="item">What you can bring back</label>
      <input id="item" name="item" required maxlength="120" placeholder="e.g. a couple of burgers, whatever's quick" />

      <label for="nickname">Your nickname</label>
      <input id="nickname" name="nickname" required maxlength="30" value="${escapeHtml(nickname)}" placeholder="how people should ask for you" />

      <label for="minutes">How long is this open</label>
      <select id="minutes" name="minutes">${options}</select>

      <button type="submit" class="button button-primary">Post it</button>
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
      <button type="submit" class="button button-primary">Send</button>
    </form>`;
}

// isRunner: one thread section per requester, labelled by that thread's own
// latest nickname (there's no account to label it with instead).
// !isRunner: the viewer's own thread, which may not exist yet (empty + a
// form is how a stranger starts one).
function threadSectionHtml({ listingId, requesterSessionId, messages, heading, nickname = "" }) {
  const list = messages.length
    ? messages.map(messageHtml).join("\n")
    : `<p class="empty-state">No messages yet.</p>`;
  return `<section class="chat-thread" data-thread="${escapeHtml(requesterSessionId)}">
      ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ""}
      <ul class="chat-messages">${list}</ul>
      ${chatForm({ listingId, thread: heading ? requesterSessionId : "", nickname })}
    </section>`;
}

export function doneBannerHtml() {
  return `<p class="done-banner" data-done-banner>Marked done — off the public board now, but this page still works for everyone who was already talking here.</p>`;
}

export function renderListing({ listing, sessionId, isRunner, threads, nickname = "" }) {
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
      : `<p class="empty-state">No one's messaged you yet.</p>`
    : threadSectionHtml({
        listingId: listing.id,
        requesterSessionId: sessionId,
        messages: threads[0]?.messages ?? [],
        nickname,
      });

  return layout({
    title: `${listing.origin} to ${listing.destination} — Passing By`,
    page: "listing",
    sessionId,
    body: `<p class="back-link"><a href="/">&larr; back to the board</a></p>
    <h1>${escapeHtml(listing.origin)} &rarr; ${escapeHtml(listing.destination)}</h1>
    <p class="listing-item-full">${escapeHtml(listing.item)}</p>
    <dl class="listing-detail">
      <dt>Posted by</dt><dd>${escapeHtml(listing.nickname)}</dd>
      <dt>Posted</dt><dd>${timeAgo(listing.created_at)}</dd>
      <dt>Open for</dt><dd>${timeLeft(listing.expires_at)}</dd>
    </dl>
    <div id="done-banner-slot">${listing.done_at ? doneBannerHtml() : ""}</div>
    ${
      isRunner && !listing.done_at
        ? `<form method="post" action="/listings/${listing.id}/done" class="done-form">
      <button type="submit" class="button button-secondary">Mark as done</button>
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
      <button type="submit" class="button button-secondary">Save</button>
    </form>`;
}

export function renderMyChats({ sessionId, listings, nickname = "" }) {
  const items = listings.length
    ? listings
        .map((l) => {
          const mine = l.creator_session_id === sessionId;
          return `<li class="listing-card">
      <a href="/listings/${l.id}">
        <div class="listing-route">${escapeHtml(l.origin)} &rarr; ${escapeHtml(l.destination)}</div>
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
    : `<p class="empty-state">Nothing yet — post a run or message someone on the <a href="/">board</a>.</p>`;

  return layout({
    title: "My chats — Passing By",
    page: "my-chats",
    sessionId,
    body: `<h1>My chats</h1>
    <h2>Your nickname</h2>
    ${profileFormHtml(nickname)}
    <ul class="listing-list">${items}</ul>`,
  });
}

export function renderNotFound() {
  return layout({
    title: "Not found — Passing By",
    body: `<h1>Not found</h1><p>This listing doesn't exist, or its window's closed. <a href="/">Back to the board</a>.</p>`,
  });
}

export function renderReadme(bodyHtml) {
  return layout({
    title: "About — Passing By",
    body: `<article class="readme">${bodyHtml}</article>`,
  });
}
