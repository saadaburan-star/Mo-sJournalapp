import ArchivePanel from '../components/ArchivePanel.jsx';
import WritingColumn from '../components/WritingColumn.jsx';
import useDiary from '../hooks/useDiary.js';
import './Diary.css';

export default function Diary() {
  const diary = useDiary();

  // Local reads are instant, so there is no loading state to design — the
  // paper surface simply holds until the first paint has something to show.
  if (!diary.ready) return <div className="diary" />;

  return (
    <div className="diary">
      <ArchivePanel
        entries={diary.visibleEntries}
        todayDate={diary.date}
        query={diary.query}
        onQueryChange={diary.setQuery}
        isMonthOpen={diary.isMonthOpen}
        onToggleMonth={diary.toggleMonth}
        openEntryDate={diary.openEntryDate}
        onToggleEntry={diary.toggleEntry}
      />

      <WritingColumn
        date={diary.date}
        entryNumber={diary.entryNumber}
        text={diary.text}
        onTextChange={diary.changeText}
        tags={diary.tags}
        onAddTag={diary.addTag}
        onRemoveTag={diary.removeTag}
        knownTags={diary.knownTags}
        saveState={diary.saveState}
        onSave={diary.save}
        syncState={diary.syncState}
        storageNotice={diary.storageNotice}
        firstRun={diary.firstRun}
      />
    </div>
  );
}
