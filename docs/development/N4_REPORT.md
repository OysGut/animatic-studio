# N4 – verifiseringsrunde for uverifiserte krav (22.10.2026)

## Tall
- Før: 113 krav med status «Implementert – ikke verifisert» (TODO.md sa 112; ett krav var kommet til etter forrige avstemming). Fordeling: P0 6, P1 95, P2 1, P3 11.
- Etter: 65. 48 krav er flyttet til «Verifisert» (2 P0, 46 P1). Totalt nå 783 verifiserte av 924.
- Ingen migrasjon, ingen nye funksjoner, ingen endringer i innlogging, språk eller konto. Ingen betalte AI- eller ElevenLabs-kall.

## Metode
Hvert krav ble flyttet bare når en navngitt test sjekker akseptansekriteriet og testen bestod i denne runden. Testhenvisningen står under `verification` i requirements.yaml, med en history-post datert 2026-10-22. Krav der testene bare dekker deler av kriteriet, står fortsatt som ikke verifisert. Det gjelder blant annet rene UI-punkter som rød markering i dialogeditoren (A8), boksen på prosjektsiden (H9), nedtrekkslisten (D5) og lesbarhet under opptak (D1–D4).

## Ny test
- `tests/architecture/n4-provider-agnostic.test.ts` (REQ-0269): manus, montering, kommandoer, kontinuitet og datamodell importerer verken leverandørkatalogen, leverandørkode eller adaptere, og har ingen leverandør-ID-er. Testen viser ett kjent avvik (se under). Listen over avvik skal bare bli kortere.

## Krav flyttet til Verifisert
| Krav | Tittel | Tester |
|---|---|---|
| REQ-0750 | DV M1: enkeltklikk på tidsplassert replikk flytter avspillingshodet | tests/unit/dialogue-navigation.test.ts |
| REQ-0754 | DV M5: manglende timing uten falsk presisjon | tests/unit/dialogue-navigation.test.ts |
| REQ-0761 | DV D7: flere takes uten overskriving | tests/unit/dialogue-versions.test.ts |
| REQ-0763 | DV L1: ett felles spor per karakter | tests/unit/dv3-dv4.test.ts |
| REQ-0765 | DV L3: replikker er separate segmenter | tests/unit/dv3-dv4.test.ts |
| REQ-0768 | DV L6: bare aktiv versjon spilles i scenen | tests/unit/dialogue-versions.test.ts |
| REQ-0769 | DV L7: tidligere versjoner bevares | tests/unit/dialogue-versions.test.ts |
| REQ-0770 | DV L8: volumkurver, klipping, hastighet og fades bevares ved bytte | tests/unit/dialogue-versions.test.ts |
| REQ-0771 | DV L9: gjenvalgt versjon arver gjeldende plassering | tests/unit/dialogue-versions.test.ts |
| REQ-0772 | DV L10: ulik varighet uten utilsiktet overlapp | tests/unit/dialogue-versions.test.ts |
| REQ-0775 | DV V3: lokale overstyringer | tests/unit/dv3-dv4.test.ts |
| REQ-0776 | DV V4: nye genereringer som separate versjoner | tests/unit/dv5-dv6.test.ts |
| REQ-0779 | DV V7: endret standardstemme endrer ikke tidligere filer | tests/unit/dv3-dv4.test.ts |
| REQ-0784 | DV G5: ny generering blir aktiv versjon | tests/unit/dv5-dv6.test.ts |
| REQ-0785 | DV G6: ingen eksisterende lyd eller redigering slettes | tests/unit/dv5-dv6.test.ts |
| REQ-0786 | DV G7: feil lar tidligere aktiv versjon stå | tests/unit/dv5-dv6.test.ts |
| REQ-0787 | DV G8: kostnadsestimat og eksplisitt bekreftelse før betalte kall | tests/unit/dv4-speech-server.test.ts |
| REQ-0788 | DV G9: usikkert tidsestimat når forsvarlig | tests/unit/dv5-dv6.test.ts, tests/unit/dv7-dv8.test.ts |
| REQ-0791 | DV G12: minimal gyldig 2D-scene opprettes ved behov | tests/unit/dv5-dv6.test.ts |
| REQ-0792 | DV G13: tekniske gjentak oppretter ingen duplikater | tests/unit/dv5-dv6.test.ts |
| REQ-0795 | DV S3: talespråk kan overstyres per replikk | tests/unit/dv5-dv6.test.ts |
| REQ-0796 | DV S4: støtte kontrolleres mot modellens levende språkdata | tests/unit/dv3-dv4.test.ts, tests/unit/dv4-speech-server.test.ts |
| REQ-0801 | DV A1: manusendring gir rød status | tests/unit/dv7-dv8.test.ts |
| REQ-0802 | DV A2: aktiv versjon bestemmer status | tests/unit/dv7-dv8.test.ts |
| REQ-0803 | DV A3: endrede og fjernede passasjer identifiseres | tests/unit/dv7-dv8.test.ts |
| REQ-0809 | DV A9: «Merk som gjennomgått» krever eksplisitt handling | tests/unit/dv7-dv8.test.ts |
| REQ-0810 | DV A10: historikken bevares | tests/unit/dv7-dv8.test.ts |
| REQ-0811 | DV A11: ny manusendring gir rødt igjen | tests/unit/dv7-dv8.test.ts |
| REQ-0812 | DV A12: eldre versjon kan gi avvik igjen | tests/unit/dv7-dv8.test.ts |
| REQ-0817 | DV R5: nye filer blir aktive, gamle bevares | tests/unit/dv7-dv8.test.ts |
| REQ-0818 | DV R6: riktig manusrevisjon registreres | tests/unit/dv7-dv8.test.ts |
| REQ-0819 | DV B1: sette personlig bokmerke | tests/db/run-db-tests.ts, tests/unit/dv7-dv8.test.ts |
| REQ-0820 | DV B2: «Fortsett ved bokmerke» åpner riktig sted | tests/unit/dv7-dv8.test.ts |
| REQ-0821 | DV B3: bokmerket fjernes etter vellykket navigasjon | tests/db/run-db-tests.ts |
| REQ-0822 | DV B4: andres bokmerker påvirkes ikke | tests/db/run-db-tests.ts |
| REQ-0823 | DV H1: merke lyd | tests/unit/dv7-dv8.test.ts |
| REQ-0824 | DV H2: merke bilde | tests/unit/dv7-dv8.test.ts |
| REQ-0825 | DV H3: valgfri tekst | tests/unit/dv7-dv8.test.ts |
| REQ-0826 | DV H4: av/på | tests/unit/dv7-dv8.test.ts |
| REQ-0827 | DV H5: avmarkering sletter ikke tekst | tests/unit/dv7-dv8.test.ts |
| REQ-0828 | DV H6: andre autoriserte ser lappen | tests/db/run-db-tests.ts |
| REQ-0829 | DV H7: synkronisering | tests/db/run-db-tests.ts |
| REQ-0830 | DV H8: oppretter og dato | tests/unit/dv7-dv8.test.ts |
| REQ-0832 | DV H10: sortering etter dato og manusplassering | tests/unit/dv7-dv8.test.ts |
| REQ-0833 | DV H11: filter på oppretter | tests/unit/dv7-dv8.test.ts |
| REQ-0834 | DV H12: klikk åpner riktig sted | tests/unit/dv7-dv8.test.ts |
| REQ-0835 | DV H13: virker selv om elementet er flyttet | tests/unit/dv7-dv8.test.ts |
| REQ-0836 | DV H14: rettigheter følger samarbeidsmodellen | tests/db/run-db-tests.ts |

## Avvik (ikke rettet, står i TODO.md)
- **REQ-0269 (P0):** `AssetVoice.provider` i `src/core/model.ts` er låst til typen `"elevenlabs"`. En ny taleleverandør krever derfor endring i datamodellen, mens kravet sier at det ikke skal trengs. Kravet står fortsatt som ikke verifisert. Rettingen er en liten typeendring, men den er ny funksjonalitet og er derfor ikke gjort.

## Krever ekstern prøving
- REQ-0291, REQ-0293, REQ-0504 (P0): Kravene gjelder at jobber fortsetter når fanen er lukket, og at status bevares mellom økter. Køreglene og databasedelen er testet (`ai-queue`, `ai-claim`, DB 0025), men selve kriteriet krever en ekte bakgrunnsjobb mot en ekte leverandør i Cloud. Det koster penger og kan ikke kjøres her.
- REQ-0685, REQ-0687, REQ-0689: krever ekte telefon og ekte opptak.
- REQ-0711: krever kontroll på ekte iPhone og Android.

## Resultater
- tsc: 0 feil.
- Vitest: 2457 bestått, 10 hoppet over, 0 feilet (309 filer).
- DB: 180 bestått, 0 feilet (lokal Postgres).
- build_docs.py og check_kb.py: OK.

## Stoppunkt
Runden stopper etter DV-blokken og P0. Resten (65 krav, mest UI-punkter i DV og P3) tas i neste runde. De trenger visuelle tester.
