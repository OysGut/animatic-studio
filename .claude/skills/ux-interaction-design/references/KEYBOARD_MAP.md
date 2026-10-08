# Tastatursnarveier – forslag

**Status: Teknisk anbefaling – foreløpig, valideres med Trollfilm.** Bygger på konvensjoner fra profesjonelle klippeprogrammer (J/K/L, I/O, mellomrom) uten å kopiere et bestemt programs komplette oppsett.

## Regler
- `Mod` = **Cmd** på macOS, **Ctrl** på Windows/Linux. Alt = Option på macOS.
- Ett register (forslag `src/app/shortcuts/registry.ts`) er eneste kilde: id, standardtast per plattform, kontekst, kommando, norsk etikett. Menyer og verktøytips leser etiketten derfra.
- **Kontekst:** snarveier gjelder i fokusert arbeidsflate (`viewer`, `timeline`, `script`, `canvas`, `global`). Når fokus er i et tekstfelt eller i manusredigering, er enkelttast-snarveier (J, K, L, I, O, pil, mellomrom) **av** – bare `Mod`-kombinasjoner og `Esc` gjelder.
- Ikke overstyr snarveier nettleseren ikke lar oss fange (f.eks. `Mod+W`, `Mod+T`, `Mod+N`, `Mod+Q`). Test i Chrome, Safari og Edge.
- Senere: brukeren kan endre snarveier (ikke MVP).

## Globale
| Tast | Handling | Kontekst | Status |
|---|---|---|---|
| `Mod+Z` | Angre (egen siste endring) | global | Planlagt |
| `Mod+Shift+Z` (og `Ctrl+Y` på Windows) | Gjør om | global | Planlagt |
| `Mod+K` | Kommandopalett (søk etter handling, scene, ressurs) | global | Planlagt |
| `Mod+F` | Søk i aktiv arbeidsflate (manus: søk i tekst) | global | Planlagt |
| `Mod+1 … Mod+5` | Bytt arbeidsflate (Prosjekt, Manus, Scene, Montering, Produksjon) | global | Planlagt |
| `Mod+S` | Ingen lagring trengs (alt lagres fortløpende) – vis «Alt er lagret» | global | Planlagt |
| `Esc` | Avbryt dra/dialog, fjern markering | global | Planlagt |
| `?` | Vis snarveioversikt | global (ikke i tekst) | Planlagt |
| `Delete` / `Backspace` | **Deaktiver** valgt scene / fjern klipp fra montering (aldri sletting av materiale – INV-14) | timeline, script-navigator | Planlagt |

## Avspilling (viewer, timeline, script når ikke i redigering)
| Tast | Handling | Status |
|---|---|---|
| `Mellomrom` | Spill / pause | Planlagt |
| `L` | Spill fremover; gjentatt = raskere (2×, 4×, 8×) | Planlagt |
| `J` | Spill bakover; gjentatt = raskere | Planlagt |
| `K` | Stopp; `K`+`L` / `K`+`J` = sakte frem/bak | Planlagt |
| `←` / `→` | Ett bilde bak/frem | Planlagt |
| `Shift+←` / `Shift+→` | Ett sekund bak/frem | Planlagt |
| `↑` / `↓` | Forrige/neste klippunkt (sceneskifte) | Planlagt |
| `Home` / `End` | Start/slutt av produksjon | Planlagt |
| `I` / `O` | Sett inn-/utpunkt | Planlagt |
| `Alt+I` / `Alt+O` / `Alt+X` | Fjern inn / ut / begge | Planlagt |
| `Mod+L` | Slå automatisk rulling av manus av/på (REQ-0101) | Planlagt |

## Tidslinje
| Tast | Handling | Status |
|---|---|---|
| `N` | Snapping av/på | Planlagt |
| `=` / `-` | Zoom inn/ut rundt avspillingshodet | Planlagt |
| `Shift+Z` | Tilpass hele produksjonen i vinduet | Planlagt |
| `Mod+B` | Splitt klipp ved avspillingshodet (medieklipp, ikke narrativ scene – REQ-0229) | Planlagt |
| `Alt+←` / `Alt+→` | Flytt valgt scene én plass (= `MoveOccurrence`) | Planlagt |
| `,` / `.` | Trim valgt kant ett bilde | Planlagt |
| `Shift+,` / `Shift+.` | Trim valgt kant ti bilder | Planlagt |
| `Mod+Enter` | Bruk denne (sett valgt take som aktiv – REQ-0233) | Planlagt |
| `Shift+D` | Aktiver/deaktiver valgt scene | Planlagt |

## Manus
| Tast | Handling | Status |
|---|---|---|
| `Tab` / `Shift+Tab` (i redigering) | Neste/forrige elementtype (handling → karakter → dialog …) som i manusprogrammer | Planlagt |
| `Mod+Enter` (på replikk) | Flytt avspillingshodet til replikken (REQ-0097) | Planlagt |
| `Mod+Alt+↑` / `Mod+Alt+↓` | Forrige/neste scene | Planlagt |
| `Mod+Shift+M` | Vis/skjul metadatapanel (tidskoder, varighet – REQ-0103) | Planlagt |

## Sceneeditor (lerret)
| Tast | Handling | Status |
|---|---|---|
| `V` | Velg/flytt | Planlagt |
| `C` | Kameraverktøy (start/sluttramme, bane) | Planlagt |
| `H` (hold) / `Mellomrom` (hold, når ikke avspilling) | Panorer lerretet | Planlagt |
| `Mod+0` / `Mod+1` | Tilpass / 100 % | Planlagt |
| Piltaster / `Shift`+pil | Flytt valgt lag 1 / 10 px | Planlagt |
| `Mod+G` / `Mod+Shift+G` | Grupper / avgrupper lag | Planlagt |

## Kjente kollisjoner å teste
- `Mellomrom` = spill/pause vs. panorering i lerretet (løses med hold-varighet eller kontekst).
- `Mod+L` er adressefeltet i noen nettlesere – kan ikke alltid fanges; alternativ `Alt+L` hvis test viser problem.
- `Mod+B` = fet skrift i tekstfelt (bare aktiv i tidslinjekontekst).
