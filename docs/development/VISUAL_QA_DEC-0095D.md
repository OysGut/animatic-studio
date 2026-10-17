# Visuell kontroll – DEC-0095 (fase 2, bolk D: ord-til-lyd)

Skript: `tests/visual/dec0095-word-alignment-ui.mjs` (kopieres til `/tmp/claude-0/pw`). Mocket Supabase og serverfunksjoner (analysen svarer med ord for replikken der det tredje ordet mangler). Resultat 17.10.2026: **16/16**.

| Skudd | Kontroll |
|---|---|
| w01a-ord | Status for tekst mot lyd i lydvinduet. Lydeditoren viser replikken som ord; ElevenLabs er standard; kostnaden vises og må godkjennes før analysen; koblingen lagres; ordet som mangler, merkes ≈. Ett ord og fire ord (Shift) markerer lyden; ordene fremheves over opptaksknappene; avspilling med kontekst. |
| w01b-hand | «Manuelt»: ett ord kobles til et område i linjalen for hånd, og er ikke lenger usikkert. |
| (w02) | Valget av tjeneste huskes når vinduet åpnes igjen. |

Også kjørt: dec0094 20/20, dec0093 28/28, dec0089 26/26, verifisering3 73/73, verifisering4 58/58, interactions 44/44, ai-admin 46/46. Vitest 151 filer / 1265 tester, DB 65/65.
