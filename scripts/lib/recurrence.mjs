/**
 * Expands recurrence rules into dated events.
 *
 * Everything here is pure and deterministic — same inputs, same output, no
 * network. That's deliberate: this is the part that must never break, because
 * it's what keeps the calendar populated when every fetcher is failing.
 */

/** Pacific offset for a given date. US DST: 2nd Sun in March → 1st Sun in Nov. */
export function pacificOffset(y, m, d) {
  const secondSundayMarch = (() => {
    const first = new Date(Date.UTC(y, 2, 1));
    const firstSun = 1 + ((7 - first.getUTCDay()) % 7);
    return firstSun + 7;
  })();
  const firstSundayNov = (() => {
    const first = new Date(Date.UTC(y, 10, 1));
    return 1 + ((7 - first.getUTCDay()) % 7);
  })();

  const afterStart = m > 3 || (m === 3 && d >= secondSundayMarch);
  const beforeEnd = m < 11 || (m === 11 && d < firstSundayNov);
  return afterStart && beforeEnd ? '-07:00' : '-08:00';
}

/** Which occurrence of its weekday a date is within its month (1-5). */
export function nthOfMonth(day) {
  return Math.floor((day - 1) / 7) + 1;
}

function iso(y, m, d, hh, mm) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${p(hh)}:${p(mm)}:00${pacificOffset(y, m, d)}`;
}

function ymd(y, m, d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}${p(m)}${p(d)}`;
}

/**
 * @param {Array} rules  from data/recurring.json
 * @param {Date}  from   first date to generate (inclusive)
 * @param {Date}  to     last date to generate (inclusive)
 */
export function expand(rules, from, to) {
  const out = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const d = cursor.getDate();

    for (const r of rules) {
      if (r.dow !== cursor.getDay()) continue;
      if (r.nth && !r.nth.includes(nthOfMonth(d))) continue;
      if (r.skip && r.skip.includes(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)) continue;
      if (r.until) {
        const [uy, um, ud] = r.until.split('-').map(Number);
        if (cursor > new Date(uy, um - 1, ud)) continue;
      }
      if (r.from) {
        const [fy, fm, fd] = r.from.split('-').map(Number);
        if (cursor < new Date(fy, fm - 1, fd)) continue;
      }

      const [hh, mm] = r.at.split(':').map(Number);
      const endMin = hh * 60 + mm + r.mins;

      out.push({
        id: `${r.id}-${ymd(y, m, d)}`,
        kind: r.kind,
        title: r.title,
        venue: r.venue,
        start: iso(y, m, d, hh, mm),
        end: iso(y, m, d, Math.floor(endMin / 60), endMin % 60),
        url: r.urlPattern ? r.urlPattern.replace('{YMD}', ymd(y, m, d)) : r.url || null,
        cultural: r.cultural || null,
        source: 'recurring',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
