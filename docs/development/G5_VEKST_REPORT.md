# G-5 Vekst og misbruk – rapport

Status: levert, ikke publisert. Migrasjon 0097 er skrevet og testet lokalt (DB-tester 198/198), men er **ikke kjørt i Cloud**. 0096 og eldre er låst.

## 1. Oppbevaring av endringsloggen (change_log)

- `service_settings` fikk `change_log_retention_days` (standard 90) og `change_log_max_rows` (standard 20 000).
- `public.prune_change_logs()` sletter kun rader som **både** er eldre enn fristen **og** ligger utenfor de nyeste N per prosjekt (i `project_seq`-rekkefølge). De to vilkårene gjør at fersk historikk aldri forsvinner selv om et prosjekt passerer radtaket, og at gamle rader blir værende så lenge prosjektet er innenfor radtaket.
- **Hvorfor sletting fremfor komprimering:** Gjeldende tilstand ligger i domenetabellene, og `project_snapshot` (0093) gir full innlasting uten historikk. Et «øyeblikksbilde» av gamle endringer ville bare duplisert data som allerede finnes. Angre over økter gjelder uansett bare historikk klienten har lastet; eldre historikk er arkiv, ikke angregrunnlag. Valget er begrunnet i at det er enklere, billigere og uten tap av funksjon.
- **Beskyttelse:** `private.protect_change_log` er kopiert ordrett fra 0073 med ett nytt unntak – sletting når øktvariabelen `animatic.prune_change_log = 'on'`, som bare `prune_change_logs` setter (samme mønster som `animatic.purge_project` for prosjektsletting). INV-13-testen består: sletting uten variabelen feiler fortsatt.
- **Synkronisering (G-2):** `project_seq` endres aldri. En klient som ligger etter et hull prøver selektiv henting tre ganger og faller da tilbake på full innlasting via `project_snapshot` – eksisterende reserve fra G-2, nå med reell mulighet for permanente hull.
- **Eier av jobben:** `prune_change_logs` kan kalles av service_role (eksisterende cron-adresse `/api/public/cron/ai-jobs` – tilkobling dit gjenstår, se Åpent) og av administrator (sjekkes inne i funksjonen).

## 2. Kvoter per arbeidsgruppe eller bruker

Ny tabell `public.usage_quotas`: nøyaktig ett omfang (`workspace_id` **eller** `user_id`), fire grenser (`max_storage_bytes`, `max_projects`, `max_change_log_rows`, `max_uploads_per_hour`), `null` = ubegrenset. Ingen klient-tilgang (revokert + RLS uten policyer); admin når den bare via funksjonene under.

Håndheving i databasen:
- **Prosjekter:** `create_project` kopiert ordrett fra 0090 (4-argumentersversjonen) med kvotesjekk lagt til (PTG11). Nye prosjekter har ennå ingen arbeidsgruppe, så sjekken gjelder eieromfanget.
- **Endringslogg:** trigger på `change_log` teller rader i omfanget (PTG12).
- **Lagring og opplastinger:** `private.check_quota_upload` kalles av triggere på `asset_versions` og `mobile_imports` og sjekker samlede byte (asset_versions + mobile_imports, PTG13) og antall opplastinger siste time (PTG14).
- Feilene kastes i samme transaksjon som skrivingen, så ingenting lagres halvveis – ingen datatap.
- Feilkodene PTG11–PTG14 oversettes til vennlige meldinger i klienten (`quotaErrorMessage` i commands.functions.ts, prosjektoppretting og mobilopplasting), på alle registrerte språk; oversettelsene utover nb/en er maskinoversatt og merket `review: "machine"`.

**Begrunnelse for triggerhåndheving:** kostnaden er én ekstra telling per innsetting, og tellingene er indeksdekket av G-2-indeksene. Samtidighet løses av databasens radlåser; overskridelse med én rad ved kappløp er akseptabelt for en vennlig grense.

## 3. Delingslenker uten klartekst

Cloud hadde tre delinger, alle med `token_digest` og ingen med klartekst – 0070 lagrer aldri nye klartekstnøkler, og oppslag og QR-gjenvisning bruker digest og den avledede nøkkelen. 0097 setter derfor `token = null` der det eventuelt finnes rester (testlenker kan dermed gjøres ugyldige, jf. oppdraget) og merker kolonnen DEPRECATED. Kryptering er ikke nødvendig fordi QR-koden gjenskapes fra den avledede nøkkelen, ikke fra lagret klartekst.

## 4. Tak på jsonb-kolonner

41 brukerstyrte jsonb-kolonner manglet størrelsestak (55 hadde fra før). 0097 legger `pg_column_size`-sjekker (NOT VALID + VALIDATE) med tre nivåer: 4 MB for `script_versions.snapshot`, 1 MB for store kommando-/spesifikasjonsfelt (bl.a. `change_log.command/inverse`, `story_sessions.turns`, rigg- og munnspesifikasjoner), 64 KB for små styringsfelt. Takene er misbrukstak langt over målte maksverdier (største eksisterende verdi var ca. 212 kB), ikke faglige grenser. DB-testen G-5.4 feiler hvis en ny jsonb-kolonne i `public` mangler tak.

## Migrasjon 0097 – hva den oppretter, erstatter og fjerner

**Kolonner lagt til:** `service_settings.change_log_retention_days`, `service_settings.change_log_max_rows`.
**Tabell opprettet:** `public.usage_quotas` (med to delvise unikindekser).
**Funksjoner opprettet:** `public.prune_change_logs`, `public.admin_set_change_log_retention`, `public.admin_change_log_stats`, `public.admin_set_usage_quota`, `public.admin_delete_usage_quota`, `public.admin_usage_quotas`, `private.quota_scope`, `private.quota_in_scope`, `private.check_quota_change_log`, `private.check_quota_upload`, `private.check_quota_asset_version`, `private.check_quota_mobile_import`.
**Funksjoner erstattet:** `private.protect_change_log` (ordrett kopi fra 0073 + ryddingsunntak), `public.create_project` (ordrett kopi fra 0090 + kvotesjekk).
**Triggere opprettet:** `change_log_quota`, `asset_versions_quota`, `mobile_imports_quota`.
**Data endret:** `film_shares.token` settes til null der den finnes; kolonnen merkes DEPRECATED.
**Constraints lagt til:** 41 `*_g5cap`-sjekker (alle validert).
**Fjernet:** ingenting.
Alle SECURITY DEFINER-funksjoner har `set search_path = ''`; den eksisterende arkitekturtesten bekrefter dette.

## Kontroller

- DB-tester: 198 bestått, 0 feilet (nye: G-5.1 rydding, G-5.2 kvoter, G-5.3 klartekst, G-5.4 jsonb-tak).
- i18n-kontroll: grønn for alle språk (0 tekster uten engelsk).
- Typekontroll og full Vitest: ikke kjørt i denne omgangen – kjøres av Claude før Cloud.

## Åpent

- Tilkobling av `prune_change_logs` til cron-adressen `/api/public/cron/ai-jobs` og admin-knappen i grensesnittet gjenstår (funksjonen er klar og testet).
- Målinger før/etter: ryddingen er en indeksstyrt sletting på `project_seq`; formell ytelsesmåling med produksjonslignende datamengder gjenstår.
