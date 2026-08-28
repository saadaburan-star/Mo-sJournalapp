/* Date helpers.

   ASSUMPTION (Blueprint #7): everything is in the browser's local timezone and
   the day rolls over at local midnight. ISO date strings (YYYY-MM-DD) are the
   entry key, so they are built from local parts — never from toISOString(),
   which would shift the day for anyone west of UTC. */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Local-midnight-safe ISO date string for a Date. */
export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

/** Parse an ISO date as a *local* date, not UTC. */
export function fromISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "28 August" — how the date is written at the top of a notebook page. */
export function formatDisplayDate(iso) {
  const date = fromISODate(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Wednesday" */
export function formatDayOfWeek(iso) {
  return DAYS[fromISODate(iso).getDay()];
}

/** "August 2026" — the archive month header. */
export function formatMonthLabel(iso) {
  const date = fromISODate(iso);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "2026-08" — the key months are grouped and folded by. */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** "28" — the archive row's day numeral. */
export function dayNumeral(iso) {
  return String(fromISODate(iso).getDate());
}
