# Anti-mønstre – det Animatic Studio ikke skal se ut som

Mandat 1.3 og 30.1: et troverdig profesjonelt filmverktøy, «ikke en generell chatbot eller en samling tilfeldige AI-funksjoner», og ikke «et leketøy eller en tilfeldig AI-demo» (REQ-0013, REQ-0426). Listen under er de vanligste måtene genererte grensesnitt bryter dette på.

## Generisk AI-dashboard
| Anti-mønster | Hvorfor det er feil her | Gjør i stedet |
|---|---|---|
| Rutenett av like kort med ikon, tittel og tall som startside | Ser ut som en SaaS-mal; skjuler arbeidet | Prosjektoversikt som tett tabell/liste med status, varighet og avvik (REQ-0405) |
| Lilla/blå gradienter, glød, «glassmorphism», neon | Dekor uten informasjon; kolliderer med filmmaterialet | Nøytrale flater i tre lyshetstrinn, én dempet aksent |
| «Sparkles»/tryllestav-ikoner overalt for AI | Gjør AI til hovedsaken; mandatet sier AI er valgfritt (INV-11) | Nøytral generer-glyf bare der det faktisk genereres; «Generer scene» som tekst |
| Chat-boble som hovedgrensesnitt | Mandatet: ikke en chatbot | Arbeidsflater med paneler, tidslinje og manus |
| Store heltebilder, illustrasjoner, maskoter, emoji i UI | Leketøyuttrykk | Ekte materiale (manus, stillbilder, film) er bildene |
| Store avrundede hjørner (12–24 px), pilleknapper overalt | Forbrukerapp-preg, kaster bort plass | Radier 2–8 px etter DESIGN_SYSTEM §5 |
| Mye luft og store fonter i arbeidsflatene | Profesjonelle brukere trenger tetthet | Kompakt tetthet (13 px standard, 24 px rader) |
| Skygger og hevede kort i hvert panel | Visuell støy | Paneler møtes med 1 px linje; skygger bare på flytende lag |

## Inkonsekvens
- Ulike knappestiler, radier eller ikonsett fra side til side.
- Lokale fargeverdier i komponenter (`#3b82f6`, `bg-slate-700`) i stedet for tokens.
- Hver side med «sin egen stil» (det Anthropics `frontend-design` oppfordrer til – ikke for oss).
- Blanding av engelske og norske etiketter i samme flate.

## Feil statuskommunikasjon
- Farge alene for status (rød prikk uten tekst).
- Spinner uten forklaring; fremdriftsprosent som ikke kan beregnes pålitelig (REQ-0295).
- Røde feilbannere for ting som ikke er feil (f.eks. «usikker tolkning» er gult/usikker, ikke rødt).
- Toasts som eneste sted en viktig tilstand vises (forsvinner).

## Brudd på domeneregler
- Tidskoder, ID-er eller varighet i ordinær manusvisning (REQ-0102, REQ-0117).
- Manus vist som kort, notater eller tabell (REQ-0051).
- Scenenummer brukt som synlig nøkkel i URL-er eller som eneste identifikasjon i lister med duplikater (INV-02).
- Tidslinje som ser ut til å ha egen rekkefølge (f.eks. egen «lagre rekkefølge»-knapp) – INV-01.
- Kamerarammer som er tykke, fylte eller i andre farger enn blå/rød (REQ-0185, REQ-0186).
- «Slett»-knapper for takes, manusversjoner eller ressursversjoner (INV-14).
- Kostnadsknapper som starter betalt jobb uten estimat og godkjenning (INV-12).

## Bevegelse
- Sprett, overskyting, parallakse, pulserende knapper.
- Animerte tall-tellere, konfetti eller «belønnings»-animasjoner.
- Animasjon som ignorerer `prefers-reduced-motion`.
