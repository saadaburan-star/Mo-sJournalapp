# Trader's Diary

A local-first daily diary for a trader. Not a trading journal — there is no P&L,
no tickers, no charts, no statistics, and there never will be. One entry per
calendar day, written across as many sittings as it takes.

Built with React + Vite, deployed to Netlify.

---

## Phase 1 — what is in this build

- **Pin lock** — 8 to 11 digits, with all of its states: idle, too short, wrong,
  unlocked, and locked out after five failures.
- **Today / Write** — the primary screen. Opens with the cursor already in the
  writing area, at the end of what is already there. Live word count, a deferred
  metadata row for tags, an explicit save with the sweep confirmation, and a
  quiet debounced autosave.
- **Archive panel** — 328px, recessed, always visible. Today pinned at the top,
  past days grouped under collapsible month headers, any entry expanding in
  place, and live search across entry text and tags.
- **Local persistence** in IndexedDB, behind an isolated storage module.
- **Six seeded past entries**, so the archive and search are real on first open.

### Not in this build

Sync, the Netlify Functions, and Netlify Blobs. Rich text formatting, inline
images, full-width read mode, and entry deletion. All are deliberate deferrals,
not oversights — see *Deferred* below.

---

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Deploying to Netlify

`netlify.toml` is committed and already correct — build `npm run build`, publish
`dist`, with an SPA redirect. Either connect the repository in the Netlify UI and
accept the detected settings, or:

```sh
npx netlify-cli deploy --build --prod
```

No environment variables are needed yet. The one that will be needed when sync
lands is described below.

---

## ⚠️ The pin is not security yet

**Read this before putting the app on a public URL.**

The design handoff is emphatic, and correct: *a pin compared in front-end
JavaScript is no lock at all.* The real check belongs in a Netlify Function that
holds a bcrypt or scrypt hash in an environment variable, rate-limits failures
per IP, adds a constant delay, and returns a short-lived **signed** token.

Sync is deferred, so that function does not exist yet. What ships here is the
same interface — `src/lib/pinGate.js` — backed locally, so that every state of
the lock screen is real and exercisable now, and so that swapping in the function
later means replacing two calls with `fetch()` and changing nothing else.

Until then this gate stops someone glancing at your screen. It does not stop
anyone willing to open devtools. **Do not deploy this to a public URL expecting
the diary to be private.** Keep it local, or wait for the sync phase.

When that phase lands: the pin hash goes in a Netlify environment variable, read
only by the function. Never hardcoded, never in the front-end bundle, never
committed.

---

## Architecture

```
src/
  storage/         the ONLY code that touches persistence
    db.js          minimal promise wrapper over IndexedDB
    index.js       the narrow interface everything else calls
  lib/
    entry.js       the entry model — days, blocks, tags, word count
    date.js        local-time date helpers
    diary.js       composes storage + model + seed
    pinGate.js     the gate (see the warning above)
  hooks/
    useDiary.js    all of Today/Write and the archive's state
  components/      ArchivePanel, WritingColumn, TagChip, PrimaryButton
  screens/         LockScreen, Diary
  styles/          tokens.css, base.css, fonts.css
  seed/            the six seeded entries
```

**The storage boundary is the point of the whole build.** Nothing outside
`src/storage/` touches IndexedDB. The backing store can later become an encrypted
store, a different host, or a desktop filesystem without a single screen
changing. A sync module will sit alongside it, reading and writing the same
shapes, in the background — the UI will never call the network or await it.

**Entry content is structured data, not HTML strings.** A day holds blocks; a
block holds text and the timestamp of the sitting that produced it. That is what
lets rich text, images, export, and print land later without a data migration.

**Search is a function over entries.** It can become an index later without
changing any of its callers.

---

## Design

Rebuilt to the handoff's specification — colours, type, spacing, texture, and
motion. Every value lives in `src/styles/tokens.css`; nothing else in the app
hardcodes a colour, size, or duration.

Both fonts (Archivo Narrow, Patrick Hand) are **self-hosted** in `public/fonts`
as woff2, latin and latin-ext subsets, under the SIL Open Font License. The app
makes no third-party network request at runtime — no analytics, no error
reporting, no scripts of any kind.

The paper texture is built entirely in CSS. There are no image assets in this
project at all; the fold marker is a typographic `–` / `+`.

### Three places this build departs from the prototype

The handoff README states that where it and the prototype disagree, the README
wins. Three cases came up:

1. **No mood row.** The prototype's metadata row carries mood chips, but the
   README's component table lists tags only, and the Blueprint defers mood
   tracking. The metadata row is tags.
2. **No window title bar.** The prototype's 38px chrome bar and its three dots
   are framing for the artboard; the README says to drop it, and that the 9px
   dots do not ship.
3. **Tag chips are outline, not filled.** Filled navy is the *active* state, and
   the accent is already spent once on the save button — it appears at most once
   or twice per screen.

---

## Assumptions flagged in the code

Each is marked at the line where it matters, and each is listed in the
Blueprint's Assumptions section.

| # | Assumption | Where |
|---|---|---|
| 1 | IndexedDB rather than localStorage, because images will exceed the quota | `src/storage/index.js` |
| 2 | A later sitting appends a new timestamped block | `src/lib/entry.js` — `applyText` |
| 3 | Past entries are editable; nothing is locked | `src/lib/entry.js` — `applyText` |
| 4 | Current month unfolded, older months folded; search overrides folding | `src/hooks/useDiary.js` |
| 5 | Freeform tags, autocompleted from tags already used | `src/components/WritingColumn.jsx` |
| 7 | Local timezone; the day rolls at local midnight | `src/lib/date.js` |
| 8 | Designed for 1280px and up; below 1024px the panel becomes a 56px strip | `src/components/ArchivePanel.css` |

One consequence of assumption 2 is worth knowing: if you edit text from an
earlier sitting, that entry's block boundaries no longer describe the text, so
they collapse into one block keeping the earliest timestamp. Timestamps are quiet
markers; the text itself is never lost on that path.

Entry numbers count what is actually stored — the seeded six are 1 to 6, so the
first day you write is entry 7.

---

## Deferred

Sync (Netlify Functions + Netlify Blobs, last-write-wins per entry by
last-edited timestamp), the real server-side pin check, rich text, inline images,
full read mode, delete, and export.

Permanently out of scope: trade imports, P&L, tickers, charts, win rates,
streaks, reminders, mood analytics, accounts, and anything else that would turn
this into a trading journal.
