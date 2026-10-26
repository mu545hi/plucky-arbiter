# plucky-arbiter

A listing-photo review page that runs from GitHub Pages: a static port of
intrepid-tuning's `listing_photos/review_app.py`. You sign in with Google and the page reads and
writes the trip-planning Google Sheet directly from your browser. There's no server.

```
https://mu545hi.github.io/plucky-arbiter/?tab=<workspace tab>
```

The tab name only goes in the link, so bookmark that link. `&region=<District>` picks a region.

## What it reads and writes

| Tab | Who writes it | What it holds |
|---|---|---|
| `<tab>` | the trackers; this page writes `<R> Ranking` and `<R> Photo Review` | listing rows; your `<R> Review` ticks choose what you see ("picks only") |
| `<tab>_PHOTOS` (hidden) | intrepid-tuning `listing_photos/sheet_review.py export` | each listing's photo list, its room class, and reused-photo groups |
| `<tab>_MARKS` (hidden) | this page (append-only) | `Reviewer, Photo Key, Mark, At`; the last row for a photo wins |

The scores are the same as `push_photo_scores.py`'s: liked 3, neutral 5, partial 7, rejected 10. A
rating you typed yourself in `<R> Ranking` is kept, and the photo score goes on a second line as
`photos: N`. They're written about 20 s after your last mark, or right away after a bulk mark or
when nothing is left to review.

Back in intrepid-tuning, `sheet_review.py import --workspace <name>` folds the marks into
`marks.<R>.json` for the compare apps.

## Use

- Keys: `]` / `[` next / previous unreviewed, `→` / `←` photo, `↓` / `↑` listing, `1` like,
  `2` dislike (press again for normal), `⇧2` reject the listing, `0` clear, `B` mark seen photos
  normal, `R` photo view, `M` / `S` random order / reshuffle, `O` open the listing.
- Phone: the bottom bar has like, dislike, next listing and previous / next unreviewed. Swipe left
  or right for the next or previous unreviewed photo. Tap the photo to cycle like → dislike → clear.
  ⓘ shows the listing's details and the filters.
- Your J / T choice is remembered in this browser. Tap the badge to switch reviewer.
- The Google sign-in lasts an hour. Marks you make after it expires are kept in the browser and
  saved once you sign in again.

## Setup (once)

1. **Pages:** repository Settings → Pages → Deploy from a branch → `main`, `/ (root)`.
2. **OAuth client** (the one didactic-parakeet uses): in Google Cloud Console → APIs & Services →
   Credentials, add `https://mu545hi.github.io` to Authorized JavaScript origins and
   `https://mu545hi.github.io/plucky-arbiter/` to Authorized redirect URIs.
3. Each reviewer's Google account needs edit access to the sheet.

To test locally, run `python3 -m http.server 8000` and add `http://localhost:8000` and
`http://localhost:8000/` to the same client.

## Keeping this repo free of personal data

This repo is public. The page holds only code: the sheet ID, the OAuth client ID (neither is a
secret) and the reviewer initials. Listing names, hosts, prices, photo lists, marks and trip dates
stay in the sheet and are loaded at runtime after you sign in. Don't commit exports or snapshots
of the sheet here (`.gitignore` blocks the usual file types).
