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
- **Restrained orange.** The theme colour is an accent — buttons, links,
  small highlights — never a background fill or a large block of colour.
- **English only, mobile-first.** UI copy is English; layouts assume a phone
  screen first and scale up, not the other way round.
