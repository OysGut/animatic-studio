# Sikkerhetssjekkliste – Animatic Studio

Gå gjennom de seksjonene som berøres. Avkrysning dokumenteres i `CURRENT_WORK.md` ved leveranse.

## 1. Hemmeligheter og API-nøkler (mandat 19.1, 28.3; REQ-0270–REQ-0272, REQ-0413, REQ-0414)
- [ ] Nøkkelen ligger bare i Lovable Cloud-hemmeligheter (MVP) – eller senere i kryptert server-side tabell per prosjekt (krever egen ADR).
- [ ] Leses bare i serverkode (edge/server function, adapter i `src/adapters/providers/`). Ingen import av serveradaptere fra klientkode.
- [ ] Ikke `VITE_`-prefiks; ikke i `.env`; ikke i `supabase/migrations/`; ikke i testdata.
- [ ] Ikke i prosjekteksport/backup (REQ-0412) – bare referanse/«koblet til»-status.
- [ ] Feilmeldinger fra leverandør normaliseres (`normalizeError`) og vaskes for nøkler/headers før logging og visning.
- [ ] UI viser bare «Tilkoblet / ikke tilkoblet» og siste 4 tegn om nødvendig – aldri nøkkelen.
- [ ] Build-output skannes for hemmelighetsmønstre i CI.

## 2. Tilgangsstyring (DEC-0003, DEC-0010, DEC-0020, ADR-0004; REQ-0520–REQ-0529; INV-C2)
- [ ] RLS aktivert på alle tabeller med prosjektdata, inkl. koblingstabeller, `change_log`, `discrepancies`, `generation_jobs`, `render_jobs`.
- [ ] **Bare `select`-policy** `to authenticated using (private.is_project_member(project_id))`; `(select auth.uid())` i hjelpefunksjonene; indeks på `project_id`.
- [ ] `revoke insert, update, delete on <tabell> from authenticated` (og `anon`) – ingen skrivepolicyer for klienten (DEC-0020 pkt. 1). Unntak bare for rene brukerinnstillinger, listet eksplisitt.
- [ ] Hjelpefunksjonene `private.is_project_member(uuid)`, `private.has_project_role(uuid, text)` og `private.can_approve_costs(uuid)` er `security definer`, `set search_path = ''`, i skjemaet `private` som ikke eksponeres via API-et (DEC-0020 pkt. 2).
- [ ] Skriving skjer bare via `public.apply_command(project_id, command, base_revisions)` som sjekker medlemskap, rolle og `revision` (avvik → `P0409`), validerer kommandoen og kaller `private.cmd_<kommando>`. `private.cmd_*` kan ikke kalles direkte av klienten.
- [ ] `commenter`/`viewer` kan ikke skrive produksjonsdata; bare `owner` kan endre medlemskap og nøkler; bare medlemmer der `private.can_approve_costs(project_id)` er sann kan godkjenne kostnad (INV-C3).
- [ ] Invitasjon: token lagres som hash, har utløp, kan trekkes tilbake, er engangs; aksept via serverfunksjon som validerer token og e-post.
- [ ] Fjerning av medlem sletter ikke medlemmets arbeid (REQ-0529).
- [ ] Realtime: private kanaler `project:<id>` med policy på `realtime.messages` (ikke kjør `ENABLE ROW LEVEL SECURITY` på den tabellen – [VERIFISERT] at det feiler).
- [ ] Service role brukes bare i server-kode som selv sjekker tilgang.

## 3. Filimport (manus PDF/DOCX, bilder, lyd, video; mandat 4.1, 16; ADR-0007)
- [ ] **Størrelse** sjekkes i klient før opplasting og i Storage-grense (Lovable: 2 GB standard, maks 5 GB – [VERIFISERT]). Forslag: manus ≤ 50 MB, bilde ≤ 100 MB, lyd ≤ 1 GB, video ≤ grensen i Storage.
- [ ] **Type**: filendelse + MIME + magiske bytes (`%PDF-`, `PK\x03\x04` for DOCX, kjente signaturer for medier). Avvik → avvis med forståelig melding.
- [ ] **PDF**: parses med pdf.js i en **Web Worker**, med `isEvalSupported: false` og uten å kjøre innebygde skript/skjemaer/lenker; bare tekstlag og posisjoner hentes. Tidsgrense og sidetallgrense (f.eks. 400 sider).
- [ ] **DOCX**: zip-leser med grenser – maks antall filer, maks utpakket størrelse (f.eks. 200 MB), maks kompresjonsforhold (zip-bombe); ignorer `vbaProject.bin`/makroer, eksterne relasjoner (`TargetMode="External"`), innebygde OLE-objekter; XML-parser uten ekstern entitetsoppslag (XXE). Bare `.docx`, ikke `.docm`.
- [ ] **Video/lyd**: metadata leses med nettleser-API eller ffprobe i medietjenesten (ikke i edge function); filnavn saneres; ingen kjøring av noe fra filen.
- [ ] Original lagres uendret med SHA-256 (REQ-0053, REQ-0242); tolket resultat er en ny versjon.
- [ ] Filnavn brukes aldri direkte i Storage-sti (bruk ID).
- [ ] Importerte tekster rendres som tekst, aldri som HTML (XSS).

## 4. Medielagring (mandat 28.4; REQ-0415)
- [ ] Bøtter og sti følger den kanoniske lagringsstrukturen i `docs/architecture/DATA_RELATIONSHIPS.md` «Lagringsstruktur» (DEC-0020 pkt. 4); alle bøtter private.
- [ ] Storage-policyer sjekker medlemskap via prosjekt-ID i stien (`private.is_project_member`); skriving krever editor (`private.has_project_role`).
- [ ] Signerte URL-er med kort levetid (minutter for avspilling, maks 1 t); ingen permanente offentlige lenker uten eksplisitt beslutning.
- [ ] Medietjeneste/AI-leverandør får bare signerte URL-er til de filene jobben trenger.
- [ ] Midlertidige filer ryddes; historiske versjoner slettes aldri automatisk (INV-14, REQ-0316).

## 5. Backend-autorisering og kostnad (INV-12, INV-C3; midlertidig eier inntil `ai-cost-quality-governance`, DEC-0020 pkt. 11)
- [ ] Følger `docs/architecture/API_INTEGRATIONS.md` §2.
- [ ] `start_job` (via `apply_command`) kontrollerer godkjenning, kostnadsrett (`private.can_approve_costs`) og alle budsjettnivåer (strengeste gjelder, brukt beløp, retries og ekstrarunder teller) – i backend, ikke klient.
- [ ] Segmenterte jobber: samlet estimat og én godkjenning for jobbgruppen; overskridelse under kjøring stopper videre kall.
- [ ] Ingen automatisk prosess (avviksanalyse, ressursendring) kan opprette betalt jobb uten godkjenning.
- [ ] Rate limiting på kostnadsdrivende og invitasjonsendepunkter.

## 6. Logging og feil (REQ-0414)
- [ ] Strukturerte logger med `projectId`, `userId`, `commandId`, feilkode – ikke innhold.
- [ ] Maskering av `sk-…`, `Bearer …`, `apikey=…`, `Authorization`, signerte URL-tokens, e-post (delvis).
- [ ] Ingen manustekst, dialog, prompter eller filinnhold i logger eller feilrapporter (DEC-0004).
- [ ] Ingen tredjeparts analyse/sporing uten beslutning (API_INTEGRATIONS §7).

## 7. Fortrolig manus og opphavsrett (DEC-0004)
- [ ] Hele manusfiler aldri i repo (`.gitignore`), aldri i issues/PR-tekst, aldri i Lovable-meldinger.
- [ ] Testutdrag korte, i `tests/fixtures/screenplay/`, uten kontaktinformasjon fra tittelsiden.
- [ ] Manustekst sendes bare til AI-leverandør når brukeren starter en generering, og bare nødvendig del (prompt). Leverandørens vilkår (opplæring på data, lagring, region) dokumentert før integrasjon (API_INTEGRATIONS §6) – nye leverandører som får manustekst krever Mars' godkjenning.
- [ ] Prosjekteksport inneholder manus – vis tydelig at fila er fortrolig.

## 8. Avhengigheter
- [ ] Ny pakke vurdert: formål, vedlikehold (siste utgivelse, utgivere), lisens (MIT/Apache/BSD/ISC/OFL for fonter), `postinstall`-skript, størrelse, transitive avhengigheter.
- [ ] Eksakt versjon i `package-lock.json`; `npm ci` i CI.
- [ ] `npm audit --omit=dev --audit-level=high` grønt; funn som ikke kan rettes dokumenteres i KNOWN_ISSUES.
- [ ] Ingen upinnede `npx …@latest` i skript, CI eller skills.

## 9. Eksterne skills, plugins, hooks og MCP (DEC-0016)
- [ ] Kilde og utgiver verifisert; lisens funnet; versjon/commit-SHA pinnet og notert (`metadata.source`, `metadata.source-sha`).
- [ ] Lest alle filer som kjører kode (skript, hooks, `.mcp.json`) – ikke bare SKILL.md.
- [ ] Ingen henting av instruksjoner fra nett ved kjøring; ingen upinnet `npx`.
- [ ] Hooks som sender diff/kode til eksterne API-er (f.eks. Anthropic `security-guidance` sin Stop/commit-review) er bevisst valgt og godkjent av Mars (kostnad, data forlater maskinen).
- [ ] MCP-servere med skrivetilgang (SQL, deploy, publisering) bare mot dev-prosjekt og med manuell godkjenning per kall.
- [ ] Vår skill har forrang ved konflikt; dokumentert i `docs/development/EXTERNAL_SKILLS_POLICY.md`.

## 10. Klient
- [ ] Ingen `dangerouslySetInnerHTML` med bruker-/manusinnhold.
- [ ] Content Security Policy vurdert (avhengig av hva Lovable-hosting tillater – [UVERIFISERT]).
- [ ] Ingen kritiske data bare i `localStorage`/IndexedDB (REQ-0410); lokal cache inneholder ikke nøkler.
