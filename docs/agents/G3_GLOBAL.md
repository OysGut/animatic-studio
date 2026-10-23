# G-3 global bruk – regler for agenter (henvist fra AGENTS.md regel 71)

- Word, character and grapheme counts use src/core/language/text-metrics (Intl.Segmenter, whitespace fallback); never `split(/\s+/)` for counting, wrapping or search, so languages without spaces (ja, zh, th) work.
- Speech duration uses speechRateFor/speechSeconds: chars per second for ja/zh/ko, words per minute otherwise; defaults have a cited source and projects may override, so estimates are never English-only.
- Scene-heading prefixes live only in src/core/screenplay/heading-keywords.ts (per language, project-extensible, source language first); a Fountain forced heading (leading dot) always wins.
- Settings resolve only via src/core/settings/resolve.ts (project → workspace → user → country → default) and report their source, so UI never guesses where a value came from.
- Budget days/months are computed in the database with private.budget_period_start (workspace time zone, else project owner's, else UTC), so limits flip at local midnight.
- Workspace time zone/region/settings change only via public.set_workspace_settings (owner, security definer), consistent with GP1. fx_rates is written only by service role.
