/**
 * Reference helper for emitting schema.org/Event JSON-LD from whatever
 * event objects your existing twice-daily calendar-refresh pipeline
 * already produces. Framework-agnostic plain JS — adapt field names to
 * your actual data shape and drop the output into the /calendar page's
 * <head> (or just before </body>) as a single <script type="application/
 * ld+json"> tag, regenerated every time the refresh job runs.
 *
 * Attribution matters: only tag an event's organizer as "Mandarin
 * Playgroup" when it actually is one of your own events. For aggregated
 * events from other organizers (SF Rec & Park, Chase Center, Salesforce
 * Park, etc.), use that organizer's real name so agents attribute
 * correctly.
 */

function toEventJsonLd(event) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startDateTimeISO, // e.g. "2026-09-05T10:00:00-07:00"
    ...(event.endDateTimeISO ? { endDate: event.endDateTimeISO } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.locationName,
      address: {
        "@type": "PostalAddress",
        addressLocality: event.city || "San Francisco",
        addressRegion: event.region || "CA",
        addressCountry: "US",
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.organizerName, // "Mandarin Playgroup" for your own events;
      // the real host org's name for aggregated events
      url: event.organizerUrl,
    },
    url: event.rsvpUrl, // Partiful link for your events, or the source page
    description: event.description,
    isAccessibleForFree: event.isFree ?? true,
    ...(event.ageRange ? { typicalAgeRange: event.ageRange } : {}),
    ...(event.isFree === false && event.price != null
      ? {
          offers: {
            "@type": "Offer",
            price: String(event.price),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: event.rsvpUrl,
          },
        }
      : {}),
  };
}

/**
 * Combine every event currently shown on /calendar into one JSON-LD
 * @graph, so a single <script> tag on that page describes the whole
 * week at once.
 */
function toCalendarPageJsonLd(events) {
  return {
    "@context": "https://schema.org",
    "@graph": events.map(toEventJsonLd),
  };
}

module.exports = { toEventJsonLd, toCalendarPageJsonLd };

// --- Example usage ---
// const events = await getThisWeeksEvents(); // however your pipeline already fetches these
// const jsonLd = toCalendarPageJsonLd(events);
// injectIntoPageHead(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
