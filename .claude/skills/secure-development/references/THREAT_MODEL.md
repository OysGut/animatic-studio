# Trusselmodell – Animatic Studio (kort)

**Status: Teknisk anbefaling, 2026-10-08.** Oppdateres når nye eiendeler, aktører eller integrasjoner kommer til (f.eks. medietjeneste i fase 4–5, AI-leverandører i fase 5).

## 1. Eiendeler (hva vi beskytter)
| Eiendel | Hvorfor | Hvor |
|---|---|---|
| Manus (norsk/engelsk, alle versjoner) | Upublisert verk eid av Trollfilm/Anita Killi (DEC-0004) | Postgres (blokker), Storage (original) |
| Produksjonsmateriale (takes, 2D-scener, ressurser, lyd) | Kreativt arbeid; ikke-destruktivt krav (INV-07, INV-13) | Storage, Postgres |
| API-nøkler til AI-leverandører | Direkte økonomisk skade ved misbruk | Cloud-hemmeligheter |
| Kostnadsgodkjenning og budsjett | Hindre ukontrollerte betalte kall (INV-12) | Postgres, server-RPC |
| Medlemskap, roller, invitasjoner | Grunnlaget for all tilgang (INV-C2) | Postgres |
| Historikk og kommandologg | Revisjonsspor, angre, avvik | `change_log` |
| Repo, CI og skills | Forsyningskjede for koden | GitHub, `.claude/` |

## 2. Aktører
- **Prosjektmedlemmer** med ulike roller (owner/editor/commenter/viewer, ev. kostnadsrett) – kan gjøre feil eller gå utover rollen.
- **Innlogget ikke-medlem** – annen bruker av samme app.
- **Anonym internettbruker** – kjenner app-URL-en.
- **Ondsinnet fil** – manus/medier fra ukjent kilde.
- **Kompromittert avhengighet / ekstern skill / plugin / MCP.**
- **Lovables agent** – kan endre filer i repoet ved feil instruksjon.
- **AI-leverandør / medietjeneste** – mottar data og signerte URL-er.

## 3. Trusler og tiltak

| # | Trussel | Konsekvens | Tiltak | Test |
|---|---|---|---|---|
| T1 | API-nøkkel lekker via klientbundle, repo, logg eller eksport | Kostnad, misbruk | Bare server-hemmeligheter; aldri `VITE_`; loggmaskering; bundle-skann | Bundle-skann, maskeringstest |
| T2 | Ikke-medlem leser/skriver prosjektdata (IDOR via ID i URL) | Manuslekkasje | RLS (`private.is_project_member`) på alle tabeller + Storage-policyer på prosjektsti (kanonisk sti i `DATA_RELATIONSHIPS.md`) | `tests/rls/role-matrix` (INV-C2) |
| T3 | Viewer/commenter skriver via direkte API-kall | Uautoriserte endringer | Klienten har bare `select`; `insert/update/delete` revoket for `authenticated`; skriving bare via `public.apply_command` → `private.cmd_*` med rollesjekk (`private.has_project_role`) (DEC-0020 pkt. 1) | Rollematrise (direkte skriving feiler for alle roller) |
| T4 | Betalt jobb startes uten godkjenning / over budsjett (også via retry) | Kostnad | `start_job` (via `apply_command`) i backend sjekker godkjenning, kostnadsrett (`private.can_approve_costs`), alle budsjetter; se `API_INTEGRATIONS.md` §2 og SKILL §4 punkt 4 | `inv12-cost-approval.test.ts`, `invC3-cost-role.test.ts` |
| T5 | Stille overskriving av en annen brukers endring | Datatap | `revision` på objekter; `apply_command` avviser utdatert skriving med `P0409` | `invC1-revision-conflict.test.ts` |
| T6 | Ondsinnet PDF (skript, enorme sider) eller DOCX (makro, XXE, ekstern relasjon, zip-bombe) | Kodekjøring, frys, minnebrudd | Worker-parsing, grenser, ingen makro/ekstern ref., XXE av | Importtester med ondsinnede eksempelfiler (syntetiske) |
| T7 | XSS via manustekst, ressursnavn eller prompt | Kontoovertakelse | Tekst rendres som tekst; ingen `dangerouslySetInnerHTML` | Komponenttest med `<script>` i manus |
| T8 | Lekket signert URL eller offentlig bøtte | Medielekkasje | Private bøtter, korte signerte URL-er | Storage-policytest |
| T9 | Invitasjon misbrukes (gjettbar, gjenbrukt, videresendt) | Uautorisert medlemskap | Tilfeldig token, hash, utløp, engangs, tilbaketrekking, e-postsjekk | Invitasjonstester |
| T10 | Manus sendes til leverandør med uakseptable vilkår (opplæring/lagring) | Brudd på rettighetshavers tillit | Leverandørvurdering før integrasjon; bare nødvendig tekst; Mars godkjenner | Dokumentert vurdering |
| T11 | Kompromittert npm-pakke eller ekstern skill/plugin/hook (upinnet `npx @latest`, hook som sender diff) | Kodekjøring, datalekkasje | Pinning, `npm audit`, lese kode før installasjon, DEC-0016 | CI-audit, manuell vurdering |
| T12 | Lovables agent endrer `src/core/`, `docs/`, `.claude/` eller migrasjoner | Brutte invarianter, tapt dokumentasjon | AGENTS.md, rekkverk i meldinger, diff-kontroll etter synk, CI (`check_kb`, kontrollsum) | CI + `git log --author=lovable` |
| T13 | Data bare i nettleseren går tapt | Tap av arbeid | Alt lagres i backend; lokal cache bare cache (REQ-0410) | Frakoblingstest |
| T14 | Sletting av historikk/takes via API | Tap av materiale | `delete` revoket for `authenticated`; ingen `cmd_*` sletter historiske rader; arkivering i stedet (INV-14) | Rollematrise (delete avvist) |

## 4. Utenfor omfang (nå)
- Ondsinnet prosjekteier mot eget prosjekt.
- Kompromittering av Lovable/Supabase/GitHub-plattformen selv.
- Avansert DoS – vi stoler på plattformens beskyttelse, men har grenser på import og kostnadsdrivende endepunkter.

## 5. Revisjon
Gå gjennom ved: ny fase (særlig fase 4–5: medietjeneste og AI), ny leverandør, ny rolle, endring i delingsmodell, eller funn i `npm audit`/review.
