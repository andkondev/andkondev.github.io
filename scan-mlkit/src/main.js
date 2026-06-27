import "./styles.css";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CapacitorPluginMlKitTextRecognition } from "@pantrist/capacitor-plugin-ml-kit-text-recognition";

const els = {
  cameraBtn: document.getElementById("cameraBtn"),
  galleryBtn: document.getElementById("galleryBtn"),
  status: document.getElementById("status"),
  preview: document.getElementById("preview"),
  placeholder: document.getElementById("placeholder"),
  proteinPercent: document.getElementById("proteinPercent"),
  energyDensity: document.getElementById("energyDensity"),
  calories: document.getElementById("calories"),
  protein: document.getElementById("protein"),
  serving: document.getElementById("serving"),
  imageInfo: document.getElementById("imageInfo"),
  linesText: document.getElementById("linesText"),
  rawText: document.getElementById("rawText"),
  jsonText: document.getElementById("jsonText"),
};

function setStatus(text) {
  els.status.textContent = text;
}

function setBusy(isBusy) {
  els.cameraBtn.disabled = isBusy;
  els.galleryBtn.disabled = isBusy;
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

async function getPhoto(source) {
  return Camera.getPhoto({
    source,
    resultType: CameraResultType.Base64,
    quality: 95,
    correctOrientation: true,
    saveToGallery: false,
  });
}

async function scanSource(source) {
  setBusy(true);
  setStatus(source === CameraSource.Camera ? "Opening camera..." : "Opening gallery...");

  try {
    const photo = await getPhoto(source);
    if (!photo.base64String) throw new Error("Camera did not return base64 image data.");

    const mime = photo.format ? `image/${photo.format === "jpg" ? "jpeg" : photo.format}` : "image/jpeg";
    const imageSrc = `data:${mime};base64,${photo.base64String}`;
    els.preview.src = imageSrc;
    els.preview.hidden = false;
    els.placeholder.hidden = true;
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
    updateParsed(parsed);
    els.linesText.textContent = lineSummary(result.blocks);
    els.rawText.textContent = rawText.trim() || "(no text)";
    els.jsonText.textContent = JSON.stringify(result.blocks || [], null, 2);
    setStatus(`Done in ${elapsed} ms`);
  } catch (error) {
    setStatus("Failed");
    els.rawText.textContent = error?.message || String(error);
  } finally {
    setBusy(false);
  }
}

els.cameraBtn.addEventListener("click", () => scanSource(CameraSource.Camera));
els.galleryBtn.addEventListener("click", () => scanSource(CameraSource.Photos));
