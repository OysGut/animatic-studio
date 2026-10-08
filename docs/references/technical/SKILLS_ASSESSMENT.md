# Skills-vurdering for Animatic Studio

**Dato:** 2026-10-08
**Omfang:** Kun research. Ingenting er installert, klonet eller kjørt. Alle filer er lest som tekst via raw.githubusercontent.com og WebFetch.
**Stack som er lagt til grunn:** Lovable (React + TypeScript + Vite + Tailwind + shadcn/ui), sannsynlig Supabase-backend, GitHub-repo med Claude Code som utviklingsassistent. Prosjektskills skal ligge i `.claude/skills/<navn>/SKILL.md`.
**Formatregler:** se `/home/claude/work/agentskills_spec_notes.md`.

## 0. Hva som ikke kunne verifiseres (les dette først)

- **Commit-datoer og HEAD-SHA-er kunne IKKE hentes.** `gh` hadde et ugyldig token, og api.github.com, github.com (HTML/Atom), codeload og jsdelivr ble blokkert av egress-proxyen (403) eller robots.txt. Bare raw.githubusercontent.com (`main`-grenen) var tilgjengelig.
- Det jeg *har*: (a) SHA-er som Anthropics marketplace-fil `anthropics/claude-plugins-official/.claude-plugin/marketplace.json` pinner for **eksterne** plugins (oppgitt under), (b) versjonsfelt i `plugin.json`/SKILL.md-metadata, (c) innholdet slik det sto på `main` 2026-10-08.
- Interne Anthropic-plugins (`./plugins/...`) er ikke SHA-pinnet i marketplace-fila; de følger repoets `main`.
- Jeg har lest SKILL.md/README/plugin.json/LICENSE for kandidatene, men **ikke** gjennomgått alle skript, hooks og agentfiler linje for linje (filtrær kunne ikke listes uten API). Påstander om kodekjøring bygger på README/SKILL.md/marketplace-oppføringer.
- Før installasjon: én person med fungerende GitHub-tilgang bør bekrefte siste commit-dato og pinne en SHA per kilde.

---

## 1. Oversiktstabell

Status-koder:
- **PLUGIN** = «Finnes ferdig – bruk som plugin»
- **REF+TILPASS** = «Finnes – bruk som referanse, skriv prosjektspesifikk tilpasning»
- **SELV** = «Må skrives selv»

### P0-skills

| Skill | Kandidatkilde(r) | Dekker (av vårt behov) | Status | Overlapp / konflikt | Anbefaling | Prioritet |
|---|---|---|---|---|---|---|
| specification-guardian | `anthropics/skills` → doc-coauthoring (kun prosess-inspirasjon) | ~0 %. Ingen ekstern skill kjenner mandatet (spec.md v14), kap. 2/3/34 eller våre invarianter | **SELV** | Nær kobling til requirements-traceability og scene-sync-invariants – avgrens tydelig | Skriv selv. Legg mandatets prinsipper i `references/`, ikke i SKILL.md. Instruks: sjekk endringer mot mandatet, flagg avvik, «ikke hevd uverifisert funksjonalitet» (mandat 33.x) | P0 – først |
| requirements-traceability | Ingen funnet | 0 % | **SELV** | Bruker krav-ID-ene fra kravuttrekket (EXTRACTION_BRIEF.md) | Skriv selv; `assets/` med kravregister-skjema (YAML), `scripts/` kun hvis lokalt og uten nett | P0 |
| architecture-guardian | `feature-dev` (code-architect-agent), `code-modernization` (Anthropic) | ~20 %: generisk arkitekturfase | **REF+TILPASS** | feature-dev har egen arkitekturfase – kan gi dobbel arkitekturvurdering | Skriv selv (lagdeling nettleser/backend/medietjenester, migreringsvei mot macOS/Windows, mandat 1542–1551). Bruk feature-dev som plugin for arbeidsflyt | P0 |
| lovable-development | `lovablelabs/mcp` (offisiell Lovable-plugin, i Anthropic-marketplace) | ~25 %: MCP-tilgang til Lovable-prosjekter (create/send_message/deploy/query_database). Dekker IKKE GitHub-sync-disiplin, prompt-skriving til Lovable, hva Lovable ikke bør gjøre | **REF+TILPASS** (pluginen er valgfri) | Pluginen kan bruke kreditter, publisere offentlig URL og kjøre SQL direkte mot prosjektets DB | Skriv egen skill for: Lovable↔GitHub-toveissync, filer Lovable eier, formulering av Lovable-instrukser (mandat 33.3). Installer Lovable-plugin bare hvis dere vil styre Lovable fra Claude Code – og da med manuell godkjenning av hvert verktøykall | P0 |
| design-system-director | `frontend-design` (Anthropic), `shadcn` (shadcn-ui/ui) | ~30 %: generell estetisk metode; shadcn: komponentbruk/semantiske tokens | **REF+TILPASS** | **frontend-design tvinger «distinkt, risikovillig» estetikk** («take aesthetic risk», unngå «SaaS-card kit») – kolliderer med et rolig, profesjonelt redigeringsverktøy med eget designsystem. shadcn-skill kjører `npx shadcn@latest info` ved lasting | Skriv egen skill som eier tokens/komponentregler. Bruk frontend-design kun som referanse (skrivestil for UI-tekst, kvalitetsgulv). Ikke installer begge samtidig uten at vår skill sier at den har forrang | P0 |
| ux-interaction-design | `web-design-guidelines` (Vercel), `frontend-design` (seksjon om UI-tekst) | ~25 %: generelle UI-regler (fokus, skjema, animasjon, tastatur) | **REF+TILPASS** | Vercel-skillen henter regler fra nett ved hver kjøring (upinnet) | Skriv selv (tidslinje-/redigeringsinteraksjoner, tastatursnarveier, angre/gjør om, drag på tidslinje). Kopier relevante regler fra web-interface-guidelines (MIT) inn i `references/` med kildeangivelse og pinnet versjon | P0 |
| react-typescript-engineering | `vercel-react-best-practices`, `vercel-composition-patterns` (Vercel Labs); `typescript-lsp` (Anthropic) | ~50 %: React-ytelse og komposisjon. Mye Next.js/RSC/server-innhold som ikke gjelder Vite-SPA | **REF+TILPASS** + **PLUGIN** (typescript-lsp) | react-best-practices er Next.js-tung (`next/dynamic`, server actions, `React.cache`). `name` (`vercel-react-best-practices`) ≠ mappenavn (`react-best-practices`) – bryter agentskills-spec | Skriv egen skill med Vite/SPA-filter; plukk relevante regler (async-, bundle-, rerender-, rendering-, js-) til `references/`. Installer `typescript-lsp` (krever `typescript-language-server` lokalt) | P0 |
| database-domain-modeling | `supabase-postgres-best-practices` + `supabase` (supabase/agent-skills); `supabase`-plugin (supabase-community) | ~50 % på Postgres/RLS/indekser; 0 % på vår domenemodell (manus, scene, sceneforekomst, scenevariant, karakter/utseende/stil) | **PLUGIN** (postgres-best-practices) + **SELV** (domenemodell) | Supabase-plugin gir MCP med SQL-tilgang til prosjektet; `supabase`-skillen instruerer agenten å hente changelog fra nett | Installer `supabase-postgres-best-practices` (ren veiledning). Skriv egen `database-domain-modeling` for domenet og migrasjonsregler. Vurder MCP-pluginen separat (kun mot dev-prosjekt, read-only) | P0 |
| screenplay-engineering | Ingen funnet | 0 % (Fountain/FDX-parsing, manusstruktur vs. teknisk genereringsstruktur, mandat 753) | **SELV** | Ingen | Skriv selv; Fountain-syntaks og eksempler i `references/`, testmanus i `assets/` | P0 |
| scene-sync-invariants | Ingen funnet | 0 % | **SELV** | Avgrens mot specification-guardian | Skriv selv; invariantliste (INV-xx) i `references/`, krav om test per invariant | P0 |
| test-quality-engineering | `pr-review-toolkit` (pr-test-analyzer), `webapp-testing` (anthropics/skills), `playwright-cli` (Microsoft), Playwright MCP | ~40 %: E2E-verktøy og testgap-analyse. Ingen dekker Vitest/RTL-konvensjoner eller våre invarianttester | **REF+TILPASS** + **PLUGIN** (pr-review-toolkit) | webapp-testing er Python-Playwright (vi er TS); playwright-cli krever global npm-installasjon; Playwright MCP kjører `npx @playwright/mcp@latest` (upinnet) | Skriv egen skill (Vitest + Testing Library + Playwright Test i TS, testpyramide, dataintegritetstester). Vurder `playwright-cli`-skill når E2E kommer | P0 |
| secure-development | `security-guidance` (Anthropic, v2.0.11), `supabase`-skillens sikkerhetssjekkliste, Semgrep-plugin | ~60 %: generelle sårbarhetsklasser + hooks; Supabase-RLS-feller | **PLUGIN** + **REF+TILPASS** | security-guidance kjører hooks (Python) på hver Edit/Write, ved Stop og ved `git commit`, og sender diff til Claude-API (kostnad, data forlater maskinen via API) | Installer security-guidance. Skriv tynn egen skill for prosjektregler: RLS på alle tabeller, ingen hemmeligheter i Lovable-frontend, opplasting av medier, AI-nøkler kun i Edge Functions | P0 |

### Støtte-skills

| Skill | Kandidatkilde(r) | Dekker | Status | Overlapp / konflikt | Anbefaling | Prioritet |
|---|---|---|---|---|---|---|
| git-version-control | `commit-commands` (Anthropic) | ~60 %: /commit, /commit-push-pr, branch-opprydding | **PLUGIN** + **REF+TILPASS** | /commit-push-pr oppretter branch/PR automatisk; Lovable skriver også til repoet (toveissync) → konfliktfare | Installer plugin. Skriv kort egen skill: branch-strategi mot Lovable-sync, commit-format, aldri force-push til branchen Lovable følger | Støtte – høy |
| documentation-maintenance | `claude-md-management` (Anthropic v1.0.0), doc-coauthoring (anthropics/skills) | ~40 %: CLAUDE.md-vedlikehold | **PLUGIN** + **SELV** | Ingen alvorlig | Installer claude-md-management. Skriv egen for ADR-er, kravsporing i docs, endringslogg | Støtte – middels |
| performance-profiling | `vercel-react-best-practices` (rerender-/rendering-regler), `web-quality-skills` (Addy Osmani, uoffisiell), `modern-web-guidance` (GoogleChrome) | ~30 %: web-ytelse generelt. Ingenting om tidslinje-/mediaavspilling, Web Audio, canvas, store manus | **REF+TILPASS** | web-quality-skills forutsetter Chrome DevTools MCP/Lighthouse; modern-web-guidance er CLI via `npx …@latest` (preview) | Skriv selv med fokus på tidslinje/avspilling; referer regler | Støtte – middels |
| accessibility-audit | `web-design-guidelines` (Vercel), `accessibility` i addyosmani/web-quality-skills (WCAG 2.2, MIT, uoffisiell) | ~60 % av generell WCAG-sjekk | **REF+TILPASS** | Ingen offisiell W3C/Deque-skill funnet | Skriv egen skill som pinner WCAG 2.2 AA-krav relevant for redigeringsverktøy (tastaturdrevet tidslinje, fokus, kontrast, reduced motion); bruk de to som referanse | Støtte – middels |
| release-readiness | `code-review` (Anthropic), `pr-review-toolkit` (Anthropic) | ~30 % (review), 0 % sjekkliste for release | **REF+TILPASS** | code-review poster kommentar på PR via `gh` | Skriv egen sjekkliste-skill (tester grønne, migrasjoner, RLS, invarianter, endringslogg) som kaller review-pluginene | Støtte – lav/middels |
| skill-library-maintenance | `skill-creator` (Anthropic, både i claude-plugins-official og anthropics/skills), `plugin-dev` (skill-development) | ~70 %: lage/forbedre/evaluere skills | **PLUGIN** + **REF+TILPASS** | skill-creator kjører Python-skript for eval/benchmark | Installer skill-creator. Skriv tynn egen skill med husregler (navn, versjonering, eier, review-syklus, `skills-ref validate`) | Støtte – høy (trengs tidlig) |

### Ekstra plugins som anbefales uten egen planlagt skill

| Plugin | Hvorfor |
|---|---|
| `feature-dev` (Anthropic) | 7-fasers arbeidsflyt (discovery → utforskning → spørsmål → arkitektur → implementering → review). Passer Mars sin regel om ikke å starte koding før «OK» |
| `code-review` (Anthropic) | Bruker CLAUDE.md som regelgrunnlag → våre skills/CLAUDE.md blir automatisk review-kriterier |
| `typescript-lsp` (Anthropic) | Typeinformasjon/go-to-definition for Claude Code |

---

## 2. Detaljert F1-vurdering per ekstern kandidat

Felles for alle Anthropic-plugins i `anthropics/claude-plugins-official`:
- **Repo:** https://github.com/anthropics/claude-plugins-official – offisiell Anthropic-org.
- **Lisens:** Apache-2.0 (rot-`LICENSE` og egen `LICENSE` i hver plugin-mappe sjekket for frontend-design, skill-creator, security-guidance; LICENSE-fil (HTTP 200) finnes for alle sjekkede interne plugins).
- **Commit-dato/SHA:** ikke verifisert (se kap. 0). Innhold lest fra `main` 2026-10-08.
- README-advarsel (sitat): "Make sure you trust a plugin before installing, updating, or using it. Anthropic does not control what MCP servers, files, or other software are included in plugins…" – gjelder særlig `external_plugins`.

### 2.1 frontend-design (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design (identisk SKILL.md også i https://github.com/anthropics/skills/tree/main/skills/frontend-design)
- Utgiver/autentisitet: Anthropic, offisiell. Lisens: Apache-2.0 (`license: Complete terms in LICENSE.txt`).
- Versjon: ingen versjonsfelt.
- Kodekjøring: nei (ren instruksjon). Hemmeligheter: nei.
- Dekker: designprosess (tokenplan → selvkritikk → bygg), typografi, motion-prinsipper, UI-tekst/mikrocopy, kvalitetsgulv (responsivt, synlig fokus, reduced motion).
- **Konflikt:** Persona «design lead at a design studio … take aesthetic risk», mål om at hver design er distinkt. Vi trenger et konsistent, rolig produktverktøy med eget designsystem. Skillen sier riktignok "Where the brief pins down a visual direction, follow it exactly", men trigges bredt («building new UI»). Risiko for at Claude «redesigner» etablerte komponenter.
- Vurdering: **referanse**, ikke plugin – eller installer kun med vår design-system-director som eksplisitt brief.

### 2.2 skill-creator (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/skill-creator og https://github.com/anthropics/skills/tree/main/skills/skill-creator
- Lisens: Apache-2.0. Versjon: ikke oppgitt.
- Kodekjøring: **ja** – eval/benchmark og beskrivelsesoptimalisering via Python-skript (f.eks. `eval-viewer/generate_review.py`), og kjører Claude med skillen på testprompts (forbruker tokens). Hemmeligheter: ingen eksplisitte krav utover vanlig Claude-tilgang.
- Dekker: hele livsløpet for å skrive/forbedre/teste skills og optimalisere `description`-triggere.
- Konflikt: ingen. Merk at skillen er laget for et bredt publikum (forklarer «for plumbers…») – OK.
- Vurdering: **plugin** (Støtte: skill-library-maintenance).

### 2.3 plugin-dev (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/plugin-dev
- Lisens: Apache-2.0. Kodekjøring: ja (valideringsskript `validate-agent.sh`, `validate-hook-schema.sh` m.fl.).
- Dekker: 7 skills (hooks, MCP, plugin-struktur, settings, kommandoer, agenter, **skill-development**).
- Vurdering: kun referanse – vi lager prosjektskills, ikke plugins. Unødvendig å installere med skill-creator på plass.

### 2.4 feature-dev (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev
- Lisens: Apache-2.0. Kodekjøring: nei utover vanlige Claude Code-verktøy (agenter: utforsker, arkitekt, reviewer).
- Dekker: 7-fasers strukturert funksjonsutvikling, avklarende spørsmål før koding.
- Konflikt: lite; overlapper architecture-guardian (arkitekturfasen). La vår skill levere *innholdet* (regler), feature-dev *prosessen*.
- Vurdering: **plugin**.

### 2.5 code-review (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-review
- Lisens: Apache-2.0. Kodekjøring: bruker `gh` og git blame; **poster kommentar på PR** (krever autentisert `gh`).
- Dekker: 4 parallelle agenter, CLAUDE.md-etterlevelse, bugs, historikk; terskel 80/100.
- Vurdering: **plugin** (release-readiness bygger på den).

### 2.6 pr-review-toolkit (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit
- Lisens: Apache-2.0. Kodekjøring: nei (agenter).
- Dekker: 6 agenter – comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design, kodekvalitet, forenkling.
- Vurdering: **plugin** (test-quality-engineering, react-typescript-engineering).

### 2.7 security-guidance (Anthropic, v2.0.11)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance
- Forfatter: David Dworken (Anthropic). Lisens: Apache-2.0. Versjon: 2.0.11 (plugin.json).
- Kodekjøring: **ja** – hooks i Python 3.8+ på Edit/Write (regex), på Stop (LLM-diffreview) og ved `git commit`/push (agentisk reviewer via SDK). Krever Claude Code ≥ v2.1.144.
- Hemmeligheter/data: bruker eksisterende API-tilgang; **sender diffen til Claude-API** for review (ekstra tokenkostnad). Leser ikke `.env` eksplisitt i følge README; den *flagger* hardkodede hemmeligheter.
- Dekker: injeksjon, XSS, SSRF, hardkodede hemmeligheter, IDOR, auth-bypass, deserialisering, path traversal m.m.
- Konflikt: Stop-hook kan forstyrre fler-agent-oppsett (README anbefaler `ENABLE_STOP_REVIEW=0` der). Kan gi støy på Lovable-genererte endringer.
- Vurdering: **plugin** + tynn prosjektskill.

### 2.8 typescript-lsp (Anthropic, v1.0.0)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/typescript-lsp
- Lisens: Apache-2.0. Kodekjøring: starter `typescript-language-server --stdio` (må installeres globalt med npm).
- Vurdering: **plugin**.

### 2.9 commit-commands (Anthropic)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/commit-commands
- Lisens: Apache-2.0. Kodekjøring: git og `gh pr create`. README: "Avoids committing files with secrets (.env, credentials.json)".
- Konflikt: `/commit-push-pr` lager branch og pusher automatisk – må avstemmes mot Lovables GitHub-sync.
- Vurdering: **plugin** + egen git-skill med Lovable-regler.

### 2.10 claude-md-management (Anthropic, v1.0.0)
- Lenke: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-md-management
- Forfatter: Isabella He (Anthropic). Lisens: Apache-2.0. Kodekjøring: nei.
- Vurdering: **plugin** (documentation-maintenance).

### 2.11 Lovable-plugin (lovablelabs/mcp, v0.1.0)
- Lenke: https://github.com/lovablelabs/mcp – Anthropic-marketplace pinner SHA **0336e6db8026b0f02cb89d1451cc48ea3f469791**.
- Utgiver: Lovable (org `lovablelabs`, oppført med `author: Lovable`, homepage lovable.dev). Sannsynlig autentisk; org-verifisering ikke mulig uten github.com-tilgang.
- Lisens: Apache-2.0 (LICENSE + plugin.json).
- Kodekjøring: lokal kode – kun kommandofiler (`commands/build.md`, `commands/iterate.md` funnet); MCP-serveren er fjern (`https://mcp.lovable.dev`, OAuth 2.1).
- Hemmeligheter/risiko: OAuth-token mot Lovable-kontoen. README (sitat): "`create_project` and `send_message` consume Lovable build credits. `deploy_project` publishes a public URL. `query_database` runs SQL directly against your project's database."
- Dekker: styring av Lovable fra Claude Code. Dekker ikke utviklingsdisiplin rundt Lovable+GitHub.
- Vurdering: valgfri **plugin**; vår egen `lovable-development` er nødvendig uansett.

### 2.12 Playwright (Microsoft)
- (a) Playwright MCP via Anthropic-marketplace: https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/playwright – `.mcp.json` kjører `npx @playwright/mcp@latest` (**upinnet versjon**). Upstream https://github.com/microsoft/playwright-mcp, Apache-2.0.
- (b) playwright-cli-skill: https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md – offisiell Microsoft-org, Apache-2.0. Krever `npm install -g @playwright/cli@latest`; `allowed-tools: Bash(playwright-cli:*) Bash(npx playwright:*) …` (forhåndsgodkjenner kommandoer). README anbefaler CLI framfor MCP for kodeagenter (token-effektivt).
- Hemmeligheter: nei. Risiko: nettleserautomasjon mot vilkårlige URL-er.
- Vurdering: referanse nå; installer playwright-cli når E2E-fasen starter, med pinnet versjon.

### 2.13 webapp-testing (anthropics/skills)
- Lenke: https://github.com/anthropics/skills/tree/main/skills/webapp-testing – Anthropic, Apache-2.0 (LICENSE.txt i skill-mappen).
- Kodekjøring: **ja**, Python-Playwright og `scripts/with_server.py`; instruerer «run scripts with --help first … DO NOT read the source». (I strid med vår praksis om å lese kode før kjøring.)
- Konflikt: Python, ikke TypeScript. README: "provided for demonstration and educational purposes only".
- Vurdering: kun referanse (reconnaissance-then-action-mønsteret er nyttig).

### 2.14 doc-coauthoring (anthropics/skills)
- Lenke: https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring. Lisensfil i skill-mappen ga 404; repoet har ingen rot-LICENSE (kun THIRD_PARTY_NOTICES.md). README: "Many skills in this repo are open source (Apache 2.0)" – **lisens for akkurat denne skillen er uverifisert**.
- Vurdering: kun inspirasjon (prosess for spesifikasjonsarbeid), ikke kopier tekst.

### 2.15 Vercel Labs agent-skills
- Repo: https://github.com/vercel-labs/agent-skills – org `vercel-labs` (Vercels eksperiment-org; ikke `vercel`). README: "License: MIT"; **ingen LICENSE-fil på rot** (LICENSE og LICENSE.md ga 404). SKILL.md-ene har `license: MIT`. Versjon: `metadata.version: "1.0.0"`. Commit/SHA: uverifisert. Installasjon anbefalt via `npx skills add vercel-labs/agent-skills` (ikke kjørt).
- **react-best-practices** (https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
  - Kodekjøring: nei (regler i markdown). Hemmeligheter: nei.
  - Dekker: 70 regler i 8 kategorier (waterfalls, bundle, server, klient-fetching, re-render, rendering, JS, avansert).
  - Konflikt: **Next.js-orientert** (server-, RSC-, `next/dynamic`-regler gjelder ikke Vite-SPA). **Spec-brudd:** `name: vercel-react-best-practices` matcher ikke mappenavnet `react-best-practices` (agentskills.io: "Must match the parent directory name").
  - Vurdering: referanse; plukk SPA-relevante regler til vår skill med kildeangivelse (MIT krever at lisensteksten følger med ved kopiering).
- **composition-patterns** – samme vurdering; nyttig for komponent-API-er (compound components, unngå boolske props). Også her `name` (`vercel-composition-patterns`) ≠ mappenavn.
- **web-design-guidelines** (https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines)
  - **Henter regler fra nett ved hver kjøring**: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` (upinnet `main`). Innholdet styrer agenten → forsyningskjede-/promptinjeksjonsrisiko og ikke-reproduserbare reviews. web-interface-guidelines er MIT.
  - Dekker: 100+ regler for a11y, fokus, skjema, animasjon, typografi, bilder, ytelse, URL-tilstand, dark mode, i18n.
  - Vurdering: referanse; vendor-kopier `command.md` på en kjent commit inn i `references/` i vår ux-/a11y-skill.
- Øvrige (vercel-optimize, vercel-deploy-claimable, react-native-guidelines, writing-guidelines, react-view-transitions): ikke relevante (Vercel-hosting/React Native/Next.js) – vercel-deploy-claimable laster opp prosjektet til tredjepart og bør unngås.

### 2.16 Supabase
- **supabase/agent-skills** – https://github.com/supabase/agent-skills – offisiell `supabase`-org. Lisens: **MIT** (LICENSE, «Copyright (c) 2026 Supabase»).
  - `supabase-postgres-best-practices` (v1.1.1, «date: January 2026», `license: MIT`): ren veiledning – query, connection, **Security & RLS**, schema, låsing. Kodekjøring: nei (regelfiler). → **plugin/installer**.
  - `supabase` (v0.1.2): bred produktveiledning + sikkerhetssjekkliste (RLS i eksponerte skjema, aldri `user_metadata` i autorisasjon, m.m.). Instruerer agenten til å **hente `https://supabase.com/changelog.md` ved bruk** og verifisere med testspørringer (kan innebære SQL mot DB via CLI/MCP). → installer med bevissthet, eller bruk som referanse.
  - Konflikt: eksemplene er Next.js/SSR-tunge, men dekker også React generelt.
- **supabase-community/supabase-plugin** – https://github.com/supabase-community/supabase-plugin – marketplace-pinnet SHA **f3f332e0164c34a8392772811737fda0cb972d06**. README kaller seg "Official Supabase plugin distribution repo", men ligger i `supabase-community`-org. **LICENSE-fil ikke funnet (404)** – lisens uverifisert. Bundler MCP (SQL, auth, storage) + de to skillsene over (synkronisert fra supabase/agent-skills).
  - Hemmeligheter: MCP-tilgang til Supabase-prosjekt (token). Risiko: agenten kan kjøre SQL mot prosjektet.
  - Vurdering: foretrekk skillsene direkte fra `supabase/agent-skills` (klar MIT-lisens); MCP kun mot dev-prosjekt.

### 2.17 shadcn (shadcn-ui/ui)
- Lenke: https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md – offisielt shadcn-repo, MIT (LICENSE.md).
- Kodekjøring: **ja, automatisk ved lasting** – dynamisk kontekst `` !`npx shadcn@latest info --json` `` (upinnet npm-pakke kjøres hver gang skillen aktiveres); `allowed-tools` forhåndsgodkjenner `npx shadcn@latest *`. Bruker Claude Code-feltet `user-invocable: false`; `allowed-tools` er kommaseparert (spesifikasjonen sier mellomromsseparert).
- Dekker: bruk av eksisterende shadcn-komponenter, varianter, semantiske farger (`bg-primary`, aldri `bg-blue-500`) – svært relevant for Lovable-prosjekter (Lovable bruker shadcn/ui).
- Vurdering: **referanse** for design-system-director (prinsippene er gode); ikke installer før dere aksepterer auto-kjøring av `npx`.

### 2.18 Tilgjengelighet / WCAG
- **Ingen offisiell W3C-, WAI- eller Deque-skill funnet** (WebSearch 2026-10-08 ga bare community-registre: tessl.io, vibeindex.ai, claudskills.com, claudemarketplaces.com m.fl.).
- **addyosmani/web-quality-skills** – https://github.com/addyosmani/web-quality-skills – MIT. README sier selv "(unofficial)". `accessibility`-skill (v2.0) baserer seg på WCAG 2.2 og Lighthouse; full verdi krever Chrome DevTools MCP. Personlig repo (Addy Osmani), ikke Google-org. → referanse.
- **GoogleChrome/modern-web-guidance** – https://github.com/GoogleChrome/modern-web-guidance – offisiell GoogleChrome-org, Apache-2.0, i Anthropic-marketplace (SHA 22ab18dfb50a5d7e3bdcf471c14076a5534eae4e). "Preview release". Kjører via `npx modern-web-guidance@latest` (upinnet). Dekker moderne plattform-API-er, ytelse og a11y. → referanse; vurder senere.
- Primærkilde for vår egen skill bør være WCAG 2.2 selv (https://www.w3.org/TR/WCAG22/) – ikke hentet i denne runden.

### 2.19 Andre funn i marketplacen (ikke anbefalt nå)
- `semgrep` (semgrep/mcp-marketplace, SHA f97e1ce4…): SAST via MCP – alternativ/supplement til security-guidance; krever Semgrep-konto/CLI.
- `superpowers` (obra/superpowers, SHA 5bf4e780…): TDD/brainstorming-arbeidsflyt, tredjepart (personlig) – overlapper feature-dev.
- `hyperframes` (HeyGen, SHA 8d2b6e7b…): HTML→video-rendering – potensielt interessant for animatic-eksport senere, ikke vurdert i dybden.
- `figma` (figma/mcp-server-guide): designtokens fra Figma – relevant hvis designsystemet lever i Figma.

---

## 3. Anbefalt installasjonsrekkefølge (når Mars gir OK)

1. **Plugins nå:** skill-creator, feature-dev, typescript-lsp, commit-commands, claude-md-management, security-guidance, code-review, pr-review-toolkit.
2. **Skills fra tredjepart nå:** `supabase-postgres-best-practices` (supabase/agent-skills, MIT) – kopier inn i `.claude/skills/` på pinnet commit, eller installer via deres marketplace.
3. **Skriv selv først (P0, i denne rekkefølgen):** specification-guardian → scene-sync-invariants → requirements-traceability → architecture-guardian → lovable-development → screenplay-engineering → database-domain-modeling → design-system-director → react-typescript-engineering → ux-interaction-design → test-quality-engineering → secure-development.
4. **Senere:** playwright-cli (E2E-fasen), Lovable-plugin (hvis ønskelig), Supabase MCP (dev-prosjekt), accessibility-audit/performance-profiling egne skills.

## 4. Generelle forholdsregler

- Pinn alltid en commit-SHA når eksterne skills kopieres inn; lagre opphav i `metadata` (f.eks. `metadata.source`, `metadata.source-sha`, `metadata.license`).
- Ved kopiering av MIT/Apache-tekst: ta med lisenstekst/NOTICE i skill-mappen.
- Unngå skills som (a) henter instruksjoner fra nett ved kjøring (web-design-guidelines, delvis supabase), (b) kjører upinnede `npx …@latest` automatisk (shadcn, Playwright MCP, modern-web-guidance) – med mindre dette er et bevisst valg.
- Ingen kandidat ba om tilgang til `.env` eller andre hemmelighetsfiler. MCP-baserte plugins (Lovable, Supabase) krever OAuth/tokens mot tjenesten – det er den reelle hemmelighetsrisikoen.
- Hold skill-triggere smale: flere brede «UI»-skills (frontend-design, web-design-guidelines, shadcn, vår design-system-director) vil konkurrere om de samme forespørslene.
