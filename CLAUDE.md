# Harness rules for Passing By

These follow from the argument in `README.md`.

- **Identity stays a nickname.** Never add accounts, logins, photos, or ID
  verification anywhere in this app. If a feature seems to need "knowing who
  someone really is", that's a sign to reconsider the feature, not to add
  verification.
- **No ratings or reviews.** Don't add a score, a star, or a review field to
  the schema or the UI.
- **No on-platform payment or tipping.** Don't add a tip amount, a payment
  field, or any integration with a payment provider.
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
- **Restrained orange.** The theme colour is an accent — buttons, links,
  small highlights — never a background fill or a large block of colour.
- **English only, mobile-first.** UI copy is English; layouts assume a phone
  screen first and scale up, not the other way round.
