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
| `<tab>_PHOTOS` (hidden) | intrepid-tuning `listing_photos/sheet_review.py export` | each listing's photo list, its room class, reused-photo groups and photo-rule flags |
| `<tab>_MARKS` (hidden) | this page (append-only) | `Reviewer, Photo Key, Mark, At`; the last row for a photo wins |
| `<tab>_COMPARE_QUEUE` (hidden) | intrepid-tuning `listing_photos/compare_batch.py` | the current batch of comparison questions, per reviewer: the two options, their rates and prices, the question and its answer buttons; a `status` row per region |
| `<tab>_COMPARE` (hidden) | this page (append-only) | `Reviewer, Question ID, Answer, At`: a button's id, `drop left` / `drop right`, `undo`, or `batch done` (the batch id as the question) |

The scores are the same as `push_photo_scores.py`'s: liked 3, neutral 5, partial 7, rejected 10. A
rating you typed yourself in `<R> Ranking` is kept, and the photo score goes on a second line as
`photos: N`. They're written about 20 s after your last mark, or right away after a bulk mark or
when nothing is left to review.

Back in intrepid-tuning, `sheet_review.py import --workspace <name>` folds the marks into
`marks.<R>.json` for the compare apps.

## Adhoc mode

A read-only look at the rows ticked **"<R> Adhoc"** (it replaces intrepid-tuning's Mac-only
`adhoc_app.py`). **Adhoc** in the header switches to it, or bookmark:

```
https://mu545hi.github.io/plucky-arbiter/?tab=<workspace tab>&adhoc=1
https://mu545hi.github.io/plucky-arbiter/?tab=<workspace tab>&adhoc=1&order=Est.+Commute+(min)&desc=1
```

One listing at a time, in the order of a sheet column: `<R> Rate Rank` by default, lowest first, blanks
last (a cell's first line, by its leading number). `&order=<column>` or the picker under ⓘ picks
another column, and ↑ / ↓ reverses it (`&desc=1`). A Booking room's rate rows share its photos, so a
room shows once, at its best-ordered rate; a picture repeated across a hotel's room types shows
under the first of them. Each listing shows its name (a link), site, room, price per night and rate,
`<R> Tier` / `Rate Rank` / `Value` / `Surplus`, `Est. Commute (min)` and `Commute Station`, Review
Flags, a Deal Scan and the photo-rule ⚑ flags. Ticked rows whose listing has no photos in
`<tab>_PHOTOS` yet are listed under the details (fetch them with `fetch_photos.py`, then
`sheet_review.py export`).

Nothing is marked or written to the sheet. Swipe left / right or `←` `→` between a listing's photos,
up / down or `↑` `↓` between listings; tap the left / right third for the previous / next photo, the
middle's upper / lower half for the previous / next listing; the filmstrip, the photo views (`R`) and
the region menu work as in the review. ↻ sheet re-reads ticks and ranks. Like compare mode, it's
only in the address: a plain review link still opens the review.

## Compare mode

The price-aware shortlist's questions (intrepid-tuning's `compare_app_v2.py`, which this replaces)
are asked here, in batches. **Compare** in the header switches to them (bookmark `&compare=1`):

```
https://mu545hi.github.io/plucky-arbiter/?tab=<workspace tab>&compare=1
```

Each question shows both options side by side: a photo (tap to enlarge, swipe there), the strip of
their photos (liked first; a picture repeated across a hotel's room types shows once) and the
listing details. Tier questions hide the prices (tap "show" for one). Answer with the buttons at the
bottom or keys `1`–`3` (tiers) / `1`–`5` (value); `⇧←` / `⇧→` or ✗ drop takes an option out of the
ranking (its other questions in the batch are skipped); `U` takes back your last answer in this
batch. Answers are saved as you go, so a reload (or another device) resumes at the first open
question.

There's no ranking maths in the page. When the batch is used up it says **Batch done: ranking runs
next** and shows the ranking columns as they stand (`<R> Tier`, `<R> Rate Rank`, `<R> Value`,
`<R> Surplus`). Then `compare_batch.py --workspace <name> --reviewer <R>` (from a cloud session: "J
finished a batch") imports the answers, re-ranks and writes the next batch; press ↻ sheet to load it.
**Batch done** leaves a flag that `compare_batch.py --if-done` looks for, for a scheduled run.

## Deal review

intrepid-tuning's `listing_photos/deal_scan.py` writes a **Deal Scan** cell ("2026-11-01: Late Escape
Deal -15%") on the rows of last-minute deals. Open the tab with `&deals=<date>` to review just the
deals a scan found on or after that date (the **new deals** checkbox; without a date it means the
latest scan):

```
https://mu545hi.github.io/plucky-arbiter/?tab=<workspace tab>&deals=2026-11-01
```

The listing details show the Deal Scan and **Review Flags** cells (`deal_reviews.py` writes the
latter for deals: "45 reviews · bugs 5, dirty 3"). Photos a photo rule flags (`run_rule.py`, e.g.
toilet and shower not separated) carry a ⚑ badge with the model's answer, and the **Flagged by a
photo rule** view shows only those. Dislike (2) accepts a flag; like or seen overrules it.
`sheet_review.py import` turns those marks into the rule's decisions.

Tabs without "<R> Review" ticks (older workspaces) hide "picks only". Where the tab has a bare
"Photo Review" column instead of "J Photo Review", J's notes go there.

## Use

- Keys: `]` / `[` next / previous unreviewed, `→` / `←` photo, `↓` / `↑` listing, `1` like,
  `2` dislike (press again for normal), `⇧2` reject the listing, `0` clear, `B` mark seen photos
  normal, `R` photo view, `M` / `S` random order / reshuffle, `O` open the listing.
- Phone: the bottom bar has like, dislike, next listing and previous / next unreviewed. On the photo:
  - one finger, swipe left / right or tap the right / left third: next / previous unreviewed (`]` / `[`)
  - two fingers, the same: next / previous photo (`→` / `←`); two fingers up / down: listing (`↓` / `↑`)
  - one-finger tap in the middle third: cycle like → dislike → clear
  - **?** (button or key) shows all the controls
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

`node tests/adhoc_page.test.mjs` checks adhoc mode the same way (order, `&order=`, room dedupe, copy
groups, touch, and that it sends nothing to the sheet).
`node tests/compare_page.test.mjs` checks compare mode on a phone viewport against a mocked Sheets
API (needs the `playwright` package and its Chromium; screenshots go to `tests/shots/`, gitignored).
`tests/fixture.mjs` holds made-up listings; its queue rows were generated with intrepid-tuning's
`compare_batch.plan()`, so they're in the format that script writes.

## Keeping this repo free of personal data

This repo is public. The page holds only code: the sheet ID, the OAuth client ID (neither is a
secret) and the reviewer initials. Listing names, hosts, prices, photo lists, marks and trip dates
stay in the sheet and are loaded at runtime after you sign in. Don't commit exports or snapshots
of the sheet here (`.gitignore` blocks the usual file types).
