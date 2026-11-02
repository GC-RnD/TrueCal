// TrueCal: live lookup in I-CAR's public "OEM Calibration Requirements" matrix, for ONE vehicle at a time.
//
// What it does, step by step (the same two things a person does with I-CAR's "Quick Search By Vehicle"):
//   1. asks I-CAR's own vehicle-search service which calibration page belongs to year / make / model
//   2. reads that one page and turns it into JSON (sensor, the events I-CAR lists, scan tool, special tools)
//
// Good-citizen rules built in: it identifies itself, waits between requests, caches results, and stops
// (and stays stopped for an hour) if the site ever answers with a block, rate-limit or challenge page.
// It never tries to look like a person or to get past a challenge.
//
// Uses only fetch(), so the same code can run in plain Node or in a serverless function on any provider.

const BASE = "https://rts.i-car.com";
const API = `${BASE}/laravel/api`;
const USER_AGENT = "TrueCalLookup/0.1 (+https://github.com/GC-RnD/TrueCal)";
const MIN_GAP_MS = 1500;
const CACHE_MS = 24 * 60 * 60 * 1000;
const PAUSE_MS = 60 * 60 * 1000;

const cache = new Map();
let lastHit = 0;
let pausedUntil = 0;
let makesCache = null;
const modelsCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const norm = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

class Blocked extends Error {}

async function upstream(url, asJson) {
  if (Date.now() < pausedUntil) throw new Blocked("I-CAR lookups are paused after a block or limit response. Try again later.");
  const wait = MIN_GAP_MS - (Date.now() - lastHit);
  if (wait > 0) await sleep(wait);
  lastHit = Date.now();
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: asJson ? "application/json" : "text/html" } });
  const body = await response.text();
  const challenge = /captcha|cf-chl|just a moment|access denied|verify you are human/i.test(body.slice(0, 4000));
  if ([401, 403, 429, 503].includes(response.status) || challenge) {
    pausedUntil = Date.now() + PAUSE_MS;
    throw new Blocked(`I-CAR answered with a block or limit (HTTP ${response.status}). Lookups paused for an hour.`);
  }
  if (!response.ok) throw new Error(`I-CAR answered HTTP ${response.status}`);
  return asJson ? JSON.parse(body) : body;
}

async function getMakes() {
  if (!makesCache) makesCache = await upstream(`${API}/ymm/options/makes`, true);
  return makesCache;
}

async function getModels(make) {
  if (!modelsCache.has(make)) modelsCache.set(make, await upstream(`${API}/ymm/options/models?make=${encodeURIComponent(make)}`, true));
  return modelsCache.get(make);
}

/** Picks the I-CAR spelling of a make or model from what we have (for example "Ram" -> "RAM"). */
function bestMatch(wanted, options) {
  const w = norm(wanted);
  if (!w) return null;
  const exact = options.find((o) => norm(o) === w);
  if (exact) return exact;
  const partial = options.filter((o) => norm(o).startsWith(w) || w.startsWith(norm(o)));
  return partial.sort((a, b) => a.length - b.length)[0] || null;
}

// ---------- Reading one calibration page ----------

const SENSOR_RULES = [
  [/near rearview mirror|windshield/i, "forward-camera"],
  [/rear view only/i, "rear-camera"],
  [/360|surround|side mirror|camera in front bumper/i, "surround-camera"],
  [/deck lid|liftgate|tailgate/i, "rear-camera"],
  [/quarter panel|behind rear bumper|rear corner|blind/i, "blind-spot"],
  [/behind front bumper|front radar|millimeter|radar/i, "front-radar"],
  [/ultrasonic|sonar|park|sensor\(s\) in (front|rear) bumper/i, "parking-sensors"],
  [/lane|ldw|lka/i, "lane-keeping"],
  [/cruise|\bacc\b/i, "adaptive-cruise"],
  [/night|infrared/i, "night-vision"],
  [/camera/i, "forward-camera"],
];

const EVENT_RULES = [
  [/windshield|windscreen|front glass/i, "windshield"],
  [/alignment|thrust|toe\b/i, "alignment"],
  [/suspension|ride height/i, "suspension"],
  [/collision|impact|accident|structural|damage|deform|deploy/i, "collision-structural"],
  [/front bumper[^.;]*(repair|refinish|paint)/i, "bumper-front-repair"],
  [/front bumper/i, "bumper-front-ri"],
  [/rear bumper[^.;]*(repair|refinish|paint)/i, "bumper-rear-repair"],
  [/rear bumper/i, "bumper-rear-ri"],
  [/mirror|door|lift ?gate|tail ?gate|deck ?lid/i, "mirror-door-liftgate"],
  [/(remov|install|replac)/i, "sensor-ri"],
];

function systemFor(title, oemName) {
  for (const text of [title, oemName]) {
    for (const [pattern, system] of SENSOR_RULES) if (pattern.test(text)) return system;
  }
  return "other";
}

function triggerFor(event) {
  for (const [pattern, trigger] of EVENT_RULES) if (pattern.test(event)) return trigger;
  return null;
}

const decode = (text) =>
  text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#176;/g, "°").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

function flagFor(block, label) {
  const row = block.match(new RegExp(`${label}[\\s\\S]*?</span>([\\s\\S]*?)</tr>`, "i"));
  if (!row) return "unknown";
  const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => decode(c[1]));
  if (/x/i.test(cells[0] || "")) return "yes";
  if (/x/i.test(cells[1] || "")) return "no";
  return "not-identified";
}

function parseCalibrationPage(html) {
  const sensors = [];
  for (const part of html.split(/<h3>/i).slice(1)) {
    const title = decode(part.split(/<\/h3>/i)[0]);
    const oem = part.match(/OEM Name:\s*<\/strong>([\s\S]*?)<\/p>/i);
    const oemName = oem ? decode(oem[1]) : "";
    const list = part.match(/<h4>[^<]*Events:?\s*<\/h4>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i);
    const events = list ? [...list[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => decode(m[1])).filter(Boolean) : [];
    const noRequirement = events.length === 1 && /no calibration\/initialization requirements found/i.test(events[0]);
    const real = noRequirement ? [] : events;
    sensors.push({
      title, oemName, system: systemFor(title, oemName), noRequirement, events: real,
      triggers: [...new Set(real.map(triggerFor).filter(Boolean))],
      otherEvents: real.filter((e) => !triggerFor(e)),
      eventTriggers: real.map((e) => ({ event: e, trigger: triggerFor(e) })),
      dtcSet: flagFor(part, "DTC Set"), scanToolRequired: flagFor(part, "Scan Tool Required"), specialToolsRequired: flagFor(part, "Special Tools Required"),
    });
  }
  return sensors;
}

// ---------- Public entry point ----------

/** Maps model names that carry an engine or trim code to I-CAR's family names (E-450 -> E-Class, 330i -> 3 Series). */
function familyGuess(model, options) {
  const m = String(model || "").trim();
  const letters = m.match(/^([A-Za-z]{1,3})[\s-]?\d{2,3}/);
  if (letters) {
    const hit = options.find((o) => norm(o) === norm(`${letters[1]}-Class`));
    if (hit) return hit;
  }
  const digits = m.match(/^(\d)\d{2}/);
  if (digits) {
    const hit = options.find((o) => norm(o) === norm(`${digits[1]} Series`));
    if (hit) return hit;
  }
  return null;
}

const HELP_LINKS = [
  { title: "I-CAR OEM Information: position statements and links, by make", url: `${BASE}/oem-information.html` },
  { title: "I-CAR article hotspot: ADAS, calibration and scanning", url: `${BASE}/crn-1022.html` },
  { title: "How to read I-CAR's calibration matrix", url: `${BASE}/crn-483.html` },
];

const helpFor = (make) => [
  { title: `I-CAR's ${make} page (position statements, ADAS links)`, url: `${BASE}/oem-information/${String(make).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html` },
  ...HELP_LINKS,
];

async function lookupVehicle({ year, make, model, icarModel }) {
  const key = `${year}|${norm(make)}|${norm(model)}|${norm(icarModel)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, cached: true };

  const makes = await getMakes();
  const icarMake = bestMatch(make, makes);
  if (!icarMake) return { found: false, reason: `I-CAR has no make called "${make}".`, helpLinks: HELP_LINKS };
  const models = await getModels(icarMake);
  const chosenModel = icarModel ? models.find((o) => norm(o) === norm(icarModel)) : bestMatch(model, models) || familyGuess(model, models);
  if (!chosenModel) return { found: false, reason: `I-CAR has no ${icarMake} model called "${model}". Pick the closest I-CAR model.`, choices: models, helpLinks: helpFor(icarMake) };

  const query = new URLSearchParams({ make: icarMake, model: chosenModel });
  if (year) query.set("year", String(year));
  const found = await upstream(`${API}/search/articles/all?${query}`, true);
  const pages = (found.data || [])
    .filter((a) => /calibration/i.test((a.joomla_category && a.joomla_category.name) || ""))
    .sort((a, b) => (/\(/.test(a.title) ? 1 : 0) - (/\(/.test(b.title) ? 1 : 0));
  if (!pages.length) {
    const data = {
      found: false, helpLinks: helpFor(icarMake),
      reason: `I-CAR's calibration matrix has no ${year || ""} ${icarMake} ${chosenModel} entry. It covers 2016 and newer vehicles and is not complete.`.replace(/\s+/g, " "),
    };
    cache.set(key, { at: Date.now(), data });
    return data;
  }

  const page = pages[0];
  const url = `${BASE}/${page.alias}.html`;
  const html = await upstream(url, false);
  const sensors = parseCalibrationPage(html);
  const notice = sensors.length ? "" : decode((html.match(/<h4[^>]*>\s*(Refer To OEM[^<]*)<\/h4>/i) || ["", ""])[1]);
  const data = {
    found: true, vehicle: page.title, submodel: page.submodel || "", icarModel: chosenModel, helpLinks: helpFor(icarMake), notice,
    alternatives: pages.slice(1).map((p) => ({ title: p.title, url: `${BASE}/${p.alias}.html` })),
    source: { title: `I-CAR OEM Calibration Requirements: ${page.title}`, url, retrieved: new Date().toISOString().slice(0, 10) },
    sensors,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { lookupVehicle, parseCalibrationPage, triggerFor, systemFor, Blocked };
