# Maler for meldinger til Lovable

Etter DEC-0005 skal Lovable **ikke** bygge funksjoner. Meldinger sendes bare for: oppsett, hemmeligheter, kjøring av migrasjoner, deploy av funksjoner, og feilsøking av plattformen. Mandat 33.3 (REQ-0466–REQ-0468) gjelder fortsatt for disse: **kort, avgrenset, testbar**, med hva som skal gjøres, hva som ikke skal røres, og hvordan resultatet kontrolleres.

## Regler for alle meldinger
- Skrives på engelsk (presisjon for Lovables agent; mandat 1.3 om tekniske instruksjoner), med en norsk forklaring til Mars utenfor kodeblokken.
- Én oppgave per melding. Nevn eksakte filnavn.
- Alltid rekkverk: «Do not modify any other files. Do not change application code, `docs/`, `.claude/`, `src/core/` or `tests/`.»
- Alltid en kontroll Lovable skal rapportere tilbake.
- Ingen hemmeligheter i meldingen. Ingen manustekst.
- Send i **Build mode** bare når noe skal utføres; spørsmål i **Chat mode** (billigere, endrer ingenting – [VERIFISERT]).

## 1. Standard synkmelding (migrasjoner + funksjoner)
Bruk når leveransen har nye filer i `supabase/migrations/` og/eller endrede funksjoner. Kopieres også til `docs/development/LOVABLE_SYNC.md`.

```
Sync task – do not write or change any code.

1. Apply these pending database migrations from the repository, in filename order, exactly as written (do not edit them):
   - supabase/migrations/<FILNAVN_1>.sql
   - supabase/migrations/<FILNAVN_2>.sql
2. Deploy these functions from the repository without changing their contents:
   - <supabase/functions/NAVN | server function NAVN>
3. Do not modify any files in the repository. Do not change application code, docs/, .claude/, src/core/ or tests/.
4. Report back: (a) each migration applied successfully or the exact error, (b) each function deployed or the exact error, (c) the value in table public.schema_version after applying.
If anything fails, stop and report the error. Do not try to fix it.
```

## 2. Bare migrasjon
```
Apply the pending migration supabase/migrations/<FILNAVN>.sql exactly as written. Do not edit it and do not modify any other files or code.
Report: success or the exact error message, and the resulting value in public.schema_version.
If it fails, stop and report. Do not attempt a fix.
```

## 3. Ny hemmelighet (Mars legger inn verdien selv)
Norsk til Mars: «Lovable vil vise et skjema. Lim inn nøkkelen der – aldri i selve chatten.»
```
I need to add a project secret named <SECRET_NAME> (used server-side only by <funksjon/adapter>).
Please open the secure "Add secret" form for it. Do not write any code and do not modify any files.
Confirm when the secret exists (do not display its value).
```
Navneregler: STORE_BOKSTAVER_MED_UNDERSTREK, ikke `VITE_`, ikke `SUPABASE_*`/`LOVABLE_*` (reserverte – [VERIFISERT]).

## 4. Førstegangsoppsett av prosjektet (én gang)
Norsk til Mars: «Lag nytt prosjekt i Lovable, slå på Lovable Cloud, koble GitHub (Lovable lager repoet). Send så denne meldingen.»
```
Project setup only – do not build any features.
1. Keep the default generated app as is. Do not add pages or components.
2. Confirm which framework this project uses (TanStack Start or React + Vite) and the Node.js version for builds.
3. Confirm that Lovable Cloud is enabled and which region it uses.
Report the answers. Do not modify any files.
```

## 5. Plattformspørsmål (Chat mode)
```
Question only – do not change anything.
<Ett konkret spørsmål, f.eks.: What are the execution time and memory limits for server functions in this project?>
Please answer with a link to the documentation page if one exists.
```
Svaret registreres i PLATFORM_CONSTRAINTS.md som [DELVIS] til det er dokumentert eller testet.

## 6. Feilsøking av forhåndsvisning
```
The preview fails after the latest sync. Do not change any code yet.
1. Show the exact build or runtime error from the logs.
2. Identify the file and line.
Report only. I will fix it in the repository.
```

## Sjekkliste før Mars sender
- [ ] Én oppgave, eksakte filnavn, rekkverk med, kontrollpunkt med.
- [ ] Ingen hemmeligheter, ingen manustekst, ingen funksjonsbygging.
- [ ] Riktig modus (Chat for spørsmål, Build for utførelse).
- [ ] Norsk forklaring til Mars ved siden av.
