# From Pen to Glass for Krita (C-8)

**Status: bygget, ikke verifisert i Krita. / Built, not verified in Krita.**

## Norsk

Krever Krita 5.2 eller nyere.

1. Lag pakken: `python3 plugins/scripts/pack-python.py` (lager `plugins/krita/dist/pentoglass-krita-0.1.0.zip`).
2. I Krita: **Verktøy → Skript → Importer Python-tillegg fra fil …**, velg ZIP-filen og start Krita på nytt.
3. Slå på tillegget under **Innstillinger → Sett opp Krita → Python Plugin Manager → From Pen to Glass**.
4. Menyen ligger under **Verktøy → Skript → From Pen to Glass**:
   - **Logg inn**: nettleseren åpnes, og du godkjenner tilgangen der (PKCE via 127.0.0.1). Ingen passord eller nøkler lagres i tillegget; tilgangen ligger i brukerens konfigmappe (`pentoglass/krita-session.json`, rettigheter 0600).
   - **Åpne fra Pen to Glass**: velg ressurs og versjon. PSD åpnes med lag (navn, synlighet, opasitet og alfa); PNG blir ett lag.
   - **Åpne pakke**: åpner en «Send til …»-pakke (ZIP eller mappe med `manifest.json`).
   - **Send tilbake**: dokumentet flates til PNG med alfa og blir en ny kandidatversjon. Lagene blir værende i Krita. Har noen godkjent en annen versjon i mellomtiden, får du tre valg: behold begge, behold gjeldende eller bruk den nye (den siste godkjennes i appen). Ingenting tas i bruk automatisk.
   - Paneler fra en pakke sendes tilbake på retursiden fra pakken, som åpnes i nettleseren.
5. **Logg ut** trekker tilgangen tilbake.

Koblingen til prosjektet lagres i dokumentet (annotasjonen `ptg-link`), aldri i filnavnet.

## English

Requires Krita 5.2 or later.

1. Build the package: `python3 plugins/scripts/pack-python.py`.
2. In Krita: **Tools → Scripts → Import Python Plugin from File…**, choose the ZIP and restart Krita.
3. Enable it in **Settings → Configure Krita → Python Plugin Manager → From Pen to Glass**.
4. The menu is under **Tools → Scripts → From Pen to Glass**: sign in (browser, PKCE via 127.0.0.1, no secrets stored in the add-on), open an asset version (PSD keeps layers, names, visibility, opacity and alpha), open a "Send to…" package, and send back as a new candidate version (flattened PNG with alpha). Conflicts offer keep both / keep current / use new (approved in the app). Nothing is applied automatically. Panels from a package are returned on the package's return page.
5. **Sign out** revokes access.

The link to the project is stored in the document (`ptg-link` annotation), never in the file name.
