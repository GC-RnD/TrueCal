# TrueCal: Getting Complete, Sourced Calibration Data

_Updated 2026-11-02. Facts about providers come from public web pages only; prices and API terms are mostly "not public" and need a sales call._

---

## 1. The goal

An adjuster should know, **before the shop quotes**, whether each ADAS sensor calibration is **required, not required or self-learning** for that vehicle and repair, with the manufacturer's own wording and a link as proof. Scope is **sensor calibration requirements only**, not general repair information.

Who and why (from the end user):
- Auto insurance company; the end user has gone into shops and won arguments over calibration charges.
- This is a recurring issue that he and his managers discuss, so he may offer the tool to all adjusters, the whole company, or sell it.
- He uses **Mitchell Connect**, which he says gives **no calibration guidance at all** (whether to calibrate or not), which he puts down to liability. His company has pressed Mitchell for about two years and he assumes other insurers have the same issue.
- He wants adjusters to see the answer **before the shop's quote**, since the adjuster and the shop each have their own numbers.

## 2. Where we are today

- **51 rules** in the app, entered from manufacturer wording, each with the exact quote and a source link: Honda 17, Acura 17, Nissan 12, GM 2, Volvo 2, Subaru 1.
- **183 findings** waiting for review in the app (raw sentences from the same documents).
- **Live I-CAR lookup (built, local testing only):** when a sensor has no reviewed rule, the app asks I-CAR's public matrix about that one vehicle and shows the result with I-CAR's wording and a link. Tested and working on Acura, Toyota, Kia, Chevrolet and Dodge.
- **Team records:** an adjuster can add their own record with a reference. It is always labelled "NOT OEM-verified" and a manufacturer source overrides it.
- **Weakest area:** vehicles I-CAR does not cover (for example the Mercedes E-Class, where I-CAR only says to use the manufacturer's scan tool) and bumper cases outside Honda/Acura.

## 3. The core problem, and the answer

We need answers for **every vehicle in advance**, not built up as cars arrive.

- **No free source is complete.** The detailed rules sit in paid manufacturer portals and in licensed databases built from them. I-CAR's public matrix is the closest free source (section 4), but I-CAR says it is not complete.
- **The path to full coverage is licensed data** from a provider that holds per-vehicle calibration requirements with citations (section 6), or a licence from I-CAR itself.
- **You do not have to buy whole-repair information.** The providers ranked first sell calibration requirements only, which is separate from the manufacturer service portals.
- **Two ways to use licensed data:**
  1. **Lookup at quote time:** TrueCal sends the vehicle and repair to the provider and shows the answer. Nothing to store, every covered vehicle works on day one.
  2. **Bulk licence:** the dataset is delivered on a schedule and loaded into TrueCal. More work, works offline.
- **What TrueCal adds either way:** VIN scan, the shop's quote, the sensor-by-sensor comparison (Match / Challenge / Missing), the manufacturer's sentence, and a printable report.

## 4. I-CAR's public calibration matrix

What it is (rts.i-car.com, "OEM Calibration Requirements Search"):
- Public pages, no login to view. About **2,555 vehicle pages** are listed in I-CAR's sitemap. It covers **2016 and newer** vehicles and states it does not contain all production vehicles.
- Built from OEM service manuals, OEM ADAS documents and position statements. I-CAR says text in quotation marks is quoted from the manufacturer.
- Per vehicle, per sensor (for example "Sensor(s) Behind Front Bumper Cover/Grille"), it lists the **events that call for calibration** ("If sensor is removed/installed or replaced", "If front bumper cover is repaired within 300 mm of the radar", "If windshield is removed/installed or replaced") plus whether a scan tool or special tools are needed.
- I-CAR's vehicle search is a public JSON service its own web page uses. The lookup relay uses the same two steps a person does: find the vehicle, open its page.

How to read it (from I-CAR's own guide, rts.i-car.com/crn-483.html):
- **"No calibration/initialization requirements"** means the manufacturer's manual **does not specify** one. It does **not** mean none is needed. TrueCal treats it as "not identified".
- **"If DTC indicates"** means a trouble code may call for calibration that I-CAR could not list.
- Manuals use other words for calibration (initialization, relearn, alignment, adjustment; Mercedes says normalization and coding). Events can differ by model year.
- Some vehicles have only "Refer To OEM Scan Tool For Camera/Sensor Identification And Requirements" (2022 Mercedes-Benz E-Class). There is no sensor list.
- Next places to look when nothing is found: I-CAR's page for the make (`rts.i-car.com/oem-information/<make>.html`), its ADAS article list, then the manufacturer's scan tool or service information.
- An I-CAR mobile app exists and accepts a VIN. We have not looked at how it works.

Open items:
- **I-CAR's website terms have not been reviewed and permission has not been requested.** Do both before anything beyond testing. A licence or data feed from I-CAR is the best outcome.
- Measure real coverage of the matrix across the makes the end user sees most.

## 5. Why Mitchell Connect may not be enough

The end user has confirmed Mitchell gives no calibration guidance. Our earlier notes suggest the likely reasons (treat as hypotheses): it is built for the repair shop's workflow; reports from third-party providers reach Mitchell Connect after the shop has scanned and calibrated (too late to question a quote); it speaks of "recommended" calibrations without showing the manufacturer's sentence; and it avoids stating "not required".

Still worth asking him:
> 1. Which makes does he see most, and which repairs (bumper, windshield, alignment)?
> 2. Can he send one or two examples of shop quotes he pushed back on and won, with the document or source he used?
> 3. Would he want the answer on a phone at the shop, at a desk, or both?

**Question 2 is the most valuable.** Each source he used to win becomes a real, citable record and a first verified set from his own cases.

## 6. Paid sources for sensor calibration data (ranked)

| Rank | Provider | Why | Next step |
|---|---|---|---|
| 1 | Opus IVS (ADAS MAP / ADAS MAP PRO) and asTech adasThink (Repairify) | Per-VIN calibration requirements citing OEM documents, I-CAR RTS and others; already feeds CCC ONE and Mitchell | Ask about a VIN lookup service or data licence for our own app |
| 2 | I-CAR RTS | Public matrix with the manufacturer's wording; live lookup built and tested | Read the terms; ask for permission or a licensed feed |
| 3 | Mitchell (Enlyte) Predictive ADAS | Per-vehicle reports, already in use, though the end user reports no calibration guidance in Mitchell Connect | Ask whether any calibration data can be exported or used outside Mitchell |
| 4 | ALLDATA Collision | Public price $249/month; reference only, no yes/no engine, no API | Only if a human lookup is enough |
| 5 | CCC ONE Diagnostics Network | Passes through partners' reports; not a data owner | Ask which partners supply requirement data |

Questions for Opus IVS, I-CAR and Mitchell:
1. Do you offer a VIN lookup service or a bulk data licence for our own app, and at what price and terms?
2. What manufacturer document and date is cited for each determination, and how are citations refreshed?
3. What is the U.S. coverage by year, make and model, and may we display the manufacturer text and citation inside our app?
4. Do answers include "calibration not required" and "self-learning", or only "required"?

If a provider will not licence data, the fallback is to use their lookup as the **human verification step**, then save the manufacturer citation in TrueCal.

## 7. Free sources still to mine

1. **OEM1Stop** (oem1stop.com): one page per manufacturer listing position statements. Still to read: Toyota/Lexus, Ford/Lincoln, Hyundai/Kia/Genesis, Mazda, Mitsubishi, Infiniti, VW/Audi, Mercedes-Benz, Stellantis, more of Volvo and Subaru. Its robots.txt allows crawling except /wp-admin/. Some automated fetchers get HTTP 400, so use the collector (works) or download by hand.
2. **I-CAR RTS OEM Information pages** (one per make) and its hosted manufacturer PDFs.
3. **Mopar Repair Connect:** public index of Stellantis position statements; only one has been read.
4. **GM Parts** trade-professional statements: more than the windshield one exist.
5. **Mercedes-Benz:** a position statement on post-collision diagnostics says calibration, normalization or coding is needed after windshield replacement or bumper, SRS or camera-sensor removal. Only an archived copy has been seen; find the live version and add it.
6. **Scanned PDFs** (several Hyundai, Kia, Mazda): read by hand or OCR.

Add pages to `tools/collector/seeds.json`, run `crawl` and `export-app`, then review in the app. For clear tables (like Honda's), enter rules directly in `tools/collector/curated_rules.json` with the exact quote.

## 8. Manufacturer service portals (what they are, and what not to do)

- Each manufacturer runs a technical information site (Toyota techinfo.toyota.com, Honda techinfo.honda.com, GM acdelcotds.com, Ford motorcraftservice.com, Stellantis techauthority.com, Nissan nissan-techinfo.com, Hyundai hyundaitechinfo.com, Kia kiatechinfo.com, Subaru techinfo.subaru.com, VW/Audi erwin.vw.com, BMW bmwtechinfo.com, Mercedes startekinfo.com, Volvo volvotechinfo.com; Tesla's manuals at service.tesla.com are free to read).
- They sell **day, month or year subscriptions**, usually per manufacturer family (for example GM's brands together), not per model. Confirm "what's included" and prices on each site; not verified here.
- A US right-to-repair agreement means manufacturers must offer this to independent shops; nastf.org lists how, make by make.
- **Do not scrape them**, even narrowly. Their terms forbid automated access; going through every model means thousands of near-identical requests, which gets accounts suspended; it is fragile; and a database built from a portal creates legal risk. We will not build that.
- **Allowed instead: a planned manual lookup.** List the vehicles and repairs you need, buy the shortest subscription, answer each by hand, and save a short record (result plus procedure number) with "Add our own record". Keep anything from a paid portal private; never put it in the public repo.

## 9. Hosting the I-CAR lookup (not decided)

Why a server is needed: a browser will not let a web page read another company's site directly, wherever the page's script is stored. GitHub Pages only hands out files, so the lookup runs in a small relay (`relay/server.js`, plain Node, no packages; `relay/icar.js` uses only `fetch()`). The app works without it on Pages, but sensors with no rule then stay Unverified.

- **Nothing in the code is tied to a hosting provider.** It runs anywhere with Node. It listens on `127.0.0.1` by default.
- **Testing now:** run it on a PC (`node relay/server.js`, then open http://localhost:8080).
- **For other adjusters, options:**
  - A small always-on server with a **fixed address** (the company's own or a cheap rented one). Preferred: the relay names itself ("TrueCalLookup") and we can tell I-CAR the name and address to expect.
  - A hosting platform or serverless function. Cloud address ranges are often blocked by sites, so test this before committing. This is about reliability, not hiding; the relay pauses itself if blocked.
  - A native iPhone app (for example a Capacitor wrapper) avoids the middle server because native apps are not under the browser rule. It needs an Apple developer account and publishing through TestFlight or the App Store.
- Do not expose a work PC to the internet for this.

## 10. Our own data (grows with use)

- **Shop and dealer documents** supplied on a claim: add as an own record with the document name and link.
- **Calibration reports** (asTech, Opus IVS, Autel and similar) usually name the manufacturer procedure; file the reference and promote it to a manufacturer-sourced rule once the original is found.
- **Cases the end user has won:** the sources he cited are the best first set.
- **Gap worklist (to build):** TrueCal lists every make, year, model and repair where it said Unverified, ranked by frequency, so a paid subscription day is not wasted.
- Team records live on the device (Review > Ours) and export with "Export review decisions". A team lead reviews them weekly and promotes common ones.

## 11. Source quality tiers

| Tier | Source | Shown in the app as |
|---|---|---|
| A | Manufacturer's own document with a link | "Manufacturer's own wording…" with quote and link |
| B | Licensed provider, or I-CAR's matrix, citing the manufacturer | "From I-CAR's matrix" (or the provider), with link |
| C | I-CAR or industry article quoting a manufacturer | Reviewed finding; open the original when you can |
| D | Our own records from claims | "Added by your team, NOT OEM-verified" |

Rules: **a rule needs a quote and a link, or it stays Unverified.** A manufacturer rule always overrides a team record (built). A missing rule is safe; a wrong one is not. Say what the document says, not more (Honda's radar rule is a front bumper fascia *repair within 300 mm*, so it is filed under "Front bumper repair (fascia)", not plain R&I). Use `conditionKey` for "only if bracket disturbed" or "airbag deployed". More specific rules (model and year) beat make-wide ones; a newer revision beats an older one.

## 12. Gaps to close, in order

1. Permission or a licence for the I-CAR matrix, and a coverage measurement across the makes the end user sees most.
2. Vehicles with no sensor list in I-CAR (for example Mercedes): manufacturer statements, then a licensed source.
3. Bumper removal and installation outside Honda/Acura.
4. Windshield replacement for Toyota, Ford, Hyundai/Kia, Mazda and Stellantis where I-CAR has no entry.
5. Model and year limits where a document names them.
6. Self-learning systems (almost no public statements yet).

## 13. Keeping it current

- Re-run the collector monthly. Unchanged pages are skipped; changed documents create new candidates.
- Record each source's revision date; flag rules older than 18 months.
- Track coverage with a make x repair grid (Sourced / I-CAR / Team record / Unverified). Not built yet.

## 14. Legal, licensing and liability

- Do not crawl paywalled or login portals (manufacturer portals, Mitchell, CCC, Opus, ALLDATA). Use licensed data or APIs.
- Store short quotes with links, not copies of manufacturer documents. Check each site's terms before adding it to `seeds.json`.
- The I-CAR lookup identifies itself, waits between requests, caches results, and stops if blocked. It never tries to look like a person or get past a challenge. Review I-CAR's terms and ask permission before wider use.
- **Liability:** the end user thinks Mitchell avoids calibration guidance because of liability. TrueCal has the same exposure. Keep wording informational, always show the manufacturer's sentence and the source, never present "not identified" as "not required", and have a lawyer review the wording and data licences before anyone else uses or buys it.
- Keep licensed data out of the public repo; import it per device (menu > Import rules file) or serve it privately.

## 15. Next actions (in order)

1. Send the end user the three questions in section 5; ask for his won cases.
2. Read I-CAR's website terms, then email I-CAR asking for permission or a licensed data feed for the calibration matrix.
3. Contact Opus IVS, then Mitchell, with the provider questions (section 6).
4. Choose a hosting approach for the relay (section 9) before anyone beyond testing uses the lookup.
5. Collect the free manufacturer statements for his top makes (section 7), starting with Mercedes.
6. Build the gap worklist and the make x repair coverage grid.
7. Get a lawyer's review of the disclaimer and the data terms before wider use.
