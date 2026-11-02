# TrueCal relay (local)

A small local server that serves the app and adds one endpoint: a live lookup of I-CAR's public **OEM Calibration Requirements** matrix for a single vehicle.

```
node relay/server.js
# open http://localhost:8080
```

When a ruling has a sensor with no reviewed rule, the app asks `/api/icar?year=2021&make=Acura&model=TLX`. The relay:
1. asks I-CAR's own vehicle-search service which calibration page matches that vehicle,
2. reads that one page (sensors, the events I-CAR lists, scan tool and special-tool flags),
3. returns it as JSON. The app shows it as "from I-CAR's matrix", with the quote and a link to the I-CAR page.

If I-CAR lists the selected repair for that sensor, the result is **Calibration required (I-CAR matrix)**. Otherwise the sensor stays **Unverified**, and the card shows what I-CAR does list. "No requirement found" means the manufacturer's manual does not specify one, not that none is needed.

Other behaviour:
- Model names are matched to I-CAR's (E-450 becomes E-Class, 330i becomes 3 Series). If there is no match, the app shows I-CAR's models to pick from (`icarModel` parameter).
- A few vehicles (for example the Mercedes-Benz E-Class) have only "Refer To OEM Scan Tool For Camera/Sensor Identification And Requirements"; this is passed back as `notice`.
- When nothing is found, links to I-CAR's page for that make and its ADAS articles are returned (`helpLinks`).
- Other I-CAR entries for the same model (for example "48 V") are returned as `alternatives`.

## How it behaves
- Identifies itself (`TrueCalLookup/0.1`), waits 1.5 s between requests, caches each vehicle for 24 hours.
- One vehicle per lookup, only when a sensor has no reviewed rule.
- If I-CAR ever answers with a block, rate limit or challenge page, it stops and stays paused for an hour. It never tries to look like a person or get past a challenge.
- Not enabled on GitHub Pages (no server there): the app quietly skips the lookup when `/api/icar` does not exist.

## Before relying on it
- I-CAR's website terms have not been reviewed and permission has not been requested. Do that before wider use.
- Results are I-CAR's summary, not the manufacturer document. They are labelled that way.

## Hosting
No hosting provider has been chosen, and nothing here is tied to one. `relay/server.js` is plain Node (no packages) and listens on `127.0.0.1` by default; `relay/icar.js` uses only `fetch()`. Whatever host is chosen later, run `node relay/server.js` (or call `lookupVehicle` from a function). Consider a fixed address, since cloud and serverless address ranges are often blocked by sites, and tell I-CAR which name and address to expect.

## Pointing the app at a relay elsewhere
Host the static files wherever you like and point the app at the relay with `localStorage.setItem("truecal.relayUrl", "https://your-relay.example/api/icar")`. The relay must then allow that origin (CORS); the bundled `relay/server.js` serves the app and the lookup from one address, so it needs no CORS setup.
