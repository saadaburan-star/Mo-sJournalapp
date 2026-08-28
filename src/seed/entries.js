/* Seeded past entries.
 *
 * These exist so the archive, its month folding, and search are real on first
 * open rather than an empty rail. They are written in the reflective voice the
 * product is for — how the day folded, what went through their mind, what to
 * improve — and contain no P&L, tickers, charts, or statistics, because this
 * is a diary and not a trading journal.
 *
 * Dates are offsets from today, so the seeded archive always spans the current
 * month plus older ones no matter when the app is first opened. That is what
 * makes the fold states meaningful: current month open, older months shut.
 */

import { createBlock, createEntry } from '../lib/entry.js';
import { fromISODate, toISODate } from '../lib/date.js';

/** An ISO date `days` before today, in local time. */
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toISODate(date);
}

/** A timestamp at a plausible end-of-session hour on that date. */
function at(iso, hours, minutes) {
  const date = fromISODate(iso);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const DRAFTS = [
  {
    daysAgo: 2,
    tags: ['patience', 'process'],
    sittings: [
      {
        hour: 17,
        minute: 40,
        text: `Slow open, and I let it be slow. That is most of the entry, really.

Spent the first hour marking where the balance sat and doing nothing about it. Two weeks ago that hour would have cost me something — I would have found a reason to be in. Today I made coffee and watched.

The move came late morning, off the area I had drawn before the bell, and I took it small because the context was not clean. Held it. Got out when the momentum thinned rather than when I got scared. That distinction matters and I want it written down while it is fresh: I exited on the market's behaviour, not on mine.

Nothing to fix tonight. Do it again tomorrow.`,
      },
      {
        hour: 21,
        minute: 15,
        text: `Came back to this after dinner. One more thing worth keeping — I did not check the account balance once during the session. Did not even occur to me until now. That is new.`,
      },
    ],
  },
  {
    daysAgo: 5,
    tags: ['tilt', 'revenge', 'rules'],
    sittings: [
      {
        hour: 16,
        minute: 5,
        text: `Bad one. Writing it anyway, maybe especially.

Stopped out twice in the first forty minutes on the same idea. The second stop was fine — the idea was wrong and the market said so plainly. What was not fine was the third entry, which I took about eleven seconds after the second stop, in size, without a level, because I wanted the money back.

I know exactly what that was. I could feel it in my hands. There is a specific hot, narrow attention I get when I am trying to undo something instead of trying to read something. I felt it arrive and I did it anyway.

Closed the platform at eleven. Walked for an hour. Came back to write this rather than to trade.

The rule, and I have made it before: after two stops on one idea I am done with that idea for the session. Not a smaller size. Done. The problem was never the sizing. The problem was that I was still in the argument.`,
      },
    ],
  },
  {
    daysAgo: 9,
    tags: ['hesitation', 'preparation'],
    sittings: [
      {
        hour: 18,
        minute: 20,
        text: `Watched the whole thing happen without me.

The setup I have been waiting weeks for showed up more or less exactly as I described it in here, and I sat on my hands through all of it. Not because of a rule. Because it looked too obvious and I assumed I was missing something.

That is worth sitting with. I have spent months training myself out of impulsive entries, and somewhere in there I have trained myself out of some of the good ones too. Caution and hesitation feel identical from the inside — same stillness, same held breath — and I clearly cannot tell them apart in the moment yet.

What would have helped: writing down beforehand what I would do if it appeared. Not a plan in my head. On paper, before the open, in words. Then the decision would already have been made by someone calmer than whoever was sitting there at twenty to ten.`,
      },
    ],
  },
  {
    daysAgo: 21,
    tags: ['conviction', 'process'],
    sittings: [
      {
        hour: 17,
        minute: 55,
        text: `First clean day in a while, and I want to be careful how I record it, because the temptation is to write it as though I was brilliant.

I was not. I was prepared. I had marked the area the night before, I had written down the condition I needed to see, and when it came I did the thing I had already decided to do. The size was the size I planned. I moved the stop once, for a reason I could say out loud.

The interesting part was the middle of it, which was uncomfortable for twenty minutes or so. I noticed the urge to take a third off just to feel better, and I recognised that as wanting to reduce discomfort rather than wanting to manage risk. Those are different jobs. I left it alone.

Good days are worse teachers than bad ones. The only thing I actually learned is that the preparation is doing the work, and it is boring, and it works.`,
      },
    ],
  },
  {
    daysAgo: 38,
    tags: ['boredom', 'discipline'],
    sittings: [
      {
        hour: 14,
        minute: 30,
        text: `Nothing happened today and I nearly made something happen.

Two hours into a range with no edge in it. I caught myself looking through other markets for something to do — not looking for a setup, looking for a reason. There is a difference and I could feel which one it was.

Boredom is the risk nobody warns you about. Fear and greed get all the attention. Most of the damage I have done to this account has been on flat, uneventful afternoons when I was restless and had a platform open in front of me.

Left at lunch. Logged nothing, because there was nothing to log, which is apparently the hardest possible outcome to accept.`,
      },
    ],
  },
  {
    daysAgo: 52,
    tags: ['drawdown', 'patience'],
    sittings: [
      {
        hour: 20,
        minute: 10,
        text: `Fourth week of this now.

Not blowing up, not tilting, just grinding sideways and slightly down, and the slow version is harder than the sharp version. A bad day you can process. A bad month erodes you — you start doubting the process itself, which is the real danger, because the process is fine.

I went back through the last six weeks tonight properly, not skimming. The execution has been mostly good. The market has been in a regime that does not suit how I read it. Those are two different problems and I have been treating the second as though it were the first, which is how people end up abandoning something that works because it has not worked lately.

So: no changes. Same rules, smaller size until the read comes back. Reduce the cost of being wrong, do not reduce the standard.

Writing that down mostly so I can come back and read it on Thursday when I want to change everything again.`,
      },
    ],
  },
];

/**
 * Build the seeded entries, oldest first, numbered from 1 so that entry
 * numbers describe what is actually stored rather than implying a history the
 * archive cannot show.
 */
export function buildSeedEntries() {
  const ordered = [...DRAFTS].sort((a, b) => b.daysAgo - a.daysAgo);

  return ordered.map((draft, index) => {
    const date = daysAgo(draft.daysAgo);
    const entry = createEntry(date, index + 1);

    entry.blocks = draft.sittings.map((sitting) =>
      createBlock(sitting.text, at(date, sitting.hour, sitting.minute)),
    );
    entry.tags = draft.tags;
    entry.createdAt = entry.blocks[0].startedAt;
    entry.updatedAt = entry.blocks[entry.blocks.length - 1].startedAt;

    return entry;
  });
}
