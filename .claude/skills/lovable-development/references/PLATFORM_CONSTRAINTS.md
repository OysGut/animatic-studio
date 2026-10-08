# Lovable – plattformbegrensninger med verifiseringsstatus

Oppsummert fra `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` (research 2026-10-08). Ved tvil: les den fulle notatfila og gjeldende docs (`https://docs.lovable.dev/llms.txt`, sider som `.md`).

**Merking:** [VERIFISERT] = står i offisiell dokumentasjon · [DELVIS] = antydet/kun blogg · [UVERIFISERT] = ikke funnet, må testes · [TESTET] = bekreftet i vårt eget prosjekt (dato).
Når en påstand testes i prosjektet, oppdater merkingen her med dato.

## 1. Stack
| Påstand | Status | Konsekvens for oss |
|---|---|---|
| Nye prosjekter (fra 13.05.2026) bruker TanStack Start med SSR; eldre bruker React + Vite (React Router) | [VERIFISERT] | Les `package.json` før koding. Nettleser-API-er bare på klient. |
| TanStack Start bygges med `@lovable.dev/vite-tanstack-config`, server pakkes med Nitro, `npm run build`, Node 22 anbefalt | [VERIFISERT] | Bruk samme Node-versjon lokalt og i CI. |
| Routing = TanStack Router; mapper `src/routes/` | [DELVIS] | Verifiser i repoet. |
| Server functions publiseres som Cloudflare Worker | [DELVIS] (blogg) | Ingen tung mediebehandling i server functions (ADR-0008). |
| TypeScript, Tailwind | [DELVIS] | Verifiser versjon (Tailwind 3 vs 4) i repoet. |
| shadcn/ui + Radix | [UVERIFISERT] | Sjekk `components.json`. |
| Rammeverk og database kan ikke velges | [VERIFISERT] | Følg det som genereres. |

## 2. GitHub-synk
| Påstand | Status |
|---|---|
| Lovable oppretter nytt repo; kan ikke koble til eksisterende repo; reconnect lager nytt repo | [VERIFISERT] |
| Toveis synk på én gren (standard `main`); andre grener vises ikke før merge | [VERIFISERT] |
| Ikke force-push, rebase eller squash på synket gren | [VERIFISERT] (anbefaling) |
| Pull via push-webhook; «GitHub ahead» løses med ny (gjerne tom) commit | [VERIFISERT] |
| Ved divergens pusher Lovable til `lovable-sync` (videre `lovable-sync-<timestamp>`); neste synk fra GitHub erstatter Lovables versjon; backup kan gjenopprettes i 24 t | [VERIFISERT] |
| Beskyttet gren på GitHub → Lovables push havner i `lovable-sync` | [VERIFISERT] |
| Slett aldri synket gren eller repoet (`lovable-fallback` / synk stopper) | [VERIFISERT] |
| Lovable-commits signeres `lovable-dev[bot]` | [VERIFISERT] |
| Synkede commits går gjennom samme sjekker som endringer i appen (inkl. avhengighetsrevisjon) | [VERIFISERT] |
| Hvordan revert i Lovable vises i Git | [UVERIFISERT] |
| Om `docs/`, `.claude/`, `.github/workflows/` overlever Lovable-runder uendret | [UVERIFISERT] – testes ved første leveranse |

## 3. Filer Lovable eier eller bruker
| Fil/mappe | Status | Regel |
|---|---|---|
| `AGENTS.md` (rot) – leses alltid av Lovables agent | [VERIFISERT] | Kort «grunnlov»; endres bare med Mars' viten |
| `CLAUDE.md` – kan gi veiledning, uten samme garanti | [VERIFISERT] | Viktige regler også i AGENTS.md |
| Project knowledge (≤ 10 000 tegn) har prioritet over repo-filer | [VERIFISERT] | Kort versjon av AGENTS-reglene kan legges der av Mars |
| `.lovable/plan.md`, `.lovable/plan/` (Plan mode) | [VERIFISERT] | Ikke rør |
| `.env` med `VITE_`-variabler skal committes | [VERIFISERT] | Bare offentlige verdier |
| `supabase/functions/`, `supabase/migrations/` (og `drizzle/migrations/`) | [VERIFISERT] | Våre filer, men kjøres ikke automatisk (§4) |
| Genererte konfigfiler (vite/tanstack-konfig, `components.json`, Supabase-klient) | [DELVIS] | Endre minst mulig; noter hvorfor i commit |
| Lovable-skills leses fra workspace, ikke fra `.claude/skills/` | [UVERIFISERT] | Kan importeres manuelt fra GitHub-undermappe |

## 4. Backend (Lovable Cloud)
| Påstand | Status |
|---|---|
| Cloud = Supabase-basert: Postgres, Auth, Storage, Realtime, Edge Functions | [VERIFISERT] |
| **Lovable kjører ikke migrasjoner og deployer ikke funksjoner som kommer via Git** | [VERIFISERT] |
| Ingen automatisk bytte Cloud ↔ egen Supabase; «decide early»; region kan ikke endres | [VERIFISERT] |
| Én daglig DB-backup, ~14 dager; Storage ikke med i backup | [VERIFISERT] |
| Lovable setter opp grunnleggende RLS automatisk; frontend skal aldri ta sikkerhetsbeslutninger; service role omgår RLS | [VERIFISERT] |
| Storage-bøtter private som standard; maks fil 2 GB (kan økes til 5 GB); «Copy URL»-signerte URL-er utløper etter 1 t | [VERIFISERT] |
| Tidsgrenser/minne for Cloud Edge Functions og server functions | [UVERIFISERT] (Supabase: 256 MB / 150–400 s; Cloudflare Workers: 128 MB) |
| Auth Hooks, `pg_cron`, `pg_net` i Cloud | [UVERIFISERT] |
| Jobs (planlagte bakgrunnsoppgaver) finnes, bruker Cloud-kreditter | [VERIFISERT]; maks kjøretid [UVERIFISERT] |

## 5. Hemmeligheter
| Påstand | Status |
|---|---|
| Krypterte, per prosjekt, write-only, når aldri nettleseren, injiseres server-side | [VERIFISERT] |
| `VITE_`-navn avvises som hemmelighet (de havner i nettleserbundlen) | [VERIFISERT] |
| `SUPABASE_*` og `LOVABLE_*` er reserverte navn | [VERIFISERT] |
| Legg inn via «Add secret»-skjema, ikke lim i chat | [VERIFISERT] |

## 6. Størrelser
| Grense | Status |
|---|---|
| Lovable kan ikke lagre filer > 10 MB i prosjektet | [VERIFISERT] |
| GitHub avviser filer > 100 MB | [VERIFISERT] |

## 7. Kostnad og kreditter (stopp og spør Mars)
- Build/Plan/Chat-meldinger, Cloud-drift, Jobs, Realtime og AI bruker kreditter [VERIFISERT]. Prisene endres (chat-prising «gjelder til 31. okt 2026»). Alt som øker forbruk vesentlig → spør Mars (DEC-0006).
- Lovable-plugin (MCP, `lovablelabs/mcp`, pinnet SHA `0336e6db…` i Anthropic-marketplace): kan bruke kreditter, publisere offentlig URL og kjøre SQL. Ikke installer uten Mars' godkjenning.

## 8. Åpne tester (ved første leveranse)
1. Overlever `docs/`, `.claude/`, `.github/workflows/` uendret?
2. Faktisk stack i `package.json`/`components.json`.
3. Tidsgrenser for Cloud-funksjoner/server functions.
4. Auth Hooks / `pg_cron` / `pg_net` tilgjengelig?
5. Revert i Lovable → hvordan i Git?
6. Leser Lovable `CLAUDE.md` like pålitelig som `AGENTS.md`?
