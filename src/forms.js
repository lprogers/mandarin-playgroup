// Spam-filtering proxy for the site's Jotform forms.
//
// The browser posts to /api/signup or /api/contact. This code checks the
// submission (honeypot, timing, Cloudflare Turnstile, basic validation) and
// only then forwards it to Jotform server-side. The real Jotform form IDs live
// in Cloudflare environment variables, never in the page source, so bots
// can't skip the site and post to Jotform directly.
//
// Environment variables (set in the Cloudflare dashboard):
//   TURNSTILE_SITE_KEY   public Turnstile site key (served to the page)
//   TURNSTILE_SECRET     Turnstile secret key            (encrypt it)
//   JOTFORM_SIGNUP_ID    ID of the cloned signup form    (encrypt it)
//   JOTFORM_CONTACT_ID   ID of the cloned contact form   (encrypt it)
// Until these are set, the code still applies the honeypot and timing checks,
// and falls back to the current (already public) form IDs, so deploying
// before configuring doesn't break the forms.

const FORMS = {
  signup: {
    envKey: 'JOTFORM_SIGNUP_ID',
    fallbackId: '262057950093055',
    nameField: 'q2_q2_textbox0',
    emailField: 'q7_q7_email5',
    required: ['q2_q2_textbox0', 'q7_q7_email5'],
  },
  contact: {
    envKey: 'JOTFORM_CONTACT_ID',
    fallbackId: '262016274308149',
    nameField: 'q19_name',
    emailField: 'q7_email',
    required: ['q7_email', 'q4_message4'],
  },
};

// Fields used only by the spam checks; never forwarded to Jotform.
const INTERNAL_FIELDS = new Set(['website', '_elapsed', 'cf-turnstile-response', 'formID', 'simple_spc']);
const MIN_FILL_MS = 3000;
const MAX_FIELD_LEN = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /(https?:\/\/|www\.|\.(com|ru|xyz|top|info|biz)\b)/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

// Bots get a normal-looking "success" so they don't learn which check caught them.
function silentDrop(request, form, reason) {
  console.log(JSON.stringify({ event: 'form_spam_dropped', form, reason }));
  return wantsJson(request) ? json({ ok: true }) : Response.redirect(new URL('/?sent=1', request.url).toString(), 303);
}

function allowedOrigin(origin) {
  if (!origin) return true; // some privacy setups strip it; Turnstile still applies
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'mandarinplaygroup.com' ||
      host.endsWith('.mandarinplaygroup.com') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.workers.dev') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.log(JSON.stringify({ event: 'turnstile_error', message: String(err) }));
    return false;
  }
}

export function handleConfig(env) {
  return new Response(JSON.stringify({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}

export async function handleFormPost(request, env, formName) {
  const cfg = FORMS[formName];
  if (!cfg) return json({ ok: false, error: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!allowedOrigin(request.headers.get('origin'))) return silentDrop(request, formName, 'origin');

  let data;
  try {
    data = await request.formData();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // 1. Honeypot: a hidden field people never see but form-filling bots do.
  if ((data.get('website') || '').toString().trim() !== '') return silentDrop(request, formName, 'honeypot');

  // 2. Timing: real people take more than a few seconds to fill in a form.
  const elapsed = Number(data.get('_elapsed'));
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) return silentDrop(request, formName, 'too_fast');

  // 3. Basic validation (mirrors the checks in the page).
  for (const field of cfg.required) {
    if (!(data.get(field) || '').toString().trim()) return json({ ok: false, error: 'missing_fields' }, 400);
  }
  if (!EMAIL_RE.test((data.get(cfg.emailField) || '').toString().trim())) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }
  for (const [, value] of data) {
    if (typeof value === 'string' && value.length > MAX_FIELD_LEN) return silentDrop(request, formName, 'too_long');
  }

  // 4. Links in the name field are a classic spam signature.
  if (URL_RE.test((data.get(cfg.nameField) || '').toString())) return silentDrop(request, formName, 'url_in_name');

  // 5. Cloudflare Turnstile (only once the secret is configured).
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(
      (data.get('cf-turnstile-response') || '').toString(),
      env.TURNSTILE_SECRET,
      request.headers.get('cf-connecting-ip'),
    );
    if (!ok) {
      console.log(JSON.stringify({ event: 'form_turnstile_failed', form: formName }));
      return json({ ok: false, error: 'verification_failed' }, 403);
    }
  }

  // 6. Forward to Jotform.
  const formId = env[cfg.envKey] || cfg.fallbackId;
  const out = new URLSearchParams();
  out.append('formID', formId);
  out.append('simple_spc', `${formId}-${formId}`);
  for (const [key, value] of data) {
    if (INTERNAL_FIELDS.has(key) || typeof value !== 'string') continue;
    out.append(key, value);
  }

  let res;
  try {
    res = await fetch(`https://submit.jotform.com/submit/${formId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: out.toString(),
      redirect: 'manual',
    });
  } catch (err) {
    console.log(JSON.stringify({ event: 'jotform_forward_error', form: formName, message: String(err) }));
    return json({ ok: false, error: 'upstream' }, 502);
  }
  if (res.status >= 400) {
    console.log(JSON.stringify({ event: 'jotform_forward_status', form: formName, status: res.status }));
    return json({ ok: false, error: 'upstream' }, 502);
  }

  console.log(JSON.stringify({ event: 'form_forwarded', form: formName }));
  return wantsJson(request) ? json({ ok: true }) : Response.redirect(new URL('/?sent=1', request.url).toString(), 303);
}
