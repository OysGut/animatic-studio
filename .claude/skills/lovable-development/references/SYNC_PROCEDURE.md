# Synkprosedyre – repo ↔ Lovable

Flyt (ARCHITECTURE.md §1): Claude skriver i repoet på Mars' Mac → Mars trykker *Commit* + *Push* i GitHub Desktop → GitHub `main` → Lovable synker → (ved behov) Mars sender én melding i Lovable.

## 1. Før arbeid
1. Hent siste fra `main` (Mars: «Fetch/Pull» i GitHub Desktop; Claude: `git pull --ff-only`). Lovable kan ha committet (`lovable-dev[bot]`).
2. Se etter `lovable-sync*`-grener (`git branch -r`). Finnes de: følg §4 før nytt arbeid.
3. Les `SESSION_HANDOVER.md`: venter migrasjoner/funksjoner fortsatt på å bli kjørt i Lovable?

## 2. Under arbeid
- Små, sammenhengende commits med krav-ID: `REQ-0228: MoveOccurrence i tidslinje (INV-01)`.
- Større arbeid kan gjøres på en lokal gren og flettes inn i `main` med vanlig merge (ikke rebase/squash av commits som allerede er på `main`).
- Migrasjoner: ny fil `supabase/migrations/<YYYYMMDDHHMMSS>_<beskrivelse>.sql`. **Endre aldri en migrasjon som kan være kjørt** – lag en ny.
- Oppdater forventet skjemaversjon i appen når en migrasjon legges til.

## 3. Leveranse
1. Lokalt: `npm run build`, `npm test`, `python3 scripts/kb/check_kb.py` – alt grønt.
2. Sjekk at ingen fil > 10 MB, ingen hemmeligheter, ingen manus/medier: `git diff --stat`, `git ls-files -z | xargs -0 du -k | sort -n | tail`.
3. Mars: *Commit* (Claude foreslår melding) og *Push origin*.
4. Vent til Lovable viser commiten (prosjektets historikk). Står det «GitHub ahead» uten at commiten kommer: push en tom commit (`git commit --allow-empty -m "Synk"`).
5. Hvis leveransen inneholder migrasjoner, funksjoner eller nye hemmeligheter: Mars sender riktig melding fra [LOVABLE_MESSAGE_TEMPLATES.md](LOVABLE_MESSAGE_TEMPLATES.md) (standard synkmelding ligger i `docs/development/LOVABLE_SYNC.md`).
6. Kontroller: forhåndsvisningen laster; skjemaversjonssjekken er grønn; Lovables eventuelle commit endret ikke `docs/`, `.claude/`, `src/core/`, `tests/invariants/` (`git log -p --author=lovable -- docs .claude src/core tests/invariants`).
7. Noter i `SESSION_HANDOVER.md` hva som er levert og kjørt.

## 4. Konflikt / divergens
Symptom: gren `lovable-sync` (eller `lovable-sync-<timestamp>`) på GitHub, eller Lovable viser divergens.
1. **Ikke** slett grener, ikke force-push.
2. Hent grenen: `git fetch origin` og se forskjellen: `git log --oneline main..origin/lovable-sync` og `git diff main origin/lovable-sync`.
3. Vurder Lovables endringer: er de ønsket (f.eks. Mars har gjort en bevisst endring i Lovable) eller utilsiktet (agenten har endret beskyttede filer)?
4. Ønskede endringer: flett inn i `main` med vanlig merge (`git merge origin/lovable-sync`), løs konflikter, test, push. Utilsiktede: ta ikke med; push `main` – neste synk fra GitHub erstatter Lovables versjon (Lovable tar backup; eier kan gjenopprette i 24 t).
5. Dokumenter hva som skjedde i `KNOWN_ISSUES.md` og vurder om AGENTS.md/Project knowledge må strammes inn.
6. Er du usikker på om noe av Mars' arbeid går tapt: stopp og spør Mars (DEC-0006: sletting/overskriving).

## 5. Aldri
- Force-push, rebase eller squash på `main`. Slette `main` eller repoet. Beskytte `main` på GitHub uten å forstå konsekvensen (Lovables push går da til `lovable-sync`).
- Committe filer > 10 MB, medier, manus, `.env.local` eller hemmeligheter.
- Be Lovable om å «synke» eller «fikse» kode generelt.
