# Fortifying the TrueCal Knowledge Base

How to add sources so more makes, repairs and sensors get a sourced answer instead of "Unverified". Goal stays narrow: **sensor calibration requirements only** (which sensor, after which repair, static / dynamic / none / self-learning, with the OEM source).

_Written 2026-11-02. Facts about providers come from public web pages only; prices and API terms are mostly "not public" and need a sales call._

---

## 1. Where we are

- **51 rules** in the app, entered from manufacturer wording with the exact quote and a source link: Honda 17, Acura 17, Nissan 12, GM 2, Volvo 2, Subaru 1.
- **183 findings** still waiting for review in the app (raw sentences from the same documents).
- **No rule** for Toyota, Lexus, Ford, Lincoln, Hyundai, Kia, Genesis, Mazda, Stellantis, BMW, Mercedes-Benz, VW, Audi, Tesla and most others.
- **Weakest trigger:** bumper R&I (the most common adjuster question). Only Honda/Acura (front) are covered.

## 2. Source tiers (what each is worth)

| Tier | Source | Trust | Shown in the app as |
|---|---|---|---|
| A | Manufacturer's own document (position statement, job aid, service bulletin) with a link | Highest | "Manufacturer's own wording…" with quote and link |
| B | Licensed aggregator that cites the OEM document (Opus IVS, I-CAR RTS matrix, Mitchell) | High, if it gives the OEM citation | Same as A, source = the OEM document it cites |
| C | I-CAR / industry article quoting an OEM | Medium (secondhand) | Reviewed finding; open the OEM original when you can |
| D | Our own records from claims (dealer bulletin, calibration report, scan report) | Low until corroborated | "Added by your team, NOT OEM-verified" |

Rule of thumb: **a rule needs a quote and a link, or it stays Unverified.** A manufacturer rule always overrides a team record (already built).

## 3. Free sources still to mine (no subscription)

Do these first; they cost nothing.

1. **OEM1Stop** (oem1stop.com, OEM Collision Repair Roundtable): one page per manufacturer listing position statements. Targets by make: Toyota/Lexus, Ford/Lincoln, Hyundai/Kia/Genesis, Mazda, Mitsubishi, Subaru (done: windshield; scan statements still to read), Infiniti, VW/Audi, Mercedes-Benz, Volvo (19 statements listed, only ADAS read), Stellantis. Its robots.txt allows crawling except /wp-admin/; some automated fetchers get HTTP 400, so use the collector (works) or download PDFs by hand.
2. **I-CAR RTS** (rts.i-car.com): hosts many OEM PDFs under `/images/pdf/oem-info/<make>/...` and calibration "Research Tips" articles that quote OEMs. Check what the "OEM Calibration Requirements Search" tool allows without a membership.
3. **Mopar Repair Connect** (moparrepairconnect.com/collision/resources/position-statements/): public index of Stellantis statements; only the scan-tool statement has been read.
4. **GM Parts trade-professional position statements** (gmparts.com): more than the windshield statement exists on the same site.
5. **Hyundai/Kia/Genesis/Mazda scanning PDFs**: several are scanned images. Read them by hand or run OCR, then enter the rules.
6. **Archived Audi / Mercedes-Benz statements** (copies of oem1stop files on the Wayback Machine): read and cite the live oem1stop address if it still exists.
7. **Joint industry statements** (e.g. the 2019 automaker association statement): useful as a general "follow OEM procedures" reference, not as per-repair rules.

How to add them: put the pages in `tools/collector/seeds.json`, run `crawl` and `export-app`, then review in the app. For clear tables (like Honda's), enter rules directly in `tools/collector/curated_rules.json` with the exact quote.

## 4. Paid sources (ranked, from the earlier research)

| Rank | Provider | Why | Next step |
|---|---|---|---|
| 1 | Opus IVS (ADAS MAP / ADAS MAP PRO) and asTech adasThink (Repairify) | Per-VIN calibration requirements citing OEM sources, I-CAR RTS and others; already feeds CCC ONE and Mitchell | Ask about a data API/export and display rights |
| 2 | I-CAR RTS "OEM Calibration Requirements Search" | Best citations (direct OEM quotes); looks like a lookup portal, not a feed | Ask what access an adjuster team gets and whether quoting is allowed |
| 3 | Mitchell (Enlyte) Predictive ADAS | Per-vehicle reports, already your estimating tool | Ask whether the data can be exported or used outside Mitchell |
| 4 | ALLDATA Collision | Public price $249/month; reference only, no yes/no engine, no API | Only if a human lookup is enough |
| 5 | CCC ONE Diagnostics Network | Pass-through of partners' reports; not a data owner | Ask which partners supply requirement data |

Questions to ask the top two (also in the overview):
1. Is there a documented API or bulk export of VIN-level records (sensor, static/dynamic/self-learning, trigger, OEM source and date) for our own app, and under what terms and price?
2. What OEM document and date is cited per determination, and how are citations refreshed?
3. What is the U.S. coverage by year/make/model, and may we display the OEM text and citation inside our app?

If a provider will not license data, the fallback is to use their lookup as the **human verification step** (adjuster checks the answer there, then records the OEM citation in TrueCal).

## 5. Our own data (cheap, and grows with use)

Every claim where TrueCal says Unverified is a chance to add a sourced record:
- **Dealer or OEM bulletin** the shop supplies: add it with its document name and link.
- **Calibration reports** from asTech, Opus IVS, Autel and similar (they usually list the OEM procedure): file the reference; promote to a Tier A/B rule when the OEM document is found.
- **Adjuster-added records** are stored on the device (Review > Ours) and exported with "Export review decisions". Plan: a team lead reviews exported records weekly, finds the OEM source for the common ones, and promotes them into `curated_rules.json`.

## 6. Gaps to close, in order

1. **Bumper R&I** (front and rear) for the top 10 makes in your claims. Ask which makes these are; the work should follow your volume.
2. **Windshield replacement** for Toyota, Ford, Hyundai/Kia, Mazda, Stellantis (often a single sentence in an OEM statement).
3. **Wheel alignment** and **sensor removal/replacement** for every make already partly covered.
4. **Model and year limits.** Most rules apply to a whole make. Where a document names models or years, add `models` / `yearFrom` / `yearTo`.
5. **Blind-spot, parking-sensor and rear/surround camera** rules, which are thin outside Honda/Acura.
6. **Self-learning** systems (almost no public statements yet).

## 7. Quality rules (keep these when adding anything)

- Every rule: `quote` (exact sentence), `source.url`, `source.title`, retrieved date, and `origin`.
- **Say what the document says, not more.** Example: Honda's radar rule is a front bumper fascia *repair within 300 mm*, so it is filed under "Front bumper repair (fascia)", not plain "R&I".
- **Conflicts:** more specific wins (model/year over make-wide), a manufacturer source beats a team record, a newer revision beats an older one.
- **Conditions** ("only if bracket disturbed", airbag deployed) use `conditionKey` so the app asks the right questions.
- **If unsure, leave it Unverified.** A missing rule is safe; a wrong rule is not.

## 8. Keeping it current

- Re-run the collector monthly. Unchanged pages are skipped; changed documents add new candidates.
- Record each source's revision date; flag rules whose source is older than 18 months.
- When an OEM issues a new statement, update the rule and keep the old `retrieved` date in notes.
- Track coverage: a simple make x trigger grid showing Sourced / Team record / Unverified, so gaps are visible. (Not built yet.)

## 9. Legal and licensing guardrails

- Do not crawl paywalled or login portals (Toyota TIS, Honda iN, Ford PTS, GM ACDelco TDS, Mitchell, CCC, Opus, ALLDATA). Use licensed data or API only.
- Store short quotes with links, not full copies of OEM documents.
- Check each site's terms before adding it to `seeds.json`. Respect robots.txt (the collector does).
- If the repo or app is public, keep licensed data out of it: import it on each device instead (menu > Import rules file).
- Keep the disclaimer: informational only; confirm with current OEM service information.

## 10. Suggested next actions

1. Tell us the top makes in your claims, so the next source work follows volume.
2. Collect the rest of OEM1Stop and Mopar statements for those makes (free).
3. Contact Opus IVS, then I-CAR, then Mitchell with the three questions above.
4. Start capturing dealer/bulletin references from live claims through "Add our own record".
5. Add the make x trigger coverage grid so progress is measurable.
