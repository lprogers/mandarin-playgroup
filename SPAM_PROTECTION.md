# Form spam protection

The signup and contact forms post to `/api/signup` and `/api/contact` on this site rather than to Jotform. A small Cloudflare script (`src/forms.js`) checks each submission and forwards only the ones that pass. The page code no longer contains any Jotform form ID.

Checks, in order:

1. **Honeypot.** A hidden `website` field. People never see it, but bots fill it in.
2. **Fill time.** Submissions sent less than 3 seconds after the page loaded are dropped.
3. **Validation.** Name/email (signup) or email/message (contact) must be filled in correctly.
4. **Link in the name field.** Dropped.
5. **Cloudflare Turnstile.** Usually invisible. People only see a checkbox if Cloudflare isn't sure about them.

Bots caught by checks 1, 2 and 4 get a fake "success" response, so they can't tell what blocked them. Nothing they send reaches Jotform or counts toward the submission limit. Each dropped submission is logged as `form_spam_dropped`; you can see these in Cloudflare under Workers & Pages → mandarin-playgroup → Logs.

## Files

- `_worker.js`: the code the live site (Cloudflare Pages) runs. The spam checks are at the bottom of this file

## One-time setup

Until the settings below are added, the honeypot, fill-time and link checks already run, and submissions go to the current Jotform forms.

1. **Turnstile:** Cloudflare dashboard → Turnstile → Add widget. Hostnames: `mandarinplaygroup.com`, `www.mandarinplaygroup.com`. Widget mode: Managed. Copy the **site key** and the **secret key**.
2. **Clone both Jotform forms:** My Forms → select the form → More → Clone. On each clone:
   - Confirm the autoresponder and the notification email (with the WhatsApp link) came across.
   - Re-connect Google Sheets if you use it.
   - Make sure Settings → "Unique Submission" is **off**. Every submission now comes from a Cloudflare address, so an IP-based limit would block real people.
   - Note each new form ID (the number in the form's URL).
3. **Cloudflare variables:** Workers & Pages → mandarin-playgroup (the Pages project) → Settings → Variables and Secrets. Add all four as type Secret:
   - `TURNSTILE_SITE_KEY` as Text
   - `TURNSTILE_SECRET`, `JOTFORM_SIGNUP_ID` and `JOTFORM_CONTACT_ID` as Secret

   Then redeploy.
4. **Test:** submit both forms on the live site and check that the submission and emails arrive in the *new* Jotform forms.
5. **Retire the old forms:** in Jotform, set the original two forms to Disabled (Settings → Form Status). Bots that still post to the old IDs then get nothing.
