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
  messagesForThread,
  threadsForListing,
} from "./db.js";
import { renderMarkdown } from "./markdown.js";
import {
  doneBannerHtml,
  isValidDeadline,
  listingCardHtml,
  messageHtml,
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
  res.send(renderHome(activeListings(), { sessionId: req.sessionId }));
});

app.get("/my", (req, res) => {
  res.send(renderMyChats({ sessionId: req.sessionId, listings: listingsForSession(req.sessionId) }));
});

app.get("/post", (req, res) => {
  res.send(renderPostForm({ nickname: readCookie(req, "nickname") ?? "" }));
});

app.post("/post", (req, res) => {
  const origin = (req.body.origin ?? "").trim();
  const destination = (req.body.destination ?? "").trim();
  const item = (req.body.item ?? "").trim();
  const nickname = (req.body.nickname ?? "").trim();
  const minutes = Number(req.body.minutes);

  if (!origin || !destination || !item || !nickname || !isValidDeadline(minutes)) {
    res.status(400).send(renderPostForm({ nickname, error: "Fill in every field and pick a deadline." }));
    return;
  }

  const id = createListing({ origin, destination, item, nickname, minutes, creatorSessionId: req.sessionId });
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
  res.send(
    renderListing({
      listing,
      sessionId: req.sessionId,
      isRunner,
      threads,
      nickname: readCookie(req, "nickname") ?? "",
    }),
  );
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

app.get("/readme/", (req, res) => {
  const markdown = readFileSync("README.md", "utf8");
  res.send(renderReadme(renderMarkdown(markdown)));
});

app.use((req, res) => {
  res.status(404).send(renderNotFound());
});

// A plain HTTP server underneath Express, so the `ws` upgrade handler can
// share the same port (one Fly machine, one process — see PROCESS.md).
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const boardSubscribers = new Set();
const listingSubscribers = new Map(); // listing id -> Set<{ ws, sessionId, isRunner }>

function broadcastBoard(event) {
  const payload = JSON.stringify(event);
  for (const ws of boardSubscribers) if (ws.readyState === ws.OPEN) ws.send(payload);
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
  console.log(`Passing By listening on 0.0.0.0:${PORT}`);
});
