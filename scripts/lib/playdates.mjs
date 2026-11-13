/**
 * Renders the "Upcoming playdates" cards on index.html from playgroup
 * events, so the homepage can no longer go stale the way it did before —
 * a playgroup that's already happened is never eligible to appear.
 *
 * Mirrors the hand-written cards it replaces: same markup, same rotating
 * set of hand-drawn doodles, so a generated card looks the same as one
 * that was written by hand.
 */

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LONG_MON = ['January','February','March','April','May','June','July','August',
  'September','October','November','December'];
const LONG_DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

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

function weekday(iso) {
  const { y, mo, d } = parts(iso);
  return LONG_DOW[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}

// Same shapes, same palette (persimmon/blue/green/yellow) as the cards these
// replace — cycled by position so consecutive cards don't repeat a doodle.
const DOODLES = [
  '<circle cx="26" cy="30" r="13" fill="#E8553D"/><rect x="56" y="18" width="24" height="28" rx="6" fill="#4E8FD9"/><circle cx="98" cy="26" r="11" fill="#4C9A6B"/>',
  '<path d="M12 44 L34 14 L56 44 Z" fill="#4C9A6B"/><rect x="70" y="22" width="38" height="22" rx="6" fill="#4E8FD9"/>',
  '<circle cx="24" cy="20" r="11" fill="#F5B62F"/><path d="M50 46 L72 16 L94 46 Z" fill="#E8553D"/>',
  '<rect x="14" y="16" width="34" height="30" rx="6" fill="#4E8FD9"/><circle cx="80" cy="30" r="13" fill="#4C9A6B"/><circle cx="104" cy="18" r="7" fill="#E8553D"/>',
  '<path d="M6 40 Q30 24 54 40 T102 40" fill="none" stroke="#4E8FD9" stroke-width="6" stroke-linecap="round"/><circle cx="94" cy="18" r="10" fill="#F5B62F"/>',
  '<path d="M8 46 A46 46 0 0 1 100 46" fill="none" stroke="#F5B62F" stroke-width="6" stroke-linecap="round"/><rect x="46" y="10" width="22" height="22" rx="5" fill="#4C9A6B"/>',
];

// Special sessions get a corner "Special event" badge plus a chip naming the
// activity. Keys come from the `special` field (see generate-events.mjs).
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>';
const SPECIALS = {
  storytime: {
    label: 'Mandarin Storytime',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5C5.5 4.3 8.5 4.3 12 6c3.5-1.7 6.5-1.7 9-.5V19c-2.5-1.2-5.5-1.2-9 .5-3.5-1.7-6.5-1.7-9-.5z" fill="#4E8FD9"/><path d="M12 6v13.5" stroke="#fff" stroke-width="1.6"/></svg>',
  },
  music: {
    label: 'Mandarin Music Class',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12" fill="none" stroke="#4C9A6B" stroke-width="2.4" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="3" fill="#4C9A6B"/><circle cx="17.5" cy="15" r="3" fill="#4C9A6B"/></svg>',
  },
};

// Upcoming cards carry no description: the drop-in note (and "look for the
// red nametags") lives once in the section intro in index.html, so cards
// don't repeat the same line and no per-venue copy has to be written.

// Past events can't invite anyone to "come by" — recap copy instead, still
// split morning/evening so it doesn't read as a template.
const DAYTIME_RECAP = 'Another good morning at the playground — thanks to everyone who came out!';
const EVENING_RECAP = 'Another good after-work turnout — thanks to everyone who came out!';

// Most Partiful titles name a place ("Upper Noe Recreation Center"). Some are
// event names instead ("Holiday Potluck") because the address is only shown
// to guests who RSVP yes — so there is no place to put on the card.
const PLACE_WORDS = /\b(park|playground|rec(reation)?|center|centre|square|plaza|library|garden|field|school|museum|yard|beach|pier|commons|court|grove|hill|lot|green)\b/i;
const isPlace = (venue) => PLACE_WORDS.test(venue);

function cardHtml(e, i, { past = false } = {}) {
  const { mo, d, hh } = parts(e.start);
  const shortVenue = e.venue.split(' · ')[0];
  const when = `${weekday(e.start)}, ${LONG_MON[mo - 1]} ${d} · ${clock(e.start)}` +
    (e.end ? ` – ${clock(e.end)}` : '');
  const evening = hh >= 16;
  const desc = past ? (evening ? EVENING_RECAP : DAYTIME_RECAP) : '';
  const sp = SPECIALS[e.special] || null;
  const cardClass = (past ? 'card card--past' : 'card') + (sp ? ' card--special' : '');
  const cta = past ? 'See details →' : 'RSVP →';

  return `<article class="${cardClass}">
${sp ? `  <div class="special-badge">${STAR} Special event</div>\n` : ''}  <div class="card-date"><div class="mo">${MON[mo - 1]}</div><div class="day">${d}</div></div>
  <svg class="card-doodle" viewBox="0 0 120 56" aria-hidden="true">
    ${DOODLES[i % DOODLES.length]}
  </svg>
  <h3>${esc(shortVenue)}${isPlace(shortVenue) ? ' playdate' : ''}</h3>
${isPlace(e.venue) ? `  <div class="where">${esc(e.venue)}</div>` : past ? '' : '  <div class="where">Location shared once you RSVP</div>'}
  <div class="when">${when}</div>
${sp ? `  <div class="activity">${sp.icon} ${sp.label}</div>\n` : ''}${desc ? `  <p class="desc">${desc}</p>\n` : ''}  <a class="rsvp" href="${esc(e.url)}" target="_blank" rel="noopener">${cta}</a>
</article>`;
}

export function renderPlaydateCards(events, today, max = 8) {
  const todayKey = today.toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.kind === 'playgroup' && e.start.slice(0, 10) >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, max);

  return upcoming.map((e, i) => cardHtml(e, i, { past: false })).join('\n\n');
}

/** Most recent first — a "See past playdates" disclosure reads newest-on-top. */
export function renderPastPlaydateCards(events, today, max = 12) {
  const todayKey = today.toISOString().slice(0, 10);
  const past = events
    .filter((e) => e.kind === 'playgroup' && e.start.slice(0, 10) < todayKey)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, max);

  return past.map((e, i) => cardHtml(e, i, { past: true })).join('\n\n');
}
