/**
 * Pre-renders events into calendar.html so search engines see real text.
 *
 * Why this exists: the calendar builds itself from events.json in the browser.
 * Google can run JavaScript, but it does so on a slower, less reliable second
 * pass — so a JS-only calendar often gets indexed as an empty grid. This writes
 * the same events into the HTML at build time. The page ships with content;
 * the script then takes over for week navigation.
 *
 * It replaces the contents between marker comments, so calendar.html stays a
 * normal file you can hand-edit everywhere else.
 */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Local wall-clock parts from an ISO string with an explicit offset. */
function parts(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return { y: +m[1], mo: +m[2], d: +m[3], hh: +m[4], mm: +m[5] };
}

function clock(iso) {
  const { hh, mm } = parts(iso);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}

function dayKey(iso) {
  const { y, mo, d } = parts(iso);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A readable list of the next `days` days of events. This is the crawlable
 * content — plain headings and paragraphs, no grid, no JS. Visually hidden
 * once the script boots, because the interactive grid replaces it.
 */
export function renderList(events, today, days = 21) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const todayKey = today.toISOString().slice(0, 10);

  const upcoming = events
    .filter((e) => dayKey(e.start) >= todayKey && dayKey(e.start) <= cutoffKey)
    .sort((a, b) => a.start.localeCompare(b.start));

  const byDay = new Map();
  for (const e of upcoming) {
    const k = dayKey(e.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }

  const out = [];
  for (const [key, list] of byDay) {
    const [y, mo, d] = key.split('-').map(Number);
    const dow = new Date(y, mo - 1, d).getDay();
    out.push(`  <h3 class="mpgcal-lday">${LONG[dow]}, ${MON[mo - 1]} ${d}</h3>`);
    out.push('  <ul class="mpgcal-llist">');
    for (const e of list) {
      const when = `${clock(e.start)}${e.end ? `–${clock(e.end)}` : ''}`;
      const name = e.url
        ? `<a href="${esc(e.url)}" rel="noopener">${esc(e.title)}</a>`
        : esc(e.title);
      const lantern = e.cultural === 'mandarin'
        ? ' <img class="mpgcal-lantern-inline" src="/lantern.png" alt="Mandarin or Chinese cultural event" width="10" height="17">'
        : '';
      out.push(`    <li><strong>${when}</strong> — ${name}${lantern}<span class="mpgcal-lvenue">${esc(e.venue)}</span></li>`);
    }
    out.push('  </ul>');
  }
  return out.join('\n');
}

/** schema.org Event objects — what makes the page eligible for event rich results. */
export function renderJsonLd(events, today, days = 60) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const todayKey = today.toISOString().slice(0, 10);

  const items = events
    .filter((e) => dayKey(e.start) >= todayKey && dayKey(e.start) <= cutoffKey)
    .map((e) => {
      const o = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: e.title,
        startDate: e.start,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: e.venue,
          address: { '@type': 'PostalAddress', addressLocality: 'San Francisco', addressRegion: 'CA', addressCountry: 'US' },
        },
      };
      if (e.end) o.endDate = e.end;
      if (e.url) o.url = e.url;
      // Only playgroups are ours to describe and price. Everything else we
      // merely list — asserting "free" for a venue we don't run would be a
      // claim we can't stand behind, and swim sessions charge admission.
      if (e.kind === 'playgroup') {
        o.organizer = { '@type': 'Organization', name: 'Mandarin Playgroup', url: 'https://mandarinplaygroup.com/' };
        o.isAccessibleForFree = true;
        o.offers = {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: e.url,
          validFrom: new Date(today).toISOString(),
        };
        o.description = 'A free, parent-led Mandarin playgroup at a San Francisco playground. Kids hear and speak Mandarin with other children. No Mandarin fluency required.';
      }
      return o;
    });

  return JSON.stringify(items, null, 2);
}

/** Replace the contents between <!-- NAME:START --> and <!-- NAME:END -->. */
export function injectBetween(html, name, replacement) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(html)) throw new Error(`Marker ${name}:START/END not found in calendar.html`);
  return html.replace(re, `$1\n${replacement}\n$2`);
}
