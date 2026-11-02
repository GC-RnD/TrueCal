# ADAS Calibration Rules App: Overview Notes

## Problem
Repair shops outsource ADAS calibrations and we can't verify which are necessary. Examples: a bumper removed and reinstalled where the OEM says the system self-calibrates or needs nothing. We currently use Mitchell, but its calibration coverage isn't thorough. Goal: an app that tells us, per vehicle and per repair, whether calibration is **required, not required, or self-learning**, backed by a cited source.

## Key Reality
- There is no single free, definitive database of calibration rules.
- Requirements are **trigger-based** (what was repaired or replaced) and vary by **VIN, model year, trim, and installed equipment**.
- A "not needed" ruling must cite the OEM document (position statement or service info), with its date.
- Copying OEM or aggregator data wholesale may violate their terms. Licensing is likely needed for a commercial app.

## Where the Rules Live
**OEM position statements and service info (authoritative)**
- Each manufacturer publishes which ADAS sensors need calibration after windshield replacement, bumper repair, alignment, collision, or module replacement.
- OEM service portals: Toyota TIS, Honda iN, Ford PTS, GM ACDelco TDS, and others. These are paid, with restrictive terms.

**Commercial aggregators (the realistic path to "definitive")**
- Mitchell/Enlyte, CCC ONE, Audatex/Solera, Opus IVS (ADAS calibration requirements), Autel, Bosch, Hunter, RepairLogic.
- They license structured data and APIs.

**Public references (context, not complete per-vehicle rules)**
- I-CAR, Collision Industry Conference, AAA ADAS research.
- NHTSA recalls/TSB database (free API).
- NHTSA vPIC API for VIN decoding (free).

## Systems in Scope
Forward camera, front radar, blind spot monitors, rear/backup camera, surround-view cameras, parking sensors, lane departure and keeping, adaptive cruise, night vision, and others.

## Proposed Data Model
Vehicle (VIN / year / make / model / trim)
→ ADAS system (camera, radar, blind spot, parking, etc.)
→ Trigger event (bumper R&I, windshield replacement, alignment, collision, module replacement, etc.)
→ Calibration type (static, dynamic, both, none, self-learning)
→ Source (OEM document, URL, publish date, retrieved date)

Add fields for confidence, conditions/notes (for example, "only if sensor bracket disturbed"), and last-verified date.

## Findings: Free Public Sources (checked 2026-11-02)
Hub sites that link to or host OEM statements, no login needed:
- **OEM1Stop** (oem1stop.com, run by the OEM Collision Repair Roundtable): best single index of OEM position statements. robots.txt only blocks /wp-admin/. Some automated fetchers get HTTP 400 from it; the files are public.
- **I-CAR RTS** (rts.i-car.com): hosts many OEM PDFs and news articles that quote OEM statements. Its "OEM Calibration Requirements Search" is a **public matrix** (no login needed to view): about 2,555 vehicle pages are listed in its sitemap, 2016 and newer, built from OEM service manuals and ADAS documents, with the OEM's wording quoted. I-CAR says it is not complete. See "I-CAR matrix lookup" below.

Verified OEM statements (each fetched and read):

| Make | What it says about sensor calibration | URL |
|---|---|---|
| Honda | Camera/radar aiming required after windshield R&R, structural collision repair, or radar/camera R&I; 4-wheel alignment first; calibration NOT required after wheel alignment alone unless service info says so | https://rts.i-car.com/images/pdf/oem-info/honda/position-statements/30193.pdf |
| Acura | Companion job aid with the same requirements | https://rts.i-car.com/images/pdf/oem-info/acura/position-statements/43998x.pdf |
| Honda/Acura | Diagnostic scan and calibration statement | https://oem1stop.com/wp-content/uploads/2026/10/Honda-Acura_Pos_Diag-Scans-Calib_Revised_FINAL7-25-1.pdf |
| GM | Service-point calibration/learn required whenever a front-view windshield camera or sensor is removed, reinstalled or replaced, or the windshield is replaced | https://www.gmparts.com/content/dam/gmparts/na/us/en/index/trade-professionals/position-statements/02-pdfs/windshield-replacement.pdf |
| Nissan | NPSB/26-971: calibration required after any ADAS component removal or replacement, and even after alignment | https://oem1stop.com/wp-content/uploads/2026/10/Nissan_Pos_ADAS_NPSB26-971_Revised1-1-26.pdf |
| Subaru | EyeSight calibration required after windshield replacement; genuine glass required | https://oem1stop.com/wp-content/uploads/2026/10/Subaru_Pos_Eyesight_FINAL4-16-20.pdf |
| Volvo | Camera and radar unit calibration required after windshield replacement; bumper repair effects on BLIS | https://oem1stop.com/wp-content/uploads/2026/10/Volvo_Position_ADAS2-22.pdf |
| Ford / Lincoln | Bumper fascia repair rules with ADAS (new OE fascia, no fillers); not a calibration table | https://rts.i-car.com/images/pdf/oem-info/ford/statements/44470.pdf |
| Toyota / Lexus | Only I-CAR articles quoting Toyota (health-check scan, blind-spot radar zone rules); the calibration procedures are behind a login portal | https://rts.i-car.com/crn-561.html |
| Hyundai, Kia, Genesis, Mazda, Subaru (scans), Chrysler/Stellantis | Pre/post-repair scan statements; calibration wording is general ("calibrated and free of DTCs") | see oem1stop.com and moparrepairconnect.com |

Nothing public found: **BMW** (login-only bmwtechinfo.com), **Tesla** (site blocks automated access), **VW brand** (no ADAS statement).

What this tells us:
- Free public sources give **policy-level statements** ("calibrate after windshield replacement"), not a full per-model, per-trigger matrix. That detail lives in paid OEM portals or licensed aggregator data.
- Public statements are enough for a useful first set of rules for Honda, Acura, GM, Nissan, Subaru and Volvo, mainly windshield and alignment triggers.
- Some statements are scanned images (several Hyundai/Kia/Mazda PDFs) and need manual reading.
- A collector tool (tools/collector) fetches these pages politely and produces candidate rows for human review; nothing is published without approval.

## Paid Data Providers, Ranked (researched 2026-11-02)
Scope: only sensor calibration requirements (which sensor, which repair, static/dynamic/none/self-learning, OEM source). Not general repair procedures or estimating. Pricing and licensing are mostly not public; no provider's public pages state an open API for an outside app, so every one needs a sales conversation.

| Rank | Provider | Why | Per-VIN | OEM citations | Price | Contact / URL |
|---|---|---|---|---|---|---|
| 1 | **Opus IVS** (ADAS MAP / ADAS MAP PRO) and sister product **asTech adasThink** (Repairify) | VIN-specific list of required calibrations and scans, built from OEM requirements, I-CAR RTS, ALLDATA and OEM1Stop; already feeds CCC ONE and Mitchell as structured data, which suggests a usable data interface | Yes | Yes | Not public | https://opusivs.com/adas-map-pro/ , https://www.astech.com/pages/adasthink , https://opusivs.com/about/contact-form/ |
| 2 | **I-CAR RTS** "OEM Calibration Requirements Search" | Best citation quality and the broadest free coverage. The matrix pages are public and list, per vehicle and sensor, the events that call for calibration. TrueCal has a live per-vehicle lookup built (local testing only). Terms not yet reviewed and permission not yet requested | Vehicle lookup by year, make and model (VIN decode not offered on the web page; an I-CAR mobile app accepts a VIN) | Yes, direct OEM quotes | Not public | https://rts.i-car.com/oem-calibration-requirements-search.html , https://rts.i-car.com/contact-us.html |
| 3 | **Mitchell (Enlyte)** Predictive ADAS / Mitchell Diagnostics | Per-vehicle calibration reports, single subscription for unlimited vehicles; built for Mitchell's own estimating workflow; you already use Mitchell | Yes | Says OEM-recommended; citation format not shown publicly | Not public | https://www.mitchell.com/solutions/collision-repairers/diagnostic-solutions , 800.448.4401 |
| 4 | **ALLDATA Collision** "ADAS Quick Reference" | Real OEM data but a reference and component locator, not a yes/no calibration engine; no API | No | General OEM data | $249/month (public); add-ons $129 and $59/month | https://www.alldata.com/us/en/collision |
| 5 | **CCC ONE Diagnostics Network** | Workflow software that passes through partners' calibration reports (Opus IVS, asTech, AirPro, Autel, Revv and others); not a data owner | Depends on partner | Partner's | Not public | https://www.cccis.com/collision-repairers/repair-solutions/diagnostics |

Excluded: Audatex/Solera and Identifix (general repair data, no calibration-requirement product found), MOTOR/Hearst (parts/labor data), Autel/Bosch/Hunter/Snap-on (equipment makers; requirements live inside their tools), AirPro/All Clear/Elitek/Kinetic/Revv/Azimuth/VSSTA (calibration service providers), CollisionLink (parts ordering).

Recommended order of outreach:
1. Opus IVS (and asTech): ask about a data API or export and display rights.
2. I-CAR RTS: ask what access an insurance-adjuster team can get and whether quoting is allowed.
3. Mitchell: since it is already in use, ask whether Predictive ADAS data can be exported or reported on outside Mitchell.

Questions for Opus IVS and I-CAR:
1. Is there a documented API or bulk export of VIN-level records (sensor, static/dynamic/self-learning, repair trigger, OEM source and date) for our own app, and what are the license terms and price?
2. What OEM document and date is cited for each determination, and how are citations refreshed when OEMs update statements?
3. What is the U.S. coverage by year/make/model, and may we show the underlying OEM text and citation inside our own app?

## Coverage: which makes the free sources support (as of 2026-11-02)
**Rules in the app today: 51**, entered from the manufacturer's own wording with the quote and source link kept (tools/collector/curated_rules.json): Honda 17, Acura 17, Nissan 12, GM 2, Volvo 2, Subaru 1. They were wording-checked by the assistant against the documents; a person can still confirm or hide the 183 remaining findings in the app's Review screen. Records a team adds on its own are stored separately and always labelled "not OEM-verified".

Examples of what is covered: Honda/Acura radar, camera and blind-spot aiming after sensor removal, windshield replacement, structural repair, airbag deployment and front bumper fascia repair near the radar; "not required after wheel alignment"; Acura/Honda multi-view camera aiming after front bumper and grille removal; GM, Subaru and Volvo windshield; Nissan any ADAS component removal and alignment.

The 183 findings are raw sentences, not a count of vehicles. A rule applies to every model and year of a make unless the document or reviewer limits the years or models.

| Tier | Makes | What can be supported |
|---|---|---|
| Best | Honda, Acura | Most detailed public source: the Aiming Driving Support Systems job aid lists when camera/radar aiming is required (windshield R&R, structural collision repair, radar/camera R&I) and that alignment alone does not require it. Per-model tables inside the PDF were flattened by text extraction, so read the PDF for model and year limits. |
| Good, narrow | GM (Chevrolet, GMC, Cadillac, Buick), Subaru, Volvo, Nissan | Windshield replacement and camera/radar replacement rules (Nissan also says after alignment). Little on bumper R&I. |
| Partial | Ford, Lincoln, Toyota, Lexus | Ford and Lincoln: bumper fascia repair rules only. Toyota: scan and blind-spot radar-zone rules only; calibration procedures are in a login portal. |
| Scan statements only | Hyundai, Kia, Genesis, Mazda, Chrysler/Dodge/Jeep/Ram | "Scan before and after repair and make sure systems are calibrated"; no per-trigger calibration rules. |
| Nothing public | BMW, Tesla, Volkswagen; Mercedes-Benz and Audi exist only as archived copies and were not collected | Needs a licensed source. |

By repair trigger: windshield replacement and wheel alignment are the best covered; front and rear bumper R&I (the most common adjuster question) is mostly missing from free sources. That gap is the main reason to license data from Opus IVS, I-CAR or Mitchell.

Review workflow in the app (menu, Review findings): each finding shows the sentence, a link to the source, and guessed make, sensors, repair and result. Yes keeps it as a rule (with the sentence and link shown on every ruling that uses it); No hides it (kept in the Hidden tab, can be restored). Decisions live on the device and can be exported from the menu, then recorded in the collector database with `import-decisions` so hidden findings do not come back on the next crawl.

## I-CAR matrix lookup (built 2026-11-02, local testing)
When a sensor has no reviewed rule, the app asks a small relay (`relay/server.js`) for I-CAR's matrix entry for that one vehicle (year, make, model). If I-CAR lists the selected repair for that sensor, the ruling is "Calibration required" with I-CAR's wording and a link to its page, labelled as from I-CAR's matrix. Otherwise the sensor stays Unverified and the card shows what I-CAR does list.

What we learned from I-CAR's own guide (rts.i-car.com/crn-483.html):
- The matrix covers 2016 and newer vehicles and "does not contain all production vehicles".
- "No calibration/initialization requirements" means the manufacturer's manual does not specify one. It does not mean none is needed.
- "If DTC indicates" means a trouble code may call for calibration that I-CAR could not list.
- Manuals use other words for calibration (initialization, relearn, alignment, adjustment; Mercedes says normalization and coding), and events can differ by model year.
- Some vehicles have only "Refer To OEM Scan Tool For Camera/Sensor Identification And Requirements" (for example the 2022 Mercedes-Benz E-Class), with no sensor list.
- When nothing is found, I-CAR's page for the make (`rts.i-car.com/oem-information/<make>.html`) and its ADAS article list are the next places to look.

Tested working: Acura, Toyota, Kia, Chevrolet, Dodge Durango. Terms of use are not yet reviewed and permission has not been requested; do that before anything beyond testing. The relay is host-neutral (plain Node); no hosting provider has been chosen.

End user input (2026-11-02): he uses Mitchell Connect, and Mitchell gives no guidance on whether to calibrate, which he attributes to liability. His company has pressed Mitchell for about two years. He wants adjusters to see the answer before the shop's quote.

## Plan
1. Define the schema and a VIN decode step using NHTSA vPIC.
2. Prototype ingestion of public OEM position statements for a few makes.
3. Contact Opus IVS, Mitchell, and CCC about API/data licensing.
4. Build the app: enter a VIN and the repair performed, then get a ruling with its source, and a printable summary to challenge or confirm a shop's quote.
5. Consider legal and liability disclaimers. The app should always cite the OEM source.

## Name Ideas
- **CalCheck**
- **CalibrateRight**
- **SensorSense**
- **ADAS Verify**
- **RecalCheck**
- **TrueCal**
- **CalCert**
- **SecondSight** (a second opinion on calibrations)
- **NeedCal?**
- **CalFact**

Check domain, trademark, and app-store availability before settling on one.

## Open Questions
- Which manufacturers matter most for our fleet?
- Which repair triggers are the most common (bumper R&I, windshield, alignment)?
- Do we need a licensed data source from day one, or can we start with public OEM documents?
- Who is the end user: us as the customer, or other customers and adjusters?
