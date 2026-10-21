cat << 'EOF' > oversett_alle.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6K2VRGoPWD8NSdhicBQ0tmRH_h3sD7VT7V_2PF1u2kPTA";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const INPUT_DIR = path.resolve("1_til_oversetting");
const OUTPUT_DIR = path.resolve("2_oversatt");
const ZIP_FILE = path.resolve("2_oversatt.zip");

const BATCH_SIZE = 40;
const CONCURRENCY = 3;

const LANGUAGES = [
  {
    code: "fr",
    name: "fransk (fr)",
    plurals: '["one", "many", "other"]',
    glossary: `
- manus / script -> scénario
- replikk / line (dialogue) -> réplique
- scene / scene -> scène
- sceneforekomst / scene occurrence -> occurrence de scène
- skudd / shot -> plan
- montering / assembly -> montage
- animatic / animatic -> animatique
- lag / layer -> calque
- nøkkelbilde / keyframe -> image clé
- bevegelsesbane / motion path -> trajectoire
- tidslinje / timeline -> timeline (eller chronologie)
- spor / track -> piste
- avspillingshode / playhead -> tête de lecture
- ressurs / asset -> élément
- ressursbibliotek / asset library -> bibliothèque d’éléments
- bildevariant / image variant -> variante d’image
- munnform / mouth shape -> forme de bouche
- leppesynk / lip sync -> synchro labiale
- blink / blink -> clignement
- rytmeverktøy / rhythm tool -> outil de rythme
- rigg / rig -> rig
- platenivå / plate level -> niveau de plateau
- kontur / klippelinje / contour / cut line -> contour / ligne de découpe
- maske / mask -> masque
- lydversjon / opptak / audio version / take -> version audio / prise
- romtone / room tone -> ambiance sonore (room tone)
- X-sheet / X-sheet -> feuille d’exposition (X-sheet)
- eksport / export -> exportation
- utgivelse / release -> publication
- gul lapp / merknad / sticky note / note -> note / annotation
- prosjekt / produksjon / project / production -> projet / production`
  },
  {
    code: "es",
    name: "spansk (es)",
    plurals: '["one", "many", "other"]',
    glossary: `
- manus / script -> guion
- replikk / line (dialogue) -> línea (de diálogo)
- scene / scene -> escena
- sceneforekomst / scene occurrence -> aparición de escena
- skudd / shot -> plano
- montering / assembly -> montaje
- animatic / animatic -> animática
- lag / layer -> capa
- nøkkelbilde / keyframe -> fotograma clave
- bevegelsesbane / motion path -> trayectoria de movimiento
- tidslinje / timeline -> línea de tiempo
- spor / track -> pista
- avspillingshode / playhead -> cabezal de reproducción
- ressurs / asset -> recurso
- ressursbibliotek / asset library -> biblioteca de recursos
- bildevariant / image variant -> variante de imagen
- munnform / mouth shape -> forma de boca
- leppesynk / lip sync -> sincronización labial
- blink / blink -> parpadeo
- rytmeverktøy / rhythm tool -> herramienta de ritmo
- rigg / rig -> rig
- platenivå / plate level -> nivel de placa
- kontur / klippelinje / contour / cut line -> contorno / línea de corte
- maske / mask -> máscara
- lydversjon / opptak / audio version / take -> versión de audio / toma
- romtone / room tone -> tono de sala
- X-sheet / X-sheet -> carta de rodaje (X-sheet)
- eksport / export -> exportación
- utgivelse / release -> publicación
- gul lapp / merknad / sticky note / note -> nota adhesiva / nota
- prosjekt / produksjon / project / production -> proyecto / producción`
  },
  {
    code: "ru",
    name: "russisk (ru)",
    plurals: '["one", "few", "many", "other"]',
    glossary: `
- manus / script -> сценарий
- replikk / line (dialogue) -> реплика
- scene / scene -> сцена
- sceneforekomst / scene occurrence -> вхождение сцены
- skudd / shot -> план (eller кадр)
- montering / assembly -> монтаж (eller сборка)
- animatic / animatic -> аниматик
- lag / layer -> слой
- nøkkelbilde / keyframe -> ключевой кадр
- bevegelsesbane / motion path -> траектория движения
- tidslinje / timeline -> таймлайн
- spor / track -> дорожка
- avspillingshode / playhead -> курсор воспроизведения
- ressurs / asset -> ресурс
- ressursbibliotek / asset library -> библиотека ресурсов
- bildevariant / image variant -> вариант изображения
- munnform / mouth shape -> форма рта
- leppesynk / lip sync -> липсинк
- blink / blink -> моргание
- rytmeverktøy / rhythm tool -> инструмент ритма
- rigg / rig -> риг
- platenivå / plate level -> уровень пластины
- kontur / klippelinje / contour / cut line -> контур / линия реза
- maske / mask -> маска
- lydversjon / opptak / audio version / take -> аудиоверсия / дубль
- romtone / room tone -> тон помещения
- X-sheet / X-sheet -> экспозиционный лист (X-sheet)
- eksport / export -> экспорт
- utgivelse / release -> релиз (eller публикация)
- gul lapp / merknad / sticky note / note -> заметка / примечание
- prosjekt / produksjon / project / production -> проект / продакшн (eller производство)`
  },
  {
    code: "ja",
    name: "japansk (ja)",
    plurals: '["other"]',
    glossary: `
- manus / script -> 脚本 (eller スクリプト)
- replikk / line (dialogue) -> セリフ
- scene / scene -> シーン
- sceneforekomst / scene occurrence -> シーンの出現
- skudd / shot -> カット (eller ショット)
- montering / assembly -> 編集 (アセンブリ)
- animatic / animatic -> アニマティック
- lag / layer -> レイヤー
- nøkkelbilde / keyframe -> キーフレーム
- bevegelsesbane / motion path -> モーションパス
- tidslinje / timeline -> タイムライン
- spor / track -> トラック
- avspillingshode / playhead -> 再生ヘッド
- ressurs / asset -> アセット
- ressursbibliotek / asset library -> アセットライブラリ
- bildevariant / image variant -> 画像バリアント
- munnform / mouth shape -> 口形
- leppesynk / lip sync -> リップシンク
- blink / blink -> まばたき
- rytmeverktøy / rhythm tool -> リズムツール
- rigg / rig -> リグ
- platenivå / plate level -> プレートレベル
- kontur / klippelinje / contour / cut line -> 輪郭 / カットライン
- maske / mask -> マスク
- lydversjon / opptak / audio version / take -> 音声バージョン / テイク
- romtone / room tone -> ルームトーン
- X-sheet / X-sheet -> タイムシート (Xシート)
- eksport / export -> 書き出し (エクスポート)
- utgivelse / release -> リリース
- gul lapp / merknad / sticky note / note -> メモ / 注記
- prosjekt / produksjon / project / production -> プロジェクト / プロダクション`
  }
];

function buildSystemPrompt(lang) {
  return `Du oversetter brukergrensesnittet i et profesjonelt verktøy for animasjon og film (Animatic Studio / From Pen to Glass), fra manus til animatic og videre til produksjon (stop motion, utklipp på glass, Dragonframe, After Effects).

Oversett feltet "en" til ${lang.name}, og bruk "nb" som støtte for betydningen.

Regler:
1. Du mottar et JSON-objekt med nummererte nøkler ("0", "1", osv.) der hver verdi har {"nb": ..., "en": ...}. Returner et JSON-objekt med NØYAKTIG de samme nummererte nøklene ("0", "1", osv.), der verdien for hver nøkkel KUN er selve oversettelsen på ${lang.name}.
2. Alt i krøllparenteser, som {count}, {value1} og {name}, MÅ kopieres helt uendret (ikke oversett ordet inni krøllparentesen!) og skal stå i oversettelsen.
3. Ikke oversett filnavn, filendelser, kode, tastatursnarveier (Cmd, Ctrl, Shift, Esc), formatnavn (ProRes, MP4, PDF, FBX, EDL, OTIO, QR), produktnavn (Dragonframe, After Effects, Premiere, Resolve, ElevenLabs, Animatic Studio) eller navnet «From Pen to Glass».
4. Flertall: når "en" er et objekt med flertallsformer (f.eks. {"one": "...", "other": "..."}), skal verdien du returnerer for den nøkkelen også være et objekt med CLDR-flertallsformene for ${lang.name}: ${lang.plurals}, og hver form MÅ beholde de samme {plassholderne} som i "en".
5. Bruk korte, naturlige formuleringer slik de står i profesjonelle programmer på målspråket. Knapper og menyvalg skal være korte. Bruk høflig og nøytral tiltaleform.
6. Returner KUN gyldig JSON, uten markdown-blokker eller forklaring.

Fagordliste som skal følges konsekvent:
${lang.glossary}`;
}

function extractPlaceholders(str) {
  if (typeof str !== "string") return [];
  const matches = str.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? [...new Set(matches)].sort() : [];
}

function validateTranslation(enVal, translatedVal) {
  if (typeof enVal === "string") {
    if (typeof translatedVal !== "string" || translatedVal.trim() === "") return false;
    const expected = extractPlaceholders(enVal);
    const actual = extractPlaceholders(translatedVal);
    return expected.every((ph) => actual.includes(ph));
  }
  if (typeof enVal === "object" && enVal !== null) {
    if (typeof translatedVal !== "object" || translatedVal === null || Array.isArray(translatedVal)) {
      return false;
    }
    if (!("other" in translatedVal)) return false;
    const expected = extractPlaceholders(enVal.other || Object.values(enVal)[0]);
    for (const v of Object.values(translatedVal)) {
      if (typeof v !== "string" || v.trim() === "") return false;
      const actual = extractPlaceholders(v);
      if (!expected.every((ph) => actual.includes(ph))) return false;
    }
    return true;
  }
  return false;
}

async function callAI(systemPrompt, userJsonString) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userJsonString }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

function cleanJsonText(raw) {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(t);
}

async function translateBatch(lang, batchEntries, attempt = 1) {
  const payload = {};
  batchEntries.forEach(([, v], idx) => {
    payload[String(idx)] = { nb: v.nb, en: v.en };
  });

  try {
    const rawText = await callAI(buildSystemPrompt(lang), JSON.stringify(payload));
    const parsed = cleanJsonText(rawText);

    const failedEntries = [];
    const validResults = {};

    batchEntries.forEach(([k, v], idx) => {
      const candidate = parsed[String(idx)] ?? parsed[k];
      if (candidate !== undefined && validateTranslation(v.en, candidate)) {
        validResults[k] = candidate;
      } else {
        failedEntries.push([k, v]);
      }
    });

    if (failedEntries.length > 0) {
      if (attempt < 5) {
        console.warn(
          `   [!] ${failedEntries.length} nøkler manglet plassholder/format på ${lang.code}. Prøver i mindre gruppe (forsøk ${attempt + 1}/5)...`
        );
        for (let j = 0; j < failedEntries.length; j += 10) {
          const sub = failedEntries.slice(j, j + 10);
          const retried = await translateBatch(lang, sub, attempt + 1);
          Object.assign(validResults, retried);
        }
      } else {
        throw new Error(
          `Klarte ikke å validere nøklene etter 5 forsøk: ${failedEntries.map((e) => e[0]).join(", ")}`
        );
      }
    }
    return validResults;
  } catch (err) {
    if (attempt < 5) {
      console.warn(`   [!] Feil i batch (${err.message.slice(0, 120)}), prøver igjen (${attempt + 1}/5)...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return translateBatch(lang, batchEntries, attempt + 1);
    }
    throw err;
  }
}

function saveFile(outFilePath, allKeys, sourceData, translatedMap, existingData) {
  const finalJson = {};
  for (const key of allKeys) {
    finalJson[key] = {
      nb: sourceData[key].nb,
      en: sourceData[key].en,
      oversatt: translatedMap[key] ?? existingData[key]?.oversatt ?? (typeof sourceData[key].en === "object" ? {} : "")
    };
  }
  fs.writeFileSync(outFilePath, JSON.stringify(finalJson, null, 1) + "\n", "utf8");
}

async function processFileForLanguage(filePath, lang) {
  const fileName = path.basename(filePath);
  const outFileName = `${lang.code}_${fileName}`;
  const outFilePath = path.join(OUTPUT_DIR, outFileName);

  const sourceData = JSON.parse(fs.readFileSync(filePath, "utf8"));

  let existingData = {};
  if (fs.existsSync(outFilePath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(outFilePath, "utf8"));
    } catch {
      existingData = {};
    }
  }

  const allKeys = Object.keys(sourceData);
  const todoEntries = [];

  for (const key of allKeys) {
    const existingVal = existingData[key]?.oversatt;
    if (!validateTranslation(sourceData[key].en, existingVal)) {
      todoEntries.push([key, sourceData[key]]);
    }
  }

  if (todoEntries.length === 0) {
    console.log(`[✓] ${outFileName} er allerede ferdig oversatt og validert.`);
    return;
  }

  console.log(`[→] Oversetter ${outFileName} (${todoEntries.length} gjenstående tekster)...`);

  const batches = [];
  for (let i = 0; i < todoEntries.length; i += BATCH_SIZE) {
    batches.push(todoEntries.slice(i, i + BATCH_SIZE));
  }

  const translatedMap = {};

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((b) => translateBatch(lang, b)));
    for (const res of results) {
      Object.assign(translatedMap, res);
    }
    saveFile(outFilePath, allKeys, sourceData, translatedMap, existingData);
    const doneCount = Math.min((i + CONCURRENCY) * BATCH_SIZE, todoEntries.length);
    console.log(`    ${outFileName}: ${doneCount} / ${todoEntries.length}`);
  }

  console.log(`[✓] Lagret ${outFileName}`);
}

async function main() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`Fant ikke mappen ${INPUT_DIR}. Kjør skriptet fra samme mappe som LESMEG.md.`);
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(`Fant ${files.length} JSON-filer i 1_til_oversetting/.`);

  for (const lang of LANGUAGES) {
    console.log(`\n=== STARTER SPRÅK: ${lang.name.toUpperCase()} ===`);
    for (const file of files) {
      await processFileForLanguage(path.join(INPUT_DIR, file), lang);
    }
  }

  console.log(`\nPakker alle de oversatte filene i ${ZIP_FILE}...`);
  try {
    execSync(`zip -r -j "${ZIP_FILE}" "${OUTPUT_DIR}"`, { stdio: "inherit" });
    console.log(`\n🎉 FERDIG! Alle 72 filer ligger i 2_oversatt/ og i ${ZIP_FILE}`);
  } catch {
    console.log(`\n🎉 FERDIG! Alle 72 filer ligger klare i mappen 2_oversatt/`);
  }
}

main().catch((err) => {
  console.error("Kritisk feil:", err);
  process.exit(1);
});
EOF
node oversett_alle.mjs