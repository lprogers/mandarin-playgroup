/**
 * San Francisco Public Library kids' events.
 *
 * Ported from sf-kids-calendar's lib/sources/sfpl.ts (July 2026). Same parsing
 * strategy, remapped to this project's event schema.
 *
 * Source: https://sfpl.org/kids/events — a Drupal views listing.
 *   items_per_page=50, paginated with &page=N
 *
 * No audience filter: this returns kids' events across every age group and
 * every branch, not just the babies/toddlers/preschool subset.
 *
 * Parsing is deliberately selector-light. Drupal theme class names change
 * between deploys, so instead of depending on .views-row we anchor on the one
 * structurally stable thing: event detail links, whose hrefs always match
 * /events/YYYY/MM/DD/slug. From each link we walk up to the enclosing row and
 * pull the time range, branch, and topic tags out of its text.
 *
 * ⚠️ The original was tested against fixture HTML, never against SFPL's live
 * markup — and I can't reach sfpl.org from the build sandbox either. The first
 * real run is the real test. If it returns 0 events the fix is almost certainly
 * one selector tweak in parseListing(), not a rewrite.
 */

import * as cheerio from 'cheerio';

const BASE = 'https://sfpl.org';
const LIST = `${BASE}/kids/events?items_per_page=50`;

const EVENT_HREF = /\/events\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z0-9-]+$/;
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/;

/** Titles that should carry the lantern. Cantonese counts: the lantern marks
 *  Mandarin *or* Chinese cultural, and SFPL runs both. */
const CHINESE = /\b(mandarin|chinese|cantonese|lunar new year|moon festival|mid-autumn)\b/i;

/** SFPL lists times without am/pm. Hours 1–7 are afternoon; 8–12 are morning. */
function to24h(h) {
  return h >= 1 && h <= 7 ? h + 12 : h;
}

/** US DST: second Sunday in March → first Sunday in November. */
function pacificOffset(y, m, d) {
  const secondSunMarch = (() => {
    const f = new Date(Date.UTC(y, 2, 1));
    return 1 + ((7 - f.getUTCDay()) % 7) + 7;
  })();
  const firstSunNov = (() => {
    const f = new Date(Date.UTC(y, 10, 1));
    return 1 + ((7 - f.getUTCDay()) % 7);
  })();
  const after = m > 3 || (m === 3 && d >= secondSunMarch);
  const before = m < 11 || (m === 11 && d < firstSunNov);
  return after && before ? '-07:00' : '-08:00';
}

function iso(y, m, d, hh, mm) {
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}T${p(hh)}:${p(mm)}:00${pacificOffset(y, m, d)}`;
}

/** Parse one listing page. Exported so it can be tested against saved HTML. */
export function parseListing(html, into = []) {
  const $ = cheerio.load(html);
  const seen = new Set(into.map((e) => e.id));

  const anchors = $('a').filter((_, el) => EVENT_HREF.test($(el).attr('href') ?? ''));

  anchors.each((_, el) => {
    const a = $(el);
    const href = a.attr('href');
    const m = href.match(EVENT_HREF);
    if (!m) return;

    const title = a.text().trim();
    if (!title) return; // thumbnail-wrapped duplicate; the titled anchor follows

    const y = +m[1], mo = +m[2], d = +m[3];

    // Walk up until we hit a container that contains a time range.
    let row = a.parent();
    for (let i = 0; i < 6 && !TIME_RANGE.test(row.text()); i++) row = row.parent();
    const t = row.text().match(TIME_RANGE);
    if (!t) return; // no time — not an event row we can trust

    const start = iso(y, mo, d, to24h(+t[1]), +t[2]);
    const end = iso(y, mo, d, to24h(+t[3]), +t[4]);

    const branch = row.find('a[href*="/locations/"]').last().text().trim();
    const topics = row
      .find('a[href*="field_event_topic_target_id"]')
      .map((_, x) => $(x).text().trim())
      .get();

    const id = `sfpl-${href.split('/').pop()}-${start.slice(0, 10)}`;
    if (seen.has(id)) return;
    seen.add(id);

    const haystack = `${title} ${topics.join(' ')}`;

    into.push({
      id,
      kind: 'library',
      title,
      venue: branch ? `${branch} Branch Library` : 'San Francisco Public Library',
      start,
      end,
      url: href.startsWith('http') ? href : BASE + href,
      cultural: CHINESE.test(haystack) ? 'mandarin' : null,
      source: 'sfpl',
    });
  });

  return into;
}

export async function fetchSfplEvents({ log, maxPages = 12 } = {}) {
  const events = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${LIST}&page=${page}`, {
      headers: { 'User-Agent': 'mandarinplaygroup-calendar/1.0 (+https://mandarinplaygroup.com)' },
    });
    if (!res.ok) {
      if (page === 0) throw new Error(`SFPL returned ${res.status}`);
      break; // partial results from earlier pages are still good
    }

    const before = events.length;
    parseListing(await res.text(), events);
    if (events.length === before) break; // empty page — stop paginating
  }

  if (events.length === 0) {
    throw new Error(
      'SFPL returned pages but no events parsed — treat as a parser break, not an empty calendar. ' +
      'Save a page of sfpl.org/kids/events and test parseListing() against it.'
    );
  }

  if (log) {
    const lanterns = events.filter((e) => e.cultural === 'mandarin').length;
    log(`  sfpl: ${events.length} events, ${lanterns} Chinese/Mandarin`);
  }
  return events;
}
