# Trader's Diary

A local-first daily diary for a trader. Not a trading journal — there is no P&L,
no tickers, no charts, no statistics, and there never will be. One entry per
calendar day, written across as many sittings as it takes.

Built with React + Vite, deployed to Netlify.

---

## What is in this build

- **Pin lock** — 8 to 11 digits, **verified server-side** by a Netlify Function,
  with all of its states: idle, too short, wrong, unlocked, locked out, and
  unreachable.
- **Today / Write** — the primary screen. Opens with the cursor already in the
  writing area, at the end of what is already there. Live word count, a deferred
  metadata row for tags, an explicit save with the sweep confirmation, and a
  quiet debounced autosave.
- **Archive panel** — 328px, recessed, always visible. Today pinned at the top,
  past days grouped under collapsible month headers, any entry expanding in
  place, and live search across entry text and tags.
- **Local persistence** in IndexedDB, behind an isolated storage module.
- **Background sync** to Netlify Blobs through a second Function, so the same
  diary appears on any device behind the same pin. Local-first: the UI never
  calls the network and never waits on it.
- **Delete a past day**, behind a confirmation in the row itself, with the
  deletion syncing to your other devices.
- **Fold the archive away entirely**, so the writing page has the window to
  itself. The `Archive –` / `Archive +` control sits in the footer, and the
  choice is remembered across reloads.
- **Six seeded past entries**, so the archive and search are real on first
  open — with a one-time line offering to remove them all. It appears only
  while samples remain, so it cannot be shown twice.

### Not in this build

Rich text formatting, inline images, and full-width read mode. Deliberate
deferrals — see *Deferred* below.

---

## Running it

```sh
npm install
npx netlify dev    # http://localhost:8888 — Vite AND the functions
npm run build      # production build into dist/
```

Use `npx netlify dev`, not `npm run dev`. The lock is verified by a Function, so
plain Vite leaves `/api/pin` unrouted and the lock screen will correctly report
that it cannot be reached. Create a `.env` first (it is gitignored):

```sh
npm run hash-pin   # prompts for a pin, prints both variables
```

Paste its two lines into `.env` for local work, and into Netlify's environment
variables for the deployed site.

---

## Deploying to Netlify

**1. Choose the pin and generate the secrets.**

```sh
npm run hash-pin
```

It prompts for an 8–11 digit pin and prints two values:

| Variable | What it is |
|---|---|
| `DIARY_PIN_HASH` | scrypt hash of your pin, salted. The pin itself is never stored. |
| `DIARY_TOKEN_SECRET` | random 32 bytes used to sign unlock tokens. |

**2. Put them in Netlify**, under Site configuration → Environment variables.
Never commit them; `.env` is gitignored for exactly this reason.

**3. Deploy.** `netlify.toml` is committed and already correct — build
`npm run build`, publish `dist`, functions in `netlify/functions`. Either connect
the repository in the Netlify UI and accept the detected settings, or:

```sh
npx netlify-cli deploy --build --prod
```

Netlify Blobs needs no setup — the store is created on first write, on the free
tier, under the same site.

**To change the pin later**, run `npm run hash-pin` again and replace
`DIARY_PIN_HASH`. Existing devices stay unlocked, because they hold tokens rather
than the pin. To force every device to re-enter the pin, replace
`DIARY_TOKEN_SECRET` too — that invalidates every token immediately.

---

## How the lock works

The pin is compared **only** in `netlify/functions/pin.mjs`, never in the
browser. There is no local fallback, deliberately: a fallback would quietly
reintroduce the exact weakness the check exists to remove.

- The client posts the pin once and receives a short-lived **signed** token
  (HMAC-SHA256, 30 days). The pin is discarded; the token is what the browser
  keeps, and it is what `/api/sync` requires on every call.
- The pin is stored as a salted **scrypt** hash in `DIARY_PIN_HASH` — never in
  the bundle, never in the repo, never in plain text.
- Failures are **rate-limited per IP**: five wrong attempts locks that address
  out for a minute. Buckets are keyed by a hash of the IP, not the IP.
- Every response takes a **constant ~250ms**, whatever the outcome, so timing
  leaks nothing.
- **No route returns entry content without a valid token**, and the diary
  screen is not mounted until one exists.

An 8–11 digit pin is still a thin gate — it is a private lock, not an
authentication system. Anyone with both the pin and the URL can read the diary.
Do not add analytics, error reporting, or any third-party script to this app.

If a token expires or the secret is rotated mid-session, sync reports a failure
and drops the token; the next load asks for the pin. It deliberately does **not**
yank the screen away from someone mid-sentence — their writing is already safe
locally.

---

## Architecture

```
netlify/
  functions/
    pin.mjs        the lock — scrypt compare, rate limit, signed token
    sync.mjs       the store — manifest, push, pull, all token-gated
  lib/
    pin.mjs        scrypt hashing and constant-time comparison
    token.mjs      HMAC token signing and verification
scripts/
  hash-pin.mjs     `npm run hash-pin`
src/
  storage/         the ONLY code that touches persistence
    db.js          minimal promise wrapper over IndexedDB
    index.js       the narrow interface everything else calls
  lib/
    entry.js       the entry model — days, blocks, tags, word count
    date.js        local-time date helpers
    diary.js       composes storage + model + seed
    pinGate.js     posts the pin to the function, keeps the token
    sync.js        background push/pull/merge — never awaited by the UI
  hooks/
    useDiary.js    all of Today/Write and the archive's state
  components/      ArchivePanel, WritingColumn, TagChip, PrimaryButton
  screens/         LockScreen, Diary
  styles/          tokens.css, base.css, fonts.css
  seed/            the six seeded entries
```

**The storage boundary is the point of the whole build.** Nothing outside
`src/storage/` touches IndexedDB. `src/lib/sync.js` sits alongside it, reading
and writing the same shapes in the background. The UI calls neither the network
nor `fetch` directly, and never awaits a sync: it subscribes to what sync
reports and carries on.

**Sync is two requests per cycle, regardless of diary size.** A `GET` returns a
manifest of `{ date: updatedAt }`; the client diffs it against local and sends
one `POST` carrying only the entries that actually differ, in both directions.
The manifest exists because Netlify Blobs' `list()` returns keys without
metadata — without it, a pull would mean downloading every entry just to compare
timestamps. It is derived data, and the function rebuilds it from the entries if
it is ever missing.

**Conflicts are last-write-wins per entry, by `updatedAt`** — there is exactly
one writer, so that is the whole rule. The one guard: if a remote version
replaces a local one that is *longer*, the local copy is written to a `backups`
store first. Last-write-wins should never mean silently losing writing.

**The samples are removable in one action, once.** The offer to clear them is
rendered only while `sampleCount > 0`, so it disappears with them and never
returns — there is no dismissed-state flag to keep, because the condition is
the diary's own contents.

**Seeded entries never sync.** They are marked `seeded` and stay on the device
that generated them — otherwise two devices first opened on different days would
each contribute their own set of samples to the shared store. Saving an entry
strips the flag, so anything the writer actually touches becomes theirs and
syncs normally. Deleting a seeded entry removes it outright on that device;
there is nothing remote to tell.

**Today's entry is in the archive too**, as soon as it has been saved. The
pinned row at the top of the panel says which day you are on; it is not a record
that the day has been written. Leaving today out of the list meant that on a
diary with no past entries, saving your first entry left the archive reading
"No entries yet." — which reads exactly like the save failing. Delete is not
offered on today's row: the day is still open in the writing surface, so the
next autosave would simply write it back.

**Deleting leaves a tombstone.** A deleted day becomes a `{ date, deleted: true,
updatedAt }` record rather than vanishing, because the deletion is itself a
change that has to reach the other devices. A plain local delete would be undone
by the very next pull. Tombstones are hidden from every part of the UI —
`listEntries()` filters them, and only sync asks for them. A tombstone arriving
from another device backs the local copy up first, under the reason
`deleted-elsewhere`, so a deletion made on one device is still recoverable from
`backups` on the others.

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
| 9 | Sync is Netlify Functions + Netlify Blobs — no third-party database | `netlify/functions/sync.mjs` |
| 10 | The pin is a scrypt hash in an environment variable, compared server-side | `netlify/functions/pin.mjs` |
| 11 | Last write wins per entry by timestamp, with a backup of a longer local copy | `src/lib/sync.js` |

The writing column is 1160px wide — about 107 characters at the 29px writing
size — and it centres itself when the archive is folded, so a wide monitor gets
balanced margins rather than the whole gap piled up on the right. Both come from
`--measure` in `tokens.css`; change that one value to widen or narrow the page.
It is stated in px rather than em because it is used both inside the writing
surface (29px) and on the column around it (16px), where an em would silently
mean two different widths.

Scrollbars are styled to the paper palette — a hairline thumb over a transparent
track, in both the writing surface and the archive. The operating system's
default bar reads as a window dropped onto the page.

The archive panel folds to zero width rather than to the 56px strip — the strip
is still what narrow viewports get, but an explicit fold means the writer wanted
the panel gone, not smaller. While folded it is `inert` and `aria-hidden`, so it
is out of the keyboard order too.

One consequence of assumption 2 is worth knowing: if you edit text from an
earlier sitting, that entry's block boundaries no longer describe the text, so
they collapse into one block keeping the earliest timestamp. Timestamps are quiet
markers; the text itself is never lost on that path.

Entry numbers count what is actually stored — the seeded six are 1 to 6, so the
first day you write is entry 7.

---

## Deferred

Rich text, inline images, full read mode, and export. End-to-end
encryption of synced entries, so the host never sees plaintext, is the most
valuable next step: today Netlify Blobs holds the diary in plain JSON, readable
by anyone with access to the Netlify account.

Permanently out of scope: trade imports, P&L, tickers, charts, win rates,
streaks, reminders, mood analytics, accounts, and anything else that would turn
this into a trading journal.
