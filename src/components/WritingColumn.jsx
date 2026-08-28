import { useEffect, useRef, useState } from 'react';

import PrimaryButton from './PrimaryButton.jsx';
import TagChip from './TagChip.jsx';
import { formatDayOfWeek, formatDisplayDate } from '../lib/date.js';
import { countWords, normaliseTag, wordLabel } from '../lib/entry.js';
import './WritingColumn.css';

export default function WritingColumn({
  date,
  entryNumber,
  text,
  onTextChange,
  tags,
  onAddTag,
  onRemoveTag,
  knownTags,
  saveState,
  onSave,
  offline,
  storageNotice,
  firstRun,
}) {
  const surfaceRef = useRef(null);
  const [draftTag, setDraftTag] = useState('');

  // The cursor is the interface: focus lands in the writing area on load, at
  // the end of existing text. Nothing steals it afterwards.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.focus();
    const end = surface.value.length;
    surface.setSelectionRange(end, end);
  }, []);

  function commitTag() {
    const tag = normaliseTag(draftTag);
    if (tag) onAddTag(tag);
    setDraftTag('');
  }

  function handleTagKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitTag();
      return;
    }
    // Backspace on an empty field removes the last tag — no delete affordance
    // has to exist on the chip itself until one is earned.
    if (event.key === 'Backspace' && !draftTag && tags.length > 0) {
      onRemoveTag(tags[tags.length - 1]);
    }
  }

  const hasText = text.trim().length > 0;
  const words = countWords(text);

  return (
    <main className="writing">
      <header className="writing__header">
        <div>
          <div className="writing__day-of-week">{formatDayOfWeek(date)}</div>
          <h1 className="writing__date">{formatDisplayDate(date)}</h1>
        </div>
        <div className="writing__meta">
          <div>Entry no. {entryNumber}</div>
          <div>One entry per day</div>
        </div>
      </header>

      {/* First run says what this is, once, in one line. It never apologises
          and never upsells. */}
      {firstRun && <div className="writing__first-run">A diary, not a journal.</div>}

      <div className="writing__rule" />

      <div className="writing__surface-wrap">
        <label className="sr-only" htmlFor="writing-surface">
          Today's entry
        </label>
        <textarea
          id="writing-surface"
          ref={surfaceRef}
          className="writing__surface focus-caret-only"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="How did the day fold?"
          spellCheck="true"
        />
      </div>

      {/* Chrome appears only when earned: the metadata row does not exist in
          the DOM until the entry has text to describe. */}
      {hasText && (
        <div className="writing__metadata">
          <div className="writing__metadata-inner">
            <div className="writing__metadata-field">
              <label className="micro-label" htmlFor="tag-input">
                Tags
              </label>
              <div className="writing__tags">
                {/* Outline by default. Filled navy is the active-filter
                    state, and the accent is already spent on Save — it
                    appears at most once or twice per screen. */}
                {tags.map((tag) => (
                  <TagChip
                    key={tag}
                    label={tag}
                    title="Remove tag"
                    onClick={() => onRemoveTag(tag)}
                  />
                ))}
                <input
                  id="tag-input"
                  className="writing__tag-input"
                  list="known-tags"
                  value={draftTag}
                  onChange={(event) => setDraftTag(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTag}
                  placeholder="add a tag"
                  autoComplete="off"
                />
                {/* Autocomplete from tags already used — native, so it adds no
                    permanent chrome of its own. */}
                <datalist id="known-tags">
                  {knownTags.map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Errors are plain sentences in place, never a modal. */}
      {storageNotice && <div className="writing__notice">{storageNotice}</div>}

      <div className="writing__footer">
        <div className="writing__footer-left">
          <div className="writing__word-count">{wordLabel(words)}</div>
          <div
            className={`writing__sweep${saveState !== 'idle' ? ' writing__sweep--out' : ''}`}
          />
        </div>
        <div className="writing__footer-right">
          {offline && (
            <div className="writing__status">Offline — saved on this device.</div>
          )}
          <div
            className={`writing__saved${saveState === 'saved' ? ' writing__saved--visible' : ''}`}
            role="status"
          >
            Saved
          </div>
          <PrimaryButton onClick={onSave}>Save entry</PrimaryButton>
        </div>
      </div>
    </main>
  );
}
