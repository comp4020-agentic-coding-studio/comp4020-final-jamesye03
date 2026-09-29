import express from "express";
import { readFileSync } from "node:fs";
import { activeListing, activeListings, createListing } from "./db.js";
import { renderMarkdown } from "./markdown.js";
import { isValidDeadline, renderHome, renderListing, renderNotFound, renderPostForm, renderReadme } from "./views.js";

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

app.get("/", (req, res) => {
  res.send(renderHome(activeListings()));
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

  createListing({ origin, destination, item, nickname, minutes });
  res.setHeader("Set-Cookie", nicknameCookie(nickname));
  res.redirect("/");
});

app.get("/listings/:id", (req, res) => {
  const listing = activeListing(Number(req.params.id));
  if (!listing) {
    res.status(404).send(renderNotFound());
    return;
  }
  res.send(renderListing(listing));
});

app.get("/readme/", (req, res) => {
  const markdown = readFileSync("README.md", "utf8");
  res.send(renderReadme(renderMarkdown(markdown)));
});

app.use((req, res) => {
  res.status(404).send(renderNotFound());
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Passing By listening on 0.0.0.0:${PORT}`);
});
