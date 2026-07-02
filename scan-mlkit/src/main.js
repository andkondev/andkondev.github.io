import "./styles.css";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { CapacitorPluginMlKitTextRecognition } from "@pantrist/capacitor-plugin-ml-kit-text-recognition";

const els = {
  cornerAction: document.getElementById("cornerAction"),
  defaultAction: document.getElementById("defaultAction"),
  actionMenuToggle: document.getElementById("actionMenuToggle"),
  actionMenu: document.getElementById("actionMenu"),
  activeActionIcon: document.getElementById("activeActionIcon"),
  activeActionLabel: document.getElementById("activeActionLabel"),
  actionOptions: document.querySelectorAll("[data-action]"),
  meatSearchInput: document.getElementById("meatSearchInput"),
  meatSearchClear: document.getElementById("meatSearchClear"),
  meatResults: document.getElementById("meatResults"),
  status: document.getElementById("status"),
  resultStage: document.getElementById("resultStage"),
  resultTitle: document.getElementById("resultTitle"),
  resultBg: document.getElementById("resultBg"),
  preview: document.getElementById("preview"),
  placeholder: document.getElementById("placeholder"),
  proteinPercent: document.getElementById("proteinPercent"),
  energyDensity: document.getElementById("energyDensity"),
  calories: document.getElementById("calories"),
  protein: document.getElementById("protein"),
  serving: document.getElementById("serving"),
  imageInfo: document.getElementById("imageInfo"),
  railOpacityInput: document.getElementById("railOpacityInput"),
  railOpacityValue: document.getElementById("railOpacityValue"),
  cardBgInput: document.getElementById("cardBgInput"),
  cardBgValue: document.getElementById("cardBgValue"),
  linesText: document.getElementById("linesText"),
  rawText: document.getElementById("rawText"),
  jsonText: document.getElementById("jsonText"),
};

const BARCODE_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
];
const BATCH_OCR_BASE_URL = "http://127.0.0.1:8765";

const QUERY_ANIMALS = [
  "beef", "veal", "lamb", "pork", "chicken", "turkey", "duck", "goose",
  "salmon", "tuna", "shrimp", "cod", "tilapia", "trout", "sardine", "halibut",
  "snapper", "mahi mahi", "catfish", "haddock", "pollock", "crab", "lobster",
  "scallop", "clam", "oyster", "mussel", "flounder", "swordfish", "fish",
];
const QUERY_FORMS = [
  "ground", "breast", "thigh", "wing", "drumstick", "sirloin", "ribeye",
  "round", "chuck", "loin", "tenderloin", "fillet", "steak", "roast", "chop",
  "ribs", "sausage", "ham", "bacon",
];
const QUERY_STATES = ["raw", "cooked", "grilled", "broiled", "roasted", "fried", "canned", "smoked"];
const QUERY_STOP_WORDS = new Set(["and", "or", "the", "with", "without", "only", "meat", "seafood", "fresh", "frozen"]);
const SEAFOOD_VARIANTS = new Set(["atlantic", "sockeye", "yellowfin", "steelhead"]);
const PRODUCE_TERMS = new Set([
  "watermelon", "papaya", "mandarin", "orange", "apple", "banana", "melon",
  "grape", "berry", "strawberry", "blueberry", "pineapple", "mango", "peach",
  "pear", "plum", "kiwi", "lime", "lemon", "tomato", "potato", "onion",
  "pepper", "lettuce", "cabbage", "broccoli", "carrot",
]);
const PRODUCE_PREP_TERMS = new Set(["slice", "slices", "halved", "peeled", "bowl", "large", "xl"]);
const CUT_TERMS = new Set([
  "strip", "skirt", "eye", "ny", "new", "york", "top", "inside", "center",
  "cut", "butt", "boston", "country", "style", "finger", "spare", "st",
  "louis", "fajitas", "stew", "leg", "milk", "fed", "whole",
]);
const ATTRIBUTE_TERMS = new Set([
  "boneless", "bone", "in", "thin", "thick", "butterflied", "skinless",
  "sliced", "cubes", "cubed", "seasoned", "grass", "fed", "prime", "choice",
  "select", "wagyu", "atlantic", "sockeye", "yellowfin", "steelhead",
  "alaska", "wild", "caught", "farm", "raised", "previously", "natural",
  "extra", "lean", "fat", "carnitas",
]);
const DROP_LABEL_WORDS = new Set([
  "h", "e", "b", "heb", "produce", "market", "total", "price", "unit",
  "store", "time", "sell", "by", "packed", "on", "net", "weight", "wt",
  "ct", "lb", "lbs", "oz", "safe", "handling", "instructions", "keep",
  "refrigerated", "microwave", "cook", "thoroughly", "product", "usa",
  "mexico", "chile", "san", "antonio", "tx", "texas", "size", "sized",
  "pack", "tray", "case", "ready", "service", "value", "usda", "inspected",
  "passed", "department", "agriculture", "no", "antibiotics", "hormones",
  "ever", "artificial", "ingredients", "minimally", "processed", "serving",
  "nutrition", "facts", "calories", "protein", "sodium", "cholesterol",
  "carbohydrate", "vitamin", "calcium", "iron", "for", "mi", "tienda",
  "statement", "salt",
]);
const NEGATIVE_LABEL_LINE = /\b(h-?e-?b|san antonio|safe handling|instructions|sell by|packed on|net w|total price|unit price|price\/lb|store|time|keep refrigerated|microwave|cook thorough|product of|nutrition facts|serving|daily value|calories|cholesterol|sodium|carbohydrate|vitamin|calcium|iron|department of|inspected|passed|antibiotic|hormone|preservative|freshness|learn more|barcode|plu|lot #|est\.|use by|freeze by|ingredient|statement|seasoning)\b/i;
const LABEL_WORD_FIXES = [
  [/(\b)b0ston(\b)/g, "$1boston$2"],
  [/(\b)l0in(\b)/g, "$1loin$2"],
  [/(\b)drk(\b)/g, "$1pork$2"],
  [/(\b)yellowein(\b)/g, "$1yellowfin$2"],
  [/(\b)grno(\b)/g, "$1ground$2"],
  [/(\b)neef(\b)/g, "$1beef$2"],
  [/(\b)beet(\b)/g, "$1beef$2"],
  [/(\b)amb(\b)/g, "$1lamb$2"],
  [/(\b)srass(\b)/g, "$1grass$2"],
  [/(\b)lonsthp(\b)/g, "$1loin strip$2"],
  [/(\b)bef(\b)/g, "$1beef$2"],
  [/(\b)bn(\b)/g, "$1bone$2"],
  [/(\b)atl(\b)/g, "$1atlantic$2"],
  [/sli ces/g, "slices"],
  [/(\b)caugkt(\b)/g, "$1caught$2"],
  [/(\b)porkfinger(\b)/g, "$1pork finger$2"],
];

let meatFoods = [];
let meatLoadPromise = null;
let currentAction = "upc";

function setStatus(text) {
  els.status.textContent = text;
}

function setBusy(isBusy) {
  els.defaultAction.disabled = isBusy;
  els.actionMenuToggle.disabled = isBusy;
  for (const option of els.actionOptions) {
    option.disabled = isBusy;
  }
}

function openSearchMode({ focus = true } = {}) {
  els.cornerAction.classList.add("search-open");
  loadMeatFoods().catch(() => {});
  if (focus) {
    requestAnimationFrame(() => els.meatSearchInput.focus());
  }
}

function closeSearchMode() {
  els.cornerAction.classList.remove("search-open");
}

function saveAction(action) {
  try {
    window.localStorage.setItem("proteinScanAction", action);
  } catch {
    // The app still works if local storage is unavailable.
  }
}

function loadAction() {
  try {
    return window.localStorage.getItem("proteinScanAction");
  } catch {
    return null;
  }
}

function closeActionMenu() {
  els.cornerAction.classList.remove("menu-open");
  els.actionMenu.hidden = true;
  els.actionMenuToggle.setAttribute("aria-expanded", "false");
}

function setCurrentAction(option, revealSearch = true) {
  currentAction = option.dataset.action;
  els.activeActionLabel.textContent = option.dataset.label;
  els.activeActionIcon.innerHTML = option.querySelector(".icon").outerHTML;
  els.defaultAction.setAttribute("aria-label", `Run ${option.dataset.label}`);

  for (const otherOption of els.actionOptions) {
    otherOption.classList.toggle("active", otherOption === option);
  }

  closeActionMenu();

  if (currentAction === "search") {
    if (revealSearch) openSearchMode();
  } else {
    closeSearchMode();
  }

  saveAction(currentAction);
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unknown";
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${formatNumber(value, value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function cssImageUrl(value) {
  return `url("${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}

function setResultVisual({ title = "Ready", imageSrc = "", placeholder = "No image yet" } = {}) {
  els.resultTitle.textContent = title || "Ready";
  els.preview.alt = title || "";

  if (imageSrc) {
    els.preview.src = imageSrc;
    els.preview.hidden = false;
    els.placeholder.hidden = true;
    els.resultBg.style.backgroundImage = cssImageUrl(imageSrc);
    els.resultStage.classList.add("has-image");
    return;
  }

  els.preview.hidden = true;
  els.preview.removeAttribute("src");
  els.placeholder.hidden = false;
  els.placeholder.textContent = placeholder;
  els.resultBg.style.backgroundImage = "";
  els.resultStage.classList.remove("has-image");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function postBatchResult(payload) {
  const response = await fetch(`${BATCH_OCR_BASE_URL}/ocr-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Batch server returned ${response.status}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function cleanOcrLine(line) {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOcrText(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(cleanOcrLine)
    .filter(Boolean)
    .join("\n");
}

function parseOcrNumber(value) {
  const cleaned = String(value || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeBarcode(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function barcodeValue(barcode) {
  return normalizeBarcode(barcode?.rawValue || barcode?.displayValue || "");
}

function getKcal100g(nutriments) {
  const kcal = Number(nutriments?.["energy-kcal_100g"]);
  if (Number.isFinite(kcal) && kcal >= 0) return kcal;

  const kj = Number(nutriments?.energy_100g);
  if (Number.isFinite(kj) && kj >= 0) return kj / 4.184;

  return NaN;
}

function getProtein100g(nutriments) {
  const protein = Number(nutriments?.proteins_100g);
  return Number.isFinite(protein) && protein >= 0 ? protein : NaN;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(value) {
  return normalizeSearchText(value)
    .split(" ")
    .flatMap((token) => token === "spareribs" ? ["spare", "ribs"] : [token])
    .map((token) => token.endsWith("s") && ["chop", "rib", "burger", "portion"].includes(token.slice(0, -1)) ? token.slice(0, -1) : token)
    .filter((token) => token.length > 1 && !QUERY_STOP_WORDS.has(token));
}

function findKnownTerm(text, terms) {
  return terms.find((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) || "";
}

function parseLeanFat(query) {
  const compact = query.replace(/\s+/g, " ").trim();
  const slash = compact.match(/\b(\d{2,3})\s*(?:\/|\s+)\s*(\d{1,3})\b/);
  if (slash) {
    const lean = Number(slash[1]);
    const fat = Number(slash[2]);
    if (lean >= 45 && lean <= 99 && fat >= 1 && fat <= 55 && Math.abs(lean + fat - 100) <= 2) {
      return { lean, fat };
    }
  }

  const leanOnly = compact.match(/\b(\d{2,3})\s*(?:percent|%)?\s*lean\b/);
  if (leanOnly) {
    const lean = Number(leanOnly[1]);
    if (lean >= 45 && lean <= 99) return { lean, fat: 100 - lean };
  }

  return { lean: null, fat: null };
}

function parseMeatQuery(rawQuery) {
  const normalized = normalizeSearchText(rawQuery);
  const tokens = searchTokens(rawQuery);
  const ratio = parseLeanFat(normalized);
  const animal = normalized.includes("hamburger") ? "beef" : findKnownTerm(normalized, QUERY_ANIMALS);
  const form = normalized.includes("hamburger") ? "ground" : findKnownTerm(normalized, QUERY_FORMS);
  const state = findKnownTerm(normalized, QUERY_STATES);
  return {
    normalized,
    tokens,
    animal,
    form,
    state,
    lean: ratio.lean,
    fat: ratio.fat,
    wild: /\bwild\b|\bwild caught\b/.test(normalized),
    farm: /\bfarm\b|\bfarmed\b|\bfarm raised\b/.test(normalized),
  };
}

function cleanLabelText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[°º]/g, "%")
    .replace(/\|b/gi, "lb")
    .replace(/\b[Ii]b\b/g, "lb")
    .replace(/ILB|IlB/g, "/LB")
    .replace(/S\/lb/gi, "$/lb")
    .replace(/(?<=\d)[lI|]b\b/gi, "lb")
    .replace(/(?<=\d)\s*0Z\b/gi, " oz")
    .replace(/(?<=\d),(?=\d{2}\b)/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function fixLabelWords(value) {
  let text = cleanLabelText(value).toLowerCase();
  text = text
    .replace(/(?<=[a-z])0(?=[a-z])/g, "o")
    .replace(/(?<=[a-z])5(?=[a-z])/g, "s")
    .replace(/(?<=[a-z])1(?=[a-z])/g, "i")
    .replace(/&/g, " and ");
  for (const [pattern, replacement] of LABEL_WORD_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

function labelWords(value) {
  return fixLabelWords(value)
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1);
}

function hasAny(words, terms) {
  return words.some((word) => terms.has(word));
}

function scoreStickerTitleLine(line) {
  const fixed = fixLabelWords(line);
  if (!fixed || fixed.length > 90) return -8;
  if (/^[\d\s./:$%-]+$/.test(fixed)) return -8;
  if (NEGATIVE_LABEL_LINE.test(fixed)) return -7;
  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(fixed)) return -6;
  if (/\$\s*\d/.test(fixed)) return -6;

  const words = labelWords(line);
  let score = 0;
  if (hasAny(words, new Set(QUERY_ANIMALS))) score += 7;
  if (hasAny(words, new Set(QUERY_FORMS))) score += 5;
  if (hasAny(words, CUT_TERMS)) score += 4;
  if (hasAny(words, ATTRIBUTE_TERMS)) score += 2;
  if (hasAny(words, SEAFOOD_VARIANTS)) score += 5;
  if (hasAny(words, PRODUCE_TERMS)) score += 7;
  if (hasAny(words, PRODUCE_PREP_TERMS)) score += 2;
  if (/\b\d{2}\s*%?\s*(lean|fat)\b/.test(fixed)) score += 4;
  if (/\b(bone|boneless|skinless|natural|choice|prime|select)\b/.test(fixed)) score += 1;
  if (words.length === 1 && !hasAny(words, new Set(QUERY_ANIMALS)) && !hasAny(words, PRODUCE_TERMS)) score -= 2;
  return score;
}

function parseLabelLeanFat(rawText) {
  const text = cleanLabelText(rawText)
    .toLowerCase()
    .replace(/leanz/g, "lean 20")
    .replace(/lean\/fat/g, "lean fat")
    .replace(/[^a-z0-9%/.\s]+/g, " ")
    .replace(/\s+/g, " ");
  const patterns = [
    /\b(\d{2})\s*%?\s*(?:\/|\s+)?\s*(\d{1,2})\s*%?\s*(?:lean\s*\/?\s*fat|lean\s+fat)\b/,
    /\b(\d{2})\s*%?\s*lean\s*\/?\s*(\d{1,2})\s*%?\s*fat\b/,
    /\b(\d{2})\s*%?\s*\/\s*(\d{1,2})\s*%?\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lean = Number(match[1]);
    const fat = Number(match[2]);
    if (lean >= 45 && lean <= 99 && fat >= 1 && fat <= 55 && Math.abs(lean + fat - 100) <= 2) {
      return { lean, fat };
    }
  }
  const leanOnly = text.match(/\b(\d{2})\s*%?\s*lean\b/);
  if (leanOnly) {
    const lean = Number(leanOnly[1]);
    if (lean >= 45 && lean <= 99) return { lean, fat: 100 - lean };
  }
  const stacked = text.match(/\bfat\s+(\d{1,2})\s+lean\s+(\d{2})\b/);
  if (stacked) {
    const fat = Number(stacked[1]);
    const lean = Number(stacked[2]);
    if (lean >= 45 && lean <= 99 && Math.abs(lean + fat - 100) <= 2) return { lean, fat };
  }
  return { lean: null, fat: null };
}

function buildStickerQuery(lines, leanFat) {
  const scored = lines.map((line, index) => ({ index, text: line, score: scoreStickerTitleLine(line) }));
  const selected = scored.filter((line) => line.score >= 4);
  const selectedIndexes = new Set(selected.map((line) => line.index));

  for (const line of scored) {
    if (selectedIndexes.has(line.index) || line.score < 1) continue;
    const words = labelWords(line.text);
    const keepable = hasAny(words, ATTRIBUTE_TERMS) || hasAny(words, CUT_TERMS) || hasAny(words, PRODUCE_PREP_TERMS) || hasAny(words, new Set(QUERY_FORMS));
    const nearby = selected.some((selectedLine) => Math.abs(line.index - selectedLine.index) <= 3);
    if (keepable && nearby) selected.push(line);
  }

  selected.sort((a, b) => a.index - b.index);
  const rawWords = labelWords(lines.join("\n"));
  const rawWordSet = new Set(rawWords);
  const filtered = [];

  for (const line of selected) {
    for (const word of labelWords(line.text)) {
      if (DROP_LABEL_WORDS.has(word)) continue;
      if (/^\d+$/.test(word) && !["80", "85", "90", "93", "96", "20", "15", "10", "7", "4"].includes(word)) continue;
      if (word === "burger") filtered.push("burgers");
      else if (word === "chop") filtered.push("chops");
      else filtered.push(word);
    }
  }

  for (const species of ["beef", "pork", "lamb", "veal", "chicken", "salmon", "tuna", "trout"]) {
    if (rawWordSet.has(species) && !filtered.includes(species)) filtered.unshift(species);
  }
  if (rawWordSet.has("ground") && !filtered.includes("ground") && filtered.some((word) => ["beef", "lamb", "veal"].includes(word))) {
    filtered.splice(filtered.findIndex((word) => ["beef", "lamb", "veal"].includes(word)) + 1, 0, "ground");
  }
  if (leanFat.lean !== null) {
    for (const value of [String(leanFat.lean), String(leanFat.fat)]) {
      if (!filtered.includes(value)) filtered.push(value);
    }
  }
  if (filtered.includes("salmon") && (rawWordSet.has("wild") || rawWordSet.has("caught")) && !filtered.includes("wild")) filtered.push("wild");
  if (filtered.includes("salmon") && rawWordSet.has("farm") && rawWordSet.has("raised")) {
    if (!filtered.includes("farm")) filtered.push("farm");
    if (!filtered.includes("raised")) filtered.push("raised");
  }
  if (filtered.includes("tuna") && rawWordSet.has("yellowfin") && !filtered.includes("yellowfin")) {
    filtered.splice(filtered.indexOf("tuna"), 0, "yellowfin");
  }
  if (filtered.includes("beef") && filtered.includes("sirloin") && !filtered.includes("steak")) filtered.push("steak");
  if (filtered.includes("pork") && filtered.includes("carnitas")) {
    for (const word of ["shoulder", "boston", "butt"]) {
      if (!filtered.includes(word)) filtered.push(word);
    }
  }

  let phrase = filtered.join(" ");
  phrase = phrase
    .replace(/\bwatermelon slices?(?: xl)?\b/g, "watermelon")
    .replace(/\bmandarin peeled bowl large\b/g, "mandarin peeled")
    .replace(/\bpapaya halved\b/g, "papaya")
    .replace(/\batl fresh\b/g, "atlantic fresh")
    .replace(/\bsteelhead trout fillet\b/g, "trout")
    .replace(/\brib rack\b/g, "rack of lamb")
    .replace(/\bhalf ot boneless pork loin\b/g, "pork loin")
    .replace(/\bpk nat bnl hrlf loin cov\b/g, "pork loin")
    .replace(/\bgrno neef\b/g, "ground beef")
    .replace(/\btop or\s+/g, "")
    .replace(/\bop loin strip\b/g, "top loin strip")
    .replace(/\bpork finger ribs\b/g, "pork spare ribs")
    .replace(/\bpork st louis style ribs\b/g, "pork spare ribs")
    .replace(/\ball purpose seasoned\b/g, "")
    .replace(/\bcolor added through feed c00king\b/g, "");
  if (/\bwhole chicken\b/.test(phrase)) phrase = "whole chicken roasting meat and skin and giblets and neck";

  const finalWords = [];
  const seen = new Set();
  for (const word of phrase.split(/\s+/)) {
    if (!word || DROP_LABEL_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    finalWords.push(word);
  }

  return {
    searchQuery: finalWords.join(" ").trim(),
    titleLines: selected.map((line) => ({ index: line.index, text: line.text, score: line.score })),
  };
}

function parseLabelDecimal(value) {
  const number = Number(String(value || "").replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(",", "."));
  return Number.isFinite(number) ? number : NaN;
}

function parseLabelMoney(value) {
  const cleaned = String(value || "").replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(",", ".");
  if (/^\d{3,4}$/.test(cleaned)) {
    const cents = Number(cleaned) / 100;
    return cents > 0 && cents < 500 ? cents : NaN;
  }
  return parseLabelDecimal(cleaned);
}

function parseStickerWeight(lines, fullText) {
  const netLabel = /net\s+(?:wt|weight|eight|wict|vwt|vwe|wi\/ct|wvt\/ct|wt\/ct|nt\/ct|wt\/lb)/i;
  for (const [index, line] of lines.entries()) {
    if (!netLabel.test(fixLabelWords(line))) continue;
    const segment = lines.slice(index, index + 4).join(" ");
    const fixed = fixLabelWords(segment);
    const lbOz = fixed.match(/\b(\d+)\s*(?:lb|1b)\s*(\d+)\s*(?:oz|0z)\b/i);
    if (lbOz) {
      const value = Number(lbOz[1]) + Number(lbOz[2]) / 16;
      if (value > 0 && value < 100) return Number(value.toFixed(3));
    }
    const lbValues = [...fixed.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:lb|1b)\b/gi)]
      .map((match) => parseLabelDecimal(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0 && value < 100);
    if (lbValues.length) return (lbValues.filter((value) => value >= 0.2)[0] ?? lbValues[0]);
    const oz = fixed.match(/\b(\d+(?:[.,]\d+)?)\s*(?:oz|0z)\b/i);
    if (oz) {
      const value = parseLabelDecimal(oz[1]);
      if (value > 0 && value <= 64) return Number((value / 16).toFixed(3));
    }
  }

  const text = cleanLabelText(fullText).toLowerCase();
  const direct = text.match(/net\s+(?:wt|weight|wict|vwt|vwe|wt\/ct|nt\/ct)[^0-9]{0,20}(\d+)\s*(?:lb|1b)\s*(\d+)\s*(?:oz|0z)/i);
  if (direct) return Number((Number(direct[1]) + Number(direct[2]) / 16).toFixed(3));
  const candidates = [];
  for (const [index, line] of lines.entries()) {
    const fixed = fixLabelWords(line);
    if (/\/\s*lb|unit\s+(?:price|frice|price)|price\/lb/i.test(fixed)) continue;
    for (const match of fixed.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:lb|1b)\b/gi)) {
      const value = parseLabelDecimal(match[1]);
      if (value > 0 && value < 100) candidates.push({ index, value });
    }
  }
  const plausible = candidates.find((item) => item.value >= 0.2);
  return plausible?.value ?? candidates[0]?.value ?? NaN;
}

function parseStickerUnitPrice(lines, fullText) {
  for (const [index, line] of lines.entries()) {
    if (!/^\s*[$s5]\/\s*lb:?\s*$/i.test(fixLabelWords(line))) continue;
    for (const lookahead of lines.slice(index + 1, index + 4)) {
      const match = lookahead.match(/\b(\d+(?:[.,]\d+)?)\b/);
      if (match) {
        const value = parseLabelMoney(match[1]);
        if (value > 0 && value < 100) return value;
      }
    }
  }
  const text = cleanLabelText(fullText).toLowerCase();
  const patterns = [
    /unit\s+(?:price|frice|pr[i1]ce)[^$0-9]{0,20}\$?\s*(\d+(?:[.,]\d+)?)\s*\/?\s*(?:lb|1b)/i,
    /price\s+per\s+lb[^$0-9]{0,20}\$?\s*(\d+(?:[.,]\d+)?)/i,
    /\$\/lb:?\s*(\d+(?:[.,]\d+)?)/i,
    /\$\s*(\d+(?:[.,]\d+)?)\s*\/\s*(?:lb|1b)/i,
    /(\d+(?:[.,]\d+)?)\s*\/\s*(?:lb|1b)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseLabelMoney(match[1]);
    if (value > 0 && value < 100) return value;
  }
  return NaN;
}

function parseStickerTotalPrice(lines, fullText, weightLb, unitPrice) {
  const candidates = [];
  for (const [index, line] of lines.entries()) {
    if (!/total\s+(?:price|frice|p[rp]ce|ce)/i.test(fixLabelWords(line))) continue;
    for (let lookIndex = Math.max(0, index - 2); lookIndex < Math.min(lines.length, index + 5); lookIndex += 1) {
      const lookLine = lines[lookIndex];
      if (/\/\s*lb|unit\s+(?:price|frice)/i.test(lookLine)) continue;
      for (const match of lookLine.matchAll(/[$sS]\s*(\d+(?:[.,]\d+)?)/g)) {
        const value = parseLabelMoney(match[1]);
        if (value > 0 && value < 500) candidates.push({ distance: Math.abs(lookIndex - index), prefixed: true, value });
      }
      if (!candidates.length) {
        for (const match of lookLine.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)) {
          const value = parseLabelMoney(match[1]);
          if (value > 0 && value < 500) candidates.push({ distance: Math.abs(lookIndex - index), prefixed: false, value });
        }
      }
    }
  }
  if (candidates.length) {
    if (Number.isFinite(weightLb) && Number.isFinite(unitPrice)) {
      const target = weightLb * unitPrice;
      const close = [...candidates].sort((a, b) => Math.abs(a.value - target) - Math.abs(b.value - target))[0];
      if (Math.abs(close.value - target) <= Math.max(0.25, target * 0.08)) return Number(close.value.toFixed(2));
    }
    candidates.sort((a, b) => a.distance - b.distance || Number(b.prefixed) - Number(a.prefixed) || b.value - a.value);
    return candidates[0].value;
  }

  const dollars = [...cleanLabelText(fullText).matchAll(/\$\s*(\d+(?:[.,]\d+)?)/g)]
    .map((match) => parseLabelMoney(match[1]))
    .filter((value) => value > 0 && value < 500);
  if (dollars.length && Number.isFinite(weightLb) && Number.isFinite(unitPrice)) {
    const target = weightLb * unitPrice;
    const close = [...dollars].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    if (Math.abs(close - target) <= Math.max(0.25, target * 0.08)) return Number(close.toFixed(2));
  }
  return dollars.length ? Math.max(...dollars) : NaN;
}

function parseStickerSellBy(lines) {
  const datePattern = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|[A-Z][a-z]{2}\.?\s*\d{1,2}\.\d{2})/;
  for (const [index, line] of lines.entries()) {
    if (!/(sell|use|freeze)\s+by/i.test(line)) continue;
    const match = lines.slice(index, index + 4).join(" ").match(datePattern);
    if (match) return match[1];
  }
  return "";
}

function parseStickerLabel(rawText) {
  const lines = String(rawText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(cleanLabelText)
    .filter(Boolean);
  const leanFat = parseLabelLeanFat(rawText);
  const title = buildStickerQuery(lines, leanFat);
  const words = new Set(labelWords(title.searchQuery));
  const hasProduce = [...words].some((word) => PRODUCE_TERMS.has(word));
  const hasSeafood = [...words].some((word) => ["salmon", "tuna", "trout", "fish", "shrimp", "cod"].includes(word));
  const weightLb = parseStickerWeight(lines, rawText);
  const unitPrice = parseStickerUnitPrice(lines, rawText);
  const totalPrice = parseStickerTotalPrice(lines, rawText, weightLb, unitPrice);
  let confidence = 0;
  if (title.searchQuery) confidence += 0.45;
  if ([weightLb, unitPrice, totalPrice].some(Number.isFinite)) confidence += 0.25;
  if (leanFat.lean !== null) confidence += 0.1;
  if (title.titleLines.length >= 2) confidence += 0.1;
  if (title.searchQuery.split(/\s+/).length >= 2) confidence += 0.1;

  return {
    label_type: hasProduce ? "produce" : hasSeafood ? "seafood" : "meat",
    search_query: title.searchQuery,
    title_lines: title.titleLines,
    lean_percent: leanFat.lean,
    fat_percent: leanFat.fat,
    facts: {
      weight_lb: Number.isFinite(weightLb) ? weightLb : null,
      unit_price_per_lb: Number.isFinite(unitPrice) ? unitPrice : null,
      total_price: Number.isFinite(totalPrice) ? totalPrice : null,
      sell_by: parseStickerSellBy(lines),
    },
    confidence: Math.min(confidence, 0.98),
    raw_line_count: lines.length,
  };
}

function stickerFactsSummary(labelParse) {
  const facts = labelParse.facts || {};
  return [
    labelParse.search_query ? `query: ${labelParse.search_query}` : "",
    facts.weight_lb !== null ? `weight: ${formatNumber(facts.weight_lb, 3)} lb` : "",
    facts.unit_price_per_lb !== null ? `unit: $${formatNumber(facts.unit_price_per_lb, 2)}/lb` : "",
    facts.total_price !== null ? `total: $${formatNumber(facts.total_price, 2)}` : "",
    facts.sell_by ? `date: ${facts.sell_by}` : "",
  ].filter(Boolean).join(" - ");
}

function scoreMeatFood(food, query) {
  if (!query.normalized) return 0;

  const name = normalizeSearchText(food.name);
  const aliases = food.aliases || [];
  const tokenSet = new Set(food.tokens || []);
  let score = 0;
  let hasMatch = false;
  let strongMatch = false;
  let matchedTokens = 0;

  if (name === query.normalized) {
    score += 180;
    hasMatch = true;
    strongMatch = true;
  }
  if (name.includes(query.normalized)) {
    score += 70;
    hasMatch = true;
    strongMatch = true;
  }
  if (aliases.some((alias) => normalizeSearchText(alias) === query.normalized)) {
    score += 150;
    hasMatch = true;
    strongMatch = true;
  }
  if (aliases.some((alias) => normalizeSearchText(alias).includes(query.normalized))) {
    score += 70;
    hasMatch = true;
    strongMatch = true;
  }

  if (query.lean !== null) {
    if (food.leanPercent === query.lean && food.fatPercent === query.fat) {
      score += 140;
      hasMatch = true;
      strongMatch = true;
    } else if (food.leanPercent === query.lean) {
      score += 80;
      hasMatch = true;
      strongMatch = true;
    }
    else score -= query.tokens.length <= 2 ? 90 : 25;
  }

  if (query.animal) {
    if (food.animal === query.animal) {
      score += 60;
      hasMatch = true;
    } else if (query.animal === "fish" && food.category === "Finfish and Shellfish Products") {
      score += 30;
      hasMatch = true;
    }
    else score -= 35;
  }

  if (query.form) {
    if (food.form === query.form || name.includes(query.form)) {
      score += 38;
      hasMatch = true;
    }
    else score -= 12;
  }

  if (query.state) {
    if (food.state === query.state || name.includes(query.state)) {
      score += 30;
      hasMatch = true;
    }
    else score -= 20;
  } else {
    if (food.state === "raw") score += 16;
    if (food.state === "cooked") score -= 14;
    if (["canned", "smoked"].includes(food.state)) score -= 10;
  }

  if (query.wild) score += food.wildCaught ? 45 : -25;
  if (query.farm) score += food.farmRaised ? 35 : -18;
  if (food.dataType === "Foundation") score += 12;

  for (const token of query.tokens) {
    if (tokenSet.has(token)) {
      score += 12;
      hasMatch = true;
      matchedTokens += 1;
    } else if (name.includes(token)) {
      score += 7;
      hasMatch = true;
      matchedTokens += 1;
    }
  }

  const enoughTokenMatch = query.tokens.length <= 1 || matchedTokens >= Math.min(query.tokens.length, 2);
  return hasMatch && (strongMatch || enoughTokenMatch) ? score : 0;
}

function findCalories(lines) {
  for (const line of lines) {
    if (!/\bcalor/i.test(line) || /from\s+fat/i.test(line)) continue;
    const direct = line.match(/calor(?:y|ies)?[^0-9OIl]{0,24}([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)/i);
    const loose = line.match(/([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)/);
    const value = parseOcrNumber((direct || loose || [])[1]);
    if (value > 0 && value < 2000) return { value, line };
  }
  return { value: NaN, line: "" };
}

function findProtein(lines) {
  for (const line of lines) {
    if (!/\bprotein\b/i.test(line)) continue;
    const after = line.match(/protein[^0-9OIl]{0,24}([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)\s*(?:g|q|grams?)?/i);
    const before = line.match(/([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)\s*(?:g|q|grams?)\s+protein/i);
    const value = parseOcrNumber((after || before || [])[1]);
    if (value >= 0 && value < 300) return { value, line };
  }
  return { value: NaN, line: "" };
}

function findServing(lines, fullText) {
  const servingIndex = lines.findIndex((line) => /serving\s+size/i.test(line));
  const windows = [];
  if (servingIndex >= 0) windows.push(lines.slice(servingIndex, servingIndex + 3).join(" "));
  const globalServing = fullText.match(/serving\s+size[\s\S]{0,100}/i);
  if (globalServing) windows.push(globalServing[0].replace(/\n/g, " "));

  for (const chunk of windows) {
    const grams = chunk.match(/([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)\s*(?:g|grams?)\b/i);
    if (grams) {
      const value = parseOcrNumber(grams[1]);
      if (value > 0 && value < 2000) return { value, line: chunk, unit: "g" };
    }
    const ml = chunk.match(/([0-9OIl]{1,4}(?:[.,][0-9OIl]{1,2})?)\s*(?:ml|mL|milliliters?)\b/i);
    if (ml) {
      const value = parseOcrNumber(ml[1]);
      if (value > 0 && value < 2000) return { value, line: chunk, unit: "ml" };
    }
    const ounces = chunk.match(/([0-9OIl]{1,3}(?:[.,][0-9OIl]{1,2})?)\s*(?:oz|ounces?)\b/i);
    if (ounces) {
      const value = parseOcrNumber(ounces[1]);
      if (value > 0 && value < 40) return { value: value * 28.3495, line: chunk, unit: "oz" };
    }
  }

  return { value: NaN, line: "", unit: "" };
}

function parseNutritionText(rawText) {
  const text = normalizeOcrText(rawText);
  const lines = text.split("\n").filter(Boolean);
  const calories = findCalories(lines);
  const protein = findProtein(lines);
  const serving = findServing(lines, text);
  return {
    text,
    calories: calories.value,
    proteinG: protein.value,
    servingG: serving.value,
    sourceLines: {
      calories: calories.line,
      protein: protein.line,
      serving: serving.line,
    },
  };
}

function lineSummary(blocks) {
  const rows = [];
  for (const [blockIndex, block] of (blocks || []).entries()) {
    for (const [lineIndex, line] of (block.lines || []).entries()) {
      const box = line.boundingBox || {};
      rows.push({
        block: blockIndex + 1,
        line: lineIndex + 1,
        text: line.text || "",
        top: box.top,
        left: box.left,
        right: box.right,
        bottom: box.bottom,
      });
    }
  }
  return rows
    .sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (a.left ?? 0) - (b.left ?? 0))
    .map((row) => {
      const box = [row.left, row.top, row.right, row.bottom]
        .map((value) => Number.isFinite(value) ? Math.round(value) : "?")
        .join(",");
      return `${String(row.block).padStart(2, "0")}.${String(row.line).padStart(2, "0")} [${box}] ${row.text}`;
    })
    .join("\n");
}

function updateParsed(parsed) {
  const hasCalories = Number.isFinite(parsed.calories) && parsed.calories > 0;
  const hasProtein = Number.isFinite(parsed.proteinG) && parsed.proteinG >= 0;
  const hasServing = Number.isFinite(parsed.servingG) && parsed.servingG > 0;
  const proteinPercent = hasCalories && hasProtein ? parsed.proteinG * 4 * 100 / parsed.calories : NaN;
  const energyDensity = hasCalories && hasServing ? parsed.calories / parsed.servingG : NaN;

  els.proteinPercent.textContent = Number.isFinite(proteinPercent) ? `${formatNumber(proteinPercent, 1)}%` : "--";
  els.energyDensity.textContent = Number.isFinite(energyDensity) ? formatNumber(energyDensity, 2) : "--";
  els.calories.textContent = hasCalories ? `${formatNumber(parsed.calories, 0)} kcal` : "--";
  els.protein.textContent = hasProtein ? `${formatNumber(parsed.proteinG, 1)} g` : "--";
  els.serving.textContent = hasServing ? `${formatNumber(parsed.servingG, 0)} g` : "--";
}

function showEmptyResult(title, details = "") {
  setResultVisual({
    title,
    placeholder: details || "No image available",
  });
  els.proteinPercent.textContent = "--";
  els.energyDensity.textContent = "--";
  els.calories.textContent = "--";
  els.protein.textContent = "--";
  els.serving.textContent = "--";
  els.imageInfo.textContent = details || "--";
}

function showProduct(product, barcode) {
  const nutriments = product.nutriments || {};
  const protein100g = getProtein100g(nutriments);
  const kcal100g = getKcal100g(nutriments);
  const hasProtein = Number.isFinite(protein100g);
  const hasEnergy = Number.isFinite(kcal100g) && kcal100g > 0;
  const proteinPercent = hasProtein && hasEnergy ? protein100g * 4 * 100 / kcal100g : NaN;
  const energyDensity = hasEnergy ? kcal100g / 100 : NaN;
  const title = product.product_name || "Unnamed product";
  const meta = [product.brands, product.quantity || product.serving_size, barcode].filter(Boolean).join(" - ");

  setResultVisual({
    title,
    imageSrc: product.image_front_url || "",
    placeholder: "No product image",
  });

  els.proteinPercent.textContent = Number.isFinite(proteinPercent) ? `${formatNumber(proteinPercent, 1)}%` : "--";
  els.energyDensity.textContent = Number.isFinite(energyDensity) ? formatNumber(energyDensity, 2) : "--";
  els.calories.textContent = Number.isFinite(kcal100g) ? `${formatNumber(kcal100g, 0)} kcal/100g` : "--";
  els.protein.textContent = hasProtein ? `${formatNumber(protein100g, 1)} g/100g` : "--";
  els.serving.textContent = product.serving_size || product.quantity || "--";
  els.imageInfo.textContent = meta || barcode;
  els.linesText.textContent = `Open Food Facts\n${title}${meta ? `\n${meta}` : ""}`;
  els.rawText.textContent = JSON.stringify({
    barcode,
    product_name: product.product_name,
    brands: product.brands,
    quantity: product.quantity,
    serving_size: product.serving_size,
    protein_100g: protein100g,
    kcal_100g: kcal100g,
  }, null, 2);
  els.jsonText.textContent = JSON.stringify(product, null, 2);
}

async function loadMeatFoods() {
  if (meatFoods.length) return meatFoods;
  if (!meatLoadPromise) {
    meatLoadPromise = fetch("/data/whole-foods-usda.json")
      .then((response) => {
        if (!response.ok) throw new Error(`USDA data returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        meatFoods = data.foods || [];
        return meatFoods;
      });
  }
  return meatLoadPromise;
}

function meatMeta(food) {
  return [
    food.category,
    food.animal,
    food.form,
    food.state,
    food.leanPercent ? `${food.leanPercent}/${food.fatPercent}` : "",
    food.dataType,
  ].filter(Boolean).join(" - ");
}

function showMeatFood(food) {
  const hasProtein = Number.isFinite(food.protein100g);
  const hasEnergy = Number.isFinite(food.kcal100g) && food.kcal100g >= 0;

  setResultVisual({
    title: food.name,
    placeholder: "USDA whole-food item",
  });
  els.proteinPercent.textContent = Number.isFinite(food.proteinPct) ? `${formatNumber(food.proteinPct, 1)}%` : "--";
  els.energyDensity.textContent = Number.isFinite(food.energyDensity) ? formatNumber(food.energyDensity, 2) : "--";
  els.calories.textContent = hasEnergy ? `${formatNumber(food.kcal100g, 0)} kcal/100g` : "--";
  els.protein.textContent = hasProtein ? `${formatNumber(food.protein100g, 1)} g/100g` : "--";
  els.serving.textContent = "100 g";
  els.imageInfo.textContent = `USDA FDC ${food.id} - ${food.category}`;
  els.linesText.textContent = `${food.name}\n${meatMeta(food)}`;
  els.rawText.textContent = JSON.stringify({
    fdcId: food.id,
    source: food.source,
    dataType: food.dataType,
    category: food.category,
    kcal100g: food.kcal100g,
    protein100g: food.protein100g,
    fat100g: food.fat100g,
  }, null, 2);
  els.jsonText.textContent = JSON.stringify(food, null, 2);
  setStatus("USDA lookup done");
}

function renderMeatResults(matches) {
  els.meatResults.innerHTML = matches.map(({ food }) => `
    <button class="search-result" type="button" data-id="${food.id}">
      <span>
        <span class="search-result-name">${escapeHtml(food.name)}</span>
        <span class="search-result-meta">${escapeHtml(meatMeta(food))}</span>
      </span>
      <span class="search-result-score">${formatNumber(food.proteinPct, 0)}% protein - ${formatNumber(food.energyDensity, 2)} kcal/g</span>
    </button>
  `).join("");

  for (const button of els.meatResults.querySelectorAll(".search-result")) {
    button.addEventListener("click", () => {
      const food = meatFoods.find((item) => String(item.id) === button.dataset.id);
      if (food) {
        showMeatFood(food);
        els.meatResults.innerHTML = "";
        closeSearchMode();
      }
    });
  }
}

async function updateMeatSearch() {
  const queryText = els.meatSearchInput.value.trim();
  if (!queryText) {
    els.meatResults.innerHTML = "";
    return;
  }

  els.meatResults.innerHTML = `<div class="search-message">Loading USDA whole-food and ingredient data...</div>`;
  try {
    const foods = await loadMeatFoods();
    const query = parseMeatQuery(queryText);
    const matches = foods
      .map((food) => ({ food, score: scoreMeatFood(food, query) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length || a.food.name.localeCompare(b.food.name))
      .slice(0, 8);

    if (!matches.length) {
      els.meatResults.innerHTML = `<div class="search-message warn">No whole-food match found.</div>`;
      return;
    }

    renderMeatResults(matches);
  } catch (error) {
    els.meatResults.innerHTML = `<div class="search-message warn">${escapeHtml(error.message || "Could not load USDA data.")}</div>`;
  }
}

async function fetchProduct(barcode, fields) {
  const candidates = barcode.length === 12 ? [barcode, `0${barcode}`] : [barcode];

  for (const code of candidates) {
    const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=${fields}`;
    const response = await fetch(url, {
      headers: {
        "X-User-Agent": "andkon.dev/scan-mlkit - personal prototype",
      },
    });

    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);

    const data = await response.json();
    if (data.product || code === candidates[candidates.length - 1]) return data;
  }

  return { product: null };
}

async function lookupBarcode(barcode) {
  setStatus(`Looking up ${barcode}...`);
  const fields = [
    "code",
    "product_name",
    "brands",
    "quantity",
    "serving_size",
    "image_front_url",
    "nutriments",
  ].join(",");
  const data = await fetchProduct(barcode, fields);

  if (!data.product) {
    showEmptyResult("Not found", barcode);
    els.linesText.textContent = `Barcode\n${barcode}`;
    els.rawText.textContent = "Open Food Facts does not have this product yet.";
    els.jsonText.textContent = JSON.stringify(data, null, 2);
    setStatus("Barcode not found");
    return;
  }

  showProduct(data.product, data.code || barcode);
  setStatus("UPC lookup done");
}

async function getPhoto(source) {
  return Camera.getPhoto({
    source,
    resultType: CameraResultType.Base64,
    quality: 95,
    correctOrientation: true,
    saveToGallery: false,
  });
}

async function scanBarcode() {
  setBusy(true);
  setStatus("Opening UPC scanner...");

  try {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) throw new Error("Barcode scanning is not supported on this device.");

    try {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        setStatus("Installing barcode scanner...");
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        throw new Error("Google barcode scanner is installing. Try Scan UPC again in a moment.");
      }
    } catch (error) {
      if (!/not implemented|unavailable/i.test(error?.message || "")) throw error;
    }

    const result = await BarcodeScanner.scan({
      formats: BARCODE_FORMATS,
      autoZoom: true,
    });
    const barcode = (result.barcodes || []).map(barcodeValue).find(Boolean);

    if (!barcode) {
      setStatus("No barcode found");
      return;
    }

    els.linesText.textContent = `Barcode\n${barcode}`;
    els.rawText.textContent = JSON.stringify(result.barcodes || [], null, 2);
    els.jsonText.textContent = JSON.stringify(result, null, 2);
    await lookupBarcode(barcode);
  } catch (error) {
    const message = error?.message || String(error);
    const cancelled = /cancel/i.test(message);
    setStatus(cancelled ? "Scan cancelled" : "Barcode scan failed");
    if (!cancelled) {
      els.rawText.textContent = message;
    }
  } finally {
    setBusy(false);
  }
}

async function scanSource(source) {
  setBusy(true);
  setStatus(source === CameraSource.Camera ? "Opening camera..." : "Opening gallery...");

  try {
    const photo = await getPhoto(source);
    if (!photo.base64String) throw new Error("Camera did not return base64 image data.");

    const mime = photo.format ? `image/${photo.format === "jpg" ? "jpeg" : photo.format}` : "image/jpeg";
    const imageSrc = `data:${mime};base64,${photo.base64String}`;
    setResultVisual({
      title: "Reading label",
      imageSrc,
      placeholder: "Reading label",
    });
    els.imageInfo.textContent = `${photo.format || "image"} - ${formatBytes(Math.round(photo.base64String.length * 0.75))}`;

    setStatus("Running ML Kit...");
    const started = performance.now();
    const result = await CapacitorPluginMlKitTextRecognition.detectText({
      base64Image: photo.base64String,
      rotation: 0,
    });
    const elapsed = Math.round(performance.now() - started);

    const rawText = result.text || "";
    const parsed = parseNutritionText(rawText);
    const labelParse = parseStickerLabel(rawText);
    const labelSummary = stickerFactsSummary(labelParse);
    const shouldApplyLabel = labelParse.search_query && labelParse.confidence >= 0.55 && labelParse.title_lines.length > 0;

    updateParsed(parsed);
    els.linesText.textContent = lineSummary(result.blocks);
    els.rawText.textContent = [
      rawText.trim() || "(no text)",
      labelSummary ? `\n\nParsed sticker\n${labelSummary}` : "",
    ].filter(Boolean).join("");
    els.jsonText.textContent = JSON.stringify({
      label_parse: labelParse,
      blocks: result.blocks || [],
    }, null, 2);

    if (labelSummary) {
      els.imageInfo.textContent = `${els.imageInfo.textContent} - ${labelSummary}`;
    }
    if (shouldApplyLabel) {
      els.resultTitle.textContent = labelParse.search_query;
      els.meatSearchInput.value = labelParse.search_query;
      openSearchMode({ focus: false });
      await updateMeatSearch();
    } else if (labelParse.search_query) {
      els.resultTitle.textContent = labelParse.search_query;
    }
    setStatus(shouldApplyLabel ? `Parsed label in ${elapsed} ms` : `Done in ${elapsed} ms`);
  } catch (error) {
    setStatus("Failed");
    els.rawText.textContent = error?.message || String(error);
  } finally {
    setBusy(false);
  }
}

async function runBatchOcr() {
  setBusy(true);
  setStatus("Connecting to batch server...");

  try {
    const manifest = await fetchJson(`${BATCH_OCR_BASE_URL}/manifest.json?ts=${Date.now()}`);
    const images = manifest.images || [];
    if (!images.length) throw new Error("Batch manifest had no images.");

    els.rawText.textContent = "";
    els.jsonText.textContent = "";

    for (const [index, item] of images.entries()) {
      const imageUrl = `${BATCH_OCR_BASE_URL}/image/${encodeURIComponent(item.name)}?max=${encodeURIComponent(manifest.maxDimension || 0)}`;
      setStatus(`Batch OCR ${index + 1}/${images.length}: ${item.name}`);

      const imageResponse = await fetch(imageUrl, { cache: "no-store" });
      if (!imageResponse.ok) throw new Error(`${item.name} returned ${imageResponse.status}`);
      const blob = await imageResponse.blob();
      const base64Image = await blobToBase64(blob);
      const batchImageSrc = `data:${blob.type || "image/jpeg"};base64,${base64Image}`;
      setResultVisual({
        title: item.name,
        imageSrc: batchImageSrc,
        placeholder: "Batch OCR image",
      });

      const started = performance.now();
      let result = null;
      let error = "";
      try {
        result = await CapacitorPluginMlKitTextRecognition.detectText({
          base64Image,
          rotation: item.rotation || 0,
        });
      } catch (ocrError) {
        error = ocrError?.message || String(ocrError);
      }
      const elapsedMs = Math.round(performance.now() - started);

      const payload = {
        source: "mlkit-android",
        file: item.name,
        index,
        total: images.length,
        elapsedMs,
        image: {
          bytes: blob.size,
          mime: blob.type,
          original: item,
        },
        text: result?.text || "",
        blocks: result?.blocks || [],
        error,
      };
      await postBatchResult(payload);

      els.imageInfo.textContent = `${item.name} - ${formatBytes(blob.size)} - ${elapsedMs} ms`;
      els.linesText.textContent = error ? `(OCR failed) ${error}` : lineSummary(result.blocks);
      els.rawText.textContent = error || (result.text || "").trim() || "(no text)";
      els.jsonText.textContent = JSON.stringify(payload, null, 2);
    }

    setStatus(`Batch OCR complete: ${images.length} images`);
  } catch (error) {
    setStatus("Batch OCR failed");
    els.rawText.textContent = error?.message || String(error);
  } finally {
    setBusy(false);
  }
}

function updateRailOpacity() {
  const opacity = Number(els.railOpacityInput.value) / 100;
  els.resultStage.style.setProperty("--rail-darkness", opacity.toFixed(2));
  els.railOpacityValue.textContent = `${els.railOpacityInput.value}%`;
}

function updateCardBackground() {
  const opacity = Number(els.cardBgInput.value) / 100;
  els.resultStage.style.setProperty("--card-bg-opacity", opacity.toFixed(2));
  els.cardBgValue.textContent = `${els.cardBgInput.value}%`;
}

async function runCurrentAction() {
  closeActionMenu();

  if (currentAction === "search") {
    openSearchMode();
    return;
  }

  closeSearchMode();
  els.defaultAction.classList.add("is-running");
  window.setTimeout(() => {
    els.defaultAction.classList.remove("is-running");
  }, 160);

  if (currentAction === "upc") {
    await scanBarcode();
  } else if (currentAction === "nutrition" || currentAction === "meat") {
    await scanSource(CameraSource.Camera);
  }
}

const savedAction = loadAction();
const savedOption = savedAction ? document.querySelector(`[data-action="${savedAction}"]`) : null;
if (savedOption) {
  setCurrentAction(savedOption, false);
}

els.actionMenuToggle.addEventListener("click", () => {
  const willOpen = !els.cornerAction.classList.contains("menu-open");
  els.cornerAction.classList.toggle("menu-open", willOpen);
  els.actionMenu.hidden = !willOpen;
  els.actionMenuToggle.setAttribute("aria-expanded", String(willOpen));
});

els.defaultAction.addEventListener("click", () => {
  runCurrentAction().catch((error) => {
    setStatus("Action failed");
    els.rawText.textContent = error?.message || String(error);
  });
});

for (const option of els.actionOptions) {
  option.addEventListener("click", () => {
    setCurrentAction(option);
  });
}

els.railOpacityInput.addEventListener("input", updateRailOpacity);
els.cardBgInput.addEventListener("input", updateCardBackground);
els.meatSearchInput.addEventListener("input", updateMeatSearch);
els.meatSearchInput.addEventListener("focus", () => {
  loadMeatFoods().catch(() => {});
});
els.meatSearchClear.addEventListener("click", () => {
  els.meatSearchInput.value = "";
  els.meatResults.innerHTML = "";
  closeSearchMode();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeActionMenu();
    closeSearchMode();
  }
});
document.addEventListener("click", (event) => {
  if (!els.cornerAction.contains(event.target)) {
    closeActionMenu();
  }
});
updateRailOpacity();
updateCardBackground();
requestAnimationFrame(() => window.scrollTo(0, 0));
