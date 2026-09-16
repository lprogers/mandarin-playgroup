/**
 * Chinese cultural events happening in San Francisco, pulled from a small
 * curated list of organizations' own event pages.
 *
 * Unlike sfpl.mjs, this doesn't hand-write CSS selectors per site — each of
 * these orgs' markup is different, changes on its own schedule, and a
 * selector chain breaks silently (see sfpl.mjs's own history: the branch
 * and topic data went missing for a while and nothing noticed). Instead
 * this sends each page's visible text to an LLM and asks for structured
 * events back via a tool call, which is far more robust to markup that was
 * never written with scraping in mind.
 *
 * Requires ANTHROPIC_API_KEY (from the environment — never hard-code it).
 * Before trusting it: run
 *   ANTHROPIC_API_KEY=... node scripts/generate-events.mjs --dry-run
 * and read through the extracted titles/dates for anything that looks
 * hallucinated or misdated.
 *
 * A missing key, every source failing to fetch, or a malformed model
 * response are all treated as a fetch failure — the generator quarantines
 * this source and carries over whatever ran last time, same as every other
 * source here. A successful run that finds zero qualifying events is NOT a
 * failure (unlike partiful.mjs's playgroups): these orgs don't always have
 * something dated far enough out to qualify.
 */

import * as cheerio from 'cheerio';

const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_PAGE_CHARS = 8000;

// Hand-picked, not crawled — each one checked by hand to confirm it
// actually lists dated events in its rendered HTML (not a JS-only widget).
const SOURCES = [
  { name: 'Chinese Culture Center of SF', url: 'https://www.cccsf.us/upcoming-events' },
  { name: 'Chinese Historical Society of America', url: 'https://chsa.org/events/' },
  { name: 'Chinatown Community Development Center', url: 'https://www.chinatowncdc.org/news-events/events' },
];

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

/** date "YYYY-MM-DD" + time "HH:MM" (24h, Pacific wall-clock) → offset ISO string. */
function toPacificIso(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm) return null;
  const yy = +dm[1], mm = +dm[2], dd = +dm[3], hh = +tm[1], min = +tm[2];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || min > 59) return null;
  const offset = pacificOffsetHours(yy, mm, dd);
  const p = (n) => String(n).padStart(2, '0');
  const offStr = offset === -7 ? '-07:00' : '-08:00';
  return `${yy}-${p(mm)}-${p(dd)}T${p(hh)}:${p(min)}:00${offStr}`;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Strip a page down to readable text, capped, so each call stays cheap. */
function pageText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, noscript, svg').remove();
  const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return text.slice(0, MAX_PAGE_CHARS);
}

async function extractEvents({ apiKey, source, text, todayIso }) {
  const prompt = `You are extracting real, dated, upcoming events from a webpage for a family calendar site that surfaces Chinese cultural events in the San Francisco Bay Area.

Today's date is ${todayIso}.

Source: ${source.name} (${source.url})

Page text:
"""
${text}
"""

Extract every event on this page that:
- Has a specific date, on or after ${todayIso} — if a month is given without a day, or the year is ambiguous, skip it, don't guess.
- Has a specific start time stated on the page — if no time is given, skip it, don't invent one.
- Is a real one-time or annual event in the San Francisco Bay Area — not a generic "ongoing"/"all year round" program, an exhibit with no end date, or something already in the past relative to today.

Call record_events with what qualifies. If nothing qualifies, call it with an empty events array — that's a normal, expected result here, not a failure.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tool_choice: { type: 'tool', name: 'record_events' },
      tools: [{
        name: 'record_events',
        description: 'Record the qualifying Chinese cultural events found on this page.',
        input_schema: {
          type: 'object',
          properties: {
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  date: { type: 'string', description: 'ISO date, YYYY-MM-DD' },
                  time: { type: 'string', description: '24-hour start time, HH:MM' },
                  endTime: { type: 'string', description: '24-hour end time, HH:MM — omit if not stated' },
                  venue: {
                    type: 'string',
                    description: 'Where it happens, e.g. "750 Kearny Street, San Francisco". ' +
                      "If the page doesn't state a specific venue, use the organizing group's own name here — never a placeholder like \"unknown\" or \"TBD\".",
                  },
                },
                required: ['title', 'date', 'time', 'venue'],
              },
            },
          },
          required: ['events'],
        },
      }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API returned ${res.status} for ${source.name}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((b) => b.type === 'tool_use' && b.name === 'record_events');
  if (!toolUse || !Array.isArray(toolUse.input?.events)) {
    throw new Error(`No record_events tool call in model response for ${source.name}`);
  }
  return toolUse.input.events;
}

export async function fetchChineseCultureEvents({ log, today = new Date() } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — add it to the environment (or GitHub Actions secrets) to enable this source.');
  }

  const todayIso = today.toISOString().slice(0, 10);
  const events = [];
  const seen = new Set();
  let anySourceSucceeded = false;
  const errors = [];

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'mandarinplaygroup-calendar/1.0 (+https://mandarinplaygroup.com)' },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const text = pageText(await res.text());

      const raw = await extractEvents({ apiKey, source, text, todayIso });
      anySourceSucceeded = true;
      if (log) log(`  chinese-culture: ${source.name} — ${raw.length} candidate event(s)`);

      for (const r of raw) {
        const startIso = toPacificIso(r.date, r.time);
        if (!startIso) continue; // model didn't follow the date/time format — drop rather than guess
        if (new Date(startIso).getTime() < today.getTime() - 86400000) continue; // already past

        const id = `culture-${slugify(source.name)}-${slugify(r.title)}-${r.date}`;
        if (seen.has(id)) continue;
        seen.add(id);

        // Backstop for the schema instruction above: a model that ignores it
        // and emits a placeholder anyway shouldn't leak "<unknown>" onto the
        // live calendar — fall back to the organizer's name instead.
        const venueRaw = (r.venue || '').trim();
        const venue = venueRaw && !/^(unknown|n\/a|tbd|<unknown>|none)$/i.test(venueRaw)
          ? venueRaw
          : source.name;

        events.push({
          id,
          kind: 'culture',
          title: r.title,
          venue,
          start: startIso,
          end: r.endTime ? toPacificIso(r.date, r.endTime) : null,
          url: source.url,
          cultural: 'mandarin',
          source: 'chinese-culture',
        });
      }
    } catch (err) {
      errors.push(`${source.name}: ${err.message}`);
    }
  }

  // Every source failing outright (network down, all 4xx/5xx) is worth
  // quarantining over — a page's own content having nothing that qualifies
  // is not.
  if (!anySourceSucceeded) {
    throw new Error(`All sources failed — ${errors.join('; ')}`);
  }
  if (errors.length && log) {
    log(`  chinese-culture: ${errors.length} source(s) failed this run: ${errors.join('; ')}`);
  }

  return events;
}
