# Kapabilitetsmatrise – øvrige programmer (C-9)

Klassifisering per 24.10.2026, etter leverandørenes offisielle dokumentasjon. Ingen plugins er bygget for disse programmene. I kapabilitetsmodellen (`src/core/connectors/capabilities.ts`) har de `connection: "export"`, så brukerflaten bare viser «Eksporter for …» med formater vi allerede lager.

**Koblingstyper:** **A** ekte plugin (skript/tillegg i programmet), **B** API (server mot server), **C** filvei via C-1 (send fil og manifest, ta imot på retursiden).
**Vi dekker i dag:** OTIO, FCP7 XML og CMX EDL (PTG6), X-sheet, FBX og Dragonframe-pakke (PTG3), PSD/PNG/SVG/WAV-BWF med manifest (C-1), Fusion-komposisjon (PTG7) og film (MP4).
«Ukjent» betyr at den offisielle dokumentasjonen vi fant ikke sier noe om det. Punkter merket «ikke sjekket i dok.» er vår kunnskap uten at vi har kildelenke, og må kontrolleres før det bygges noe på dem.

---

## Toon Boom Harmony — `toonboom-harmony`
- **Skript-API:** JavaScript (QtScript) og Python-modul, dokumentert i Toon Booms skriptreferanse: https://docs.toonboom.com/help/harmony-22/scripting/script/index.html og https://docs.toonboom.com/help/harmony-22/scripting/pythonmodule/index.html
- **Plugin-API:** Det finnes et SDK for egne noder, men det er ikke offentlig dokumentert. Vi regner det som ukjent.
- **Filer inn/ut:** PSD-import med lag, bilder og lyd (ikke sjekket i dok.). OTIO og XML: ukjent. Klipp-/storyboardutveksling fra Storyboard Pro går via Toon Booms egne formater.
- **Lag:** ja (noder/lag). **Lyd:** ja (lydspor). **Tidslinje:** ja. **Markører:** ukjent.
- **Mulig kobling:** A er mulig (skript, som C-5), og C er mulig nå.
- **Vi dekker:** PSD med lag, PNG og WAV/BWF via C-1.
- **Mangler:** Harmony-skriptpakke (A) og import av X-sheet/eksponering til Harmony. Retur med lag blir flat (samme som i C-2).

## DaVinci Resolve — `davinci-resolve`
- **Skript-API:** Python og Lua (eksternt eller fra konsollen). Dokumentasjonen følger med programmet (Developer/Scripting/README.txt) og er omtalt på https://www.blackmagicdesign.com/developer/
- **Plugin-API:** Workflow Integration-plugins (HTML/JS-paneler), OFX og DCTL (samme kilde).
- **Filer inn/ut:** FCP7 XML, EDL, AAF og OTIO (ikke sjekket i dok.: OTIO i nyere versjoner). Lyd: WAV/BWF.
- **Lag:** gjelder ikke (videospor). **Lyd:** ja. **Tidslinje:** ja. **Markører:** ja, også gjennom skript-API-et (ikke sjekket i dok.).
- **Mulig kobling:** A (Workflow Integration eller skript, som C-3) og C nå.
- **Vi dekker:** OTIO, FCP7 XML, CMX EDL og WAV/BWF.
- **Mangler:** retur av klipperytme fra Resolve som forslag (slik C-3 gjør for Premiere) og markører med våre ID-er gjennom Resolve.

## Fusion (frittstående og i Resolve) — `blackmagic-fusion`
- **Skript-API:** Lua og Python (Fusion Scripting Guide): https://www.blackmagicdesign.com/developer/
- **Plugin-API:** Fuses (Lua) og OFX (samme kilde).
- **Filer inn/ut:** .comp (tekstbasert komposisjon) og bildesekvenser (PNG/EXR/TIFF). Lyd: begrenset; ukjent i detalj.
- **Lag:** noder (ikke lag). **Lyd:** ukjent. **Tidslinje:** keyframes. **Markører:** ukjent.
- **Mulig kobling:** A og C nå.
- **Vi dekker:** Fusion-komposisjon og kamera (PTG7) og PNG.
- **Mangler:** retur av rendringer som kandidater fra Fusion (bare manuelt via C-1 i dag).

## Clip Studio Paint — `clip-studio-paint`
- **Skript-API:** Ingen offentlig skript-API for dokument, lag eller filflyt er dokumentert. Vi regner det som ukjent eller ikke tilgjengelig.
- **Plugin-API:** Bare et SDK for filterplugins (bildeprosessering) i PAINT EX, og ikke på iPad: https://www.clipstudio.net/ja/sdk/ og https://www.celsys.com/clipsolution/case/id=215
- **Filer inn/ut:** PSD med lag, PNG, .clip og timeark i XDTS-formatet (CELSYS sitt «汎用デジタルタイムシート情報ファイル形式 xdts», samme kilde).
- **Lag:** ja. **Lyd:** begrenset; ukjent. **Tidslinje:** animasjon i EX. **Markører:** ukjent.
- **Mulig kobling:** bare C. Filter-SDK-et gir ikke tilgang til prosjektfiler eller nettverk.
- **Vi dekker:** PSD med lag og PNG via C-1.
- **Mangler:** XDTS-eksport og -import av timeark (eget format vi ikke lager i dag).

## Procreate Dreams — `procreate-dreams`
- **Skript-API:** ingen dokumentert (ukjent). **Plugin-API:** ingen dokumentert (ukjent).
- **Filer inn:** JPG, PNG, TIFF, GIF, HEIC, TGA, .procreate, video (H.264/HEVC/ProRes) og lyd (dekodes til PCM 48 kHz): https://help.procreate.com/dreams/handbook/tracks-and-content/content-types
- **Filer ut:** MP4/MOV (H.264, HEVC, ProRes), bildesekvenser (PNG, JPG, TIFF, TGA, BMP) og .drm: https://help.procreate.com/articles/deaqnd-export-formats
- **Lag:** ja (.procreate beholder lag). **Lyd:** ja. **Tidslinje:** ja. **Markører:** ukjent.
- **Mulig kobling:** bare C.
- **Vi dekker:** PNG, film (MP4) og WAV. Retur av MP4/MOV eller PNG kan tas imot på retursiden (C-1).
- **Mangler:** PSD (står ikke i importlisten) og overføring av timing (ingen dokumentert tidslinjefil).

## Dragonframe — `dragonframe`
- **Skript-API:** Bare «Action Script»: programmet kaller et lokalt skallskript (.sh/.bat) ved hendelser som SHOOT, POSITION, CAPTURE COMPLETE, FRAME COMPLETE, EDIT, CONFORM og NEW_TAKE: https://www.dragonframe.com/ufaqs/how-can-i-run-a-process-after-dragonframe-captures-an-image-or-after-some-other-event/ og https://www.dragonframe.com/download/dragonframe_script.sh.txt
- **Plugin-API:** ingen dokumentert (ukjent).
- **Filer:** lydklipp og dialoglesing, X-sheet, Arc-bevegelseskontroll og eksport av take (Brukerveiledningen): https://www.dragonframe.com/download/Dragonframe%20User%20Guide%20-%20Mac.pdf
- **Lag:** gjelder ikke (opptak). **Lyd:** ja. **Tidslinje:** ja. **Markører:** ukjent.
- **Mulig kobling:** C nå. A bare som hendelsesskript, ikke som et ekte plugin.
- **Vi dekker:** Dragonframe-pakke (FBX, X-sheet, lyd og munner; PTG3), Dragonframe-import (EDL; inaktiv take) og WAV.
- **Mangler:** et hendelsesskript som melder status tilbake (krever tokenhåndtering i et skallskript; ikke bestilt).

## REAPER — `reaper`
- **Skript-API:** ReaScript (Lua, EEL2 og Python): https://www.reaper.fm/sdk/reascript/reascript.php
- **Plugin-API:** C/C++-utvidelses-SDK: https://www.reaper.fm/sdk/plugin/plugin.php
- **Filer inn/ut:** WAV/BWF med tidsstempel, .RPP (tekstbasert prosjekt) og markører/regioner (ikke sjekket i dok. utover SDK-sidene).
- **Lag:** gjelder ikke. **Lyd:** ja. **Tidslinje:** ja. **Markører:** ja, gjennom ReaScript.
- **Mulig kobling:** A (ReaScript, som C-6) og C nå.
- **Vi dekker:** WAV/BWF med ID-er i iXML og cue-markører (C-6-formatet).
- **Mangler:** en ReaScript-pakke og en .RPP-økt med spor per rolle.

---

## English

C-9 classifies Toon Boom Harmony, DaVinci Resolve, Fusion, Clip Studio Paint, Procreate Dreams, Dragonframe and REAPER from vendor documentation (links above). None has a plugin from us. All seven are `connection: "export"` in the capability model, so the UI only offers "Export for…" using formats we already produce (OTIO/FCP7/EDL, PSD/PNG/WAV-BWF via C-1, Fusion comp, Dragonframe package, MP4).

Real plugins (type A) are possible for Harmony (JS/Python), Resolve and Fusion (Python/Lua, Workflow Integration, Fuses) and REAPER (ReaScript, C++ SDK). Clip Studio Paint only offers a filter-plugin SDK, and Procreate Dreams documents no API, so both are file-only (type C). Dragonframe offers event "action scripts" only. "Ukjent" (unknown) marks what the docs we found do not state, and "ikke sjekket i dok." marks our own knowledge without a cited source.
