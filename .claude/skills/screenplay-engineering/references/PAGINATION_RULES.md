# Paginering og sideskiftregler

Grunnlag: mandat 4.2 (REQ-0050–REQ-0054), 5.3 (REQ-0090), ADR-0007. Kode: `src/core/screenplay/paginate.ts` (ren funksjon, kan kjøres i worker).

Reglene under er vanlig bransjepraksis (Final Draft-lignende). **Toleranser og eksakte linjetall er ikke målt mot referansemanuset ennå** – kalibrer fra referanse-PDF-en og dokumenter i `REFERENCE_SCREENPLAY.md` og `KNOWN_ISSUES.md`.

## 1. Sidemodell
```ts
interface PageSpec {
  paper: 'us-letter' | 'a4';
  widthIn: number; heightIn: number;
  marginTopIn: number; marginBottomIn: number;
  linesPerInch: 6;            // Courier 12
  charsPerInch: 10;           // Courier 12
  elementColumns: Record<ScriptBlockKind, { leftIn: number; rightIn: number }>;
  spacingBefore: Record<ScriptBlockKind, number>; // blanke linjer før elementet
  sceneContinueds: boolean;   // (CONTINUED)/CONTINUED: av/på
}
```
- Linjer per side = `floor((heightIn − marginTopIn − marginBottomIn) × 6)`. US Letter med 1 in topp/bunn gir 54; kalibreres.
- Tegn per linje per element = `floor((rightIn − leftIn) × 10)`.
- A4: samme innrykk fra venstre, mer høyde (flere linjer), litt mindre bredde. Bruk egen `PageSpec`, ikke skalering.
- Ombrytning: på ordgrense; ord lengre enn linjen brytes hardt. Bevar eksplisitte linjeskift i teksten.

## 2. Sideskiftregler (prioritert rekkefølge)
1. **Ingen enke-overskrift:** sceneoverskrift kan ikke stå nederst uten minst to linjer av det som følger (typisk handling) på samme side. Ellers flyttes overskriften til neste side.
2. **Karakternavn står aldri alene nederst:** karakter + (parentes) + minst én dialoglinje må stå sammen.
3. **Parentes står aldri sist på en side** og brytes ikke.
4. **Dialog over sideskift:** brytes bare ved setningsslutt og med minst én (helst to) linjer på hver side. Nederst: `(MORE)` på karakterinnrykket. Øverst på neste side: karakternavnet gjentas med `(CONT'D)` (eller eksisterende extension + `(CONT'D)`).
5. **Handling over sideskift:** brytes ved setningsslutt med minst to linjer på hver side; ellers flyttes avsnittet.
6. **Overgang** holdes sammen med blokken før (flyttes ikke alene til ny side).
7. **Scenefortsettelse** (valgfritt, `sceneContinueds`): `(CONTINUED)` nederst og `CONTINUED:` øverst når en scene går over sideskift. Av som standard til referansen viser noe annet.
8. **Eksplisitt sideskift** fra originalen (DOCX «Ny side stil») respekteres som `page_break_hint`.

MORE/CONT'D/CONTINUED er **genererte** linjer: de finnes i sideresultatet, aldri i `ScriptBlock`-tekst.

## 3. Resultat
```ts
interface PaginatedPage { number: number; lines: PageLine[] }
interface PageLine { blockId: string | null; kind: ScriptBlockKind | 'more' | 'contd' | 'continued' | 'blank';
                     text: string; leftIn: number; sceneNumber?: string }
```
`blockId` gjør toveis navigasjon mulig (klikk i side → blokk-ID; REQ-0097/REQ-0098).

## 4. Inkrementell paginering (ytelse, ARCHITECTURE §5)
- Lagre sidestart per side (første blokk + linjeoffset).
- Ved endring i blokk B: start på siden som inneholder B, paginer framover, stopp når en ny sidestart er identisk med lagret sidestart (konvergens). Resten gjenbrukes.
- Mål: < 50 ms for én redigering i 120-siders manus (sett faktisk mål i ytelsestest).

## 5. Tester
- Gyldne: referansemanus re-paginert fra strukturert kopi gir 106 sider ± dokumentert toleranse; første linje på utvalgte sider samsvarer.
- Egenskapsbaserte: for tilfeldige blokklister er sammenslått tekst (uten genererte linjer) lik inndata; ingen side har flere linjer enn tillatt; regel 1–6 holder på hver side.
- Regresjon per regel med små håndlagde fixtures (dialog akkurat over sideskift, overskrift på siste linje, lang parentes).
