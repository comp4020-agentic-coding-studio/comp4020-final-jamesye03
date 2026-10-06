import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { WebSocketServer } from "ws";
import {
  activeListing,
  activeListings,
  addMessage,
  createListing,
  hasThread,
  isInvolved,
  listingsForSession,
  markDone,
  markListingRead,
  messagesForThread,
  threadsForListing,
  totalUnreadCount,
  unreadCount,
} from "./db.js";
import { renderMarkdown } from "./markdown.js";
import {
  doneBannerHtml,
  isValidDeadline,
  listingCardHtml,
  messageHtml,
  renderAbout,
  renderHome,
  renderListing,
  renderMyChats,
  renderNotFound,
  renderPostForm,
  renderReadme,
} from "./views.js";

const app = express();
const PORT = process.env.PORT ?? 8080;

app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function nicknameCookie(value) {
  return `nickname=${encodeURIComponent(value)}; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax`;
}

function sessionCookie(value) {
  return `session_id=${value}; Max-Age=${60 * 60 * 24 * 180}; Path=/; SameSite=Lax`;
}

// The one piece of "identity" this app has: an opaque per-browser id, no
// sign-up involved. It's what makes a private thread private — see ADR 0001.
app.use((req, res, next) => {
  let sessionId = readCookie(req, "session_id");
  if (!sessionId) {
    sessionId = randomUUID();
    res.setHeader("Set-Cookie", sessionCookie(sessionId));
  }
  req.sessionId = sessionId;
  next();
});

app.get("/", (req, res) => {
  // Same badge, same access rule as /my: a board card's unread count is only
  // ever computed for a listing this viewer is actually involved in — every
  // other card's is never anything but 0, since a session with no thread and
  // no ownership has nothing to be "behind" on.
  const listings = activeListings().map((l) => ({
    ...l,
    unread: isInvolved(l, req.sessionId) ? unreadCount(l.id, req.sessionId, l.creator_session_id === req.sessionId) : 0,
  }));
  res.send(renderHome(listings, { sessionId: req.sessionId, navUnread: totalUnreadCount(req.sessionId) }));
});

app.get("/my", (req, res) => {
  const listings = listingsForSession(req.sessionId).map((l) => ({
    ...l,
    unread: unreadCount(l.id, req.sessionId, l.creator_session_id === req.sessionId),
  }));
  res.send(
    renderMyChats({
      sessionId: req.sessionId,
      listings,
      nickname: readCookie(req, "nickname") ?? "",
      navUnread: listings.reduce((sum, l) => sum + l.unread, 0),
    }),
  );
});

app.post("/my", (req, res) => {
  const nickname = (req.body.nickname ?? "").trim();
  if (nickname) res.setHeader("Set-Cookie", nicknameCookie(nickname));
  res.redirect("/my");
});

app.get("/post", (req, res) => {
  res.send(
    renderPostForm({
      nickname: readCookie(req, "nickname") ?? "",
      sessionId: req.sessionId,
      navUnread: totalUnreadCount(req.sessionId),
    }),
  );
});

app.post("/post", (req, res) => {
  const origin = (req.body.origin ?? "").trim();
  const destination = (req.body.destination ?? "").trim();
  const item = (req.body.item ?? "").trim();
  const nickname = (req.body.nickname ?? "").trim();
  const fee = (req.body.fee ?? "").trim();
  const minutes = Number(req.body.minutes);

  if (!origin || !destination || !item || !nickname || !isValidDeadline(minutes)) {
    res.status(400).send(
      renderPostForm({
        nickname,
        fee,
        error: "Fill in every field and pick a deadline.",
        sessionId: req.sessionId,
        navUnread: totalUnreadCount(req.sessionId),
      }),
    );
    return;
  }

  const id = createListing({ origin, destination, item, nickname, minutes, fee, creatorSessionId: req.sessionId });
  res.setHeader("Set-Cookie", nicknameCookie(nickname));
  res.redirect("/");
  broadcastBoard({ type: "new-listing", id, html: listingCardHtml(activeListing(id)) });
});

app.get("/listings/:id", (req, res) => {
  const listing = activeListing(Number(req.params.id));
  // Anyone can open an active listing to start a first message — isInvolved
  // only gates access once it's done (see CLAUDE.md: done stays reachable
  // for the runner and anyone already in a thread, not for a new stranger).
  if (!listing || (listing.done_at && !isInvolved(listing, req.sessionId))) {
    res.status(404).send(renderNotFound());
    return;
  }
  const isRunner = listing.creator_session_id === req.sessionId;
  const threads = isRunner
    ? threadsForListing(listing.id)
    : [{ requesterSessionId: req.sessionId, messages: messagesForThread(listing.id, req.sessionId) }];
  // Badges live on /my only (see db.js), but this page is where "read" is
  // earned — opening a listing you're involved in resets its unread count.
  markListingRead(listing.id, req.sessionId);
  res.send(
    renderListing({
      listing,
      sessionId: req.sessionId,
      isRunner,
      threads,
      nickname: readCookie(req, "nickname") ?? "",
      navUnread: totalUnreadCount(req.sessionId),
    }),
  );
  // A second tab (e.g. still sitting on /my) should see this listing's
  // badge clear live too, not just on its own next reload.
  pushUnread(req.sessionId, listing.id);
});

app.post("/listings/:id/messages", (req, res) => {
  const listingId = Number(req.params.id);
  const listing = activeListing(listingId);
  if (!listing) {
    res.status(404).send(renderNotFound());
    return;
  }

  const isRunner = listing.creator_session_id === req.sessionId;
  const nickname = (req.body.nickname ?? "").trim();
  const body = (req.body.body ?? "").trim();
  const requestedThread = (req.body.thread ?? "").trim();

  // Only the runner picks which existing thread to reply into; anyone else
  // writes to their own (which this creates the first time they send).
  let requesterSessionId;
  if (isRunner) {
    if (!requestedThread || !hasThread(listingId, requestedThread)) {
      res.status(400).send(renderNotFound());
      return;
    }
    requesterSessionId = requestedThread;
  } else {
    if (!isInvolved(listing, req.sessionId) && listing.done_at) {
      // done hides the listing from strangers (see GET above); a stranger
      // can't have reached this form without already being involved.
      res.status(404).send(renderNotFound());
      return;
    }
    requesterSessionId = req.sessionId;
  }

  if (!nickname || !body) {
    res.redirect(`/listings/${listingId}`);
    return;
  }

  const createdAt = addMessage({ listingId, requesterSessionId, senderSessionId: req.sessionId, nickname, body });
  res.setHeader("Set-Cookie", nicknameCookie(nickname));
  res.redirect(`/listings/${listingId}`);

  broadcastListing(listingId, {
    type: "message",
    thread: requesterSessionId,
    html: messageHtml({ sender_session_id: req.sessionId, nickname, body, created_at: createdAt }),
  });
  // The sender's own messages never count as unread to themselves (db.js),
  // so only the other party in this thread has anything to be pushed.
  pushUnread(isRunner ? requesterSessionId : listing.creator_session_id, listingId);
});

app.post("/listings/:id/done", (req, res) => {
  const listingId = Number(req.params.id);
  const listing = activeListing(listingId);
  if (!listing || listing.creator_session_id !== req.sessionId) {
    res.status(404).send(renderNotFound());
    return;
  }

  markDone(listingId);
  res.redirect(`/listings/${listingId}`);

  broadcastBoard({ type: "remove-listing", id: listingId });
  broadcastListing(listingId, { type: "done", html: doneBannerHtml() });
});

app.get("/about", (req, res) => {
  res.send(renderAbout({ sessionId: req.sessionId, navUnread: totalUnreadCount(req.sessionId) }));
});

app.get("/readme/", (req, res) => {
  const markdown = readFileSync("README.md", "utf8");
  res.send(renderReadme(renderMarkdown(markdown), { sessionId: req.sessionId, navUnread: totalUnreadCount(req.sessionId) }));
});

app.use((req, res) => {
  res.status(404).send(renderNotFound({ sessionId: req.sessionId, navUnread: totalUnreadCount(req.sessionId) }));
});

// A plain HTTP server underneath Express, so the `ws` upgrade handler can
// share the same port (one Fly machine, one process — see PROCESS.md).
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const boardSubscribers = new Set();
const listingSubscribers = new Map(); // listing id -> Set<{ ws, sessionId, isRunner }>
const meSubscribers = new Map(); // sessionId -> Set<ws>

function broadcastBoard(event) {
  const payload = JSON.stringify(event);
  for (const ws of boardSubscribers) if (ws.readyState === ws.OPEN) ws.send(payload);
}

// Unread counts are pushed, never broadcast: this only ever reaches sockets
// the owning session itself opened (meSubscribers is keyed by that session's
// own cookie, read once at WS connection time) — same boundary PROCESS.md
// already draws for these badges, just delivered live instead of on load.
function pushUnread(sessionId, listingId) {
  const subs = meSubscribers.get(sessionId);
  if (!subs?.size) return;
  const listing = activeListing(listingId);
  if (!listing) return;
  const isRunner = listing.creator_session_id === sessionId;
  const payload = JSON.stringify({
    type: "unread",
    listingId,
    count: unreadCount(listingId, sessionId, isRunner),
    total: totalUnreadCount(sessionId),
  });
  for (const ws of subs) if (ws.readyState === ws.OPEN) ws.send(payload);
}

// `done` reaches every subscriber on the listing; `message` only reaches the
// runner (who sees every thread) and the one requester that thread belongs
// to — this is ADR 0001 enforced on the live channel, not just on page load.
function broadcastListing(listingId, event) {
  const payload = JSON.stringify(event);
  for (const sub of listingSubscribers.get(listingId) ?? []) {
    if (sub.ws.readyState !== sub.ws.OPEN) continue;
    if (event.type === "message" && !sub.isRunner && sub.sessionId !== event.thread) continue;
    sub.ws.send(payload);
  }
}

wss.on("connection", (ws, req) => {
  const sessionId = readCookie(req, "session_id");

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "subscribe" && msg.channel === "board") {
      boardSubscribers.add(ws);
      ws.on("close", () => boardSubscribers.delete(ws));
    } else if (msg.type === "subscribe" && msg.channel === "me") {
      if (!sessionId) return;
      if (!meSubscribers.has(sessionId)) meSubscribers.set(sessionId, new Set());
      meSubscribers.get(sessionId).add(ws);
      ws.on("close", () => meSubscribers.get(sessionId)?.delete(ws));
    } else if (msg.type === "subscribe" && msg.channel === "listing" && Number.isInteger(msg.id)) {
      const listing = activeListing(msg.id);
      // Same relaxation as the GET route: a stranger may watch an active
      // listing (e.g. waiting on their first message's reply); isInvolved
      // only gates it once done. Privacy of other threads is still enforced
      // in broadcastListing by `sub.sessionId`/`sub.isRunner`, not here.
      if (!listing || !sessionId || (listing.done_at && !isInvolved(listing, sessionId))) return;
      const sub = { ws, sessionId, isRunner: listing.creator_session_id === sessionId };
      if (!listingSubscribers.has(msg.id)) listingSubscribers.set(msg.id, new Set());
      listingSubscribers.get(msg.id).add(sub);
      ws.on("close", () => listingSubscribers.get(msg.id)?.delete(sub));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DormRunner listening on 0.0.0.0:${PORT}`);
});
