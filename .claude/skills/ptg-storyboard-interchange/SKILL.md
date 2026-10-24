---
name: ptg-storyboard-interchange
description: Utveksling av storyboard med andre programmer (OTIO, FCP7 XML, CMX EDL, Storyboard Pro-lignende pakker) via Manifest v1 og eksisterende core/interchange. Bruk ved import/eksport av paneler, timing og overganger.
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-storyboard-interchange

## Kilder (offisielle)
- OpenTimelineIO: https://opentimeline.io og https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- Final Cut Pro 7 XML Interchange Format (Apple Developer arkiv).
- CMX 3600 EDL-spesifikasjon.

## Regler
1. Timing og navn avledes bare i `src/core/interchange` (AGENTS 44/47).
2. Panel-ID og revisjon følger med i manifestet som `base`, så import tilbake kan oppdage konflikter.
3. Import legger til, aldri erstatter ferdig materiale (AGENTS 46).
