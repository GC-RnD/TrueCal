// TrueCal — app logic. Screens: home, new, ruling/<id>, report/<id>, history (hash routing).
// Rules and vocabulary are in rules.js; VIN scanning is in scanner.js.

const el = (id) => document.getElementById(id);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const safeUrl = (url) => (/^https?:\/\//i.test(url || "") ? url : "");
const formatDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");

const VEHICLE_MAKES = [
  "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ford", "GMC", "Genesis", "Honda", "Hyundai",
  "Infiniti", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan",
  "Porsche", "Ram", "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

// ---------- Storage (IndexedDB: saved checks + the unfinished draft) ----------

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("truecal", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("checks")) db.createObjectStore("checks", { keyPath: "id" });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("decisions")) db.createObjectStore("decisions", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function dbRun(store, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const saveCheck = (check) => dbRun("checks", "readwrite", (s) => s.put(check));
const getCheck = (id) => dbRun("checks", "readonly", (s) => s.get(id));
const deleteCheck = (id) => dbRun("checks", "readwrite", (s) => s.delete(id));
const getAllChecks = async () => ((await dbRun("checks", "readonly", (s) => s.getAll())) || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const putDraft = (draft) => dbRun("kv", "readwrite", (s) => s.put(draft, "draft"));
const getDraft = () => dbRun("kv", "readonly", (s) => s.get("draft"));
const clearDraft = () => dbRun("kv", "readwrite", (s) => s.delete("draft"));
const saveDecision = (decision) => dbRun("decisions", "readwrite", (s) => s.put(decision));
const deleteDecision = (id) => dbRun("decisions", "readwrite", (s) => s.delete(id));
const getAllDecisions = async () => (await dbRun("decisions", "readonly", (s) => s.getAll())) || [];

// ---------- Draft ----------

const ADJUSTER_KEY = "truecal.adjuster";
let draft = createEmptyDraft();
let draftTimer = null;

function createEmptyDraft() {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    claimId: "",
    adjuster: localStorage.getItem(ADJUSTER_KEY) || "",
    vehicle: { vin: "", year: "", make: "", model: "", trim: "" },
    trigger: "",
    sensors: {},
    conditions: {},
    photos: [],
    notes: "",
  };
}

function scheduleDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => putDraft(draft).catch((err) => console.warn("Draft not saved", err)), 400);
}

function toast(message) {
  const box = el("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (box.hidden = true), 3500);
}

// ---------- Form ----------

function buildForm() {
  const year = el("vehicleYear");
  year.add(new Option("Year", ""));
  for (let y = new Date().getFullYear() + 1; y >= 1981; y--) year.add(new Option(String(y), String(y)));

  const make = el("vehicleMake");
  make.add(new Option("Make", ""));
  VEHICLE_MAKES.forEach((name) => make.add(new Option(name, name)));

  const trigger = el("trigger");
  trigger.add(new Option("Select the repair…", ""));
  TRIGGERS.forEach((t) => trigger.add(new Option(t.label, t.id)));

  el("sensorRows").innerHTML = SENSORS.map(
    (s) => `<tr>
      <td>${esc(s.label)}</td>
      <td><label class="tick"><input type="checkbox" data-sensor="${s.id}" data-flag="onVehicle" aria-label="${esc(s.label)} on vehicle" /></label></td>
      <td><label class="tick"><input type="checkbox" data-sensor="${s.id}" data-flag="quoted" aria-label="${esc(s.label)} on shop quote" /></label></td>
    </tr>`
  ).join("");

  el("conditionRows").innerHTML = CONDITIONS.map(
    (c) => `<label><input type="checkbox" data-condition="${c.id}" /> ${esc(c.label)}</label>`
  ).join("");
}

function setSelectValue(select, value) {
  if (value && ![...select.options].some((option) => option.value === value)) select.add(new Option(value, value));
  select.value = value || "";
}

function renderForm() {
  el("claimId").value = draft.claimId;
  el("adjusterName").value = draft.adjuster;
  el("vehicleVin").value = draft.vehicle.vin;
  setSelectValue(el("vehicleYear"), draft.vehicle.year);
  setSelectValue(el("vehicleMake"), draft.vehicle.make);
  el("vehicleModel").value = draft.vehicle.model;
  el("vehicleTrim").value = draft.vehicle.trim;
  el("trigger").value = draft.trigger;
  document.querySelectorAll("[data-sensor]").forEach((box) => {
    box.checked = !!(draft.sensors[box.dataset.sensor] || {})[box.dataset.flag];
  });
  document.querySelectorAll("[data-condition]").forEach((box) => (box.checked = !!draft.conditions[box.dataset.condition]));
  el("notes").value = draft.notes;
  el("formError").textContent = "";
  setHint("vinHint", "");
  setHint("vinDecodeHint", "");
  setHint("sensorSuggestHint", "");
  renderPhotos();
  lastDecodedVin = "";
  updateVinHint();
  if (!draft.vehicle.make) scheduleVinDecode();
}

function readForm() {
  draft.claimId = el("claimId").value.trim();
  draft.adjuster = el("adjusterName").value.trim();
  localStorage.setItem(ADJUSTER_KEY, draft.adjuster);
  draft.vehicle = {
    vin: el("vehicleVin").value,
    year: el("vehicleYear").value,
    make: el("vehicleMake").value,
    model: el("vehicleModel").value.trim(),
    trim: el("vehicleTrim").value.trim(),
  };
  draft.trigger = el("trigger").value;
  draft.sensors = {};
  document.querySelectorAll("[data-sensor]").forEach((box) => {
    const entry = (draft.sensors[box.dataset.sensor] = draft.sensors[box.dataset.sensor] || { onVehicle: false, quoted: false });
    entry[box.dataset.flag] = box.checked;
  });
  draft.conditions = {};
  document.querySelectorAll("[data-condition]").forEach((box) => (draft.conditions[box.dataset.condition] = box.checked));
  draft.notes = el("notes").value;
}

function setHint(id, message, { warn = false, ok = false, choices = [] } = {}) {
  const hint = el(id);
  hint.textContent = message;
  hint.classList.toggle("field-hint--warn", warn);
  hint.classList.toggle("field-hint--ok", ok);
  choices.forEach((choice) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = choice.label;
    chip.addEventListener("click", choice.onPick);
    hint.appendChild(chip);
  });
}

function validateDraft() {
  if (!draft.vehicle.year || !draft.vehicle.make) return "Enter the vehicle year and make (or scan the VIN).";
  if (!draft.trigger) return "Select the repair that was done.";
  const anySensor = Object.values(draft.sensors).some((s) => s.onVehicle || s.quoted);
  if (!anySensor) return "Tick at least one sensor.";
  return null;
}

// ---------- VIN: scan result, check digit, NHTSA vPIC lookup ----------

const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
let vinDecodeTimer = null;
let lastDecodedVin = "";

const VPIC_SENSOR_FIELDS = {
  "forward-camera": ["ForwardCollisionWarning", "LaneDepartureWarning", "LaneKeepSystem", "PedestrianAutomaticEmergencyBraking", "DynamicBrakeSupport"],
  "front-radar": ["AdaptiveCruiseControl", "ForwardCollisionWarning", "DynamicBrakeSupport"],
  "blind-spot": ["BlindSpotMon", "BlindSpotIntervention"],
  "rear-camera": ["RearVisibilitySystem"],
  "parking-sensors": ["ParkAssist"],
  "lane-keeping": ["LaneDepartureWarning", "LaneKeepSystem"],
  "adaptive-cruise": ["AdaptiveCruiseControl"],
};

const titleCase = (text) => text.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

async function decodeVin(vin) {
  const response = await fetch(`${VPIC_URL}${encodeURIComponent(vin)}?format=json`);
  if (!response.ok) throw new Error("VIN lookup failed");
  const result = ((await response.json()).Results || [])[0];
  if (!result || !result.Make || !result.ModelYear) return null;
  const make = VEHICLE_MAKES.find((known) => sameText(known, result.Make)) || titleCase(result.Make);
  const standard = SENSORS.filter(
    (s) => (VPIC_SENSOR_FIELDS[s.id] || []).some((field) => String(result[field] || "").toLowerCase() === "standard")
  ).map((s) => s.id);
  return { year: String(result.ModelYear), make, model: (result.Model || "").trim(), trim: (result.Trim || "").trim(), standard };
}

function onVinScanned(vin) {
  const input = el("vehicleVin");
  input.value = vin;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateVinHint() {
  const vin = draft.vehicle.vin;
  if (vin.length !== 17) {
    setHint("vinHint", vin.length ? `${vin.length} of 17 characters` : "");
    return;
  }
  if (vinCheckDigitOk(vin)) setHint("vinHint", "Check digit OK ✓", { ok: true });
  else setHint("vinHint", "Check digit doesn't match — compare with the car. (Some non-US VINs don't use it.)", { warn: true });
}

function scheduleVinDecode() {
  clearTimeout(vinDecodeTimer);
  const vin = draft.vehicle.vin.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    setHint("vinDecodeHint", "");
    return;
  }
  if (vin === lastDecodedVin) return;
  vinDecodeTimer = setTimeout(() => runVinDecode(vin), 500);
}

function setVehicleField(id, value) {
  const field = el(id);
  if (field.tagName === "SELECT") setSelectValue(field, value);
  else field.value = value;
}

async function runVinDecode(vin) {
  setHint("vinDecodeHint", "Looking up the vehicle…");
  try {
    const info = await decodeVin(vin);
    if (draft.vehicle.vin.toUpperCase() !== vin) return;
    lastDecodedVin = vin;
    if (!info) {
      setHint("vinDecodeHint", "The lookup didn't recognise this VIN — check the characters, or enter the vehicle by hand.", { warn: true });
      return;
    }
    const fields = [["year", "vehicleYear"], ["make", "vehicleMake"], ["model", "vehicleModel"], ["trim", "vehicleTrim"]];
    const summary = [info.year, info.make, info.model, info.trim].filter(Boolean).join(" ");
    const differs = fields.filter(([key]) => info[key] && draft.vehicle[key] && !sameText(draft.vehicle[key], info[key]));
    fields.forEach(([key, id]) => {
      if (info[key] && !draft.vehicle[key]) setVehicleField(id, info[key]);
    });
    if (differs.length) {
      setHint("vinDecodeHint", `The VIN lookup says ${summary}, which differs from what you entered.`, {
        warn: true,
        choices: [{ label: `Use ${summary}`, onPick: () => { fields.forEach(([key, id]) => info[key] && setVehicleField(id, info[key])); readForm(); scheduleDraftSave(); } }],
      });
    } else {
      setHint("vinDecodeHint", `Filled from the VIN lookup: ${summary}. Please check it.`);
    }
    suggestSensors(info.standard);
    readForm();
    scheduleDraftSave();
  } catch (err) {
    console.warn("VIN lookup failed", err);
    setHint("vinDecodeHint", "Couldn't look up the VIN (offline?). Enter the vehicle by hand.", { warn: true });
  }
}

/** Ticks "on vehicle" for sensors the VIN says are standard equipment — only when nothing is ticked yet. */
function suggestSensors(standardIds) {
  if (!standardIds.length || Object.values(draft.sensors).some((s) => s.onVehicle)) return;
  standardIds.forEach((id) => {
    const box = document.querySelector(`[data-sensor="${id}"][data-flag="onVehicle"]`);
    if (box) box.checked = true;
  });
  setHint(
    "sensorSuggestHint",
    `Pre-ticked from the VIN lookup (standard equipment): ${standardIds.map((id) => labelOf(SENSORS, id)).join(", ")}. Optional equipment can't be read from the VIN — confirm on the car.`
  );
}

// ---------- Photos and dictation ----------

function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function scaledCanvas(source, width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

async function addPhotos(files) {
  for (const file of files) {
    try {
      const { img, release } = await loadImage(file);
      try {
        const { canvas } = scaledCanvas(img, img.naturalWidth, img.naturalHeight, 1280);
        draft.photos.push({ id: uid(), dataUrl: canvas.toDataURL("image/jpeg", 0.72), takenAt: new Date().toISOString() });
      } finally {
        release();
      }
    } catch (err) {
      toast("Couldn't read one of the photos.");
    }
  }
  renderPhotos();
  scheduleDraftSave();
}

function renderPhotos() {
  const box = el("photoThumbs");
  box.innerHTML = draft.photos
    .map(
      (p, i) => `<div class="thumb"><img src="${p.dataUrl}" alt="Photo ${i + 1}" /><span class="thumb__num">#${i + 1}</span>
        <button type="button" class="thumb__del" data-del="${p.id}" aria-label="Delete photo ${i + 1}">×</button></div>`
    )
    .join("");
}

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

function setupDictation() {
  if (!SpeechRecognitionApi) return;
  el("dictateBtn").hidden = false;
  el("dictateBtn").addEventListener("click", () => {
    if (recognizer) {
      recognizer.stop();
      return;
    }
    recognizer = new SpeechRecognitionApi();
    recognizer.lang = "en-US";
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const notes = el("notes");
        notes.value = `${notes.value}${notes.value && !/\s$/.test(notes.value) ? " " : ""}${event.results[i][0].transcript.trim()}`;
      }
      readForm();
      scheduleDraftSave();
    };
    recognizer.onerror = () => toast("Dictation isn't available right now.");
    recognizer.onend = () => {
      recognizer = null;
      el("dictateBtn").classList.remove("is-recording");
      el("dictateLabel").textContent = "Dictate note";
    };
    recognizer.start();
    el("dictateBtn").classList.add("is-recording");
    el("dictateLabel").textContent = "Stop dictating";
  });
}

// ---------- Rendering: ruling, report, lists ----------

function vehicleTitle(check) {
  const v = check.vehicle;
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}

function counts(check) {
  const result = { required: 0, challenge: 0, missing: 0, unverified: 0 };
  (check.rulings || []).forEach((r) => {
    if (r.result === "required") result.required += 1;
    if (r.quoteStatus === "challenge") result.challenge += 1;
    if (r.quoteStatus === "missing") result.missing += 1;
    if (r.result === "unverified") result.unverified += 1;
  });
  return result;
}

function sourceLine(source) {
  if (!source) return "No source found";
  const url = safeUrl(source.url);
  const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(source.title)}</a>` : esc(source.title);
  const dates = [source.published && `published ${esc(source.published)}`, source.retrieved && `retrieved ${esc(source.retrieved)}`].filter(Boolean).join(", ");
  return dates ? `${title} (${dates})` : title;
}

function hasQuote(check) {
  return (check.rulings || []).some((r) => r.quoted);
}

function renderRuling(check) {
  const conds = CONDITIONS.filter((c) => check.conditions[c.id]).map((c) => c.label);
  const quoteOn = hasQuote(check);
  const cards = (check.rulings || [])
    .map((r) => {
      const rows = [
        r.method && r.result === "required" ? `<dt>Method</dt><dd>${esc(METHOD_LABELS[r.method] || r.method)}</dd>` : "",
        r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : "",
        r.quote ? `<dt>Quote</dt><dd>“${esc(r.quote)}”</dd>` : "",
        `<dt>Source</dt><dd>${sourceLine(r.source)}</dd>`,
        r.verified ? `<dt>Reviewed</dt><dd>${esc(r.verified)}</dd>` : "",
      ].join("");
      const unverifiedNote =
        r.result === "unverified"
          ? `<p class="hint">No reviewed source for this vehicle, sensor and repair. This is not a ruling that calibration is unnecessary — ask the shop or the OEM for the procedure.</p>`
          : "";
      return `<article class="ruling ruling--${r.result}">
        <h3>${esc(labelOf(SENSORS, r.system))}</h3>
        <div class="ruling__result">${RESULT_ICONS[r.result]} ${esc(RESULT_LABELS[r.result].toUpperCase())}</div>
        <dl>${rows}</dl>
        ${unverifiedNote}
        ${quoteOn && QUOTE_LABELS[r.quoteStatus] ? `<span class="quote quote--${r.quoteStatus}">Shop quote: ${esc(QUOTE_LABELS[r.quoteStatus])}</span>` : ""}
        ${!r.onVehicle ? '<p class="hint">Not ticked as on the vehicle — quoted only.</p>' : ""}
      </article>`;
    })
    .join("");
  return `
    <div class="vehicle-summary">
      <strong>${esc(vehicleTitle(check))}</strong>
      <p>${check.vehicle.vin ? `VIN ${esc(check.vehicle.vin)}` : "No VIN entered"}</p>
      <p>${esc(labelOf(TRIGGERS, check.trigger))}${conds.length ? ` · ${esc(conds.join(", "))}` : ""}</p>
      ${check.claimId ? `<p>Claim / RO # ${esc(check.claimId)}</p>` : ""}
    </div>
    ${cards}
    <button type="button" class="btn btn--ghost no-print" id="deleteCheckBtn">Delete this check</button>`;
}

function summaryText(check) {
  const lines = [`TrueCal — ${vehicleTitle(check)}`, check.vehicle.vin ? `VIN ${check.vehicle.vin}` : "", `Repair: ${labelOf(TRIGGERS, check.trigger)}`, ""];
  (check.rulings || []).forEach((r) => {
    lines.push(`${labelOf(SENSORS, r.system)}: ${RESULT_LABELS[r.result]}${r.method && r.result === "required" ? ` (${METHOD_LABELS[r.method]})` : ""}`);
    if (hasQuote(check) && QUOTE_LABELS[r.quoteStatus]) lines.push(`  Quote: ${QUOTE_LABELS[r.quoteStatus]}`);
    if (r.quote) lines.push(`  "${r.quote}"`);
    lines.push(`  Source: ${r.source ? r.source.title + (r.source.url ? " " + r.source.url : "") : "none found"}`);
  });
  lines.push("", "Informational only — confirm against current OEM service information.");
  return lines.filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
}

function renderReport(check) {
  const quoteOn = hasQuote(check);
  const sources = [];
  (check.rulings || []).forEach((r) => {
    if (r.source && !sources.some((s) => s.title === r.source.title && s.url === r.source.url)) sources.push(r.source);
  });
  const conds = CONDITIONS.filter((c) => check.conditions[c.id]).map((c) => c.label);
  return `
    <div class="report__head">
      <img src="icons/icon-192.png" alt="" />
      <div><h1>TrueCal Calibration Report</h1>
      <p>${esc(formatDate(check.createdAt))}${check.adjuster ? ` · Checked by ${esc(check.adjuster)}` : ""}${check.claimId ? ` · Claim / RO # ${esc(check.claimId)}` : ""}</p></div>
    </div>
    <h2>Vehicle</h2>
    <p><strong>${esc(vehicleTitle(check))}</strong><br />VIN: ${esc(check.vehicle.vin || "not entered")}<br />Repair: ${esc(labelOf(TRIGGERS, check.trigger))}${conds.length ? `<br />Conditions: ${esc(conds.join(", "))}` : ""}</p>
    <h2>Rulings</h2>
    <table>
      <thead><tr><th>Sensor</th><th>Ruling</th>${quoteOn ? "<th>Shop quote</th>" : ""}</tr></thead>
      <tbody>${(check.rulings || [])
        .map(
          (r) => `<tr><td>${esc(labelOf(SENSORS, r.system))}</td>
        <td>${esc(RESULT_LABELS[r.result])}${r.method && r.result === "required" ? ` (${esc(METHOD_LABELS[r.method])})` : ""}${r.notes ? `<br /><span class="fine">${esc(r.notes)}</span>` : ""}${r.quote ? `<br /><span class="fine">“${esc(r.quote)}”</span>` : ""}</td>
        ${quoteOn ? `<td>${r.quoted ? "Quoted" : "Not quoted"}<br /><span class="fine">${esc((QUOTE_LABELS[r.quoteStatus] || "").split(" — ")[0])}</span></td>` : ""}</tr>`
        )
        .join("")}</tbody>
    </table>
    <h2>Sources</h2>
    ${sources.length ? `<ol>${sources.map((s) => `<li>${sourceLine(s)}</li>`).join("")}</ol>` : "<p>No sources found for this check.</p>"}
    ${check.notes ? `<h2>Notes</h2><p>${esc(check.notes).replace(/\n/g, "<br />")}</p>` : ""}
    ${check.photos.length ? `<h2>Photos</h2><div class="photos">${check.photos.map((p, i) => `<figure><img src="${p.dataUrl}" alt="Photo ${i + 1}" /><figcaption>#${i + 1} · ${esc(formatDate(p.takenAt))}</figcaption></figure>`).join("")}</div>` : ""}
    <h2>Disclaimer</h2>
    <p class="fine">Informational only. Rulings reflect the rule data on this device at the time of the check (rules updated ${esc(check.rulesUpdated || "unknown")}) and the cited sources. Confirm against current OEM service information before approving or denying a calibration.</p>`;
}

function checkItemHtml(check) {
  const c = counts(check);
  const pills = [
    c.required ? `<span class="pill pill--required">${c.required} required</span>` : "",
    c.challenge ? `<span class="pill pill--required">${c.challenge} challenge</span>` : "",
    c.missing ? `<span class="pill pill--required">${c.missing} missing</span>` : "",
    c.unverified ? `<span class="pill pill--unverified">${c.unverified} unverified</span>` : "",
    !c.required && !c.unverified ? '<span class="pill pill--not-required">none required</span>' : "",
  ].join(" ");
  return `<a class="check-item" href="#ruling/${esc(check.id)}">
    <div class="check-item__top"><span>${esc(vehicleTitle(check))}</span><span>${pills}</span></div>
    <div class="check-item__sub"><span>${esc(labelOf(TRIGGERS, check.trigger))}</span><span>${esc(formatDate(check.createdAt))}</span></div>
  </a>`;
}

async function renderHome() {
  const checks = await getAllChecks();
  el("recentList").innerHTML = checks.slice(0, 5).map(checkItemHtml).join("");
  el("recentEmpty").hidden = checks.length > 0;
  el("seeAllBtn").hidden = checks.length <= 5;
  const left = candidates.filter((c) => !decisionMap.has(c.id)).length;
  const banner = el("demoBanner");
  banner.hidden = false;
  banner.innerHTML = rulesSummary().total
    ? `<b>${rulesSummary().total} reviewed rules</b> in force. ${left} findings still waiting for your review. <a href="#review">Open Review</a>`
    : `<b>No reviewed rules yet</b>, so every result will say Unverified. ${left} findings are waiting. <a href="#review">Start reviewing</a>`;
}

async function renderHistory() {
  const query = el("historySearch").value.trim().toLowerCase();
  const filter = el("historyFilter").value;
  const checks = (await getAllChecks()).filter((check) => {
    const haystack = [vehicleTitle(check), check.vehicle.vin, check.claimId].join(" ").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    const c = counts(check);
    return filter === "all" || c[filter] > 0;
  });
  el("historyList").innerHTML = checks.map(checkItemHtml).join("");
  el("historyEmpty").hidden = checks.length > 0;
}

function updateRulesInfo() {
  const s = rulesSummary();
  el("rulesInfo").textContent = `Rules in force: ${s.total} (${s.reviewed} approved on this device)${s.updated ? ` · file updated ${s.updated}` : ""}`;
}

// ---------- Review: confirm or hide what the collector found ----------
// "Yes" turns a finding into a rule the app uses. "No" hides it for good (it is kept, not deleted, and can be restored).

const decisionMap = new Map();
const skippedIds = new Set();
let reviewTab = "queue";
let lastDecidedId = null;
const candidateById = (id) => candidates.find((c) => c.id === id);
const today = () => new Date().toISOString().slice(0, 10);

async function loadDecisions() {
  decisionMap.clear();
  (await getAllDecisions()).forEach((d) => decisionMap.set(d.id, d));
  setReviewedRules([...decisionMap.values()].filter((d) => d.status === "approved").flatMap((d) => d.rules));
  updateRulesInfo();
}

function options(list, selected, blank) {
  const items = list.map((item) => (typeof item === "string" ? { id: item, label: item } : item));
  return [blank ? `<option value="">${esc(blank)}</option>` : "", ...items.map((i) => `<option value="${esc(i.id)}"${i.id === selected ? " selected" : ""}>${esc(i.label)}</option>`)].join("");
}

function nextCandidate() {
  return candidates.find((c) => !decisionMap.has(c.id) && !skippedIds.has(c.id)) || null;
}

function reviewCard(c) {
  const makes = REVIEW_MAKES.includes(c.make) || !c.make ? REVIEW_MAKES : [...REVIEW_MAKES, c.make];
  return `<article class="card review-card">
    <p class="hint">Does this sentence from the manufacturer's document say what the boxes below say?</p>
    <blockquote class="excerpt">${esc(c.excerpt)}</blockquote>
    <p><a href="${esc(safeUrl(c.source.url))}" target="_blank" rel="noopener">Open the source ↗</a><br />
      <span class="fine">${esc(c.source.title)} · retrieved ${esc(c.source.retrieved)}</span></p>
    <div class="field-grid">
      <label class="field"><span>Make</span><select id="rvMake">${options(makes, c.make, "Choose…")}</select></label>
      <label class="field"><span>Repair</span><select id="rvTrigger">${options(TRIGGERS.map((t) => ({ id: t.id, label: t.label })), c.trigger, "Choose…")}</select></label>
      <fieldset class="field field--full sensor-pick"><legend>Sensors this applies to</legend>
        ${SENSORS.map((s) => `<label><input type="checkbox" name="rvSensor" value="${s.id}"${s.id === c.system ? " checked" : ""} /> ${esc(s.label)}</label>`).join("")}
      </fieldset>
      <label class="field"><span>Only if</span><select id="rvCondition">${options(CONDITIONS.map((t) => ({ id: t.id, label: t.label })), "", "Always")}</select></label>
      <label class="field"><span>Result</span><select id="rvResult">${options(VALID_RESULTS.map((r) => ({ id: r, label: RESULT_LABELS[r] })), c.result, "Choose…")}</select></label>
      <label class="field"><span>Method</span><select id="rvMethod">${options(Object.keys(METHOD_LABELS).map((m) => ({ id: m, label: METHOD_LABELS[m] })), c.method, "Not stated")}</select></label>
      <label class="field"><span>Years from</span><input type="text" inputmode="numeric" id="rvYearFrom" value="${esc(c.yearFrom || "")}" placeholder="all years" /></label>
      <label class="field"><span>Years to</span><input type="text" inputmode="numeric" id="rvYearTo" value="${esc(c.yearTo || "")}" placeholder="all years" /></label>
      <label class="field field--full"><span>Your note (optional)</span><input type="text" id="rvNotes" /></label>
    </div>
    <div class="btn-row">
      <button type="button" class="btn btn--primary" data-action="keep">✓ Yes — factual, keep</button>
      <button type="button" class="btn btn--secondary" data-action="hide">✗ No — hide it</button>
    </div>
    <p class="form-error" id="reviewError" role="alert"></p>
    <div class="btn-row">
      <button type="button" class="btn btn--ghost" data-action="skip">Skip for now</button>
      <button type="button" class="btn btn--ghost" data-action="undo"${lastDecidedId ? "" : " disabled"}>Undo last</button>
    </div>
  </article>`;
}

function reviewListItem(d, action, actionLabel) {
  const rule = d.rules && d.rules[0];
  const c = candidateById(d.id);
  const text = rule ? rule.quote : d.excerpt || (c && c.excerpt) || "";
  const url = rule ? rule.source.url : d.sourceUrl || (c && c.source.url) || "";
  const head = rule
    ? `${esc(rule.make)} · ${esc(d.rules.map((r) => labelOf(SENSORS, r.system)).join(", "))} · ${esc(labelOf(TRIGGERS, rule.trigger))} → <b>${esc(RESULT_LABELS[rule.result])}</b>`
    : "Hidden finding";
  return `<div class="card review-item">
    <p>${head}</p>
    <p class="fine">“${esc(text.length > 240 ? `${text.slice(0, 240)}…` : text)}”</p>
    <div class="btn-row">
      ${url ? `<a class="btn btn--ghost" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">Source ↗</a>` : ""}
      <button type="button" class="btn btn--secondary" data-action="${action}" data-id="${d.id}">${actionLabel}</button>
    </div>
  </div>`;
}

function renderReview() {
  const all = [...decisionMap.values()];
  const kept = all.filter((d) => d.status === "approved");
  const hidden = all.filter((d) => d.status === "rejected");
  const left = candidates.filter((c) => !decisionMap.has(c.id)).length;
  el("reviewCounts").textContent = `${left} to review · ${kept.length} kept · ${hidden.length} hidden`;
  document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === reviewTab));
  const body = el("reviewBody");
  if (reviewTab === "kept") {
    body.innerHTML = kept.length ? kept.map((d) => reviewListItem(d, "unkeep", "Hide it")).join("") : '<p class="hint">Nothing kept yet.</p>';
  } else if (reviewTab === "hidden") {
    body.innerHTML = hidden.length ? hidden.map((d) => reviewListItem(d, "restore", "Restore")).join("") : '<p class="hint">Nothing hidden.</p>';
  } else {
    const c = nextCandidate();
    if (c) body.innerHTML = reviewCard(c);
    else if (skippedIds.size) body.innerHTML = `<p class="hint">You skipped ${skippedIds.size}. </p><button type="button" class="btn btn--secondary" data-action="unskip">Show skipped again</button>`;
    else body.innerHTML = '<p class="hint">All findings reviewed. Run the collector again to find more.</p>';
  }
}

async function decide(candidate, status, rules) {
  const decision = { id: candidate.id, status, reviewer: localStorage.getItem(ADJUSTER_KEY) || "", reviewedAt: new Date().toISOString() };
  if (status === "approved") decision.rules = rules;
  else {
    decision.excerpt = candidate.excerpt;
    decision.sourceUrl = candidate.source.url;
  }
  await saveDecision(decision);
  lastDecidedId = candidate.id;
  await loadDecisions();
  renderReview();
}

async function reviewAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = Number(button.dataset.id);
  const c = nextCandidate();
  if (action === "keep" && c) {
    const read = (name) => el(name).value.trim();
    const make = read("rvMake"), trigger = read("rvTrigger"), result = read("rvResult");
    const systems = [...document.querySelectorAll('input[name="rvSensor"]:checked')].map((box) => box.value);
    if (!make || !systems.length || !trigger || !result) {
      el("reviewError").textContent = "Choose the make, at least one sensor, the repair and the result first (or tap No if the sentence doesn't say it).";
      return;
    }
    const yearFrom = Number(read("rvYearFrom")) || null;
    const yearTo = Number(read("rvYearTo")) || null;
    const rules = systems.map((system) => {
      const rule = {
        id: `c${c.id}-${system}`, make, system, trigger, result, method: read("rvMethod") || (result === "required" ? "" : "none"),
        notes: read("rvNotes"), quote: c.excerpt, confidence: "medium", verified: today(), reviewer: localStorage.getItem(ADJUSTER_KEY) || "",
        source: { title: c.source.title, url: c.source.url, published: "", retrieved: c.source.retrieved },
      };
      if (yearFrom) rule.yearFrom = yearFrom;
      if (yearTo) rule.yearTo = yearTo;
      if (read("rvCondition")) rule.conditionKey = read("rvCondition");
      return rule;
    });
    await decide(c, "approved", rules);
  } else if (action === "hide" && c) {
    await decide(c, "rejected");
  } else if (action === "skip" && c) {
    skippedIds.add(c.id);
    renderReview();
  } else if (action === "unskip") {
    skippedIds.clear();
    renderReview();
  } else if (action === "undo" && lastDecidedId) {
    await deleteDecision(lastDecidedId);
    lastDecidedId = null;
    await loadDecisions();
    renderReview();
  } else if (action === "restore") {
    await deleteDecision(id);
    await loadDecisions();
    renderReview();
  } else if (action === "unkeep") {
    const d = decisionMap.get(id);
    if (d) {
      await saveDecision({ id, status: "rejected", reviewer: d.reviewer, reviewedAt: new Date().toISOString(), excerpt: d.rules[0].quote, sourceUrl: d.rules[0].source.url });
      await loadDecisions();
      renderReview();
    }
  }
}

function exportDecisions() {
  const decisions = [...decisionMap.values()];
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), decisions }, null, 1)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `truecal-review-decisions-${today()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  toast(`Exported ${decisions.length} decisions.`);
}

// ---------- Routing ----------

const SCREENS = ["home", "new", "ruling", "report", "history", "review"];
let currentCheck = null;

async function route() {
  const [name = "home", arg = ""] = location.hash.replace(/^#/, "").split("/");
  const screen = SCREENS.includes(name) ? name : "home";
  SCREENS.forEach((s) => (el(`screen-${s}`).hidden = s !== screen));
  el("backBtn").hidden = screen === "home";
  el("menu").hidden = true;
  el("menuBtn").setAttribute("aria-expanded", "false");
  window.scrollTo(0, 0);

  if (screen === "home") await renderHome();
  else if (screen === "new") renderForm();
  else if (screen === "history") await renderHistory();
  else if (screen === "review") renderReview();
  else {
    currentCheck = arg ? await getCheck(arg) : null;
    if (!currentCheck) {
      location.replace("#home");
      return;
    }
    if (screen === "ruling") {
      el("rulingBody").innerHTML = renderRuling(currentCheck);
      el("reportBtn").href = `#report/${currentCheck.id}`;
    } else {
      el("reportBody").innerHTML = renderReport(currentCheck);
    }
  }
}

function goBack() {
  const [name, arg] = location.hash.replace(/^#/, "").split("/");
  location.hash = name === "report" && arg ? `#ruling/${arg}` : "#home";
}

// ---------- Actions ----------

function startNewCheck() {
  const adjuster = draft.adjuster || localStorage.getItem(ADJUSTER_KEY) || "";
  draft = createEmptyDraft();
  draft.adjuster = adjuster;
  clearDraft().catch(() => {});
}

async function submitCheck(event) {
  event.preventDefault();
  readForm();
  const error = validateDraft();
  el("formError").textContent = error || "";
  if (error) return;
  const check = JSON.parse(JSON.stringify(draft));
  check.rulings = buildRulings(check);
  check.rulesUpdated = rulesSummary().updated;
  await saveCheck(check);
  await clearDraft().catch(() => {});
  draft = createEmptyDraft();
  location.hash = `#ruling/${check.id}`;
}

async function shareCheck() {
  if (!currentCheck) return;
  const text = summaryText(currentCheck);
  try {
    if (navigator.share) await navigator.share({ title: `TrueCal — ${vehicleTitle(currentCheck)}`, text });
    else {
      await navigator.clipboard.writeText(text);
      toast("Summary copied to the clipboard.");
    }
  } catch (err) {
    if (err.name !== "AbortError") toast("Couldn't share. Use Print / PDF instead.");
  }
}

async function importRulesFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const problem = validateRuleset(data);
    if (problem) {
      toast(`Rules file not imported. ${problem}`);
      return;
    }
    data.updated = data.updated || new Date().toISOString().slice(0, 10);
    importRuleset(data);
    updateRulesInfo();
    toast(`Imported ${data.rules.length} rules.`);
    if (!el("screen-home").hidden) renderHome();
  } catch (err) {
    toast("That file isn't valid JSON.");
  }
}

function bindEvents() {
  const form = el("checkForm");
  form.addEventListener("input", (event) => {
    if (event.target.id === "vehicleVin") {
      const cleaned = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cleaned !== event.target.value) event.target.value = cleaned;
    }
    readForm();
    if (event.target.id === "vehicleVin") {
      updateVinHint();
      scheduleVinDecode();
    }
    scheduleDraftSave();
  });
  form.addEventListener("submit", submitCheck);
  el("photoInput").addEventListener("change", (event) => {
    addPhotos([...event.target.files]);
    event.target.value = "";
  });
  el("photoThumbs").addEventListener("click", (event) => {
    const id = event.target.dataset && event.target.dataset.del;
    if (!id) return;
    draft.photos = draft.photos.filter((p) => p.id !== id);
    renderPhotos();
    scheduleDraftSave();
  });

  el("backBtn").addEventListener("click", goBack);
  ["newCheckBtn", "againBtn"].forEach((id) =>
    el(id).addEventListener("click", (event) => {
      event.preventDefault();
      startNewCheck();
      if (location.hash === "#new") renderForm();
      else location.hash = "#new";
    })
  );
  el("editBtn").addEventListener("click", () => {
    if (!currentCheck) return;
    const { rulings, rulesUpdated, ...rest } = currentCheck;
    draft = rest;
    putDraft(draft).catch(() => {});
    location.hash = "#new";
  });
  el("rulingBody").addEventListener("click", async (event) => {
    if (event.target.id !== "deleteCheckBtn" || !currentCheck) return;
    if (!confirm("Delete this check?")) return;
    await deleteCheck(currentCheck.id);
    location.hash = "#home";
  });
  el("shareBtn").addEventListener("click", shareCheck);
  el("printBtn").addEventListener("click", () => window.print());
  el("historySearch").addEventListener("input", renderHistory);
  el("historyFilter").addEventListener("change", renderHistory);

  el("menuBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = el("menu");
    menu.hidden = !menu.hidden;
    el("menuBtn").setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!el("menu").hidden && !el("menu").contains(event.target)) el("menu").hidden = true;
  });
  el("disclaimerBtn").addEventListener("click", () => {
    el("menu").hidden = true;
    el("disclaimerDialog").showModal();
  });
  el("importRulesBtn").addEventListener("click", () => el("importRulesInput").click());
  el("exportDecisionsBtn").addEventListener("click", () => {
    el("menu").hidden = true;
    exportDecisions();
  });
  el("reviewBody").addEventListener("click", reviewAction);
  document.querySelectorAll("[data-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      reviewTab = tab.dataset.tab;
      renderReview();
    })
  );
  el("importRulesInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    el("menu").hidden = true;
    if (file) importRulesFile(file);
  });
  el("clearRulesBtn").addEventListener("click", () => {
    el("menu").hidden = true;
    clearImportedRules();
    updateRulesInfo();
    toast("Imported rules removed.");
    if (!el("screen-home").hidden) renderHome();
  });
  el("updateBtn").addEventListener("click", async () => {
    el("menu").hidden = true;
    if (!("serviceWorker" in navigator)) return toast("Updates aren't supported in this browser.");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return toast("Not installed yet.");
      await registration.update();
      toast("Checked. Reloading to apply any update…");
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      toast("Couldn't check for updates (offline?).");
    }
  });

  const showNet = () => (el("netStatus").textContent = navigator.onLine ? "" : "Offline");
  window.addEventListener("online", showNet);
  window.addEventListener("offline", showNet);
  showNet();
  window.addEventListener("hashchange", route);
  bindScanButtons();
  setupDictation();
}

async function start() {
  buildForm();
  bindEvents();
  await loadRules();
  try {
    await loadDecisions();
  } catch (err) {
    console.warn("Could not read the review decisions", err);
  }
  updateRulesInfo();
  try {
    const saved = await getDraft();
    if (saved) draft = saved;
  } catch (err) {
    console.warn("Could not read the saved draft", err);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker failed", err));
  route();
}

start();
