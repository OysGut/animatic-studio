# Eksterne integrasjoner – Animatic Studio

Status: Teknisk anbefaling. Krav: mandat kap. 17–20, 28.3, INV-11, INV-12, DEC-0018.
**Ingen leverandør er valgt ennå.** Konkrete leverandører legges til først når de faktisk skal integreres, etter at dokumentasjonen deres er lest og kapabilitetene verifisert (mandat 33.4: ikke påstå uverifisert funksjonalitet).

## 1. Adaptermodell
Hver leverandør implementerer `ProviderAdapter` (definert i `src/core/providers/types.ts`, implementert i `src/adapters/providers/<leverandør>/`, kjøres bare på server):

```ts
interface ProviderAdapter {
  id: string;                       // f.eks. "provider-x-video"
  capabilities(): Capabilities;     // oppgavetyper, maks varighet, oppløsninger, referansebilder,
                                    // bilde-til-video, lyd, kvalitetsparametere, rate limits, kostnadsmodell, begrensninger
  mapQualityProfile(p: 'fast'|'balanced'|'premium', task: Task): ProviderParams; // aldri anta felles parametere
  estimateCost(task: Task, params: ProviderParams): CostEstimate;               // med usikkerhet
  submit(task, params, secretRef): Promise<ProviderJobRef>;
  poll(ref): Promise<ProviderStatus>;   // eller webhook
  fetchResult(ref): Promise<MediaResult>;
  normalizeError(e): ProviderError;     // rate limit, kvote, innhold avvist, timeout, ukjent
}
```

## 2. Kostnadsport (INV-12)
1. Klient ber om estimat → server beregner med adapteren (antall kandidater, varighet, oppløsning, profil, ekstrarunder).
2. Bruker med `can_approve_costs` godkjenner beløp → `cost_approval` lagres på jobben.
3. Server-RPC `start_job` kontrollerer: godkjenning finnes, beløp ≤ alle budsjetter (jobb, scene, gruppe, produksjon, prosjekt – strengeste gjelder), medregnet allerede brukt og retries. Ellers avvises.
4. Faktisk kostnad registreres når leverandøren oppgir den; avvik mot estimat vises.
Ingen automatisk handling (manusendring, ressursendring, avviksløsning) kan opprette en betalt jobb uten trinn 2.

## 3. Hemmeligheter (28.3, 19.1)
- API-nøkler legges inn av Mars i Lovable/Cloud-hemmeligheter (MVP) eller i en kryptert server-side tabell per prosjekt (senere, for brukerens egne nøkler i UI). Aldri i klientkode, `.env` med `VITE_`-prefiks, repo, prosjektfiler, logger eller feilmeldinger.
- Logger maskerer alt som ligner nøkler (`sk-…`, `Bearer …`).

## 4. Prompter (kap. 17)
- `core/prompt` bygger en strukturert prompt (engelsk) fra scene, segment, karaktertilstander (fortellingstid), godkjente referanser, stilprofil, kamera, varighet, nabosegmenter og modellkrav.
- Norsk dialog som skal brukes ordrett ligger i eget felt `verbatimDialogue` og oversettes aldri; adapteren avgjør format.
- Brukeren kan åpne, lese, redigere og lagre prompten. Manuell overstyring lagres separat og flagges hvis grunnlaget endres.
- Full sporbarhet per generering: systeminstruksjon, prompt, modell, parametere, referanser, ressursversjoner, manusversjon, kostnad, resultat, tid og status.

## 5. Medietjeneste (fase 4–5)
Container med FFmpeg (f.eks. Cloud Run/Fly.io/Modal – velges når den trengs, kostnad avklares med Mars). Kontrakt: leser `render_jobs` (eller får webhook), henter kilder via signerte URL-er, skriver resultat til `generated/` eller `exports/`, oppdaterer status/fremdrift. Idempotent og gjenopptakbar.

## 6. Kandidatleverandører (ikke valgt, ikke verifisert)
Vurderes i fase 5 etter verifisering av offisiell dokumentasjon: videogenerering (bilde-til-video med referanser), bildegenerering/stilharmonisering, tale (TTS per språk), musikk/lydeffekter, leppesynk. Per leverandør dokumenteres: kapabiliteter, priser, vilkår (rettigheter til generert innhold, opplæring på data), datalagring (EU?), rate limits.

## 7. Øvrige integrasjoner
- **Lovable Cloud Auth:** e-post/magisk lenke og ev. Google.
- **E-post for invitasjoner:** via Auth (invite) eller transaksjonell e-post – avklares i fase 2.
- **Ingen tredjeparts analyse/sporing** uten beslutning.
