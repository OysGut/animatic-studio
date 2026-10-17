# Visuell kontroll – DEC-0094 (fase 2, bolk C: lydeditor og eksport)

Skript: `tests/visual/dec0094-audio-editor-ui.mjs` (kopieres til `/tmp/claude-0/pw`). Chromium med falsk mikrofon, mocket Supabase, ekte WAV-filer for opptakene. Resultat 16.10.2026: **20/20**.

| Skudd | Kontroll |
|---|---|
| e01a-editor | «Rediger» på et take åpner lydeditoren i lydvinduet: dialogsporet med bølgeform, lengden er opptakets. |
| e01b-omrade | «Sett inn etter» (lengre lyd), angre/gjør om, «Legg oppå» (eget spor), område markert ved å dra i linjalen og «Erstatt området». |
| e01c-lagret | Trim av en del, forhåndsavspilling, «Lagre som ny versjon»: miksen lastes opp som WAV og versjonen sendes med komposisjonen; ingen lydklipp i scenen endres. |
| e01d-eksport | Eksport: hele komposisjonen som WAV 48 kHz, som MP3, og ett take for seg (riktig lengde). |

Også kjørt: dec0093 28/28, dec0090 35/35, verifisering3 73/73, verifisering4 58/58, interactions 44/44, scene-video 39/39. Vitest 150 filer / 1257 tester, DB 64/64, produksjonsbygget bygger.
