# Fase 2 – gjennomføringsplan (DEC-0090)

Kilde: `docs/product/PHASE2_SPECIFICATION.md`. Krav: REQ-0668–REQ-0712. Hver bolk bygges først når Mars har sagt OK.

## Integrasjonspunkter i det som finnes
- **Ressurser og versjoner:** nye filer blir nye versjoner (`AddAssetVersion`) som godkjennes som før; ingenting godkjent overskrives (REQ-0146, DEC-0090).
- **Skriving:** all skriving i prosjektdata går via kjernen og `apply_changes` (DEC-0022). Mobilsiden har ingen innlogging; serveren sjekker tokenet og skriver på vegne av den som laget økten.
- **Lagring:** filene lastes direkte fra telefonen til lagringen med signerte opplastingslenker (ikke gjennom appens server), under `<prosjekt>/source/mobile/…` (REQ-0415). Ingen SQL mot `storage` i migrasjonene; bøttegrensen (500 MB) settes med Lovables lagringsverktøy.
- **Sanntid:** endringer i prosjektdata når datamaskinen via `change_log` som før; nye rader i mobilimporten via egen sanntidskanal.
- **Lyd:** `RecordAudioDialog` (PC-opptak), `AudioClipEditor` og lydklipp med `blockId` er utgangspunktet for bolk B–E. Komposisjonen blir en ny versjonstype som spilles og eksporteres med samme motor (Web Audio / OfflineAudioContext).
- **AI-leverandører:** ord-til-lyd legges inn som en ny funksjon i leverandørlaget (DEC-0069) med kostnadsgodkjenning; ElevenLabs finnes fra før.

## Bolk A – mobilbro, bilder og video, deling (pakke 1–3)
1. Migrasjon 0035: `upload_sessions` (token lagret som hash, kontekst, type personlig/delt, utløp, tilbakekalling, tak, telling) og `mobile_imports` (fil, type, størrelse, metadata, økt, bidragsyter, kobling til versjon eller utkast, ID fra telefonen mot duplikater). Lesing for medlemmer, skriving bare fra serveren, sanntid på `mobile_imports`.
2. Serverfunksjoner med token: hent økt (bare kontekstnavn og tillatte typer), be om opplastingslenke (sjekk type, størrelse, tak), bekreft (sjekk filen i lagringen og innholdet, registrer, legg inn versjon i konteksten), lag delt lenke, tilbakekall.
3. Mobilsiden `/m/<token>` uten app-skall: hurtigfoto med kameraet i nettleseren (bilde for bilde, kø i IndexedDB, automatisk opplasting), velg filer, video, status, «Del lenke» (Web Share / kopier), frivillig navn for bidragsytere, egne opplastinger.
4. På datamaskinen: «Importer fra mobil» på prosjektsiden og kameraikon øverst til høyre i ressursdialogene (karakter, objekt, miljø, ny ressurs, scene, bildeplass i sceneeditoren) – QR-koden vises med en gang, med status (tilkoblet, mottatt, siste fil, feil). Utkast-kontekst for ny ressurs knyttes ved lagring.
5. «Mobilimport» i biblioteket med filtre (type, dato, økt, kobling, bidragsyter), miniatyrer og avspilling; administrer lenker (tilbakekall).
6. Ny pakke: `qrcode` (MIT) for QR-koden. Tester: kjerne, database (RLS, token, tak, duplikater), nettleser (begge sider), og prøving på iPhone og Android av Mars.

## Bolk B–E (detaljeres før hver bolk)
- **B:** mikrofonikon og lydpopup (PC + QR samtidig), hele replikken vises (også på mobil), flere takes på PC og mobil, velg hva som sendes, lokal lagring og status, romlydopptak.
- **C:** lydkomposisjon (datamodell, motor, editor med bølgeformer, spor, trim, fades), erstatte/før/oppå/etter, låste andre replikker med konfliktvisning, angre og varianter, eksport WAV/MP3.
- **D:** ord-til-lyd (tjenestevalg i editoren, huskes; ElevenLabs først), klikk/markér ord, avspilling med kontekst, erstatt ord, status tekst mot lyd, ny/endret setning.
- **E:** pauser (tidsredigeringsmodus, fordeling, individuell justering), romlyd (søk i samme opptak, sammensetting, valg), overganger mellom takes, «Spill av automatisk etter endring», ytelse.

## Tekniske forbehold (O7)
- Enkelt: QR, opplastingsøkter, filvalg, deling, bibliotek, takes.
- Må prøves på iPhone/Android: kamera i nettleseren (getUserMedia krever HTTPS; iOS Safari), MediaRecorder-formater (iOS gir MP4/AAC), Web Share, lokal lagring (Safari kan slette data etter 7 dager uten besøk).
- Avansert lydbehandling: komposisjon, crossfades, romlyd – i nettleseren med Web Audio.
- Bakgrunnstjeneste og usikker presisjon: ord-til-lyd (dialekter, egennavn, støy). Romlydfylling er en hjelp, ikke en garanti for sømløst resultat, særlig mellom opptak med ulik akustikk.
