# From Pen to Glass for Blender (C-8)

**Status: bygget, ikke verifisert i Blender. / Built, not verified in Blender.**

## Norsk

Krever Blender 4.2 eller nyere (installeres som «extension» med `blender_manifest.toml`).

1. Lag pakken: `python3 plugins/scripts/pack-python.py` (lager `plugins/blender/dist/pentoglass-blender-0.1.0.zip`).
2. I Blender: **Edit → Preferences → Get Extensions → ⌄ → Install from Disk …**, velg ZIP-filen. Tillat nettverkstilgang når Blender spør (Preferences → System → Network → Allow Online Access).
3. Panelet ligger i 3D-visningen, sidepanelet (N) → fanen **Pen to Glass**:
   - **Logg inn**: godkjenn i nettleseren (PKCE via 127.0.0.1). Ingen nøkler i tillegget; tilgangen lagres i tilleggets brukermappe.
   - **Hent kameraer**: skriv inn scenens forekomst-ID. Du får kameraet «PTG Camera» med ett nøkkelbilde per storyboardpanel: brennvidde, sensorbredde og -høyde etter panelets bildeformat, plassering og retning fra blokkingen (SB-9), og en markør per panel. Oppløsning og bildefrekvens settes etter prosjektet.
   - **Hent kamerabevegelse (PTG3 FBX)**: importer FBX-filen fra «Til produksjonen»-pakken for bevegelse innen skuddet.
   - **Legg referanser i kameravisningen**: et bilde (ressurs eller panel fra en pakke) som bakgrunn i kameraet.
   - **Send rendring tilbake**: PNG-sekvens (inntil 250 bilder; tidskode og manifest skrives inn i hvert bilde) eller én video (MP4/MOV) blir kandidatversjoner av ressursen du oppgir. Ingenting tas i bruk automatisk; konflikter vises i appen med de tre valgene.
4. **Logg ut** trekker tilgangen tilbake.

## English

Requires Blender 4.2+ (installed as an extension). Build with `python3 plugins/scripts/pack-python.py`, then **Edit → Preferences → Get Extensions → Install from Disk…** and allow online access. In the 3D view sidebar (N) → **Pen to Glass**: sign in (browser, PKCE via 127.0.0.1), import cameras for a scene occurrence (one key per storyboard panel with SB-9 focal length, sensor and aspect, plus markers), import the PTG3 FBX camera move, add reference images to the camera background, and send renders back (PNG sequence up to 250 frames with timecode/manifest text chunks, or one MP4/MOV) as candidate versions. Nothing is applied automatically. **Sign out** revokes access.
