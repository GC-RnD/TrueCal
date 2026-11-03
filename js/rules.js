// TrueCal — vocabulary (sensors, repair triggers, conditions) and the rule lookup.
// Rules are data, not code: data/rules.json ships with the app, and a licensed or public-OEM rule file can be
// imported from the menu (stored on the device and merged with the bundled rules).
//
// One rule:
//   { "id": "...", "make": "Honda" | "*", "models": ["Civic"], "yearFrom": 2018, "yearTo": 2024,
//     "system": <SENSORS id>, "trigger": <TRIGGERS id>, "conditionKey": <CONDITIONS id, optional>,
//     "result": "required" | "not-required" | "self-learning",
//     "method": "static" | "dynamic" | "both" | "none",
//     "notes": "...", "quote": "exact sentence from the source", "confidence": "high" | "medium" | "low", "verified": "YYYY-MM-DD",
//     "origin": "assistant-wording-check" | "user-reviewed" | "adjuster-added" (adjuster-added needs no URL but is never shown as OEM-verified),
//     "source": { "title": "...", "url": "...", "published": "YYYY-MM-DD", "retrieved": "YYYY-MM-DD" } }
// "make" may also be a parent company: "GM" or "Stellantis" (see MAKE_GROUPS below).
// A rule with a conditionKey only applies when that condition is ticked on the check.
// Anything without a matching rule is reported as "Unverified", never as "not required".

const SENSORS = [
  { id: "forward-camera", label: "Forward camera" },
  { id: "front-radar", label: "Front radar" },
  { id: "blind-spot", label: "Blind spot monitors" },
  { id: "rear-camera", label: "Rear / backup camera" },
  { id: "surround-camera", label: "Surround-view cameras" },
  { id: "parking-sensors", label: "Parking sensors" },
  { id: "lane-keeping", label: "Lane departure / keeping" },
  { id: "adaptive-cruise", label: "Adaptive cruise" },
  { id: "night-vision", label: "Night vision" },
  { id: "other", label: "Other" },
];

const TRIGGERS = [
  { id: "bumper-front-ri", label: "Front bumper R&I" },
  { id: "bumper-rear-ri", label: "Rear bumper R&I" },
  { id: "bumper-front-repair", label: "Front bumper repair (fascia)" },
  { id: "bumper-rear-repair", label: "Rear bumper repair (fascia)" },
  { id: "sensor-ri", label: "Sensor / camera / radar removed or replaced" },
  { id: "windshield", label: "Windshield replacement" },
  { id: "alignment", label: "Wheel alignment" },
  { id: "collision-structural", label: "Collision / structural repair" },
  { id: "module-replacement", label: "Module replacement" },
  { id: "suspension", label: "Suspension / ride height" },
  { id: "mirror-door-liftgate", label: "Mirror / door / liftgate" },
  { id: "other", label: "Other" },
];

const CONDITIONS = [
  { id: "sensorDisturbed", label: "Sensor or bracket disturbed" },
  { id: "airbagDeployed", label: "Airbag deployed" },
  { id: "rideHeightChanged", label: "Ride height changed" },
];

const RESULT_LABELS = {
  required: "Calibration required",
  "not-required": "Not required",
  "self-learning": "Self-learning",
  unverified: "Unverified",
};
const RESULT_ICONS = { required: "●", "not-required": "○", "self-learning": "◐", unverified: "?" };
const ORIGIN_LABELS = {
  "assistant-wording-check": "Manufacturer's own wording, entered from the document and wording-checked by the TrueCal assistant. Open the source to confirm.",
  "user-reviewed": "Confirmed by a reviewer in this app.",
  "adjuster-added": "Added by your team. NOT verified against a manufacturer source.",
};
const METHOD_LABELS = { static: "Static", dynamic: "Dynamic", both: "Static + dynamic", none: "None" };
const CONFIDENCE_LABELS = { high: "High", medium: "Medium", low: "Low" };
const VALID_RESULTS = ["required", "not-required", "self-learning"];

const sameText = (a, b) => (a || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === (b || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const labelOf = (list, id) => (list.find((item) => item.id === id) || { label: id || "—" }).label;

const IMPORTED_RULES_KEY = "truecal.importedRules";
let bundledRules = { version: "", updated: "", rules: [] };
let importedRules = null;
let reviewedRules = []; // rules the user approved on the Review screen
let ownRules = []; // records the team added themselves (never shown as manufacturer-verified)
let candidates = []; // statements found by the collector, waiting for review

// Statements written for a parent company apply to all of its brands.
const MAKE_GROUPS = {
  GM: ["Chevrolet", "GMC", "Cadillac", "Buick"],
  Stellantis: ["Chrysler", "Dodge", "Jeep", "Ram", "Fiat"],
};
const REVIEW_MAKES = [
  "GM", "Stellantis", "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ford", "GMC", "Genesis", "Honda",
  "Hyundai", "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi",
  "Nissan", "Porsche", "Ram", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

function matchesMake(ruleMake, vehicleMake) {
  if (!ruleMake || ruleMake === "*") return true;
  if (sameText(ruleMake, vehicleMake)) return true;
  return (MAKE_GROUPS[ruleMake] || []).some((brand) => sameText(brand, vehicleMake));
}

async function loadRules() {
  try {
    const response = await fetch("data/rules.json", { cache: "no-cache" });
    if (response.ok) bundledRules = await response.json();
  } catch (err) {
    console.warn("Could not load the bundled rules", err);
  }
  try {
    const response = await fetch("data/candidates.json", { cache: "no-cache" });
    if (response.ok) candidates = (await response.json()).candidates || [];
  } catch (err) {
    console.warn("Could not load the candidates", err);
  }
  try {
    importedRules = JSON.parse(localStorage.getItem(IMPORTED_RULES_KEY) || "null");
  } catch (err) {
    importedRules = null;
  }
}

function setReviewedRules(list) {
  reviewedRules = list;
}

function setOwnRules(list) {
  ownRules = list;
}

/** All rules in force. A later copy of the same id wins, so a reviewed rule overrides a bundled one. */
function allRules() {
  const byId = new Map();
  [...(bundledRules.rules || []), ...((importedRules && importedRules.rules) || []), ...reviewedRules, ...ownRules].forEach((rule, index) =>
    byId.set(rule.id || `anon-${index}`, rule)
  );
  return [...byId.values()];
}

function rulesSummary() {
  const rules = allRules();
  const dates = [bundledRules.updated, importedRules && importedRules.updated].filter(Boolean).sort();
  return { total: rules.length, reviewed: reviewedRules.length, own: ownRules.length, updated: dates[dates.length - 1] || "" };
}

/** Returns an error message, or null when the file is a usable rule set. */
function validateRuleset(data) {
  if (!data || !Array.isArray(data.rules)) return 'The file needs a "rules" list.';
  for (const [index, rule] of data.rules.entries()) {
    if (!SENSORS.some((s) => s.id === rule.system)) return `Rule ${index + 1}: unknown "system" (${rule.system}).`;
    if (!TRIGGERS.some((t) => t.id === rule.trigger)) return `Rule ${index + 1}: unknown "trigger" (${rule.trigger}).`;
    if (!VALID_RESULTS.includes(rule.result)) return `Rule ${index + 1}: "result" must be required, not-required or self-learning.`;
    if (!rule.source || !rule.source.title) return `Rule ${index + 1}: every rule needs a "source" with a title.`;
    if (rule.origin !== "adjuster-added" && !/^https?:\/\//i.test(rule.source.url || "")) return `Rule ${index + 1}: every rule needs a "source.url" (http or https) so it can be verified.`;
  }
  return null;
}

function importRuleset(data) {
  importedRules = data;
  localStorage.setItem(IMPORTED_RULES_KEY, JSON.stringify(data));
}

function clearImportedRules() {
  importedRules = null;
  localStorage.removeItem(IMPORTED_RULES_KEY);
}

/** Best matching rule for one sensor + repair on this vehicle, or null. More specific rules win. */
function findRule(vehicle, systemId, triggerId, conditions) {
  const year = Number(vehicle.year) || 0;
  let best = null;
  let bestScore = -1;
  for (const rule of allRules()) {
    if (rule.system !== systemId || rule.trigger !== triggerId) continue;
    if (!matchesMake(rule.make, vehicle.make)) continue;
    if (rule.models && rule.models.length && !rule.models.some((model) => sameText(model, vehicle.model))) continue;
    if ((rule.yearFrom || rule.yearTo) && !year) continue;
    if (rule.yearFrom && year < rule.yearFrom) continue;
    if (rule.yearTo && year > rule.yearTo) continue;
    if (rule.conditionKey && !conditions[rule.conditionKey]) continue;
    const score =
      (rule.origin === "adjuster-added" ? 0 : 100) + // a manufacturer source always beats an adjuster's own record
      (rule.make && rule.make !== "*" ? 10 : 0) +
      (rule.models && rule.models.length ? 5 : 0) +
      (rule.yearFrom || rule.yearTo ? 2 : 0) +
      (rule.conditionKey ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

/** How the shop's quote compares with the ruling for one sensor. */
function compareWithQuote(result, quoted) {
  if (result === "required") return quoted ? "match" : "missing";
  if (result === "unverified") return quoted ? "ask-proof" : "none";
  return quoted ? "challenge" : "ok";
}

const QUOTE_LABELS = {
  match: "MATCH — required and quoted",
  missing: "MISSING — required but not on the quote",
  challenge: "CHALLENGE — quoted but not required",
  "ask-proof": "ASK FOR PROOF — quoted, no source found",
  ok: "OK — not quoted, not required",
  none: "",
};

function buildRulings(check) {
  return SENSORS.filter((sensor) => check.sensors[sensor.id] && (check.sensors[sensor.id].onVehicle || check.sensors[sensor.id].quoted)).map(
    (sensor) => {
      const flags = check.sensors[sensor.id];
      const rule = findRule(check.vehicle, sensor.id, check.trigger, check.conditions);
      const result = rule ? rule.result : "unverified";
      return {
        system: sensor.id,
        onVehicle: !!flags.onVehicle,
        quoted: !!flags.quoted,
        result,
        method: rule ? rule.method || "" : "",
        notes: rule ? rule.notes || "" : "",
        quote: rule ? rule.quote || "" : "",
        origin: rule ? rule.origin || "user-reviewed" : "",
        reviewer: rule ? rule.reviewer || "" : "",
        confidence: rule ? rule.confidence || "" : "",
        verified: rule ? rule.verified || "" : "",
        source: rule ? rule.source : null,
        quoteStatus: compareWithQuote(result, !!flags.quoted),
      };
    }
  );
}
