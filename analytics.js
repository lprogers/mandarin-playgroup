/**
 * Mixpanel product analytics for mandarinplaygroup.com.
 *
 * Loaded (deferred) on index.html and calendar.html, right after the Mixpanel
 * library. Everything is tracked with delegated listeners, so the sections
 * that the calendar-refresh job regenerates never need tracking code in them.
 *
 * Privacy: never sends names, emails, phone numbers, children's ages, or
 * free-text form answers. Only booleans, chip choices, and link destinations.
 *
 * Events
 *   $mp_web_page_view            automatic (includes UTM params + referrer)
 *   join_cta_clicked             any "Join the community" link (#newsletter)
 *   signup_form_started          first interaction with the signup form
 *   signup_form_submitted        signup form accepted by JotForm
 *   contact_form_submitted       contact form accepted by JotForm
 *   playdate_rsvp_clicked        click-out to a Partiful event
 *   ask_calendar_searched        Ask the Calendar query + result count
 *   calendar_event_clicked       click-out to an event on /calendar
 */
// Official Mixpanel loader snippet: defines a queueing stub, then loads the
// library async from cdn.mxpnl.com. Calls made before it loads are replayed.
(function(e,c){if(!c.__SV){var l,h;window.mixpanel=c;c._i=[];c.init=function(q,r,f){function t(d,a){var g=a.split(".");2==g.length&&(d=d[g[0]],a=g[1]);d[a]=function(){d.push([a].concat(Array.prototype.slice.call(arguments,0)))}}var b=c;"undefined"!==typeof f?b=c[f]=[]:f="mixpanel";b.people=b.people||[];b.toString=function(d){var a="mixpanel";"mixpanel"!==f&&(a+="."+f);d||(a+=" (stub)");return a};b.people.toString=function(){return b.toString(1)+".people (stub)"};l="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders start_session_recording stop_session_recording people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" ");
for(h=0;h<l.length;h++)t(b,l[h]);var n="set set_once union unset remove delete".split(" ");b.get_group=function(){function d(p){a[p]=function(){b.push([g,[p].concat(Array.prototype.slice.call(arguments,0))])}}for(var a={},g=["get_group"].concat(Array.prototype.slice.call(arguments,0)),m=0;m<n.length;m++)d(n[m]);return a};c._i.push([q,r,f])};c.__SV=1.2;var k=e.createElement("script");k.type="text/javascript";k.async=!0;k.src="undefined"!==typeof MIXPANEL_CUSTOM_LIB_URL?MIXPANEL_CUSTOM_LIB_URL:"file:"===
e.location.protocol&&"//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//)?"https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js":"//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";e=e.getElementsByTagName("script")[0];e.parentNode.insertBefore(k,e)}})(document,window.mixpanel||[]);

(function () {

  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  mixpanel.init('1bd2b7d55ad276d0e2667334b51f8ee7', {
    debug: isLocal,
    track_pageview: true,
    autocapture: false,          // only the explicit events below; keeps form text out
    persistence: 'localStorage',
    ignore_dnt: false
  });

  var page = location.pathname.indexOf('/calendar') === 0 ? 'calendar' : 'home';
  mixpanel.register({ site_page: page });

  function track(name, props) {
    try { mixpanel.track(name, props || {}); } catch (e) {}
  }
  function host(url) {
    try { return new URL(url, location.href).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function sectionOf(el) {
    var s = el.closest('section[id]');
    return s ? s.id : '';
  }

  // ---- Clicks (delegated) ----
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';

    if (/#newsletter$/.test(href)) {
      track('join_cta_clicked', { cta_text: a.textContent.trim().slice(0, 60), section: sectionOf(a) || 'header' });
      return;
    }
    if (href.indexOf('partiful.com/e/') !== -1) {
      track('playdate_rsvp_clicked', {
        partiful_event_id: href.split('/e/')[1].split(/[?#]/)[0],
        playdate_timing: a.closest('.past-toggle') ? 'past' : 'upcoming',
        link_text: a.textContent.trim().slice(0, 40)
      });
      return;
    }
    if (a.classList.contains('mpgcal-ev') || a.closest('.mpgcal-list, .mpgcal-ask-results, [class*="mpgcal-"]')) {
      if (host(href) === location.hostname.replace(/^www\./, '')) return; // internal nav
      var kind = (a.className.match(/mpgcal-ev--([a-z-]+)/) || [])[1] || '';
      var name = a.querySelector('.mpgcal-name');
      track('calendar_event_clicked', {
        event_name: (name ? name.textContent : a.textContent).trim().slice(0, 80),
        event_kind: kind === 'lantern' ? '' : kind,
        mandarin_event: a.classList.contains('mpgcal-ev--lantern'),
        from_ask_results: !!a.closest('.mpgcal-ask-results'),
        destination_domain: host(href)
      });
    }
  }, true);

  // ---- JotForm forms (signup + contact) ----
  function watchForm(formSel, sinkName, successSel, startedEvt, submittedEvt, propsFn) {
    var form = document.querySelector(formSel);
    if (!form) return;
    var started = false;
    if (startedEvt) {
      form.addEventListener('focusin', function () {
        if (started) return;
        started = true;
        track(startedEvt);
      });
    }
    var sink = document.querySelector('iframe[name="' + sinkName + '"]');
    if (!sink) return;
    sink.addEventListener('load', function () {
      var ok = document.querySelector(successSel);
      if (ok && getComputedStyle(ok).display !== 'none') track(submittedEvt, propsFn ? propsFn(form) : {});
    });
  }

  watchForm('#signupForm .mpg-form', 'mpg-signup-sink', '#signupForm .mpg-success',
    'signup_form_started', 'signup_form_submitted', function (form) {
      var heard = [].map.call(form.querySelectorAll('input[name="q8_q8_checkbox6[]"]:checked'), function (c) { return c.value; });
      var other = document.getElementById('mpg-other-toggle');
      if (other && other.checked) heard.push('Other');
      var phone = form.querySelector('[name="q10_phoneNumber[full]"]');
      return {
        wants_whatsapp: !!(phone && phone.value.trim()),   // phone given = WhatsApp invite requested
        heard_about: heard,
        gave_neighborhood: !!form.querySelector('#mpg-hood').value.trim()
      };
    });

  watchForm('#contact .mpgc-form', 'mpgc-contact-sink', '#contact .mpgc-success',
    null, 'contact_form_submitted');

  // ---- Ask the Calendar: observe /api/ask responses ----
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (url.indexOf('/api/ask') === -1) return p;
      var query = '';
      try { query = JSON.parse(init.body).query || ''; } catch (e) {}
      var t0 = Date.now();
      p.then(function (r) { return r.clone().json(); })
        .then(function (d) {
          track('ask_calendar_searched', {
            search_query: query.slice(0, 120),
            answered: !!(d && d.ok),
            results_count: d && Array.isArray(d.eventIds) ? d.eventIds.length : 0,
            response_ms: Date.now() - t0
          });
        })
        .catch(function () {
          track('ask_calendar_searched', { search_query: query.slice(0, 120), answered: false, results_count: 0, error: true });
        });
      return p;
    };
  }
})();
