# ptg_client (C-8)

Felles Python-klient for Krita- og Blender-tilleggene, speilet etter `packages/ptg-connector-sdk`: innlogging (enhetsflyt og PKCE via loopback), manifest v1, gjenopptakbar opplasting med idempotensnøkkel, konflikter og nedlasting med kontrollsum. Bare standardbiblioteket. `ptg_strings.py` har tekstene på alle språk. Testes av `tests/unit/c8-python.test.ts` (Python-enhetstester og kontrakt mot `/api/v1`).

Shared Python client for the Krita and Blender add-ons, mirroring the TypeScript SDK. Standard library only.
