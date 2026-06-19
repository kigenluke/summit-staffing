/**
 * Uniform display dates as DD/MM/YYYY (Australia-style) across the app.
 */

/** Parse API / Postgres timestamps reliably on Hermes (Android). */
export function parseApiDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  let d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
    Number(m[6] || 0),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateDMY(value) {
  const d = parseApiDate(value);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Parse YYYY-MM-DD at local noon and format as DD/MM/YYYY. */
export function formatYmdToDMY(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return formatDateDMY(d);
}

export function sameLocalCalendarDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

export function formatTime12h(value) {
  const d = parseApiDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** DD/MM/YYYY h:mm AM/PM — avoids US-style locale strings on device. */
export function formatDateTimeDMY(value) {
  const d = parseApiDate(value);
  if (!d) return '';
  const datePart = formatDateDMY(d);
  const timePart = formatTime12h(d);
  return timePart ? `${datePart}, ${timePart}` : datePart;
}
