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
    code: "pt-BR",
    name: "brasiliansk portugisisk (pt-BR)",
    plurals: '["one", "many", "other"]',
    glossary: `
- manus / script -> roteiro
- replikk / line (dialogue) -> fala (eller linha de diálogo)
- scene / scene -> cena
- sceneforekomst / scene occurrence -> ocorrência de cena
- skudd / shot -> plano (eller tomada)
- montering / assembly -> montagem
- animatic / animatic -> animatic
- lag / layer -> camada
- nøkkelbilde / keyframe -> quadro-chave
- bevegelsesbane / motion path -> trajetória de movimento
- tidslinje / timeline -> linha do tempo (eller timeline)
- spor / track -> faixa (eller trilha)
- avspillingshode / playhead -> agulha de reprodução (playhead)
- ressurs / asset -> ativo (eller recurso)
- ressursbibliotek / asset library -> biblioteca de ativos
- bildevariant / image variant -> variante de imagem
- munnform / mouth shape -> formato de boca
- leppesynk / lip sync -> sincronia labial (lip sync)
- blink / blink -> piscada
- rytmeverktøy / rhythm tool -> ferramenta de ritmo
- rigg / rig -> rig
- platenivå / plate level -> nível da placa
- kontur / klippelinje / contour / cut line -> contorno / linha de corte
- maske / mask -> máscara
- lydversjon / opptak / audio version / take -> versão de áudio / tomada (take)
- romtone / room tone -> som ambiente (room tone)
- X-sheet / X-sheet -> folha de exposição (X-sheet)
- eksport / export -> exportação
- utgivelse / release -> lançamento
- gul lapp / merknad / sticky note / note -> nota adesiva / nota
- prosjekt / produksjon / project / production -> projeto / produção`
  },
  {
    code: "de",
    name: "tysk (de)",
    plurals: '["one", "other"]',
    glossary: `
- manus / script -> Drehbuch
- replikk / line (dialogue) -> Dialogzeile (eller Replik)
- scene / scene -> Szene
- sceneforekomst / scene occurrence -> Szenenvorkommen
- skudd / shot -> Einstellung (eller Shot)
- montering / assembly -> Schnitt (eller Montage)
- animatic / animatic -> Animatic
- lag / layer -> Ebene
- nøkkelbilde / keyframe -> Keyframe (eller Schlüsselbild)
- bevegelsesbane / motion path -> Bewegungspfad
- tidslinje / timeline -> Zeitleiste (eller Timeline)
- spor / track -> Spur
- avspillingshode / playhead -> Abspielkopf (Playhead)
- ressurs / asset -> Asset (eller Ressource)
- ressursbibliotek / asset library -> Asset-Bibliothek
- bildevariant / image variant -> Bildvariante
- munnform / mouth shape -> Mundform
- leppesynk / lip sync -> Lippensynchronisation (Lip-Sync)
- blink / blink -> Blinzeln
- rytmeverktøy / rhythm tool -> Rhythmus-Werkzeug
- rigg / rig -> Rig
- platenivå / plate level -> Plattenebene
- kontur / klippelinje / contour / cut line -> Kontur / Schnittlinie
- maske / mask -> Maske
- lydversjon / opptak / audio version / take -> Audioversion / Take
- romtone / room tone -> Raumton (Room Tone)
- X-sheet / X-sheet -> X-Sheet (Exposure Sheet)
- eksport / export -> Export
- utgivelse / release -> Veröffentlichung
- gul lapp / merknad / sticky note / note -> Haftnotiz / Notiz
- prosjekt / produksjon / project / production -> Projekt / Produktion`
  },
  {
    code: "it",
    name: "italiensk (it)",
    plurals: '["one", "many", "other"]',
    glossary: `
- manus / script -> sceneggiatura
- replikk / line (dialogue) -> battuta
- scene / scene -> scena
- sceneforekomst / scene occurrence -> occorrenza di scena
- skudd / shot -> inquadratura
- montering / assembly -> montaggio
- animatic / animatic -> animatic
- lag / layer -> livello
- nøkkelbilde / keyframe -> fotogramma chiave (keyframe)
- bevegelsesbane / motion path -> tracciato di movimento
- tidslinje / timeline -> timeline
- spor / track -> traccia
- avspillingshode / playhead -> testina di riproduzione (playhead)
- ressurs / asset -> risorsa
- ressursbibliotek / asset library -> libreria di risorse
- bildevariant / image variant -> variante di immagine
- munnform / mouth shape -> forma della bocca
- leppesynk / lip sync -> sincronizzazione labiale (lip sync)
- blink / blink -> battito di ciglia
- rytmeverktøy / rhythm tool -> strumento ritmo
- rigg / rig -> rig
- platenivå / plate level -> livello lastra
- kontur / klippelinje / contour / cut line -> contorno / linea di taglio
- maske / mask -> maschera
- lydversjon / opptak / audio version / take -> versione audio / ripresa (take)
- romtone / room tone -> rumore ambientale (room tone)
- X-sheet / X-sheet -> foglio macchina (X-sheet)
- eksport / export -> esportazione
- utgivelse / release -> pubblicazione
- gul lapp / merknad / sticky note / note -> nota adesiva / nota
- prosjekt / produksjon / project / production -> progetto / produzione`
  },
  {
    code: "ko",
    name: "koreansk (ko)",
    plurals: '["other"]',
    glossary: `
- manus / script -> 대본 (eller 스크립트)
- replikk / line (dialogue) -> 대사
- scene / scene -> 씬 (eller 장면)
- sceneforekomst / scene occurrence -> 씬 출현
- skudd / shot -> 샷 (eller 컷)
- montering / assembly -> 편집 (어셈블리)
- animatic / animatic -> 애니매틱
- lag / layer -> 레이어
- nøkkelbilde / keyframe -> 키프레임
- bevegelsesbane / motion path -> 모션 패스
- tidslinje / timeline -> 타임라인
- spor / track -> 트랙
- avspillingshode / playhead -> 재생 헤드 (플레이헤드)
- ressurs / asset -> 에셋
- ressursbibliotek / asset library -> 에셋 라이브러리
- bildevariant / image variant -> 이미지 변형
- munnform / mouth shape -> 입 모양
- leppesynk / lip sync -> 립싱크
- blink / blink -> 눈 깜빡임
- rytmeverktøy / rhythm tool -> 리듬 도구
- rigg / rig -> 리그
- platenivå / plate level -> 플레이트 레벨
- kontur / klippelinje / contour / cut line -> 윤곽선 / 컷 라인
- maske / mask -> 마스크
- lydversjon / opptak / audio version / take -> 오디오 버전 / 테이크
- romtone / room tone -> 룸톤
- X-sheet / X-sheet -> 타임시트 (X-시트)
- eksport / export -> 내보내기 (익스포트)
- utgivelse / release -> 릴리스
- gul lapp / merknad / sticky note / note -> 메모 / 노트
- prosjekt / produksjon / project / production -> 프로젝트 / 프로덕션`
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

  console.log(`\nOppdaterer ${ZIP_FILE} med alle de 144 oversatte filene...`);
  try {
    execSync(`zip -r -j "${ZIP_FILE}" "${OUTPUT_DIR}"`, { stdio: "inherit" });
    console.log(`\n🎉 FERDIG! Alle språk ligger nå i 2_oversatt/ og i ${ZIP_FILE}`);
  } catch {
    console.log(`\n🎉 FERDIG! Alle språk ligger nå klare i mappen 2_oversatt/`);
  }
}

main().catch((err) => {
  console.error("Kritisk feil:", err);
  process.exit(1);
});