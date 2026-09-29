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

function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">Passing By</a>
  <a class="button button-primary" href="/post">Post</a>
</header>
<main>
${body}
</main>
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

export function renderHome(listings) {
  const items = listings.length
    ? listings
        .map(
          (l) => `
    <li class="listing-card">
      <a href="/listings/${l.id}">
        <div class="listing-route">${escapeHtml(l.origin)} &rarr; ${escapeHtml(l.destination)}</div>
        <div class="listing-item">${escapeHtml(l.item)}</div>
        <div class="listing-meta">
          <span>${escapeHtml(l.nickname)}</span>
          <span aria-hidden="true">&middot;</span>
          <span>${timeAgo(l.created_at)}</span>
          <span aria-hidden="true">&middot;</span>
          <span class="listing-countdown">${timeLeft(l.expires_at)}</span>
        </div>
      </a>
    </li>`,
        )
        .join("\n")
    : `<p class="empty-state">Nobody's out running errands right now. Be the first &mdash; <a href="/post">post one</a>.</p>`;

  return layout({
    title: "Passing By",
    body: `<h1>Who's out right now</h1>
    <ul class="listing-list">${items}</ul>`,
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

export function renderListing(listing) {
  return layout({
    title: `${listing.origin} to ${listing.destination} — Passing By`,
    body: `<p class="back-link"><a href="/">&larr; back to the board</a></p>
    <h1>${escapeHtml(listing.origin)} &rarr; ${escapeHtml(listing.destination)}</h1>
    <p class="listing-item-full">${escapeHtml(listing.item)}</p>
    <dl class="listing-detail">
      <dt>Posted by</dt><dd>${escapeHtml(listing.nickname)}</dd>
      <dt>Posted</dt><dd>${timeAgo(listing.created_at)}</dd>
      <dt>Open for</dt><dd>${timeLeft(listing.expires_at)}</dd>
    </dl>`,
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
