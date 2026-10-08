# Lovable + Supabase – researchnotater for Animatic Studio

Research utført 2026-10-08. Kilder er hentet fra `docs.lovable.dev` (via `.md`-varianter og `llms.txt`), `supabase.com/docs`, Lovables offisielle blogg og Cloudflare-dokumentasjon.

**Merking:**
- **[VERIFISERT]** = står eksplisitt i offisiell dokumentasjon (lenke oppgitt).
- **[DELVIS]** = antydet i offisiell kilde, men ikke uttrykt direkte, eller kun i blogg (ikke docs).
- **[UVERIFISERT]** = ikke funnet i offisiell dokumentasjon; antakelse eller tredjepartskilde. Må testes i praksis.

Indeks over alle Lovable-dokumentasjonssider: https://docs.lovable.dev/llms.txt

---

## 1. Teknologistakk og backend

### Frontend/rammeverk
- **[VERIFISERT]** Nye Lovable-apper opprettet fra **13. mai 2026** (22. juni 2026 for Enterprise) bruker **TanStack Start** med server-side rendering (SSR). Eldre apper bruker **React + Vite** og rendrer i nettleseren. «Lovable does not offer a choice of framework or database.»
  – https://docs.lovable.dev/introduction/faq.md
  – https://docs.lovable.dev/features/upgrade-to-tanstack-start.md
- **[VERIFISERT]** TanStack Start-prosjekter har `@tanstack/react-start` i `package.json`, bygges med `@lovable.dev/vite-tanstack-config` (altså fortsatt Vite under panseret) og pakker serveren med **Nitro**. Byggkommando `npm run build`, Node.js 22 anbefalt. Eldre React + Vite-apper bruker **React Router (BrowserRouter)** og bygger til `dist/`.
  – https://docs.lovable.dev/tips-tricks/external-deployment-hosting.md
- **[DELVIS]** Routing i TanStack Start = **TanStack Router** (Lovable-bloggen, 1. juni 2026: «TanStack Start (TanStack Router)»). Design-system-siden nevner mappene `src/routes/` og `src/pages/`.
  – https://lovable.dev/blog/building-apps-using-tanstack-start
  – https://docs.lovable.dev/features/design-systems.md
- **[DELVIS]** **TypeScript**: ikke sagt eksplisitt, men alle eksempler bruker `.ts/.tsx` (code-mode, design-systems).
- **[DELVIS]** **Tailwind**: design-system-siden nevner Tailwind 3 vs. 4 og `tailwind.config`, men sier ikke eksplisitt at Lovable-prosjekter bruker Tailwind som standard.
- **[UVERIFISERT]** **shadcn/ui**: nevnes ikke i noen av de offisielle sidene jeg leste. Det er allment kjent (og ses i genererte repoer) at Lovable bruker shadcn/ui + Radix + Tailwind, men dette er ikke dokumentert i dagens docs. Bør bekreftes ved å se på `package.json`/`components.json` i det første genererte repoet.
- **[VERIFISERT]** Eldre apper kan oppgraderes til TanStack Start (valgfritt, typisk 10–35 kreditter, kan reverteres via historikk). Advarsel: rene nettleserbiblioteker kan knekke SSR.
  – https://docs.lovable.dev/features/upgrade-to-tanstack-start.md

> **Konsekvens for Animatic Studio:** Et nytt prosjekt blir TanStack Start + SSR. Tunge nettleser-biblioteker (f.eks. canvas/WebGL-tidslinje, ffmpeg.wasm, Web Audio) må lastes kun på klientsiden for ikke å knekke SSR.

### Serverlogikk: server functions vs. Edge Functions
- **[VERIFISERT]** For direkte API-integrasjoner får nye TanStack Start-apper en **server function**; eldre React + Vite-apper får en «Edge Function in Cloud».
  – https://docs.lovable.dev/integrations/any-api.md
- **[DELVIS]** Lovable-bloggen oppgir at TanStack Start-apper publiseres som **Cloudflare Worker**, og at server-hemmeligheter injiseres som bindings ved forespørsel. (Blogg, ikke docs.)
  – https://lovable.dev/blog/building-apps-using-tanstack-start
- **[VERIFISERT]** Cloud-prosjekter har Edge Functions i `supabase/functions/` og migrasjoner i `supabase/migrations/` og `drizzle/migrations/`.
  – https://docs.lovable.dev/integrations/git-sync-overview.md

### Lovable Cloud vs. egen Supabase
- **[VERIFISERT]** **Lovable Cloud** = innebygd backend (database, auth, storage, realtime, edge functions, AI), bygget på Supabases åpen kildekode-fundament. Docs kaller Cloud «the default choice for most projects». Ved nytt prosjekt velger man Cloud *eller* Supabase.
  – https://docs.lovable.dev/features/cloud.md
- **[VERIFISERT]** Forskjeller (fra Supabase-integrasjonssiden):
  | | Lovable Cloud | Egen Supabase |
  |---|---|---|
  | Oppsett | Automatisk, ingen egen konto | Egen Supabase-konto/prosjekt |
  | Fakturering | Lovable-kreditter («Run credits») | Supabase-plan |
  | Administrasjon | Cloud-visning i Lovable | Supabase-dashboard |
  | Infrastruktur | Lovable styrer backup, instansstørrelse, pausing | Du styrer selv |
  – https://docs.lovable.dev/integrations/supabase.md
- **[VERIFISERT]** Funksjoner som **krever Cloud**: backend-visninger i editoren, administrerte backups/pausing/resizing, auth-e-post fra eget domene, administrert Google-auth og SAML SSO, innlogget nettlesertesting, sensitive-data-skanning, (innebygde betalinger på eldre Vite-apper).
- **[VERIFISERT]** **Ingen automatisk bytte** i noen retning. Migrering Supabase → Cloud støttes ikke; Cloud → Supabase krever eksport, nytt Lovable-prosjekt og gjenoppbygging av skjema. «Decide early.» Region kan ikke endres etter at Cloud er slått på. Fjerning av Cloud sletter instansen permanent.
  – https://docs.lovable.dev/features/cloud.md
- **[VERIFISERT]** Én Lovable-prosjekt ↔ ett Supabase-prosjekt. Deling av ett Supabase-prosjekt mellom flere Lovable-prosjekter fører til at de overskriver hverandres secrets (inkl. `LOVABLE_API_KEY`).
- **[VERIFISERT]** Cloud-database: én backup per dag, ca. 14 dagers oppbevaring; backup omfatter ikke Storage-filer. Instansstørrelser Tiny → X-Large (betalte planer), min. 8 GB databaselagring, kan bare økes.
  – https://docs.lovable.dev/features/database.md
  – https://docs.lovable.dev/features/advanced-settings.md
- **[UVERIFISERT]** Om man får direkte tilgang til det underliggende Supabase-dashboardet i Cloud – nevnes ikke (det impliseres at man *ikke* gjør det, siden «full dashboard access» er en grunn til å velge egen Supabase).

> **Vurdering (ikke fra docs):** Egen Supabase gir full kontroll (dashboard, CLI, egne cron/pg_net, Supabase-grenser som 500 GB filer på Pro) og enklere samspill med eksterne render-tjenester og Claude Code. Cloud gir raskest start og flest Lovable-integrerte funksjoner. Valget må tas før backend aktiveres.

---

## 2. GitHub-synk
Kilder: https://docs.lovable.dev/integrations/github.md og https://docs.lovable.dev/integrations/git-sync-overview.md

- **[VERIFISERT]** To lag: *workspace-tilkobling* (autoriserer Lovable GitHub-appen for en personlig konto eller organisasjon) + *prosjektlenke* (ett prosjekt ↔ ett repo).
- **[VERIFISERT]** Tilkobling **oppretter et nytt repo**. Repoet er **privat som standard** på alle planer. Git-synk finnes på alle planer (også Free).
- **[VERIFISERT]** **Kun eksport**: man kan *ikke* importere/koble til et eksisterende repo. Etter frakobling kan man ikke koble til samme repo igjen – reconnect lager et nytt repo.
  → **Konsekvens:** Start i Lovable, la Lovable lage repoet, og legg deretter `docs/` og `.claude/skills/` inn via Claude Code.
- **[VERIFISERT]** **Toveis synk**: Lovable committer til repoet; commits pushet til den synkede grenen dukker opp i Lovable. Synkede commits går gjennom samme sjekker som endringer i appen (inkl. avhengighetsrevisjon).
- **[VERIFISERT]** **Én gren om gangen**, standard er repoets default-gren (vanligvis `main`). Grener kan byttes/opprettes fra grenvelgeren (ny gren forkes fra *aktiv* gren). Commits på andre grener vises ikke før de merges inn.
- **[VERIFISERT]** Anbefaling: jobb lokalt på feature-grener; **ikke force-push, rebase eller squash** commits som allerede ligger på den synkede grenen.
- **[VERIFISERT]** Pull skjer via GitHub push-webhook. Går den tapt, vises «GitHub ahead»; løsning er å pushe en ny commit (gjerne tom). «Reconnect»/«Re-check» henter ikke manglende commits.
- **[VERIFISERT]** **Konflikter/divergens:** Hvis Lovable og GitHub har divergert, pusher Lovable til grenen `lovable-sync` (videre konflikter: `lovable-sync-<timestamp>`), og neste synk fra GitHub *erstatter* Lovables versjon av grenen. Lovable tar backup først; prosjekteier kan gjenopprette i 24 timer (Project settings → Git). Beskyttet gren på GitHub → Lovables push avvises og havner i `lovable-sync`.
- **[VERIFISERT]** Sletter man synket gren på GitHub, flytter Lovable prosjektet til `lovable-fallback`. **Ikke slett repoet** – da stopper synken. Rename av repo/org følges.
- **[VERIFISERT]** Commits fra Lovable signeres som `lovable-dev[bot]`, medtilskrevet medlemmet som utløste dem.
- **[VERIFISERT]** **Filstørrelser:** GitHub avviser filer > **100 MB**. Lovable kan ikke *lagre* filer > **10 MB** i prosjektet; større filer pushet fra datamaskin kan synke inn, men Lovable kan ikke redigere dem. For store mediefiler foreslås migrering til CDN-assets.
- **[VERIFISERT]** Lovable-appen ber om **Workflows (write)**-tillatelse, dvs. den kan håndtere `.github/workflows`-filer. Hvordan Actions samspiller med synken er ikke beskrevet.
- **[VERIFISERT]** Lovable **deployer ikke** endrede Edge Functions og **kjører ikke** migrasjonsfiler som kommer inn via Git. Functions deployes fra chat/Edge functions-siden; migrasjoner lages fra chat/SQL-editor.
  → **Viktig for Claude Code:** Endringer Claude Code gjør i `supabase/functions/` eller `supabase/migrations/` må eksplisitt deployes/kjøres via Lovable (eller via Supabase CLI hvis egen Supabase).
- **[VERIFISERT]** `.env` med `VITE_`-variabler skal **committes** (å gitignore den knekker preview/publisering). Secrets ligger ikke i repoet.
  – https://docs.lovable.dev/features/secrets.md
- **[VERIFISERT]** Drafts synkes ikke som grener; koden når repoet først når draften aksepteres.
- **[VERIFISERT]** Lovable leser `.lovable/plan.md` og lagrer godkjente planer i `.lovable/plan/` (Plan mode) – altså skriver Lovable selv filer utenfor `src/`.
  – https://docs.lovable.dev/features/plan-mode.md
- **[UVERIFISERT]** Hva Lovable gjør med filer den ikke selv har laget (`docs/`, `.claude/`, `.github/workflows`): dokumentasjonen sier ingenting eksplisitt. Den sier at alt som pushes til synket gren synkes inn, og at Lovable leser `AGENTS.md`/`CLAUDE.md` fra repoet – så det er sannsynlig at slike filer bevares og er synlige for agenten. **Må testes:** push `docs/` og `.claude/skills/` og bekreft at de overlever noen Lovable-runder.
- **[UVERIFISERT]** Håndtering av lockfiler og binærfiler – ikke dokumentert.

---

## 3. Leser Lovable filer i repoet som instruksjoner? Knowledge
Kilde: https://docs.lovable.dev/features/knowledge.md

- **[VERIFISERT]** **Ja.** Sitat: «Instruction files such as `AGENTS.md` or `CLAUDE.md` can also provide guidance to the Lovable agent.» og «root-level `AGENTS.md` files are always read by the Lovable agent regardless of session length.»
  - Merk forskjellen: **rot-`AGENTS.md` leses alltid**; `CLAUDE.md` nevnes som en fil agenten «ser på», men uten samme garanti.
  - **[UVERIFISERT]** Nøstede `AGENTS.md` i undermapper – ikke omtalt.
- **[VERIFISERT]** **Project knowledge**: kontekst for ett prosjekt (formål, personas, DB-skjema, arkitektur, domenebegreper). Maks **10 000 tegn**. Kan redigeres av alle med edit-tilgang (Project settings → Knowledge).
- **[VERIFISERT]** **Workspace knowledge**: felles regler for alle prosjekter i workspace (kodestandard, foretrukne biblioteker, tone). Maks **10 000 tegn**. Kun owners/admins kan redigere.
- **[VERIFISERT]** Ved konflikt prioriteres **project knowledge** (over workspace knowledge og, slik teksten leses, over repo-instruksjonsfiler). I svært lange samtaler følges instruksjoner ikke alltid konsekvent.
- **[VERIFISERT]** Beste praksis: spesifikt, kort, punktlister, skrevet som onboarding-dokumentasjon, oppdateres når stacken endres.
- **[VERIFISERT]** **Skills i Lovable**: workspace-nivå, `SKILL.md`-format som «follows the Agent Skills convention used by Anthropic's Claude». Lastes kun når forespørselen matcher beskrivelsen (eller `/skill-name`). Grenser: navn 1–64 tegn (små bokstaver/tall/bindestrek), `SKILL.md` ≤ 100 000 tegn, arkiv ≤ 50 MB, vedlegg ≤ 1 MB hver / 200 filer / 10 MB totalt. Kan **importeres fra et GitHub-repo eller en undermappe**, eller som `.zip`/`.skill`. Kun owners/admins kan opprette/importere.
  – https://docs.lovable.dev/features/skills.md
- **[UVERIFISERT]** At Lovable automatisk leser `.claude/skills/` i repoet: **ikke dokumentert** – skills lagres «in your workspace», ingen filsti nevnes. Men siden formatet er likt, kan samme `SKILL.md`-mapper importeres manuelt fra repoet (import fra GitHub-undermappe er dokumentert).
- **[UVERIFISERT]** `.lovable/`-mappe som instruksjonskilde: ikke nevnt i knowledge-docs (kun brukt for plan-filer).

> **Anbefalt oppsett (vurdering):** Rot-`AGENTS.md` = kort felles «grunnlov» for både Lovable og Claude Code (peker til `docs/`). `CLAUDE.md` kan peke til `AGENTS.md`. Viktigste Lovable-spesifikke regler i Project knowledge (≤10 000 tegn, høyest prioritet). `.claude/skills/` brukes av Claude Code; utvalgte skills importeres til Lovable-workspace fra GitHub-undermappe.

---

## 4. Relevante Lovable-funksjoner

### Edge Functions
- **[VERIFISERT]** Kjører på Lovables servere, skaleres automatisk, skrives/deployes via chat. Leser API-nøkler fra project secrets. Logger og statistikk under More → Cloud → Edge functions. Utilgjengelige når prosjektet er pauset. Gjentakende oppgaver hører hjemme i **Jobs**.
  – https://docs.lovable.dev/features/edge-functions.md
- **[UVERIFISERT]** Runtime (Deno) og tidsgrenser/minne for Edge Functions i Lovable Cloud: **ikke oppgitt i Lovable-docs**. Siden filene ligger i `supabase/functions/` er det sannsynlig at Supabase Edge Functions-grensene gjelder (se pkt. 5).

### Autentisering
- **[VERIFISERT]** E-post (standard; bekreftelse, passordregler, engangskoder), telefon/SMS (egen leverandør), **Google**, Apple, Microsoft (administrert modus uten oppsett, eller egne OAuth-credentials), SAML SSO, anonyme brukere. Brukervisning med «Send invitation» og «Create new user». Mulig å skru av nye registreringer.
  – https://docs.lovable.dev/features/authentication.md
  – https://docs.lovable.dev/features/google-auth.md

### Roller og RLS
- **[VERIFISERT]** Lovable setter opp grunnleggende RLS-policyer automatisk for funksjoner som lagrer brukerdata; policy-visningen er skrivebeskyttet, endringer gjøres via chat. Filtrerbar på Tables/Storage/Realtime.
  – https://docs.lovable.dev/features/database.md
- **[VERIFISERT]** Roller/tilganger må sjekkes server-side; «Frontend code should never make security decisions.» Service role omgår RLS, så slik kode må sjekke tilgang selv. Typiske mønstre: personlige data, team-basert, organisasjonsbasert.
  – https://docs.lovable.dev/tips-tricks/security-best-practices.md
- **[UVERIFISERT]** Lovable-docs beskriver ikke et eget `user_roles`-tabellmønster eller security definer-funksjoner – se Supabase-mønstre i pkt. 7.

### Storage
- **[VERIFISERT]** Bøtter er **private som standard** (RLS-styrt); offentlige bøtter er blokkert som standard på workspace-nivå. Standard maks filstørrelse **2 GB**, kan justeres opp til **5 GB** (More → Cloud → Storage). Signerte URL-er for private filer utløper etter 1 time (fra «Copy URL»). Forhåndsvisning av video/lyd/bilde.
  – https://docs.lovable.dev/features/storage.md
- **[VERIFISERT]** Storage-filer inngår ikke i databasebackup og koster kreditter også når prosjektet er pauset.
- **[UVERIFISERT]** Total lagringsgrense og CDN – ikke oppgitt.

### Bakgrunnsjobber / cron / langvarige jobber
- **[VERIFISERT]** **Jobs** = planlagte bakgrunnsoppgaver i Cloud, opprettes via chat (eller SQL), vises under More → Cloud → Jobs med kjørehistorikk. Hver kjøring bruker Cloud-kreditter. Jobs hindrer auto-pause.
  – https://docs.lovable.dev/features/jobs.md
- **[UVERIFISERT]** Maks kjøretid for Jobs – ikke oppgitt.
- **[VERIFISERT]** **Inngest-connector** anbefales for arbeid utenfor brukerforespørsler: durable functions, flertrinns workflows med retry, cron, fan-out bildeprosessering. Faktureres av Inngest.
  – https://docs.lovable.dev/integrations/inngest.md

### Secrets
- **[VERIFISERT]** Krypterte, per prosjekt, når aldri nettleseren, write-only (kan ikke leses igjen). Legges inn via sikker input i chat eller More → Cloud → Secrets. Injiseres i Edge Functions/server-side ved kjøring. `VITE_`-navn avvises (de hører hjemme i `.env` og havner i nettleserbundlen). Reserverte `SUPABASE_*`/`LOVABLE_*`. `LOVABLE_API_KEY` driver innebygd AI og kan roteres. Ikke lim nøkler inn i chatten – bruk «Add secret»-skjema.
  – https://docs.lovable.dev/features/secrets.md
  – https://docs.lovable.dev/integrations/any-api.md

### Realtime
- **[VERIFISERT]** Cloud inkluderer «realtime updates»; RLS gjelder også realtime; realtime-bruk er egen faktureringskategori.
  – https://docs.lovable.dev/features/cloud.md
  – https://docs.lovable.dev/features/project-usage.md
- **[UVERIFISERT]** Detaljer om Broadcast/Presence-konfigurasjon i Cloud – ikke beskrevet i Lovable-docs (se pkt. 7 for Supabase).

### Samarbeid
To helt ulike ting:
1. **Flere *byggere* i samme Lovable-prosjekt** **[VERIFISERT]**: Del prosjekt via Share eller inviter til workspace. Prosjektroller Viewer/Editor/Admin/Owner. Editor kan redigere, publisere, håndtere GitHub. Hver samarbeidspartner kan jobbe i egen **draft** (egen chat + preview) som må aksepteres. Samarbeidspartnere bruker eierens workspace-kreditter. Ubegrenset antall workspace-medlemmer på alle planer; roller/tilganger krever betalt plan.
   – https://docs.lovable.dev/features/collaboration.md
   – https://docs.lovable.dev/introduction/subscription-plans.md
2. **Flere *sluttbrukere* i appen** = egen auth + RLS + realtime i appen (se pkt. 7). Ikke det samme.

### Planer og kreditter
- **[VERIFISERT]** Free: daglig chat-kvote, 5 daglige build-kreditter (maks 30/mnd), 20 Cloud-kreditter og 4 AI-kreditter per måned. Pro fra $25/mnd (100 kreditter). Business fra $50/mnd (100 kreditter; SSO, rollebasert tilgang, internal publish, Lovable API). Enterprise: avtale. Private prosjekter og Git-synk på alle planer. Kodeeditor (lagring) og full nedlasting krever betalt plan.
  – https://docs.lovable.dev/introduction/subscription-plans.md
  – https://docs.lovable.dev/features/code-mode.md
- **[VERIFISERT]** Én kredittsaldo dekker bygging, chat, hosting, backend-drift (Cloud = «Run credits»), AI i appen og connectors. Cloud-grant på 20 kreditter/mnd merket «Temporary offering, subject to change».
  – https://docs.lovable.dev/introduction/credits-and-usage.md
  – https://docs.lovable.dev/features/project-usage.md

### Chat / Plan / Build mode
- **[VERIFISERT]** Tre moduser, samtalen følger med på tvers:
  - **Chat mode**: diskuterer, endrer ingenting (kode, filer, data). Typisk en brøkdel av en kreditt per melding; dekkes først av daglig chat-kvote (nullstilles 00:00 UTC). Prisingen gjelder til 31. okt 2026.
  – https://docs.lovable.dev/features/chat-mode.md
  - **Plan mode**: undersøker og skriver en redigerbar plan (`.lovable/plan.md`), 1 kreditt per melding + ev. subagent-research. Godkjenning → Build mode.
  – https://docs.lovable.dev/features/plan-mode.md
  - **Build mode** (tidligere «Agent mode»): implementerer endringer, kan lese logger, nettverk, teste i nettleser, generere bilder/video. Bruksbasert pris, mange forespørsler < 1 kreditt. Kan jobbe opptil 10 timer på én melding. Credit check-ins (20 kreditter standard, beta).
  – https://docs.lovable.dev/features/agent-mode.md

### Versjonshistorikk / revert
- **[VERIFISERT]** Hver endring lager en versjon automatisk. Revert til hel versjon; bokmerker. Revert endrer **ikke** databasedata/migrasjoner, men **redeployer** Edge Functions. Ingen kredittrefusjon. Effekt på GitHub ikke beskrevet.
  – https://docs.lovable.dev/features/projects/history.md
- **[UVERIFISERT]** Hvordan revert reflekteres i GitHub (ny commit vs. reset) – ikke dokumentert. Sannsynligvis ny commit, men bør testes før Claude Code og Lovable jobber parallelt.

---

## 5. Tunge medieoperasjoner (FFmpeg, video-rendering)

- **[VERIFISERT – Supabase]** Supabase Edge Functions-grenser:
  - Minne: **256 MB**
  - Wall clock: **150 s (Free) / 400 s (betalt)**
  - CPU-tid: **2 s per forespørsel** (ekskl. async I/O)
  - Request idle timeout: **150 s** (deretter 504)
  - Funksjonsstørrelse: 20 MB (CLI) / 5 MB (server-side bundling)
  - «Node Libraries that require multithreading are not supported» (eks. sharp, libvips)
  – https://supabase.com/docs/guides/functions/limits
- **[VERIFISERT – Supabase]** `EdgeRuntime.waitUntil()` gir bakgrunnsoppgaver, men innenfor samme wall-clock/CPU/minne-grenser.
  – https://supabase.com/docs/guides/functions/background-tasks
- **[VERIFISERT – Cloudflare]** Hvis TanStack Start-serverfunksjoner kjører som Cloudflare Workers (jf. Lovable-blogg): **128 MB** minne per isolate; CPU-tid 10 ms (Free) / 30 s standard, maks 5 min (Paid); cron maks 15 min; request body 100 MB (Free/Pro).
  – https://developers.cloudflare.com/workers/platform/limits/
- **[UVERIFISERT]** Hvilke av disse grensene Lovable faktisk bruker for sine Cloud Edge Functions og server functions – **Lovable-docs oppgir ingen tall**. FFmpeg nevnes ikke noe sted.
- **[VERIFISERT – Lovable]** Lovable anbefaler Inngest for flertrinns/langvarige/retry-baserte jobber og nevner «fan-out image processing pipelines». Edge Functions anbefales for enkle kall som fullføres innen én forespørsel.
  – https://docs.lovable.dev/integrations/inngest.md

> **Konklusjon (vurdering, ikke docs):** FFmpeg-basert rendering av animatics (minutter med video, høyt minne/CPU, native binær) passer **ikke** i Edge Functions eller Workers. Anbefalt mønster:
> 1. Klient laster opp assets til Storage (resumable/TUS for > 6 MB, jf. https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
> 2. Edge/server function oppretter en `render_jobs`-rad og kaller ekstern render-tjeneste (f.eks. container på Cloud Run/Fly.io/Modal/Render, Remotion Lambda, eller en egen FFmpeg-worker) med signerte URL-er; API-nøkkel ligger i Secrets.
> 3. Workeren skriver resultatet tilbake til Storage og oppdaterer jobbstatus via webhook → Edge Function (eller direkte med service key).
> 4. Klienten følger status via Realtime.
> Alternativt kan forhåndsvisning (scrubbing, enkel avspilling) gjøres helt i nettleseren (canvas/WebCodecs/ffmpeg.wasm), lastet kun klientside pga. SSR.
> Lovable Storage tillater opptil 5 GB per fil; Lovable-prosjektet (repoet) tåler ikke filer > 10 MB, så medier skal aldri ligge i repoet.

---

## 6. Beste praksis for prompting av Lovable
Kilde: https://docs.lovable.dev/prompting/prompting-one.md (se også https://docs.lovable.dev/prompting/prompting-library.md og https://docs.lovable.dev/prompting/prompting-debugging.md)

**[VERIFISERT]** Hovedpunkter:
- **Avklar før bygging:** Avslutt med en linje som ber Lovable stille spørsmål den trenger. Kombiner med Plan mode.
- **Planlegg før du prompter:** Hva, for hvem, hvorfor, og den ene nøkkelhandlingen.
- **Kartlegg brukerreisen:** sekvens av skjermer og hva som skjer mellom dem.
- **Sett designretning tidlig:** tonord, typografi, UI-mønstre; lagre stil-nøkkelord i **project knowledge**.
- **Bygg komponent for komponent**, gjennomgå før neste.
- **Bruk ekte innhold** i stedet for plassholdertekst.
- **Vær spesifikk og atomisk:** navngi konkrete UI-elementer; bygg kompleksitet gradvis.
- **Strukturerte layoutmønstre** som «oppskrifter».
- **Sett rekkverk (guardrails):** hver endringsprompt skal si *hva* som bygges, *hvor*, og *hva som ikke skal røres* (f.eks. «Only change the orders page … leave the rest of the app unchanged»).
- **Pek på elementer** i preview for små endringer; bruk presise verb (replace/update/adjust).
- **Design med backend i tankene:** innlogget/utlogget, tomme/lasting/feil-tilstander.
- **Iterer inkrementelt** og **bokmerk** fungerende versjoner før risikable endringer.
- Fra modussidene: avklar i Chat mode (billigst), definer i Plan mode, implementer i Build mode.

---

## 7. Flerbruker i sluttbrukerappen (Supabase-mønstre)

### Prosjektmedlemskap og roller med RLS
- **[VERIFISERT – Supabase]** RLS-retningslinjer:
  - Slå på RLS på alle tabeller i eksponert skjema; trekk tilbake standard grants og gi kun det som trengs.
  - Én policy per operasjon (select/insert/update/delete), alltid med `to authenticated` (eller annen rolle).
  - Medlemskap sjekkes med `IN`-subspørringer (rad sin team/prosjekt-id i listen over brukerens prosjekter).
  - Unngå policyer som leser hverandres tabeller (uendelig rekursjon, feil `42P17`) – bryt med en **`security definer`-funksjon** med `set search_path = ''`, plassert i et skjema som ikke er eksponert via API.
  - Ytelse: `(select auth.uid())` i stedet for `auth.uid()`, indekser kolonner som policyer filtrerer på.
  - Secret/service key omgår RLS – aldri i nettleseren.
  – https://supabase.com/docs/guides/database/postgres/row-level-security
- **[VERIFISERT – Supabase]** RBAC med custom claims: enums `app_role`/`app_permission`, tabeller `user_roles` og `role_permissions`, en **Custom Access Token Auth Hook** som legger `user_role` i JWT, og `authorize(permission)` (`security definer`) brukt i RLS-policyer. Forbehold: én global rolle per bruker i eksemplet, rolleendring slår først inn ved nytt token, Auth Hooks merket Beta.
  – https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- **[UVERIFISERT]** Om Auth Hooks kan konfigureres i **Lovable Cloud** (krever normalt Supabase-dashboard) – ikke dokumentert.

> **Anbefalt mønster for Animatic Studio (vurdering):** Bruk *per-prosjekt*-roller i en tabell fremfor globale JWT-claims:
> - `projects(id, owner_id, …)`
> - `project_members(project_id, user_id, role)` der `role` er enum `owner | editor | commenter | viewer`, unik på `(project_id, user_id)`
> - `project_invitations(id, project_id, email, role, token, invited_by, expires_at, accepted_at)`
> - `security definer`-hjelpefunksjoner, f.eks. `private.is_project_member(project_id)` og `private.has_project_role(project_id, min_role)`, brukt i RLS på alle prosjektdata (scener, shots, assets) og i Storage-policyer (filsti prefikset med `project_id`).
> - Invitasjonsaksept via Edge/server function som validerer token og setter inn medlemskapsrad (service role, med eksplisitt sjekk).
> - Lovables «Send invitation» i Users-visningen inviterer til *appen*, ikke til et spesifikt prosjekt – prosjektinvitasjon må bygges selv.
> Dette mønsteret er ikke en ferdig oppskrift i offisiell dokumentasjon, men bygger på de dokumenterte RLS-prinsippene over.

### Realtime / Presence for samtidig redigering
- **[VERIFISERT – Supabase]** Tre mekanismer:
  - **Presence**: deler liten, sakte-endrende tilstand (hvem er online, hvilket dokument/hvilken scene man ser på). `track()`/`untrack()`, hendelser `sync`/`join`/`leave`, `presenceState()`. **Ikke** egnet for markørposisjoner (for høy frekvens).
  – https://supabase.com/docs/guides/realtime/presence
  - **Broadcast**: anbefalt for høyfrekvente/«fire-and-forget»-meldinger (markører, live-scrubbing, «X redigerer shot 12»).
  - **Postgres Changes**: abonnement på INSERT/UPDATE/DELETE; respekterer RLS (unntatt DELETE). Autoriserer hver hendelse per abonnent og prosesseres på én tråd; ved > ca. 3 000 samtidige abonnenter anbefales Broadcast.
  – https://supabase.com/docs/guides/realtime/postgres-changes
- **[VERIFISERT – Supabase]** **Realtime Authorization**: private kanaler (`private: true`), RLS-policyer på `realtime.messages` med `realtime.topic()` og kolonnen `extension` (`broadcast`/`presence`). Eksempelmønster med en `rooms_users`-tabell = direkte overførbart til `project_members` (topic = `project:<id>`). Forbehold: tilgang caches per tilkobling til JWT utløper; ikke kjør `ENABLE ROW LEVEL SECURITY` på `realtime.messages` (feiler og avbryter migrasjonen).
  – https://supabase.com/docs/guides/realtime/authorization
- **[UVERIFISERT]** Konfliktløsning ved samtidig redigering av samme felt (CRDT/OT, f.eks. Yjs) – Supabase tilbyr ikke dette innebygd. Enkleste mønster: optimistisk låsing (versjonsnummer/`updated_at`) + Presence-basert «soft lock» per shot/scene.

---

## Åpne spørsmål som bør testes i praksis
1. Overlever `docs/`, `.claude/` og `.github/workflows/` uendret etter flere Lovable-runder? (Test tidlig.)
2. Bekreft faktisk stack i generert repo: `package.json` (TanStack Start, Tailwind-versjon), `components.json` (shadcn/ui).
3. Hvilke tidsgrenser/minne gjelder for Lovable Cloud Edge Functions og TanStack server functions? (Spør i Lovable Chat mode eller test.)
4. Kan Auth Hooks / `pg_cron` / `pg_net` brukes i Lovable Cloud, eller kreves egen Supabase?
5. Hvordan vises revert i Lovable i Git-historikken?
6. Leser Lovable `CLAUDE.md` like pålitelig som `AGENTS.md`? (Docs garanterer kun rot-`AGENTS.md`.)
