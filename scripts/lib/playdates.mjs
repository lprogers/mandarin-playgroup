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

// The hand-written cards used evening-appropriate copy for after-work
// playdates and daytime copy for weekend-morning ones — keep that split.
const DAYTIME_DESC = 'Come for an hour or stay the whole time — drop in whenever works for you!';
const EVENING_DESC = 'An after-work, after-daycare playdate — come for as long as works for you!';

export function renderPlaydateCards(events, today, max = 8) {
  const todayKey = today.toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.kind === 'playgroup' && e.start.slice(0, 10) >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, max);

  return upcoming
    .map((e, i) => {
      const { mo, d, hh } = parts(e.start);
      const shortVenue = e.venue.split(' · ')[0];
      const when = `${weekday(e.start)}, ${LONG_MON[mo - 1]} ${d} · ${clock(e.start)}` +
        (e.end ? ` – ${clock(e.end)}` : '');
      const desc = hh >= 16 ? EVENING_DESC : DAYTIME_DESC;

      return `<article class="card">
  <div class="card-date"><div class="mo">${MON[mo - 1]}</div><div class="day">${d}</div></div>
  <svg class="card-doodle" viewBox="0 0 120 56" aria-hidden="true">
    ${DOODLES[i % DOODLES.length]}
  </svg>
  <h3>${esc(shortVenue)} playgroup</h3>
  <div class="where">${esc(e.venue)}</div>
  <div class="when">${when}</div>
  <p class="desc">${desc}</p>
  <a class="rsvp" href="${esc(e.url)}" target="_blank" rel="noopener">RSVP on Partiful →</a>
</article>`;
    })
    .join('\n\n');
}
