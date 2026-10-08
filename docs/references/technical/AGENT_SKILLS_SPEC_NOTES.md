# Agent Skills-spesifikasjonen – notater for Animatic Studio

Hentet: 2026-10-08. Primærkilde: https://agentskills.io/specification (hentet via WebFetch, full side).
Sekundærkilde (Claude Code-spesifikke utvidelser): https://code.claude.com/docs/en/skills (hentet via WebFetch, de første 100 000 av ~106 000 tegn ble lest).
Validator: https://github.com/agentskills/agentskills/tree/main/skills-ref (README lest via raw.githubusercontent.com; Apache-2.0).

> Merk: Sitatene under er ordrette fra agentskills.io med mindre annet er oppgitt. Siden ble gjengitt via et WebFetch-verktøy som konverterer til Markdown; jeg har ikke kunnet sammenligne mot en bestemt versjon/commit av spesifikasjonen.

---

## 1. Mappestruktur

> "A skill is a directory containing, at minimum, a `SKILL.md` file"

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
└── ...               # Any additional files or directories
```

For vårt prosjekt: `.claude/skills/<navn>/SKILL.md` (Claude Code-konvensjon for prosjektskills – «Commit it so your team gets it too», code.claude.com/docs/en/skills).

## 2. SKILL.md-format

> "The `SKILL.md` file must contain YAML frontmatter followed by Markdown content."

### 2.1 Frontmatter-felt (agentskills.io)

| Felt | Påkrevd | Begrensning (sitat) |
|---|---|---|
| `name` | Ja | "Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen." |
| `description` | Ja | "Max 1024 characters. Non-empty. Describes what the skill does and when to use it." |
| `license` | Nei | "License name or reference to a bundled license file." |
| `compatibility` | Nei | "Max 500 characters. Indicates environment requirements (intended product, system packages, network access, etc.)." |
| `metadata` | Nei | "Arbitrary key-value mapping for additional metadata (a map from string keys to string values)." |
| `allowed-tools` | Nei | "Space-separated string of pre-approved tools the skill may use. (Experimental)" |

### 2.2 `name` – navneregler (sitat)

> * Must be 1-64 characters
> * May only contain unicode lowercase alphanumeric characters (`a-z`, `0-9`) and hyphens (`-`)
> * Must not start or end with a hyphen (`-`)
> * Must not contain consecutive hyphens (`--`)
> * **Must match the parent directory name**

Ugyldige eksempler fra spesifikasjonen: `PDF-Processing` (store bokstaver), `-pdf` (starter med bindestrek), `pdf--processing` (doble bindestreker).

Konsekvens for oss: alle våre planlagte navn (`specification-guardian`, `scene-sync-invariants`, `react-typescript-engineering` …) er gyldige. Mappenavn og `name` SKAL være identiske. Ikke bruk æ/ø/å i `name`.

### 2.3 `description` (sitat)

> * Must be 1-1024 characters
> * Should describe both what the skill does and when to use it
> * Should include specific keywords that help agents identify relevant tasks

Godt eksempel fra spesifikasjonen: "Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction."
Dårlig eksempel: "Helps with PDFs."

### 2.4 Valgfrie felt

- `license`: "We recommend keeping it short (either the name of a license or the name of a bundled license file)". Eksempel: `license: Proprietary. LICENSE.txt has complete terms`
- `compatibility`: "Must be 1-500 characters if provided"; "Should only be included if your skill has specific environment requirements"; "Most skills do not need the `compatibility` field."
- `metadata`: "A map from string keys to string values"; "We recommend making your key names reasonably unique to avoid accidental conflicts". Eksempel: `author: example-org`, `version: "1.0"` (merk: verdier er strenger – versjon i anførselstegn).
- `allowed-tools`: "A space-separated string of tools that are pre-approved to run"; "Experimental. Support for this field may vary between agent implementations". Eksempel: `allowed-tools: Bash(git:*) Bash(jq:*) Read`

### 2.5 Body

> "The Markdown body after the frontmatter contains the skill instructions. There are no format restrictions."

Anbefalte seksjoner: "Step-by-step instructions", "Examples of inputs and outputs", "Common edge cases".

> "Note that the agent will load this entire file once it's decided to activate a skill. Consider splitting longer `SKILL.md` content into referenced files."

## 3. Valgfrie mapper (anbefalte konvensjoner)

- `scripts/`: "Contains executable code that agents can run." Skript bør "Be self-contained or clearly document dependencies", "Include helpful error messages", "Handle edge cases gracefully".
- `references/`: "Contains additional documentation that agents can read when needed" – f.eks. `REFERENCE.md`, `FORMS.md`, domenespesifikke filer. "Keep individual reference files focused. Agents load these on demand, so smaller files mean less use of context."
- `assets/`: "Contains static resources" – maler, bilder, datafiler (oppslagstabeller, skjemaer).

## 4. Progressive disclosure (sitat)

> 1. **Metadata** (~100 tokens): The `name` and `description` fields are loaded at startup for all skills
> 2. **Instructions** (< 5000 tokens recommended): The full `SKILL.md` body is loaded when the skill is activated
> 3. **Resources** (as needed): Files (e.g. those in `scripts/`, `references/`, or `assets/`) are loaded only when required
>
> **Keep your main `SKILL.md` under 500 lines.** Move detailed reference material to separate files.

## 5. Filreferanser (sitat)

> "When referencing other files in your skill, use relative paths from the skill root"
> "Keep file references one level deep from `SKILL.md`. Avoid deeply nested reference chains."

## 6. Validering

> `skills-ref validate ./my-skill` – "This checks that your `SKILL.md` frontmatter is valid and follows all naming conventions."

skills-ref-README: "This library is intended for demonstration purposes only. It is not meant to be used in production." (Python, installeres med pip/uv – IKKE installert eller kjørt i denne researchen.)

---

## 7. Claude Code-avvik og -utvidelser (code.claude.com/docs/en/skills)

Viktig fordi Claude Code er vår faktiske kjøremiljø:

- Plassering: `.claude/skills/<skill-name>/SKILL.md` for prosjektskills.
- Kun `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` er del av den åpne standarden. Claude Code-utvidelser inkluderer bl.a.: `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`, `context` (`fork`), `agent`, `background`, `hooks`, `paths`, `shell`.
- «Claude Code ignorerer felt den ikke kjenner igjen uten å rapportere feil», og feltnavn må matche eksakt (inkl. bindestreker).
- `description` + `when_to_use` "is truncated at 1,536 characters in the skill listing to reduce context usage" – hovedbruksområdet bør stå først.
- Claude Code er MILDERE enn standarden: "All fields are optional. Only `description` is recommended"; `name` "Defaults to the directory name"; dokumentasjonen krever ikke at `name` matcher mappenavnet.
- Samme lengdeanbefaling: "Keep `SKILL.md` under 500 lines."

### Anbefalt husregel for Animatic Studio (strengeste felles nevner)

1. Følg agentskills.io-standarden strengt (påkrevd `name` = mappenavn, `description` ≤ 1024 tegn) – da er skillsene portable og passerer `skills-ref validate`.
2. Skriv `description` på engelsk eller norsk, men legg inn nøkkelord på begge språk dersom Claude skal trigges av norske forespørsler (f.eks. «manus», «scene», «screenplay», «scene»). Hovedbruksområdet først (pga. 1 536-tegns avkutting i Claude Code).
3. SKILL.md ≤ 500 linjer / < 5000 tokens; detaljer i `references/`, ett nivå dypt.
4. Bruk Claude Code-utvidelser (f.eks. `paths`, `disable-model-invocation`) bevisst og sparsomt, og dokumenter i `metadata` at skillen er Claude Code-spesifikk. Ikke-standardfelt gjør skillen mindre portabel (men brekker den ikke i Claude Code).
5. `metadata.version` som streng (`"1.0.0"`), og gjerne `metadata.owner`, `metadata.last-reviewed`.
6. Unngå skript som henter kode/innhold fra nett ved kjøring (se F1-vurderingene i skills_assessment.md).
