# TrueCal collector

Finds *candidate* calibration statements on public pages so a person can review them. It never publishes anything by itself.

```
seeds.json ──► crawl ──► SQLite (truecal-rules.db) ──► export-app ──► data/candidates.json ──► Review screen in the app
                                   ▲                                                              │
                                   └──────── import-decisions ◄── menu: Export review decisions ◄─┘
```

## Everyday use
1. `python collect.py crawl` — fetch the pages listed in `seeds.json` (polite: robots.txt, rate-limited).
2. `python collect.py export-app` — write `data/candidates.json` (what to review) and `data/rules.json` (already-approved rules).
3. In the app: menu ☰ → **Review findings**. **Yes** keeps a finding as a rule; **No** hides it (kept, not deleted, restorable from the Hidden tab).
4. Menu ☰ → **Export review decisions** saves a JSON file. Run `python collect.py import-decisions <that file>` so the database remembers your answers (hidden findings never come back), then `export-app` again.

Decisions made in the app take effect on that device immediately; step 4 only matters when you want them in the shared files.

## Setup (once)
```
pip install pypdf          # for PDF position statements
copy seeds.example.json seeds.json
```
Edit `seeds.json`: set `contact` (email or URL, sent in the User-Agent) and list real public OEM / industry pages. Each seed has a `make`, a start `url`, `depth` (links to follow), `max_pages`, and `follow` keywords.

## Optional: review in Excel instead
`export-csv` → edit `out/review.csv` (status = approved / rejected) → `import-csv` → `export-app`.

## Rules of the road
- Respects `robots.txt`, identifies itself, waits `delay_seconds` between requests, same-site links only.
- Stores URL, fetch date, content hash and ~500-character excerpts, not full copies of pages.
- Check each site's terms before crawling. Paywalled OEM portals (Toyota TIS, Honda iN, Ford PTS, etc.) and aggregators (Mitchell, CCC, Opus) are **not** to be scraped; use their licensed data or API.
- Re-run `crawl` later: unchanged pages are skipped, changed pages add new candidates.
- The guesses for sensor, repair and result are keyword hints only. A person approves every rule.
