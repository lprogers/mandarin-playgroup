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

function toIso(value) {
  // Partiful may hand back epoch seconds, epoch millis, or an ISO string.
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString();
  }
  if (typeof value === 'object' && value && '_seconds' in value) {
    return new Date(value._seconds * 1000).toISOString();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d) ? null : d.toISOString();
  }
  return null;
}

export async function fetchPlaygroups({ log }) {
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

  const data = JSON.parse(match[1]);
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
      venue: r.rawTitle,
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
