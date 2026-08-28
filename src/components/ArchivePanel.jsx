import { useMemo, useState } from 'react';

import TagChip from './TagChip.jsx';
import {
  dayNumeral,
  formatDisplayDate,
  formatMonthLabel,
  monthKey,
} from '../lib/date.js';
import { entryText, excerpt } from '../lib/entry.js';
import './ArchivePanel.css';

/** Group entries (already newest first) under their month. */
function groupByMonth(entries) {
  const groups = [];
  const index = new Map();

  entries.forEach((entry) => {
    const key = monthKey(entry.date);
    if (!index.has(key)) {
      const group = { key, label: formatMonthLabel(entry.date), entries: [] };
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).entries.push(entry);
  });

  return groups;
}

function MonthGroup({ group, open, onToggle, openEntryDate, onToggleEntry, onDeleteEntry }) {
  return (
    <div className="month">
      <button
        type="button"
        className="month__header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="month__label">{group.label}</span>
        <span className="month__label month__label--short">
          {group.label.slice(0, 3)}
        </span>
        <span className="month__right">
          <span className="month__count">
            {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
          </span>
          {/* En dash when open, plus when closed. Nothing else. */}
          <span className="month__marker" aria-hidden="true">
            {open ? '–' : '+'}
          </span>
        </span>
      </button>

      {open && (
        <div className="month__items">
          {group.entries.map((entry) => (
            <EntryRow
              key={entry.date}
              entry={entry}
              expanded={openEntryDate === entry.date}
              onToggle={() => onToggleEntry(entry.date)}
              onDelete={() => onDeleteEntry(entry.date)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, expanded, onToggle, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  // Collapsing the row puts the question away with it — a confirmation should
  // never be waiting somewhere the writer has stopped looking.
  if (!expanded && confirming) setConfirming(false);

  return (
    <div className={`entry-row${expanded ? ' entry-row--expanded' : ''}`}>
      <button
        type="button"
        className="entry-row__button"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="entry-row__day">{dayNumeral(entry.date)}</span>
        <span className="entry-row__excerpt">{excerpt(entry)}</span>
      </button>

      {/* The body stays mounted so the height transition has something to
          animate; the fold is what hides it. */}
      <div className={`entry-row__fold${expanded ? ' entry-row__fold--open' : ''}`}>
        <div className="entry-row__fold-inner">
          <div className="entry-row__body">
            {entryText(entry)}
            {entry.tags.length > 0 && (
              <div className="entry-row__tags">
                {entry.tags.map((tag) => (
                  <TagChip key={tag} label={tag} />
                ))}
              </div>
            )}

            {/* Behind a confirmation, in place — a second click, not a modal. */}
            <div className="entry-row__actions">
              {confirming ? (
                <>
                  <span className="entry-row__confirm">Delete this day?</span>
                  <button
                    type="button"
                    className="entry-row__action entry-row__action--destructive"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="entry-row__action"
                    onClick={() => setConfirming(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="entry-row__action"
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ArchivePanel({
  entries,
  todayDate,
  query,
  onQueryChange,
  isMonthOpen,
  onToggleMonth,
  openEntryDate,
  onToggleEntry,
  onDeleteEntry,
}) {
  const groups = useMemo(() => groupByMonth(entries), [entries]);
  const searching = query.trim().length > 0;

  return (
    <aside className="archive">
      <div className="archive__header">
        <div className="archive__today">
          <span className="archive__today-date">{formatDisplayDate(todayDate)}</span>
          <span className="archive__today-state">Today · writing</span>
        </div>

        <div className="archive__section-label">
          {searching ? `${entries.length} found` : 'Archive'}
        </div>

        <div className="archive__search">
          <label className="archive__search-label" htmlFor="archive-search">
            Find
          </label>
          <input
            id="archive-search"
            className="archive__search-input"
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search entries"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="archive__scroll">
        {groups.length === 0 && (
          <div className="archive__empty">
            {searching ? 'Nothing matches.' : 'No entries yet.'}
          </div>
        )}

        {groups.map((group) => (
          <MonthGroup
            key={group.key}
            group={group}
            open={isMonthOpen(group.key)}
            onToggle={() => onToggleMonth(group.key)}
            openEntryDate={openEntryDate}
            onToggleEntry={onToggleEntry}
            onDeleteEntry={onDeleteEntry}
          />
        ))}
      </div>
    </aside>
  );
}
