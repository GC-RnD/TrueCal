#!/usr/bin/env python3
"""TrueCal collector: finds candidate calibration statements on public pages, for HUMAN review.

Nothing found here is a ruling. Every finding is a candidate until a person approves it.

  python collect.py crawl         fetch the pages in seeds.json (respects robots.txt, rate-limited)
  python collect.py stats         counts of pages and findings
  python collect.py export-csv    write out/review.csv for review in Excel
  python collect.py import-csv    read the reviewed CSV back into the database
  python collect.py build-rules   write out/rules.json from approved findings (import it in the app menu)
  python collect.py export-app    write data/candidates.json (to review in the app) and data/rules.json (approved rules)
  python collect.py import-decisions FILE   record the decisions exported from the app's review screen

The database stores the URL, fetch date, a content hash and short excerpts (not full copies of pages).
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.robotparser import RobotFileParser

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "truecal-rules.db"
SEEDS_PATH = HERE / "seeds.json"
OUT_DIR = HERE / "out"
RULES_JS = HERE.parent.parent / "js" / "rules.js"

MAX_BYTES = 15 * 1024 * 1024
EXCERPT_CHARS = 500
VALID_RESULTS = ["required", "not-required", "self-learning"]
VALID_METHODS = ["static", "dynamic", "both", "none"]
VALID_CONFIDENCE = ["high", "medium", "low"]
VALID_STATUS = ["candidate", "approved", "rejected"]


def vocab(name):
    """Reads the sensor / trigger / condition ids from the app's rules.js so the two never drift apart."""
    text = RULES_JS.read_text(encoding="utf-8")
    block = re.search(rf"const {name} = \[(.*?)\n\];", text, re.S).group(1)
    return re.findall(r'id: "([^"]+)"', block)


SYSTEM_PATTERNS = {
    "forward-camera": r"forward[- ]?(facing )?camera|front[- ]?(view )?(windshield )?camera|windshield[- ]?(mounted )?camera|monocular|stereo camera|camera sensor|eyesight|front view",
    "front-radar": r"front radar|forward radar|millimeter|mmw|radar sensor|radar unit|\bradar\b",
    "blind-spot": r"blind[- ]?spot|side object|\bbsm\b|\bbsw\b",
    "rear-camera": r"rear[- ]?(view )?camera|back[- ]?up camera|reversing camera",
    "surround-camera": r"surround[- ]?view|around view|360[- ]?degree|bird.?s[- ]?eye",
    "parking-sensors": r"park(ing)?[- ]?(assist )?sensor|ultrasonic|sonar",
    "lane-keeping": r"lane[- ]?(departure|keep|centering)|\bldw\b|\blka\b",
    "adaptive-cruise": r"adaptive cruise|dynamic radar cruise|\bacc\b",
    "night-vision": r"night[- ]?vision|infrared camera",
}
TRIGGER_PATTERNS = {
    "bumper-front-ri": r"front bumper",
    "bumper-rear-ri": r"rear bumper",
    "windshield": r"windshield|front glass|windscreen",
    "alignment": r"alignment|thrust angle",
    "collision-structural": r"collision|structural|frame repair|body repair|accident",
    "module-replacement": r"(replac\w+|install\w*)\W+(\w+\W+){0,3}(module|sensor|camera|radar)",
    "suspension": r"suspension|ride height",
    "mirror-door-liftgate": r"mirror|\bdoor\b|liftgate|tailgate|trunk lid",
}
CALIBRATION = re.compile(r"re-?calibrat|calibrat|aiming|initializ", re.I)
NEGATIVE = re.compile(r"not (be )?(required|necessary|needed)|no (static |dynamic )?(re-?)?calibration|does not require|do not require|no need", re.I)
SELF = re.compile(r"self[- ]?(re-?)?(calibrat|learn)|automatic(ally)? (re-?)?(calibrat|learn)|learns? (during|while|as)", re.I)
POSITIVE = re.compile(r"required|must be|necessary|need(s|ed)? to be|should be (re-?)?calibrat|perform(ed)? a (static|dynamic)", re.I)
GENERIC_SENSOR = re.compile(r"\b(adas|driver[- ]assist\w*|camera|radar|sensor|aiming|driving support)\b", re.I)
STATIC = re.compile(r"\bstatic\b", re.I)
DYNAMIC = re.compile(r"\bdynamic\b|drive cycle|road test", re.I)


# ---------- Fetching (polite: robots.txt, identified, rate-limited) ----------

class Fetcher:
    def __init__(self, user_agent, delay):
        self.user_agent = user_agent
        self.delay = delay
        self.last_hit = {}
        self.robots = {}

    def _throttle(self, host):
        wait = self.delay - (time.time() - self.last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        self.last_hit[host] = time.time()

    def _open(self, url):
        request = urllib.request.Request(url, headers={"User-Agent": self.user_agent, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.1"})
        return urllib.request.urlopen(request, timeout=30)

    def allowed(self, url):
        parts = urllib.parse.urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            parser = RobotFileParser()
            try:
                self._throttle(parts.netloc)
                with self._open(f"{origin}/robots.txt") as response:
                    parser.parse(response.read().decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as err:
                if err.code in (401, 403):
                    parser.disallow_all = True
                else:
                    parser.allow_all = True
            except Exception:
                parser.allow_all = True
            self.robots[origin] = parser
        return self.robots[origin].can_fetch(self.user_agent, url)

    def get(self, url):
        self._throttle(urllib.parse.urlsplit(url).netloc)
        with self._open(url) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("file too large")
            return response.status, response.headers.get_content_type(), body, response.headers.get("Last-Modified", "")


class PageParser(HTMLParser):
    BLOCKS = {"p", "div", "li", "tr", "br", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "table"}
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header"}

    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.title = ""
        self.parts = []
        self.links = []
        self._skip = 0
        self._in_title = False
        self._href = None
        self._anchor = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag in self.BLOCKS:
            self.parts.append("\n")
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._anchor = []

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in self.BLOCKS:
            self.parts.append("\n")
        if tag == "a" and self._href:
            self.links.append((urllib.parse.urljoin(self.base, self._href), " ".join(self._anchor)))
            self._href = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._skip:
            return
        self.parts.append(data)
        if self._href is not None:
            self._anchor.append(data.strip())

    def text(self):
        return re.sub(r"[ \t\r\f\v]+", " ", "".join(self.parts))


def pdf_text(body):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("PDF support needs: pip install pypdf")
    reader = PdfReader(io.BytesIO(body))
    title = ""
    try:
        title = (reader.metadata.title or "") if reader.metadata else ""
    except Exception:
        pass
    # PDF lines break mid-sentence, so join them and let the sentence splitter do its job.
    return title, re.sub(r"\s*\n\s*", " ", "\n".join((page.extract_text() or "") for page in reader.pages))


# ---------- Database ----------

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS pages (
          id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, make TEXT, fetched_at TEXT, http_status INTEGER,
          content_type TEXT, sha256 TEXT, title TEXT, last_modified TEXT);
        CREATE TABLE IF NOT EXISTS findings (
          id INTEGER PRIMARY KEY, page_id INTEGER NOT NULL REFERENCES pages(id),
          excerpt TEXT NOT NULL, excerpt_hash TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'candidate',
          make TEXT, models TEXT, year_from INTEGER, year_to INTEGER,
          system TEXT, trigger TEXT, condition_key TEXT, result TEXT, method TEXT,
          notes TEXT, confidence TEXT, published TEXT, source_title TEXT, source_url TEXT);
        """
    )
    return conn


# ---------- Finding candidates ----------

def first_match(patterns, text):
    for key, pattern in patterns.items():
        if re.search(pattern, text, re.I):
            return key
    return ""


def make_findings(text, make):
    units = [u.strip() for u in re.split(r"(?<=[.!?])\s+|\n+", text) if u.strip()]
    found = []
    for i, unit in enumerate(units):
        if not CALIBRATION.search(unit):
            continue
        # Prefer the sentence alone; borrow the previous sentence only when this one names no sensor.
        window = unit[:EXCERPT_CHARS]
        system = first_match(SYSTEM_PATTERNS, window)
        if not system and i > 0:
            window = " ".join(units[i - 1: i + 1])[:EXCERPT_CHARS]
            system = first_match(SYSTEM_PATTERNS, window)
        if not system and GENERIC_SENSOR.search(window):
            system = ""  # a sensor is mentioned but not one we recognise; the reviewer picks it
        elif not system:
            continue
        years = [int(y) for y in re.findall(r"\b(19[89]\d|20[0-4]\d)\b", window)]
        result = "not-required" if NEGATIVE.search(window) else "self-learning" if SELF.search(window) else "required" if POSITIVE.search(window) else ""
        static, dynamic = bool(STATIC.search(window)), bool(DYNAMIC.search(window))
        method = "both" if static and dynamic else "static" if static else "dynamic" if dynamic else ""
        found.append(
            {
                "excerpt": window, "make": make, "system": system, "trigger": first_match(TRIGGER_PATTERNS, window),
                "result": result, "method": method,
                "year_from": min(years) if years else None, "year_to": max(years) if years else None,
            }
        )
    return found


def store_page(conn, url, make, status, ctype, body, title, text, last_modified):
    digest = hashlib.sha256(body).hexdigest()
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    row = conn.execute("SELECT id, sha256 FROM pages WHERE url = ?", (url,)).fetchone()
    if row and row["sha256"] == digest:
        conn.execute("UPDATE pages SET fetched_at = ? WHERE id = ?", (now, row["id"]))
        return 0
    if row:
        conn.execute(
            "UPDATE pages SET make=?, fetched_at=?, http_status=?, content_type=?, sha256=?, title=?, last_modified=? WHERE id=?",
            (make, now, status, ctype, digest, title, last_modified, row["id"]),
        )
        page_id = row["id"]
    else:
        page_id = conn.execute(
            "INSERT INTO pages (url, make, fetched_at, http_status, content_type, sha256, title, last_modified) VALUES (?,?,?,?,?,?,?,?)",
            (url, make, now, status, ctype, digest, title, last_modified),
        ).lastrowid
    added = 0
    for finding in make_findings(text, make):
        key = hashlib.sha256(f"{url}|{finding['excerpt']}".encode()).hexdigest()
        try:
            conn.execute(
                "INSERT INTO findings (page_id, excerpt, excerpt_hash, make, system, trigger, result, method, year_from, year_to) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (page_id, finding["excerpt"], key, finding["make"], finding["system"], finding["trigger"], finding["result"], finding["method"], finding["year_from"], finding["year_to"]),
            )
            added += 1
        except sqlite3.IntegrityError:
            pass
    return added


def crawl(args):
    if not SEEDS_PATH.exists():
        sys.exit(f"Create {SEEDS_PATH.name} first (see seeds.example.json).")
    config = json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
    contact = config.get("contact", "")
    if not contact:
        sys.exit('Add a "contact" (email or URL) to seeds.json so site owners can reach you.')
    fetcher = Fetcher(f"TrueCalCollector/0.1 (+{contact})", float(config.get("delay_seconds", 2)))
    conn = connect()
    for seed in config["seeds"]:
        start = seed["url"].split("#")[0]
        host = urllib.parse.urlsplit(start).netloc
        follow = [k.lower() for k in seed.get("follow", ["calibrat", "adas", "position", "statement", "sensor", "collision"])]
        queue, seen, fetched = [(start, 0)], set(), 0
        print(f"== {seed.get('make', '?')}: {start}")
        while queue and fetched < int(seed.get("max_pages", 40)):
            url, depth = queue.pop(0)
            if url in seen:
                continue
            seen.add(url)
            if not fetcher.allowed(url):
                print(f"   skip (robots.txt): {url}")
                continue
            try:
                status, ctype, body, last_modified = fetcher.get(url)
                links = []
                if ctype == "application/pdf":
                    title, text = pdf_text(body)
                elif ctype in ("text/html", "application/xhtml+xml"):
                    parser = PageParser(url)
                    parser.feed(body.decode("utf-8", "replace"))
                    title, text, links = parser.title.strip(), parser.text(), parser.links
                else:
                    continue
            except Exception as err:
                print(f"   failed: {url} ({err})")
                continue
            fetched += 1
            added = store_page(conn, url, seed.get("make", ""), status, ctype, body, title, text, last_modified)
            conn.commit()
            print(f"   {added:3d} new  {url}")
            if depth < int(seed.get("depth", 1)):
                for link, anchor in links:
                    link = link.split("#")[0]
                    parts = urllib.parse.urlsplit(link)
                    if parts.scheme in ("http", "https") and parts.netloc == host and link not in seen:
                        if any(k in f"{link} {anchor}".lower() for k in follow):
                            queue.append((link, depth + 1))
    stats(args)


# ---------- Review round trip (CSV) ----------

REVIEW_COLUMNS = [
    "id", "status", "make", "models", "year_from", "year_to", "system", "trigger", "condition_key", "result", "method",
    "notes", "confidence", "published", "source_title", "source_url", "excerpt", "page_url", "page_title", "fetched_at",
]
EDITABLE = [c for c in REVIEW_COLUMNS if c not in ("id", "excerpt", "page_url", "page_title", "fetched_at")]


def export_csv(args):
    conn = connect()
    OUT_DIR.mkdir(exist_ok=True)
    rows = conn.execute(
        "SELECT f.*, p.url AS page_url, p.title AS page_title, p.fetched_at FROM findings f JOIN pages p ON p.id = f.page_id "
        "WHERE f.status = 'candidate' ORDER BY (f.system != '' AND f.trigger != '' AND f.result != '') DESC, "
        "(f.system != '' AND f.result != '') DESC, p.make, p.url, f.id"
    ).fetchall()
    path = OUT_DIR / "review.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS)
        writer.writeheader()
        for row in rows:
            record = {c: ("" if row[c] is None else row[c]) for c in REVIEW_COLUMNS if c in row.keys()}
            record["source_url"] = record.get("source_url") or row["page_url"]
            record["source_title"] = record.get("source_title") or row["page_title"]
            writer.writerow(record)
    print(f"Wrote {len(rows)} candidates to {path}")
    print("Edit in Excel: set status to approved or rejected, and fill/correct result, method, years, system, trigger.")


def import_csv(args):
    conn = connect()
    path = Path(args.file) if args.file else OUT_DIR / "review.csv"
    updated = 0
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for record in csv.DictReader(handle):
            if record["status"] not in VALID_STATUS:
                print(f"   id {record['id']}: unknown status '{record['status']}', skipped")
                continue
            values = []
            for column in EDITABLE:
                value = (record.get(column) or "").strip()
                if column in ("year_from", "year_to"):
                    value = int(value) if value.isdigit() else None
                values.append(value if value != "" else None)
            conn.execute(f"UPDATE findings SET {', '.join(c + '=?' for c in EDITABLE)} WHERE id=?", (*values, int(record["id"])))
            updated += 1
    conn.commit()
    print(f"Updated {updated} findings from {path}")


MAKE_ALIAS = {"Chrysler": "Stellantis"}  # the app matches "Stellantis" to Chrysler, Dodge, Jeep and Ram (see MAKE_GROUPS in rules.js)


def clean_text(text):
    """PDF bullets and curly quotes can arrive as the replacement character; make them readable."""
    text = re.sub(r"(?<=\w)\ufffd(?=\w)", "'", text)
    return text.replace("\ufffd", "-").strip()


def clean_title(title, url):
    """PDF metadata titles often look like 'Microsoft Word - Job Aid (Acura) ... .docx'."""
    title = re.sub(r"^Microsoft (Word|PowerPoint|Excel) - ", "", title or "").strip()
    title = re.sub(r"\.(docx?|pptx?|xlsx?)$", "", title, flags=re.I)
    title = re.sub(r"[.\s]*SOURCE FILE.*$", "", title, flags=re.I).strip()
    return title or url.rsplit("/", 1)[-1]


def norm_key(text):
    return re.sub(r"\W+", " ", text.lower()).strip()[:220]


def approved_rules(conn):
    systems, triggers, conditions = vocab("SENSORS"), vocab("TRIGGERS"), vocab("CONDITIONS")
    today = dt.date.today().isoformat()
    rules, problems = [], []
    rows = conn.execute(
        "SELECT f.*, p.url AS page_url, p.title AS page_title, p.fetched_at FROM findings f JOIN pages p ON p.id = f.page_id WHERE f.status = 'approved'"
    ).fetchall()
    for row in rows:
        url = row["source_url"] or row["page_url"]
        issues = []
        if not row["make"]:
            issues.append("make is empty")
        if row["system"] not in systems:
            issues.append(f"system '{row['system']}' is not one of {systems}")
        if row["trigger"] not in triggers:
            issues.append(f"trigger '{row['trigger']}' is not one of {triggers}")
        if row["condition_key"] and row["condition_key"] not in conditions:
            issues.append(f"condition_key '{row['condition_key']}' is not one of {conditions}")
        if row["result"] not in VALID_RESULTS:
            issues.append(f"result must be one of {VALID_RESULTS}")
        if row["method"] and row["method"] not in VALID_METHODS:
            issues.append(f"method must be one of {VALID_METHODS}")
        if not re.match(r"https?://", url or ""):
            issues.append("source_url must be an http(s) link")
        if issues:
            problems.append((row["id"], issues))
            continue
        rule = {
            "id": f"c{row['id']}", "make": MAKE_ALIAS.get(row["make"], row["make"]), "system": row["system"], "trigger": row["trigger"], "result": row["result"],
            "method": row["method"] or ("none" if row["result"] != "required" else ""),
            "notes": row["notes"] or "", "quote": clean_text(row["excerpt"]), "origin": "user-reviewed",
            "confidence": row["confidence"] if row["confidence"] in VALID_CONFIDENCE else "medium",
            "verified": today,
            "source": {"title": clean_title(row["source_title"] or row["page_title"], url), "url": url, "published": row["published"] or "", "retrieved": (row["fetched_at"] or "")[:10]},
        }
        if row["models"]:
            rule["models"] = [m.strip() for m in row["models"].split(";") if m.strip()]
        if row["year_from"]:
            rule["yearFrom"] = row["year_from"]
        if row["year_to"]:
            rule["yearTo"] = row["year_to"]
        if row["condition_key"]:
            rule["conditionKey"] = row["condition_key"]
        rules.append(rule)
    return rules, problems, today


def build_rules(args):
    conn = connect()
    rules, problems, today = approved_rules(conn)
    OUT_DIR.mkdir(exist_ok=True)
    path = OUT_DIR / "rules.json"
    path.write_text(json.dumps({"version": f"collected-{today}", "updated": today, "rules": rules}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(rules)} rules to {path}")
    for finding_id, issues in problems:
        print(f"   finding {finding_id} not exported: {'; '.join(issues)}")


APP_DATA = HERE.parent.parent / "data"


def export_app(args):
    """Writes the files the app reads: data/candidates.json (to review in the app) and data/rules.json (approved rules)."""
    conn = connect()
    rows = conn.execute(
        "SELECT f.*, p.url AS page_url, p.title AS page_title, p.fetched_at FROM findings f JOIN pages p ON p.id = f.page_id "
        "WHERE f.status = 'candidate' ORDER BY (f.system != '' AND f.trigger != '' AND f.result != '') DESC, "
        "(f.system != '' AND f.result != '') DESC, p.make, p.url, f.id"
    ).fetchall()
    seen, candidates = set(), []
    for row in rows:
        key = norm_key(row["excerpt"])
        if len(key) < 25 or key in seen:  # the same sentence on several pages (menus, headlines) is shown once
            continue
        seen.add(key)
        candidates.append(
            {
                "id": row["id"], "make": MAKE_ALIAS.get(row["make"], row["make"]), "system": row["system"], "trigger": row["trigger"],
                "result": row["result"], "method": row["method"], "yearFrom": row["year_from"], "yearTo": row["year_to"],
                "excerpt": clean_text(row["excerpt"]),
                "source": {"title": clean_title(row["page_title"], row["page_url"]), "url": row["page_url"], "retrieved": (row["fetched_at"] or "")[:10]},
            }
        )
    rules, problems, today = approved_rules(conn)
    curated_path = HERE / "curated_rules.json"
    if curated_path.exists():
        rules = json.loads(curated_path.read_text(encoding="utf-8"))["rules"] + rules  # hand-entered from the OEM wording
    (APP_DATA / "candidates.json").write_text(json.dumps({"generated": today, "candidates": candidates}, indent=1, ensure_ascii=False), encoding="utf-8")
    (APP_DATA / "rules.json").write_text(json.dumps({"version": f"collected-{today}", "updated": today, "rules": rules}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(candidates)} candidates and {len(rules)} approved rules to {APP_DATA}")
    for finding_id, issues in problems:
        print(f"   finding {finding_id} not exported as a rule: {'; '.join(issues)}")


def import_decisions(args):
    """Reads the decisions file exported from the app (menu > Export review decisions) so the database remembers them."""
    conn = connect()
    data = json.loads(Path(args.file).read_text(encoding="utf-8"))
    approved = rejected = 0
    for decision in data.get("decisions", []):
        row = conn.execute("SELECT excerpt FROM findings WHERE id = ?", (decision["id"],)).fetchone()
        if not row:
            continue
        if decision["status"] == "approved":
            rules = decision["rules"]
            first = rules[0]
            conn.execute(
                "UPDATE findings SET status='approved', make=?, models=?, year_from=?, year_to=?, system=?, trigger=?, condition_key=?, result=?, method=?, notes=?, confidence=? WHERE id=?",
                (first.get("make"), ";".join(first.get("models") or []) or None, first.get("yearFrom"), first.get("yearTo"), first.get("system"), first.get("trigger"),
                 first.get("conditionKey"), first.get("result"), first.get("method"), first.get("notes"), first.get("confidence"), decision["id"]),
            )
            # a sentence that applies to several sensors becomes one finding row per sensor
            base = conn.execute("SELECT page_id, excerpt, excerpt_hash FROM findings WHERE id = ?", (decision["id"],)).fetchone()
            for rule in rules[1:]:
                conn.execute(
                    "INSERT OR IGNORE INTO findings (page_id, excerpt, excerpt_hash, status, make, models, year_from, year_to, system, trigger, condition_key, result, method, notes, confidence) "
                    "VALUES (?,?,?,'approved',?,?,?,?,?,?,?,?,?,?,?)",
                    (base["page_id"], base["excerpt"], f"{base['excerpt_hash']}|{rule.get('system')}", rule.get("make"), ";".join(rule.get("models") or []) or None,
                     rule.get("yearFrom"), rule.get("yearTo"), rule.get("system"), rule.get("trigger"), rule.get("conditionKey"), rule.get("result"),
                     rule.get("method"), rule.get("notes"), rule.get("confidence")),
                )
            approved += 1
        else:
            conn.execute("UPDATE findings SET status='rejected' WHERE id = ?", (decision["id"],))
            rejected += 1
        # the same sentence found on other pages is covered by this decision
        key = norm_key(row["excerpt"])
        for other in conn.execute("SELECT id, excerpt FROM findings WHERE status = 'candidate' AND id != ?", (decision["id"],)).fetchall():
            if norm_key(other["excerpt"]) == key:
                conn.execute("UPDATE findings SET status='duplicate' WHERE id = ?", (other["id"],))
    conn.commit()
    print(f"Recorded {approved} approved and {rejected} rejected decisions. Run export-app to refresh the app's files.")


def stats(args):
    conn = connect()
    pages = conn.execute("SELECT COUNT(*) FROM pages").fetchone()[0]
    print(f"{pages} pages stored")
    for row in conn.execute("SELECT status, COUNT(*) AS n FROM findings GROUP BY status"):
        print(f"   {row['n']:5d} findings {row['status']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("crawl").set_defaults(run=crawl)
    sub.add_parser("stats").set_defaults(run=stats)
    sub.add_parser("export-csv").set_defaults(run=export_csv)
    importer = sub.add_parser("import-csv")
    importer.add_argument("file", nargs="?")
    importer.set_defaults(run=import_csv)
    sub.add_parser("build-rules").set_defaults(run=build_rules)
    sub.add_parser("export-app").set_defaults(run=export_app)
    decisions = sub.add_parser("import-decisions")
    decisions.add_argument("file")
    decisions.set_defaults(run=import_decisions)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    main()
