// TrueCal — VIN barcode scanning (adapted from Collision Voice). Runs on the device; the camera image is never saved.
// The ZXing barcode reader (Apache-2.0) is kept in js/vendor/ so it also works offline.
// app.js supplies el(), loadImage(), scaledCanvas() and onVinScanned().

const ZXING_SRC = "js/vendor/zxing-library.min.js";

const scanner = { stream: null, timer: null, busy: false, active: false, tick: 0 };
const scannerFrameCanvas = document.createElement("canvas");
const SCANNER_IDLE_HINT = "Fill the frame with the VIN barcode (usually on the door-jamb sticker) and hold steady.";

function loadBarcodeLibrary() {
  return new Promise((resolve, reject) => {
    if (window.ZXing) return resolve();
    const script = document.createElement("script");
    script.src = ZXING_SRC;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${ZXING_SRC}`));
    document.head.appendChild(script);
  });
}

// ---------- VIN helpers ----------

const VIN_VALUES = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** The standard North American VIN check: the 9th character must match a sum of the others. Not all non-US VINs follow it. */
function vinCheckDigitOk(vin) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    sum += (/\d/.test(ch) ? Number(ch) : VIN_VALUES[ch]) * VIN_WEIGHTS[i];
  }
  const remainder = sum % 11;
  return vin[8] === (remainder === 10 ? "X" : String(remainder));
}

/** Finds 17-character VIN-like strings in text, best first (a passing check digit ranks highest). */
function extractVinCandidates(text) {
  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const scored = new Map();
  const consider = (candidate, base) => {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) return;
    const score = base + (vinCheckDigitOk(candidate) ? 10 : 0);
    if (!scored.has(candidate) || scored.get(candidate) < score) scored.set(candidate, score);
  };
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].length === 17) consider(tokens[i], 2);
    let joined = "";
    for (let j = i; j < Math.min(tokens.length, i + 4); j++) {
      joined += tokens[j];
      if (joined.length >= 17) {
        consider(joined.slice(0, 17), j === i ? 1 : 1.5);
        break;
      }
    }
    if (tokens[i].length > 17) {
      for (let k = 0; k + 17 <= tokens[i].length; k++) consider(tokens[i].slice(k, k + 17), 0.5);
    }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map((entry) => entry[0]);
}

/** Pulls a VIN out of whatever a barcode contains (some labels add a leading "I" or other text). */
function vinFromBarcodeText(text) {
  const candidates = extractVinCandidates(text || "");
  return candidates.length ? candidates[0] : null;
}

// ---------- Barcode reading ----------

let barcodeReaders = null;

/** Two readers: one-line VIN barcodes (Code 39/128) first, then square/stacked kinds, so a QR code doesn't hide a VIN barcode. */
function getBarcodeReaders() {
  if (!barcodeReaders) {
    const { MultiFormatReader, DecodeHintType, BarcodeFormat } = window.ZXing;
    const make = (formats) => {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new MultiFormatReader();
      reader.setHints(hints);
      return reader;
    };
    barcodeReaders = {
      oneD: make([BarcodeFormat.CODE_39, BarcodeFormat.CODE_128]),
      twoD: make([BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417, BarcodeFormat.QR_CODE]),
    };
  }
  return barcodeReaders;
}

function decodeCanvas(reader, canvas) {
  const { BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource } = window.ZXing;
  try {
    return reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)))).getText();
  } catch (err) {
    return null;
  }
}

function rotatedQuarterTurn(canvas) {
  const turned = document.createElement("canvas");
  turned.width = canvas.height;
  turned.height = canvas.width;
  const ctx = turned.getContext("2d");
  ctx.translate(turned.width / 2, turned.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return turned;
}

/** Looks for a VIN barcode in a picture, upright and turned a quarter turn (door-jamb stickers are often photographed sideways). */
function findVinInCanvas(canvas, { includeTwoD = true } = {}) {
  const { oneD, twoD } = getBarcodeReaders();
  let sawOther = false;
  for (const picture of [canvas, rotatedQuarterTurn(canvas)]) {
    for (const reader of includeTwoD ? [oneD, twoD] : [oneD]) {
      const text = decodeCanvas(reader, picture);
      if (!text) continue;
      const vin = vinFromBarcodeText(text);
      if (vin) return { vin, sawOther };
      sawOther = true;
    }
  }
  return { vin: null, sawOther };
}

function acceptVin(vin) {
  closeScanner();
  onVinScanned(vin);
}

async function scanVinFromPhoto(file) {
  const hint = el("scannerHint");
  hint.textContent = "Reading the photo…";
  try {
    await loadBarcodeLibrary();
  } catch (err) {
    hint.textContent = "The barcode reader couldn't load. Type the VIN instead.";
    return;
  }
  let sawOther = false;
  const { img, release } = await loadImage(file);
  try {
    for (const edge of [2000, 1400, 1000]) {
      const { canvas } = scaledCanvas(img, img.naturalWidth, img.naturalHeight, edge);
      const result = findVinInCanvas(canvas);
      if (result.vin) {
        acceptVin(result.vin);
        return;
      }
      sawOther = sawOther || result.sawOther;
    }
  } finally {
    release();
  }
  hint.textContent = sawOther
    ? "Found a barcode, but not the VIN barcode. Try again with the VIN barcode in the picture."
    : "Couldn't find a VIN barcode in that photo. Try again closer, with the barcode sharp, or type the VIN.";
}

// ---------- Live camera ----------

function stopCamera() {
  clearInterval(scanner.timer);
  scanner.timer = null;
  if (scanner.stream) {
    scanner.stream.getTracks().forEach((track) => track.stop());
    scanner.stream = null;
  }
  el("scannerVideo").srcObject = null;
}

function closeScanner() {
  stopCamera();
  scanner.active = false;
  el("scanner").hidden = true;
}

async function openScanner() {
  scanner.active = true;
  scanner.tick = 0;
  const overlay = el("scanner");
  const hint = el("scannerHint");
  overlay.hidden = false;
  hint.textContent = "Starting the camera…";

  try {
    await loadBarcodeLibrary();
  } catch (err) {
    hint.textContent = "The barcode reader couldn't load. Use a photo instead, or type the VIN.";
    return;
  }
  if (overlay.hidden) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    hint.textContent = "The camera isn't available here. Use a photo instead, or type the VIN.";
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (err) {
    hint.textContent = "Couldn't open the camera (check the camera permission). Use a photo instead, or type the VIN.";
    return;
  }
  if (overlay.hidden) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  scanner.stream = stream;
  const video = el("scannerVideo");
  video.srcObject = stream;
  await video.play().catch((err) => console.warn("Video did not start", err));
  hint.textContent = SCANNER_IDLE_HINT;
  scanner.timer = setInterval(scanTick, 250);
}

function captureFrame(video, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  scannerFrameCanvas.width = Math.round(video.videoWidth * scale);
  scannerFrameCanvas.height = Math.round(video.videoHeight * scale);
  scannerFrameCanvas.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, scannerFrameCanvas.width, scannerFrameCanvas.height);
  return scannerFrameCanvas;
}

function scanTick() {
  const video = el("scannerVideo");
  if (scanner.busy || !scanner.active || video.readyState < 2 || !video.videoWidth) return;
  scanner.busy = true;
  try {
    scanner.tick += 1;
    const result = findVinInCanvas(captureFrame(video, 1600), { includeTwoD: scanner.tick % 4 === 0 });
    if (result.vin) acceptVin(result.vin);
    else if (result.sawOther) el("scannerHint").textContent = "Found a barcode, but not the VIN barcode — keep looking.";
  } catch (err) {
    console.warn("Scan attempt failed", err);
  } finally {
    scanner.busy = false;
  }
}

function bindScanButtons() {
  el("scanVinBtn").addEventListener("click", openScanner);
  el("scannerCancel").addEventListener("click", closeScanner);
  el("scannerManual").addEventListener("click", () => {
    closeScanner();
    el("vehicleVin").focus();
  });
  el("scannerPhoto").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file || !scanner.active) return;
    stopCamera();
    try {
      await scanVinFromPhoto(file);
    } catch (err) {
      console.error("Reading the photo failed", err);
      el("scannerHint").textContent = "Couldn't read that photo. Try another, or type the VIN.";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el("scanner").hidden) closeScanner();
  });
}
