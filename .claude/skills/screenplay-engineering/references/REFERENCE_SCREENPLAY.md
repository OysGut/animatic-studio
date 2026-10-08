# Referansemanus – kjente egenskaper og gyldne testverdier

Grunnlag: DEC-0002 (referanse), DEC-0004 (rettigheter og lagring), ADR-0007.

## Lagring og rettigheter
- Filene ligger i `../Manus/` (på Mars' Mac: `Claude/Projects/Animatic Studio/Manus/`), **utenfor repoet**. Aldri commit dem, aldri kopier hele filer inn i `tests/`.
- Trollfilm/Anita Killi eier manuset. Korte, anonymiserte utdrag kan ligge i `tests/fixtures/screenplay/` (privat repo). Ingen kontaktinformasjon fra tittelsiden.
- Lokale tester leser stien fra miljøvariabel (f.eks. `MANUS_DIR`, standard `../Manus`) og hoppes over med tydelig melding når filene mangler – CI skal ikke feile av den grunn.

## Norsk referanse – «Jula på Dovre» (PDF)
| Egenskap | Verdi | Kilde / status |
|---|---|---|
| Format | PDF eksportert fra Final Draft 11 | DEC-0002 – bekreftet |
| Utkast | Draft 9.3 på tittelsiden (filnavn sier 9.2) | DEC-0002 – avvik registreres i KNOWN_ISSUES |
| Sider | 106 | DEC-0002 – bekreftet |
| Papir | US Letter (612 × 792 pt) | DEC-0002 – bekreftet |
| Nummererte scener | 96 | DEC-0002 – bekreftet |
| Høyeste scenenummer | 109 (hull i rekken) | DEC-0002 – bekreftet |
| Unummererte scener | minst 1 | DEC-0002 – bekreftet |
| Kjent unummerert scene | s. 2: «INT. LILLEHAMMER, ROLFS HUS, SOVEROM - DAG» | Brief 2026-10-08 – kontrolleres ved første import |
| Hvilke numre som mangler | ikke registrert | Fylles inn etter første import + manuell kontroll |
| Bokstavsuffikser (42A) | ikke registrert | Fylles inn |
| Innrykk per element (x i tommer) | ikke målt | Fylles inn; erstatter konvensjonene i SCREENPLAY_FORMAT.md |
| Linjer per side, topp-/bunnmarg | ikke målt | Fylles inn |
| CONT'D-/MORE-/CONTINUED-bruk | ikke registrert | Fylles inn (automatisk eller skrevet?) |
| Tidsangivelser i overskrifter | ikke registrert | Fylles inn (liste over faktiske verdier) |

## Engelsk referanse – «Christmas Survivors» (DOCX)
| Egenskap | Verdi | Status |
|---|---|---|
| Layout | Laget med mellomrom (fast bredde), ikke ekte innrykk | DEC-0002 – bekreftet |
| Stiler | «SCENE OVERSKRIFT», «Ny side stil» | ADR-0007 – bekreftet |
| Scenenumre | Samme som norsk | DEC-0002 – kontrolleres ved kobling |
| Sider, antall scener | ikke registrert | Fylles inn |

## Gyldne tester
| Test | Forventet | Type |
|---|---|---|
| `reference-nb.import.test.ts` | 106 sider; 96 nummererte; maks nummer 109; ≥ 1 unummerert; s. 2-scenen finnes som unummerert med lokasjon «LILLEHAMMER, ROLFS HUS, SOVEROM» og tid «DAG» | Lokal (hoppes over uten filer) |
| samme | Antall hull = 109 − 96 hvis rekken starter på 1 uten suffikser – **bekreft før testen låses** | Lokal |
| samme | Ingen scene har nummer som ikke står i PDF-en | Lokal |
| `reference-nb.paginate.test.ts` | Re-paginering gir 106 sider ± toleranse (dokumenteres) | Lokal |
| `reference-en.import.test.ts` | Samme scenenumre som norsk; stilene gir sceneoverskrifter og sideskift | Lokal |
| `fixtures/*.test.ts` | Utdrag: delmanus som starter midt i scene, CONT'D, O.S., V.O., hull i nummer, unummerert scene, dialog over sideskift | CI |

## Rutine når en verdi bekreftes
1. Kjør import lokalt, sammenlign med PDF-en side for side for de aktuelle stedene.
2. Før verdien inn i tabellen med «bekreftet <dato>, metode».
3. Lås testen (fjern «bekreft før …»), oppdater `verification` på REQ-0045/REQ-0048/REQ-0055 m.fl. i `requirements.yaml`.
