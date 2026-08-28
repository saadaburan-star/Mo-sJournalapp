import './TagChip.css';

/**
 * Outline by default, filled navy when active.
 *
 * Rendered as a plain span when there is nothing to click, so a filed tag on a
 * past entry is not announced as a button.
 */
export default function TagChip({ label, active = false, onClick, title }) {
  const className = [
    'tag-chip',
    active ? 'tag-chip--active' : '',
    onClick ? '' : 'tag-chip--static',
  ]
    .filter(Boolean)
    .join(' ');

  if (!onClick) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {label}
    </button>
  );
}
