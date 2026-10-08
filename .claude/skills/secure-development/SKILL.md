---
name: secure-development
description: Prosjektregler for sikkerhet i Animatic Studio – API-nøkler bare som server-hemmeligheter (aldri VITE_-variabler, repo eller logger), RLS med bare lesetilgang for klienten og all skriving via apply_command-RPC (DEC-0020), roller fra ADR-0004 (owner/editor/commenter/viewer, kostnadsrett), backend-håndheving av kostnadsporten (budsjett, kostnadsgodkjenning før betalt generering, inntil ai-cost-quality-governance finnes), sikker filimport (manus PDF/DOCX og video – størrelse, MIME-sjekk, parsing i web worker, ingen makroer, zip-bomber), private Storage-bøtter og signerte URL-er, avhengighetssikkerhet (npm audit, pinning), maskert logging, fortrolig manus (DEC-0004) og sikkerhet i eksterne plugins og skills. Bruk ved nye tabeller, migrasjoner, RLS-policyer, RPC-er, Storage, filopplasting/import, hemmeligheter, AI-adaptere, logging, nye npm-pakker, eksterne skills/plugins/MCP, eller når noen nevner security, sikkerhet, tilgang, auth, secret, API key, RLS, upload eller sårbarhet.
metadata:
  version: "0.2.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# secure-development

## 1. Ansvar
**Eier:** prosjektets sikkerhetsregler og trusselmodell: hemmeligheter, autorisering (RLS + RPC), filimport, medielagring, avhengigheter, logging, fortrolighet for manus, og vurdering av eksterne skills/plugins.
**Eier ikke:**
- Domeneskjemaets innhold → `database-domain-modeling` (denne skillen kontrollerer at det er sikret).
- Kostnadsporten (INV-12, INV-C3) eies av `ai-cost-quality-governance` når den opprettes i M5 (DEC-0020 pkt. 11). **Inntil da** eies den av `docs/architecture/API_INTEGRATIONS.md` §2 + denne skillen (se §4 punkt 4). `scene-sync-invariants` og `architecture-guardian` eier den ikke; de bidrar bare med segmentering (`CreateSegments(reason: model_limit)`) og arkitekturgjennomgang.
- Lovable-hemmelighetsflyt (hvordan Mars legger inn nøkler) → `lovable-development`.

**Stopp og spør Mars** ved sikkerhetsspørsmål som krever et valg (DEC-0006 punkt 4), f.eks. deling av data med tredjepart, ny leverandør som får manustekst, offentlig publisering.

## 2. Når den brukes
- Ny/endret tabell, migrasjon, RLS-policy, `security definer`-funksjon eller RPC (`supabase/migrations/`, `supabase/functions/`, server functions).
- Opplasting/import av manus (PDF/DOCX), bilder, lyd, video; eksport og deling.
- Ny hemmelighet, ny AI-leverandør/adapter (`src/adapters/providers/`), ny logging.
- Ny npm-pakke eller oppgradering; ny ekstern skill, plugin, hook eller MCP-server.
- Før leveranse som berører auth, medlemskap, invitasjoner eller Storage.

## 3. Les først
- [references/THREAT_MODEL.md](references/THREAT_MODEL.md) og [references/SECURITY_CHECKLIST.md](references/SECURITY_CHECKLIST.md).
- `docs/decisions/adr/ADR-0004-samarbeid-tilgang.md` (roller, RLS-hjelpefunksjoner, revisjon), ADR-0002, ADR-0007 (import), ADR-0008 (rendering).
- `docs/architecture/API_INTEGRATIONS.md` §2–3 (kostnadsport, hemmeligheter), `INVARIANTS.md` (INV-12, INV-C1, INV-C2, INV-C3). DEC-0020 (skrivevei, hjelpefunksjoner, lagringssti, kostnadsport).
- DEC-0003, DEC-0004 (manus eies av Trollfilm/Anita Killi), DEC-0016 (eksterne skills), DEC-0018 (API-nøkler, *Midlertidig antakelse*).
- Krav: REQ-0270–REQ-0272, REQ-0408–REQ-0415, REQ-0520–REQ-0529, REQ-0053, REQ-0242.
- `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` §4 (Secrets, Storage, RLS) og §7 (Supabase RLS-mønstre).
- `docs/development/EXTERNAL_SKILLS_POLICY.md` og `docs/references/technical/SKILLS_ASSESSMENT.md` §2 og §4.

## 4. Arbeidsprosedyre
1. **Klassifiser endringen** mot THREAT_MODEL: hvilke eiendeler (manus, medier, nøkler, kostnad, medlemskap) og hvilke aktører berøres?
2. **Hemmeligheter:** nøkler bare i Lovable Cloud-hemmeligheter (MVP) og leses bare server-side (adapter i `src/adapters/providers/`, kjøres på server). Aldri `VITE_`-prefiks, aldri i klientbundle, repo, prosjekttabeller i klartekst, logger, feilmeldinger, eksport eller prompt. `ProviderAdapterConfig` lagrer bare en hemmelighetsreferanse.
3. **Autorisering (DEC-0020 pkt. 1–3):** RLS på **hver** tabell med prosjektdata, med **bare** `select`-policy `to authenticated using (private.is_project_member(project_id))`. `insert/update/delete` er tilbakekalt for `authenticated` (`revoke insert, update, delete … from authenticated`) – klienten skal **ikke** ha skrivepolicyer. All skriving går via én `security definer`-RPC `public.apply_command(project_id, command jsonb, base_revisions jsonb)`, som sjekker medlemskap og rolle (`private.has_project_role(project_id, 'editor')`), sammenligner `base_revisions` (avvik → SQLSTATE `P0409` «revision_conflict») og kaller den interne `private.cmd_<kommando>`. Hjelpefunksjonene `private.is_project_member(uuid)`, `private.has_project_role(uuid, text)` og `private.can_approve_costs(uuid)` er `security definer` med `set search_path = ''`; skjemaet `private` eksponeres ikke via API-et. Unntak fra «bare RPC» gjelder bare rene brukerinnstillinger (f.eks. per-bruker `ViewFilter`) og listes eksplisitt i migrasjonen. Kode med service role sjekker tilgang selv. UI-skjuling er aldri tilgangskontroll.
4. **Kostnadsport (midlertidig eier, DEC-0020 pkt. 11):** følg `API_INTEGRATIONS.md` §2. (a) Adapteren gir estimat før start; ved segmentering (N segmenter → N jobber) vises samlet estimat og gis én godkjenning for hele jobbgruppen. (b) Godkjenning (`cost_approval`) kan bare gis av medlem der `private.can_approve_costs(project_id)` er sann (INV-C3, REQ-0528). (c) Server-RPC-en `start_job` (kalt via `apply_command`) sjekker godkjenning og **alle** budsjettnivåer – strengeste gjelder; brukt beløp, retries og ekstrarunder teller (INV-12). (d) Overskrides grensen under kjøring, stoppes videre kall og jobben venter på ny godkjenning. (e) Ingen automatisk prosess (avviksanalyse, ressursendring, segmentering) starter betalt jobb. Tester: `inv12-cost-approval.test.ts`, `invC3-cost-role.test.ts`. Når `ai-cost-quality-governance` opprettes, flyttes dette punktet dit.
5. **Filimport:** følg SECURITY_CHECKLIST §3 – størrelsesgrense før opplasting, MIME *og* magiske bytes, parsing i Web Worker (pdf.js uten skript, DOCX via zip-leser med grenser), ingen makroer/eksterne referanser, original lagres uendret med SHA-256 (REQ-0053).
6. **Lagring:** bruk den kanoniske stien og bøttelisten i `docs/architecture/DATA_RELATIONSHIPS.md` «Lagringsstruktur» (DEC-0020 pkt. 4) – ikke egne varianter. Storage-policyer leser prosjekt-ID fra stien; korte signerte URL-er; ingen offentlige bøtter.
7. **Logging:** strukturert, med maskering (`sk-…`, `Bearer …`, `apikey`, e-post delvis); aldri manustekst, prompter med dialog eller filinnhold i logger (DEC-0004).
8. **Avhengigheter:** vurder ny pakke (vedlikehold, nedlastinger, lisens, postinstall-skript, transitive avhengigheter); eksakt versjon i lockfil; `npm audit --omit=dev` uten høye/kritiske funn før leveranse.
9. **Eksterne skills/plugins/MCP:** ikke installer uten vurdering (kilde, lisens, kodekjøring, nettverk, hemmeligheter) og pinnet SHA/versjon (DEC-0016). Rødt flagg: upinnet `npx …@latest`, instruksjoner hentet fra nett ved kjøring, hooks som sender diff/kode til eksterne API-er, MCP med skrive-/SQL-tilgang til prosjektet. Kostnad eller dataeksport → spør Mars.
10. **Test** autorisasjonen (rollematrise) og importgrenser; oppdater trusselmodellen hvis noe nytt dukker opp.

## 5. Leveranse
- Migrasjoner med RLS i samme fil som tabellen; RPC-er med eksplisitte rollesjekker; tester i `tests/rls/` og `tests/security/`.
- Kort sikkerhetsnotis i `SESSION_HANDOVER.md` (hva ble vurdert, hva gjenstår). Til Mars: på norsk, uten sjargong, og bare når han må ta et valg.

## 6. Kontrollpunkter
- [ ] SECURITY_CHECKLIST gjennomgått for berørte områder.
- [ ] Ingen hemmelighet i diff (`git diff | grep -iE "sk-|api[_-]?key|secret|bearer|service_role"`), ingen `VITE_` med hemmelig innhold.
- [ ] Ny tabell har RLS aktivert + **bare** select-policy (`private.is_project_member`); `insert/update/delete` revoket for `authenticated`; ingen policy med `using (true)` på prosjektdata. Eventuelt unntak (ren brukerinnstilling) er listet eksplisitt.
- [ ] Skriving bare via `public.apply_command` → `private.cmd_*`, som sjekker medlemskap, rolle og revisjon (`P0409`); service role brukes bare server-side med egen sjekk.
- [ ] Betalt jobb: godkjenning fra `private.can_approve_costs`, alle budsjettnivåer sjekket i `start_job`, retries teller (INV-12, INV-C3).
- [ ] Import: grenser, MIME/magiske bytes, worker, ingen makroer, original med kontrollsum.
- [ ] Logger maskerer; ingen manustekst.
- [ ] `npm audit` uten høye/kritiske; nye pakker vurdert og pinnet.

## 7. Typiske feil som må unngås
- RLS aktivert uten select-policy (alt blokkert) – eller policy som leser samme tabell (rekursjon, `42P17`).
- Skrivepolicyer (insert/update/delete) for klienten «bare med rollesjekk» – det omgår revisjonskontrollen (INV-C1), `change_log` og validering i RPC (DEC-0020 pkt. 1).
- Rolle- eller medlemskapsinfo fra `user_metadata`/klient brukt i autorisering.
- Å stole på at Lovables automatiske RLS dekker våre tabeller – den er grunnleggende; vi skriver egne policyer.
- Signerte URL-er med lang levetid i delte lenker; offentlige bøtter for «enkelhets skyld».
- PDF/DOCX parset på hovedtråden uten grenser; DOCX pakket ut uten størrelsessjekk (zip-bombe).
- Hele manus som testdata i repoet (DEC-0004: bare korte utdrag uten kontaktinfo i `tests/fixtures/screenplay/`).
- Å installere Anthropics `security-guidance`-plugin uten å vite at hooks sender diff til Claude-API-et (kostnad; data forlater maskinen). Den er et **valgfritt supplement** etter Mars' OK – denne skillen har forrang ved konflikt (SKILLS_ASSESSMENT §2.7).

## 8. Akseptansekriterier / tester
- `tests/rls/role-matrix`: for hver tabell og rolle (ikke-medlem, viewer, commenter, editor, owner, med/uten kostnadsrett) – forventet tillat/avvis for select, `apply_command` og Storage (INV-C2). Direkte `insert/update/delete` fra klienten feiler for **alle** roller, også owner.
- `invC3-cost-role.test.ts`: medlem uten `can_approve_costs` kan ikke gi kostnadsgodkjenning.
- `invC1-revision-conflict.test.ts` og `inv12-cost-approval.test.ts` (INVARIANTS.md).
- Importtester: for stor fil avvises; feil MIME/magiske bytes avvises; DOCX med makro/ekstern relasjon/zip-bombe avvises eller renses; parsing skjer i worker.
- Test som feiler hvis klientbundlen inneholder kjente hemmelighetsmønstre (skann `dist/`/build-output).
- Loggmaskeringstest med eksempelnøkler.
- CI: `npm audit --omit=dev --audit-level=high`.

## 9. Dokumentasjon og sporbarhet
- `requirements.yaml`: REQ-0270–REQ-0272, REQ-0408–REQ-0415, REQ-0523–REQ-0529 – `status`, `implementation`, `verification`; `build_docs.py` + `check_kb.py`.
- Trusselmodell → `references/THREAT_MODEL.md` (her) ved nye eiendeler/aktører.
- Sikkerhetsbeslutninger (f.eks. kryptert nøkkeltabell per prosjekt, ny leverandør) → DEC/ADR; åpne spørsmål (Q-01) → `OPEN_QUESTIONS.md`.
- Kjente svakheter som ikke er rettet → `KNOWN_ISSUES.md` (uten detaljer som gjør dem lettere å utnytte). `IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`.
