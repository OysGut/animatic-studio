# AGENTS.md – typography

- Text-layer fonts come only from the licensed catalog in src/core/typography/fonts.ts, load lazily (incl. real italics) via src/engine/typography, and export awaits fontsReady; this keeps startup light and preview/export text identical.
