/* The entry model.

   An entry is one calendar day. It holds BLOCKS — a block is a stretch of
   writing added in one sitting, with its own timestamp, so a day written in
   three passes reads in order.

   Content is stored as structured data, never as an HTML string. That is what
   lets rich text, inline images, export, and print land later without a data
   migration: today a block holds `text`, tomorrow it can hold nodes. */

import { todayISO } from './date.js';

/** Blocks read seamlessly; a blank line is all that separates two sittings. */
export const BLOCK_SEPARATOR = '\n\n';

let idCounter = 0;

function makeId() {
  idCounter += 1;
  return `b${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function createBlock(text = '', startedAt = new Date().toISOString()) {
  return { id: makeId(), startedAt, text };
}

export function createEntry(date = todayISO(), entryNumber = 1) {
  const now = new Date().toISOString();
  return {
    date,
    entryNumber,
    blocks: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Defensive shape-fill, so a record written by an older build still loads. */
export function normaliseEntry(raw) {
  return {
    date: raw.date,
    entryNumber: typeof raw.entryNumber === 'number' ? raw.entryNumber : 1,
    blocks: Array.isArray(raw.blocks)
      ? raw.blocks.map((block) => ({
          id: block.id || makeId(),
          startedAt: block.startedAt || raw.createdAt || new Date().toISOString(),
          text: typeof block.text === 'string' ? block.text : '',
        }))
      : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === 'string') : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    // Scaffolding, not the writer's work. Seeded entries stay on the device
    // that generated them — see sync.js. The flag is dropped the moment the
    // writer saves the entry themselves.
    ...(raw.seeded ? { seeded: true } : {}),
    // A deleted day leaves a tombstone rather than vanishing, so that the
    // deletion itself syncs. Without one, the next pull from another device
    // would simply put the entry back.
    ...(raw.deleted ? { deleted: true } : {}),
  };
}

/** A record of a day that was deleted, not a day that was written. */
export function isTombstone(entry) {
  return entry.deleted === true;
}

/** Replace an entry with the marker of its deletion, keeping its identity. */
export function tombstoneFor(entry) {
  return {
    date: entry.date,
    entryNumber: entry.entryNumber,
    blocks: [],
    tags: [],
    createdAt: entry.createdAt,
    updatedAt: new Date().toISOString(),
    deleted: true,
  };
}

/** The whole day as one piece of prose — what the writing surface shows. */
export function entryText(entry) {
  return entry.blocks.map((block) => block.text).join(BLOCK_SEPARATOR);
}

/**
 * Fold the writing surface's text back into blocks.
 *
 * ASSUMPTION (Blueprint #2): a later sitting appends a new timestamped block
 * rather than growing the previous one. `sittingBlockId` is the block this
 * sitting owns; everything before it is earlier sittings, left untouched.
 *
 * If the writer edits earlier text (past entries are editable — nothing is
 * locked, Blueprint #3), the earlier block boundaries no longer describe the
 * text, so they are merged into one block that keeps the earliest timestamp.
 * Timestamps are quiet markers; text is the thing that must never be lost, and
 * on this path none is.
 */
export function applyText(entry, fullText, sittingBlockId) {
  const activeIndex = entry.blocks.findIndex((block) => block.id === sittingBlockId);
  const priorBlocks = activeIndex === -1 ? entry.blocks : entry.blocks.slice(0, activeIndex);
  const activeBlock =
    activeIndex === -1 ? createBlock('') : entry.blocks[activeIndex];
  const prior = priorBlocks.map((block) => block.text).join(BLOCK_SEPARATOR);

  let blocks;
  let activeId = activeBlock.id;

  if (!prior) {
    blocks = [{ ...activeBlock, text: fullText }];
  } else if (fullText.startsWith(prior + BLOCK_SEPARATOR)) {
    const tail = fullText.slice(prior.length + BLOCK_SEPARATOR.length);
    blocks = [...priorBlocks, { ...activeBlock, text: tail }];
  } else if (fullText === prior) {
    // This sitting's text was deleted back to nothing; keep the empty block
    // so the sitting still has an identity to write into.
    blocks = [...priorBlocks, { ...activeBlock, text: '' }];
  } else {
    // Earlier text was edited — collapse to a single block.
    const earliest = priorBlocks[0]?.startedAt || activeBlock.startedAt;
    blocks = [{ id: activeBlock.id, startedAt: earliest, text: fullText }];
    activeId = activeBlock.id;
  }

  return {
    entry: { ...entry, blocks, updatedAt: new Date().toISOString() },
    sittingBlockId: activeId,
  };
}

/**
 * Open a fresh block for a new sitting, if the day already has writing in it.
 * Returns the entry unchanged (and the existing block's id) when the day is
 * still empty — a blank day does not need two blocks to hold nothing.
 */
export function beginSitting(entry) {
  const last = entry.blocks[entry.blocks.length - 1];

  if (!last) {
    const block = createBlock('');
    return { entry: { ...entry, blocks: [block] }, sittingBlockId: block.id };
  }

  if (!last.text.trim()) {
    return { entry, sittingBlockId: last.id };
  }

  const block = createBlock('');
  return { entry: { ...entry, blocks: [...entry.blocks, block] }, sittingBlockId: block.id };
}

export function hasWriting(entry) {
  return entryText(entry).trim().length > 0;
}

/** Live word count. Format: "1 word" / "248 words". */
export function countWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function wordLabel(count) {
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

/** One line of the entry, for the archive row. */
export function excerpt(entry) {
  return entryText(entry).replace(/\s+/g, ' ').trim();
}

/** Every tag ever used, for autocomplete. */
export function collectTags(entries) {
  const seen = new Set();
  entries.forEach((entry) => entry.tags.forEach((tag) => seen.add(tag)));
  return [...seen].sort();
}

/** Freeform tags, created as typed — normalised only enough to dedupe. */
export function normaliseTag(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
