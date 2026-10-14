# Norsk og engelsk i tjenesten – slik skrives tekst (DEC-0081, REQ-0629/0630)

All tekst brukeren ser – knapper, menyer, overskrifter, hjelpetekster, meldinger, feilmeldinger,
verktøytips (`title`), `aria-label`, `placeholder`, navn på angresteg – finnes på norsk **og** engelsk.
Norsk er standard. `node scripts/i18n/check.mjs` finner norsk tekst som mangler engelsk (kjøres i testene).

## Mønstre
```tsx
import { L, localized, locale, collation, tm } from "@/core";      // i src/app, src/adapters, src/routes
import { L, localized } from "../i18n";                              // i src/core (relativ sti)

<h2>{L("Prosjekter", "Projects")}</h2>
<Button title={L("Slett laget", "Delete the layer")} aria-label={L("Slett", "Delete")} />
setError(L(`Kunne ikke lagre «${name}».`, `Could not save “${name}”.`));   // samme ${…} i samme rekkefølge
cmds.run(command, L("Flytt lag", "Move layer"));                           // angresteget vises i historikken

// Faste oppslag på modulnivå (utenfor funksjoner): localized – aldri L på modulnivå
export const ROLE_LABEL = localized({ owner: ["Eier", "Owner"], editor: ["Redaktør", "Editor"] });

new Date(x).toLocaleDateString(locale());     // ikke "nb-NO"
a.localeCompare(b, collation());              // ikke "nb"
setError(tm(r.message));                      // meldinger som kommer fra serveren
```
En tekst på modulnivå som ikke er et oppslag, gjøres til en funksjon: `const hint = () => L("…", "…")`.

## Etter endringer
- `node scripts/i18n/check.mjs` (eller `--summary`) skal gi «0 tekster uten engelsk». Den kjører også i `tests/unit/i18n.test.ts`.
- Har du lagt til `L(…)` i `src/core` eller `src/adapters`: kjør `node scripts/i18n/build-catalog.mjs`, så servermeldingene kan oversettes med `tm()`.
- Språknavn midt i en setning: `languageWord(l)` («norsk» / «Norwegian»). Lagrede navn som koden kjenner igjen (f.eks. «Hovedfilm», «Dialog (AI)») endres ikke – merk linjen `// i18n-ignore` med en kort grunn.
- Kontrollen kjenner norsk på æ/ø/å og en ordliste. Ord uten disse kan slippe gjennom: les over teksten selv, og legg nye typiske ord i ordlisten.

## Oversettes ikke
Brukerens eget innhold (manus, notater, navn), manusets formatord (INT./EXT., MORE, CONT'D, V.O.),
beskrivelser til AI (engelsk fra før), filnavn og lagringsnøkler, CSS-klasser og ID-er, og data som
gjenkjenner norske ord i manus (regulære uttrykk). Slik data merkes med `// i18n-ignore` på linjen
(eller linjen før), eller `// i18n-ignore-file` øverst i en ren datafil.

## Engelsk
Britisk stavemåte (colour, centre), vanlig filmbransjespråk, korte knappetekster. Norske «» blir “ ”.
Ordliste: prosjekt = project · produksjon = production · hovedfilm = main film · spinoff = spin-off ·
manus = script · scene = scene · sceneforekomst = scene occurrence · scenevariant = scene variant ·
ressursbibliotek = asset library · ressurs = asset · karakter = character · objekt/rekvisitt = object/prop ·
lokasjon = location · miljø = environment · variant = variant · versjon = version · godkjenn = approve ·
sceneeditor = scene editor · lag = layer · nøkkelbilde = keyframe · kamerautsnitt = camera shot ·
montering = assembly · utgivelse = release · tidslinje = timeline · lydspor = audio track ·
lydklipp = audio clip · opptak = recording · frilegg = cut out · speilvend = flip · plakat = poster ·
kontinuitet = continuity · fortellingstid = story time · notat = note · eier = owner · redaktør = editor ·
kommentator = commenter · leser = viewer · angre = undo · gjør om = redo · slettede objekter = deleted items ·
forbildebilder = reference images · filmens visuelle stil = the film's visual style · faktaark = fact sheet ·
beskrivelse (prompt) = description (prompt) · kreditter = credits · budsjett = budget ·
bildefrekvens = frame rate · animer på toere = animate on twos · sikkerhetskopi = backup ·
gjenopprett = restore · avvik = discrepancy · arbeidsliste = worklist · opphav = origin ·
språkversjon = language version · tittelkort = title card · tilpass = fit.
