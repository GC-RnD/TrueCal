# TrueCal relay (Cloudflare Worker)

What this is, in plain terms: the app needs to ask I-CAR's calibration
website one question per vehicle ("does this car need a camera/sensor
recalibration?"). Browsers aren't allowed to ask that site directly, so this
small Worker asks on the app's behalf and hands back the answer as plain
JSON. One question in, one answer out - nothing stays connected in between.

This replaced the local Node version that used to live in
`notes\TrueCal\relay\` (same logic, ported to run on Cloudflare instead of a
machine you'd have to keep running).

## Status
Written and ready, but **not deployed anywhere yet**. It needs a Cloudflare
account for this project first (the owner is creating one separately,
intentionally not reusing the unrelated SL-Live account this was prototyped
on - see `notes\CONVERSATION-LOG.md`).

## Deploying it, once the new Cloudflare account exists
From this folder (`TrueCal\worker`):
```
npx wrangler login      # one-time: logs this folder into the new account
npx wrangler deploy     # publishes it to a free *.workers.dev address
```
Wrangler will print the URL it deployed to, for example
`https://truecal-icar-relay.<your-subdomain>.workers.dev`.

## Pointing the app at it
The app checks `localStorage` for where to send lookups. Once deployed, set
it (one time, per browser/device) in that browser's dev console:
```js
localStorage.setItem("truecal.relayUrl", "https://truecal-icar-relay.<your-subdomain>.workers.dev/api/icar")
```
If this is never set, the app just quietly skips the live lookup - nothing
breaks.

## Before relying on it for real users
I-CAR's website terms have not been reviewed and permission has not been
requested. Do that before wider use. Results are I-CAR's summary, not the
manufacturer document, and the app labels them that way.

## Confirmed working (2026-11-03)
A throwaway test Worker making the same calls this one makes got normal,
un-blocked responses from I-CAR (see `notes\CONVERSATION-LOG.md` for the
full result). That test Worker has since been deleted - this file is the
real version, built to actually be deployed and used.
