# Importrørledning for manus (PDF og DOCX)

Grunnlag: ADR-0007, DEC-0013, mandat 4.1–4.3, REQ-0044–REQ-0060. Kode: uttrekk i `src/engine/import/` (klient/worker), alt annet rent i `src/core/screenplay/`.

```
original fil ──► [0] lagre original (Storage sources/, SHA-256, ImportedDocument)
            └──► [1] uttrekk  ──► RawLine[]      (engine: pdf.js / DOCX-XML)
                 [2] rensing  ──► RawLine[]      (core: sidehoder, sidetall, MORE/CONTINUED, revisjonsmerker)
                 [3] kalibrering ► IndentBands   (core: innrykksbånd fra dokumentet)
                 [4] klassifisering ► BlockCandidate[] med confidence + reasons
                 [5] scenedeteksjon ► SceneCandidate[] (nummer venstre/høyre, fortsettelse før første overskrift)
                 [6] validering + importrapport (usikkerheter, hull i nummerrekken)
                 [7] importkommando ► ScreenplayVersion, Scene, SceneVariant, ScriptBlock, DialogueLine, SceneOccurrence
```

## Mellomformat
```ts
interface RawLine {
  page: number;            // 1-basert, som i originalen
  lineIndex: number;       // rekkefølge på siden
  y: number;               // tommer fra toppen
  segments: { x: number; text: string; bold?: boolean; underline?: boolean; italic?: boolean }[]; // x i tommer
  style?: string;          // DOCX-stilnavn, f.eks. «SCENE OVERSKRIFT»
  pageBreakBefore?: boolean; // DOCX: «Ny side stil» eller eksplisitt sideskift
}
interface BlockCandidate {
  kind: ScriptBlockKind | 'continuation' | 'title_page' | 'unknown';
  text: string; sourceRef: { page: number; lineFrom: number; lineTo: number };
  sceneNumberLeft?: string; sceneNumberRight?: string;
  confidence: number;      // 0–1
  reasons: string[];       // f.eks. ['indent≈character', 'uppercase', 'followed-by-dialogue']
}
```

## Trinn for trinn
**[0] Original.** Lagres uendret før tolkning. Ny import av samme fil (lik SHA-256) gjenkjennes og tilbys som ny versjon, aldri som overskriving (REQ-0053, REQ-0242).

**[1] Uttrekk – PDF.** Tekstlaget fra pdf.js (`getTextContent`): hver tekstbit har transformasjonsmatrise → x/y i punkter (÷72 = tommer). Grupper biter til linjer på y med liten toleranse; sorter på x. Behold mellomrom mellom biter ut fra avstand (monospace: 0,1 in per tegn). Skannet PDF uten tekstlag: stopp med tydelig melding (OCR er ikke i omfang).
**[1] Uttrekk – DOCX.** Les `word/document.xml` og `styles.xml` (ZIP). Per avsnitt: stilnavn, innrykk (`w:ind`, twips ÷ 1440 = tommer), tabulatorer og **ledende mellomrom** (referansen på engelsk bruker mellomrom for layout: antall mellomrom × 0,1 in i Courier = visuelt innrykk). Stiler som «SCENE OVERSKRIFT» er sterke signaler; «Ny side stil» betyr sideskift.

**[2] Rensing.** Fjern og registrer (ikke kast stille): sidetall øverst til høyre, `(MORE)`, `(CONTINUED)`/`CONTINUED:`, revisjonsstjerner i marg, gjentatt karakternavn med `(CONT'D)` rett etter sideskift (slå sammen dialogen over siden). Tittelside: side 1 uten sceneoverskrift med sentrert tekst → `title_page`, og kontaktinfo går aldri videre til fixtures.

**[3] Kalibrering.** Lag histogram over venstre x for alle linjer. De tydelige toppene tilsvarer handling/overskrift, dialog, parentes, karakter og overgang. Tilordne toppene til elementtyper med startverdiene i `SCREENPLAY_FORMAT.md` og velg nærmeste. Lagre båndene i importrapporten slik at avvik kan forklares.

**[4] Klassifisering.** Kombiner signaler og vekt dem: innrykksbånd, store bokstaver, mønster (INT./EXT., «TO:», parentes), nabolag (karakter etterfølges av dialog/parentes; dialog står under karakter), DOCX-stil. Konflikt mellom signaler → lavere `confidence`. Terskel for «usikker» settes som konstant og testes (REQ-0058).

**[5] Scenedeteksjon.** Ny scene bare ved `heading`. Scenenummer leses fra marg-tekst på samme linje (venstre x < venstre tekstmarg, høyre x > høyre tekstmarg) med mønster tall + valgfrie bokstaver. Regler:
- Venstre = høyre → `productionNumbering` settes.
- Ulike → behold venstre, flagg usikkerhet.
- Mangler → unummerert scene, ikke feil (referansen har en på s. 2).
- Hopp i nummerrekken (hull) → rapporteres, skaper aldri scener (REQ-0048).
- Tekst før første overskrift → `continuation`-blokk som kan kobles til en tidligere scene (REQ-0047, REQ-0060).

**[6] Validering og rapport.** Antall sider, scener (nummererte/unummererte), hull, usikre blokker med side/linje, ukjente tidsangivelser, mistenkt dobbel dialog. Brukeren kan korrigere før og etter lagring (REQ-0059).

**[7] Importkommando.** Én transaksjon (RPC) som oppretter alle objekter med nye permanente ID-er og `sourceRef`, setter `ScreenplayVersion.previousVersionId` ved reimport, og skriver `change_log`. Strukturell kopi = ny versjon; tidligere versjoner røres ikke.

## Engelsk manus (23.2, REQ-0332–REQ-0335)
Samme rørledning, `language: 'en'`. Kobling til norske scener foreslås med flere signaler (scenenummer, overskriftens lokasjon, karakterer, rekkefølge, handlingslengde) og en samlet sikkerhetsgrad; aldri bare nummer eller ordrett tekst (REQ-0334). Usikre koblinger godkjennes manuelt. Engelsk import endrer aldri norske blokker (INV-06).

## Feilkilder å teste for
| Feilkilde | Symptom | Tiltak |
|---|---|---|
| Tekstbiter splittet midt i ord | Manglende/doble mellomrom | Slå sammen biter med avstand < 0,05 in |
| Fontkoding (ToUnicode) | æ/ø/å blir feil tegn | Test med norsk fixture; flagg linjer med erstatningstegn (U+FFFD) |
| Marg-nummer lest som tekst | «42» først i handlingen | Margfilter før klassifisering |
| Revisjonsstjerne | «*» som høyre scenenummer | Mønsteret krever siffer |
| MORE/CONT'D over sideskift | Dialog delt i to replikker | Slå sammen i trinn [2] |
| Lang overskrift brutt over to linjer | Andre linje tolket som handling | Fortsettelse i store bokstaver på samme innrykk hører til overskriften |
| Karakternavn med extension | «MAJA (O.S.)» ikke gjenkjent som karakter | Skill navn og extension med mønster |
| Dobbel dialog | To karakterer på samme linje | Flagg; ikke gjett rekkefølge |
| DOCX med mellomrom og tabulator blandet | Feil innrykk | Ekspander tab med dokumentets tabulatorstopp |
| Delmanus som slutter midt i scene | Siste scene ufullstendig | Lovlig; ingen avslutningskrav |
| Hull i nummerrekken | Fristelse til å «fylle inn» | Rapporter bare |
