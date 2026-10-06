// Vanilla JS, no framework: the server renders everything, this just patches
// the DOM when a WS event says something changed somewhere else. The page's
// own actions (posting, sending a message, marking done) are plain form
// POSTs that redirect back and re-render server-side as normal.
(function () {
  const page = document.body.dataset.page;
  const sessionId = document.body.dataset.sessionId;

  function markMine(li) {
    if (li.dataset.sender && li.dataset.sender === sessionId) li.classList.add("chat-msg--mine");
  }

  // See ADR 0002: the server never sends another viewer's raw session id, so
  // "is this my card" is answered by hashing our own id the same way
  // (SHA-256, hex) and comparing against each card's data-owner-hash. Guarded
  // for a non-secure context (no HTTPS, not localhost), where
  // crypto.subtle is unavailable — the board just skips the highlight.
  let myHashPromise;
  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function markOwnListings(root) {
    if (!window.crypto?.subtle || !sessionId) return;
    myHashPromise ??= sha256Hex(sessionId);
    const myHash = await myHashPromise;
    (root ?? document).querySelectorAll("[data-owner-hash]").forEach((li) => {
      if (li.dataset.ownerHash === myHash) li.classList.add("listing-card--mine");
    });
  }

  document.querySelectorAll(".chat-msg").forEach(markMine);
  if (page === "board") markOwnListings();

  function setNavUnread(total) {
    const el = document.getElementById("nav-unread");
    if (!el) return;
    el.textContent = total > 0 ? String(total) : "";
    el.hidden = !(total > 0);
  }

  function setCardUnread(listingId, count) {
    const badge = document.querySelector(`.listing-card[data-id="${listingId}"] .badge-unread-corner`);
    if (!badge) return;
    badge.textContent = count > 0 ? String(count) : "";
    badge.hidden = !(count > 0);
  }

  // The nav badge needs a live connection on every page, not just board/
  // listing — nothing to subscribe to without an identity, though.
  if (!sessionId) return;

  function connect() {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", channel: "me" }));
      if (page === "board") {
        ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));
      } else if (page === "listing") {
        const el = document.getElementById("chat-threads");
        ws.send(JSON.stringify({ type: "subscribe", channel: "listing", id: Number(el.dataset.listingId) }));
      } else if (page === "stats") {
        ws.send(JSON.stringify({ type: "subscribe", channel: "stats" }));
      }
    });

    ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "new-listing") {
        const list = document.getElementById("board-list");
        if (list && !list.querySelector(`[data-id="${data.id}"]`)) {
          list.insertAdjacentHTML("afterbegin", data.html);
          list.firstElementChild.classList.add("listing-card--enter");
          markOwnListings(list.firstElementChild);
        }
      } else if (data.type === "remove-listing") {
        document.querySelector(`#board-list [data-id="${data.id}"]`)?.remove();
      } else if (data.type === "message") {
        const thread = document.querySelector(`[data-thread="${data.thread}"] .chat-messages`);
        if (!thread) return;
        thread.querySelector(".empty-state")?.remove();
        thread.insertAdjacentHTML("beforeend", data.html);
        markMine(thread.lastElementChild);
        thread.lastElementChild.scrollIntoView({ block: "nearest" });
      } else if (data.type === "done") {
        const slot = document.getElementById("done-banner-slot");
        if (slot && !slot.querySelector("[data-done-banner]")) {
          slot.insertAdjacentHTML("beforeend", data.html);
        }
        document.querySelector(".done-form")?.remove();
      } else if (data.type === "unread") {
        setNavUnread(data.total);
        // Board and /my render the exact same (hidden-when-zero)
        // badge-unread-corner markup on a card, so the same lookup+toggle
        // applies wherever that card happens to be on screen; it's a no-op
        // via the null check above on any page with no matching card.
        setCardUnread(data.listingId, data.count);
      } else if (data.type === "event") {
        // /stats only: bump both window counters, no reload. A count here
        // only ever grows between reloads — the "last hour" window's own
        // aging-out happens server-side on the next full page load, same as
        // any other simple stats page (crit 10 doesn't call for more).
        document.querySelectorAll(`dd[data-type="${data.eventType}"]`).forEach((dd) => {
          dd.textContent = String(Number(dd.textContent) + 1);
        });
        const feed = document.getElementById("stats-feed");
        if (feed) {
          const labels = {
            listing_posted: "Posted a run",
            listing_viewed: "Viewed a listing",
            message_sent: "Sent a message",
            listing_done: "Marked done",
          };
          const li = document.createElement("li");
          li.dataset.type = data.eventType;
          const link = data.listingId ? ` <a href="/listings/${data.listingId}">listing #${data.listingId}</a>` : "";
          li.innerHTML = `<span class="stats-event-label">${labels[data.eventType] ?? data.eventType}</span> <span class="stats-event-who">${data.sessionHash}</span>${link} <span class="stats-event-time">just now</span>`;
          feed.insertAdjacentElement("afterbegin", li);
        }
      }
    });

    // The Fly machine can stop/restart under an idle app; a plain retry loop
    // is enough at this scale (see PROCESS.md) — no backoff bookkeeping.
    ws.addEventListener("close", () => setTimeout(connect, 1000));
  }

  connect();

  // Listings carry their own deadline; counting down locally means expiry
  // doesn't need a server broadcast (see README: expiry isn't someone's
  // action, it's just time passing).
  setInterval(() => {
    document.querySelectorAll(".listing-countdown[data-expires-at]").forEach((el) => {
      const ms = Number(el.dataset.expiresAt) - Date.now();
      if (ms <= 0) {
        el.closest("[data-id]")?.remove();
      } else {
        const mins = Math.round(ms / 60000);
        el.textContent = mins < 60 ? `${mins} min left` : `${Math.floor(mins / 60)}h ${mins % 60}m left`;
      }
    });
  }, 15000);
})();
