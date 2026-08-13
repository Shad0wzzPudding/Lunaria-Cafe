/**
 * CSV export — the one place a table becomes a downloadable file.
 *
 * Two hazards this exists to handle, both easy to get wrong inline:
 *
 * 1. Quoting (RFC 4180). A value containing a comma, a quote or a
 *    newline must be wrapped in quotes with its own quotes doubled.
 *    Classroom names and display names are free text, so all three
 *    turn up in practice.
 *
 * 2. Formula injection. A cell beginning = + - @ is executed as a
 *    formula by Excel and Sheets. This is NOT theoretical here:
 *    students set their own display_name through the rename RPC, so
 *    that column is attacker-controlled text landing in a file an
 *    instructor opens on their own machine. Every exported value is
 *    neutralised with a leading apostrophe, which spreadsheets strip
 *    on display — the name still READS correctly, it just can't run.
 */

// Leading whitespace counts: " =1+1" is still parsed as a formula
// once the sheet trims it, so test the trimmed value.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_LEAD.test(text.trim())) text = `'${text}`;
  // Quote only when needed — an unquoted file is far easier to eyeball.
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/**
 * Build CSV text.
 *
 * @param columns [{ key, label }] — order and headers of the output.
 *   `key` may also be a function (row) => value, for derived columns.
 * @param rows    the data, one object per line.
 */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = (rows ?? []).map((row) =>
    columns
      .map((c) => escapeCell(typeof c.key === 'function' ? c.key(row) : row[c.key]))
      .join(','),
  );
  // CRLF per RFC 4180 — Excel on Windows is the likeliest destination.
  return [header, ...body].join('\r\n');
}

// Characters filesystems genuinely object to: path separators and the
// Windows-reserved set. Deliberately NOT a whitelist — see slugify.
const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|]/g;
// Whitespace and punctuation that reads as a word separator.
const SEPARATORS = /[\s,;–—]+/g;

/**
 * Filesystem-safe slug for the filename half we build from user text.
 *
 * Strips only what filesystems object to — it does NOT reduce to ASCII.
 * An [^a-z0-9] filter looks safe but erases any wholly non-Latin name,
 * and this project is used in Thai: every Thai-named classroom would
 * collapse to the same fallback and quietly overwrite the previous
 * export in the downloads folder. Modern filesystems take UTF-8 names.
 */
export function slugify(text, fallback = 'export') {
  const slug = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(ILLEGAL_IN_FILENAME, '')
    .replace(SEPARATORS, '-')
    .replace(/-{2,}/g, '-')
    // Leading dots make hidden files; trailing dots and hyphens break
    // on Windows.
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 40);
  return slug || fallback;
}

/** YYYY-MM-DD in local time, for filenames that sort chronologically. */
export function fileDateStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// U+FEFF. Written as an escape rather than pasted literally so it stays
// visible to anyone reading this file.
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Trigger a download of `text` as `filename`. */
export function downloadCsv(filename, text) {
  // The BOM is what makes Excel read the file as UTF-8; without it,
  // non-ASCII display names (Thai, here) arrive as mojibake.
  const blob = new Blob([UTF8_BOM, text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers;
  // one frame is enough for the click to have been consumed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
