/**
 * Reads upcoming playgroups from the Partiful profile feed.
 *
 * ⚠️ UNVERIFIED. Partiful publishes no public API and I could not inspect a
 * live response while writing this. The parser below assumes the profile page
 * is server-rendered Next.js and walks __NEXT_DATA__ looking for objects that
 * have both a title and a start time. That's a reasonable guess, not a
 * confirmed contract.
 *
 * Before trusting it: run `node scripts/generate-events.mjs --dry-run` and
 * check the playgroup count. If it returns 0, the page is probably client-
 * rendered and this approach can't work without a headless browser — in that
 * case set PARTIFUL_MODE=manual and maintain data/playgroups.json instead.
 *
 * Because this is unverified, a zero result is treated as a FAILURE, not as
 * "no events". That distinction is what stops a silent parser break from
 * quietly deleting your playgroups from the calendar.
 */

const PROFILE = 'https://partiful.com/u/BCH0Gh6wfh6F5lJGQj3A';

/** Walk a nested object, collecting anything that smells like an event. */
function harvest(node, found = [], depth = 0) {
  if (depth > 12 || node === null || typeof node !== 'object') return found;

  if (Array.isArray(node)) {
    for (const item of node) harvest(item, found, depth + 1);
    return found;
  }

  const title = node.title ?? node.name ?? node.eventName;
  const start = node.startDate ?? node.startTime ?? node.start ?? node.startsAt;
  const id = node.id ?? node.eventId ?? node.slug;

  if (typeof title === 'string' && start != null && typeof id === 'string') {
    found.push({ rawTitle: title, rawStart: start, rawEnd: node.endDate ?? node.endTime ?? node.end ?? null, id });
  }

  for (const v of Object.values(node)) harvest(v, found, depth + 1);
  return found;
}

/** US DST: second Sunday in March → first Sunday in November. */
function pacificOffsetHours(y, m, d) {
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
  return after && before ? -7 : -8;
}

/**
 * Every other source in this project writes ISO strings with an explicit
 * Pacific offset (recurring.mjs, sfpl.mjs, data/playgroups.json) — the
 * calendar's day-grouping and time-of-day rendering read those digits
 * directly as local wall-clock time. `Date#toISOString()` returns UTC
 * instead, which silently shifted every Partiful-sourced playgroup onto the
 * wrong day or time once this fetcher started succeeding for real. Convert
 * to the same Pacific-offset format everything else uses.
 */
function toPacificIso(date) {
  if (!date || isNaN(date)) return null;
  const offsetHours = pacificOffsetHours(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const local = new Date(date.getTime() + offsetHours * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  const offStr = offsetHours === -7 ? '-07:00' : '-08:00';
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}${offStr}`;
}

function toIso(value) {
  // Partiful may hand back epoch seconds, epoch millis, or an ISO string.
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    return toPacificIso(new Date(ms));
  }
  if (typeof value === 'object' && value && '_seconds' in value) {
    return toPacificIso(new Date(value._seconds * 1000));
  }
  if (typeof value === 'string') {
    return toPacificIso(new Date(value));
  }
  return null;
}

/**
 * Partiful event titles are hand-typed per event and inconsistent — "Mandarin
 * Playgroup - X (Y)", "Mandarin Playgroup (San Francisco)- Y", "Mandarin
 * Playgroup - Y" all show up. Strip the group-name prefix that's redundant
 * with the "title" field anyway, and where the remainder is "Neighborhood
 * (Venue)" flip it to "Venue · Neighborhood" to match the site's usual venue
 * format. Never invents a neighborhood that isn't already in the title.
 */
function cleanVenue(rawTitle) {
  const stripped = rawTitle
    .replace(/^mandarin playgroup\s*\(san francisco\)\s*-?\s*/i, '')
    .replace(/^mandarin playgroup\s*-\s*/i, '')
    .trim();
  const m = stripped.match(/^(.+?)\s*\((.+)\)$/);
  return m ? `${m[2]} · ${m[1]}` : stripped;
}

async function fetchProfileData() {
  const res = await fetch(PROFILE, {
    headers: { 'User-Agent': 'mandarinplaygroup-calendar/1.0 (+https://mandarinplaygroup.com)' },
  });
  if (!res.ok) throw new Error(`Partiful profile returned ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(
      'No __NEXT_DATA__ block found. The profile page is likely client-rendered — ' +
      'set PARTIFUL_MODE=manual and use data/playgroups.json.'
    );
  }
  return JSON.parse(match[1]);
}

export async function fetchPlaygroups({ log }) {
  const data = await fetchProfileData();
  const raw = harvest(data);
  log(`  partiful: ${raw.length} candidate objects in __NEXT_DATA__`);

  const now = Date.now();
  const seen = new Set();
  const events = [];

  for (const r of raw) {
    const startIso = toIso(r.rawStart);
    if (!startIso) continue;
    if (new Date(startIso).getTime() < now - 86400000) continue; // drop past events
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    events.push({
      id: `mpg-partiful-${r.id}`,
      kind: 'playgroup',
      title: 'Mandarin Playgroup',
      venue: cleanVenue(r.rawTitle),
      start: startIso,
      end: toIso(r.rawEnd),
      url: `https://partiful.com/e/${r.id}`,
      cultural: 'mandarin',
      source: 'partiful',
    });
  }

  if (events.length === 0) {
    throw new Error('Parsed __NEXT_DATA__ but found no upcoming events — treating as a parser break, not an empty calendar.');
  }
  return events;
}

/**
 * For the homepage's "See past playdates" history, not the calendar — so
 * unlike fetchPlaygroups() a zero result here is just "no history yet," not
 * a failure worth quarantining the whole run over. Same profile page: the
 * "Past Events" section Partiful renders is server-rendered into the same
 * __NEXT_DATA__ blob as upcoming events, just with dates behind `now`.
 */
export async function fetchPastPlaygroups({ log, days = 365 } = {}) {
  const data = await fetchProfileData();
  const raw = harvest(data);

  const now = Date.now();
  const cutoff = now - days * 86400000;
  const seen = new Set();
  const events = [];

  for (const r of raw) {
    const startIso = toIso(r.rawStart);
    if (!startIso) continue;
    const t = new Date(startIso).getTime();
    if (t >= now - 86400000) continue; // not past
    if (t < cutoff) continue; // too old to be worth showing
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    events.push({
      id: `mpg-partiful-${r.id}`,
      kind: 'playgroup',
      title: 'Mandarin Playgroup',
      venue: cleanVenue(r.rawTitle),
      start: startIso,
      end: toIso(r.rawEnd),
      url: `https://partiful.com/e/${r.id}`,
      cultural: 'mandarin',
      source: 'partiful',
    });
  }

  if (log) log(`  partiful: ${events.length} past events (of ${raw.length} candidates)`);
  return events;
}
