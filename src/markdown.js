import { marked } from "marked";

// README.md links images/docs relative to the repo root, the way GitHub
// resolves them. Served at /readme/, a relative path would resolve under
// that path instead, so anything that isn't already absolute, rooted, or an
// anchor gets rooted here.
function absolutize(href) {
  if (!href) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href; // has a scheme (http:, mailto:, ...)
  if (href.startsWith("//") || href.startsWith("/") || href.startsWith("#")) return href;
  return `/${href}`;
}

const renderer = new marked.Renderer();
const baseLink = renderer.link.bind(renderer);
const baseImage = renderer.image.bind(renderer);
renderer.link = (token) => baseLink({ ...token, href: absolutize(token.href) });
renderer.image = (token) => baseImage({ ...token, href: absolutize(token.href) });

export function renderMarkdown(md) {
  return marked.parse(md, { renderer });
}
