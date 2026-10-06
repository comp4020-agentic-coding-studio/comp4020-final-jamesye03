// Vanilla JS, no framework: the server renders everything, this just patches
// the DOM when a WS event says something changed somewhere else. The page's
// own actions (posting, sending a message, marking done) are plain form
// POSTs that redirect back and re-render server-side as normal.
(function () {
  const page = document.body.dataset.page;
  const sessionId = document.body.dataset.sessionId;
  if (page !== "board" && page !== "listing") return;

  function markMine(li) {
    if (li.dataset.sender && li.dataset.sender === sessionId) li.classList.add("chat-msg--mine");
  }
  document.querySelectorAll(".chat-msg").forEach(markMine);

  function connect() {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

    ws.addEventListener("open", () => {
      if (page === "board") {
        ws.send(JSON.stringify({ type: "subscribe", channel: "board" }));
      } else {
        const el = document.getElementById("chat-threads");
        ws.send(JSON.stringify({ type: "subscribe", channel: "listing", id: Number(el.dataset.listingId) }));
      }
    });

    ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "new-listing") {
        const list = document.getElementById("board-list");
        if (list && !list.querySelector(`[data-id="${data.id}"]`)) {
          list.insertAdjacentHTML("afterbegin", data.html);
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
        if (slot && !slot.querySelector("[data-done-banner]")) slot.insertAdjacentHTML("beforeend", data.html);
        document.querySelector(".done-form")?.remove();
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
