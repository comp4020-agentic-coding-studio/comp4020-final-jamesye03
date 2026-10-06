# Harness rules for DormRunner

These follow from the argument in `README.md`.

- **Identity stays a nickname.** Never add accounts, logins, photos, or ID
  verification anywhere in this app. If a feature seems to need "knowing who
  someone really is", that's a sign to reconsider the feature, not to add
  verification.
- **No ratings or reviews.** Don't add a score, a star, or a review field to
  the schema or the UI.
- **No on-platform payment or tipping, with one narrow exception.** A
  listing may carry one optional free-text field — a plain hint like "$5"
  or "a coffee" for what the runner would like to earn, shown before anyone
  messages them. That's the whole exception: it's still not a numeric or
  currency type, nothing validates or computes it as an amount, it's never
  required, and there's no running total, invoice, or integration with a
  payment provider anywhere in the app. Settlement always happens
  off-platform, between the two people, however they want to handle it. If
  a feature needs the app itself to know or move an actual amount of money,
  that's the line this rule still holds — the fee field is a hint for a
  human to read, not a value this app ever reasons about.
- **Expired listings are hidden, not deleted.** A listing that passes its
  deadline stops appearing in queries; its row stays in the database. Never
  write a query, migration, or cleanup job that `DELETE`s a listing for
  having expired.
- **Chat threads are private per requester.** A listing's messages are split
  into one thread per person who messaged the runner. The runner may see
  every thread on their own listing; a requester may only ever see the
  thread they're part of. Never render, query, or broadcast a message to a
  session that isn't the runner and isn't that thread's requester — see
  [`docs/adr/0001-private-threads-per-requester.md`](docs/adr/0001-private-threads-per-requester.md).
- **A "done" listing stays reachable, it doesn't disappear.** Marking a
  listing done removes it from the public board query only. Its page must
  keep working — never 404 or delete the row — for the runner and for
  anyone who already has a thread on it.
- **Restrained orange, with two bounded exceptions.** The theme colour is an
  accent — buttons, links, small highlights — not a background fill or a
  large block of colour. The first exception is the site header: it alone
  may use a solid or gradient accent fill as a single visual anchor repeated
  on every page. The second is the brand mark: one small circular badge, no
  larger than about 110px across, carrying the app's icon on an accent fill
  — the header's own small version of it, plus one larger copy on the
  homepage. Nowhere else changes because of this — cards, form fields,
  buttons, and the page background all stay exactly as restrained as
  before, and neither exception becomes a hero band, a footer, or a banner.
  Don't extend either exception, or add a third, without updating this rule
  first to say so explicitly.
- **English only, mobile-first.** UI copy is English; layouts assume a phone
  screen first and scale up, not the other way round.
