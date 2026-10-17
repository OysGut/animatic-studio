# Visuell kontroll – DEC-0093 (fase 2, bolk B: lydopptak)

Skript: `tests/visual/dec0093-audio-ui.mjs` (kopieres til `/tmp/claude-0/pw` og kjøres mot dev-serveren med fixturen). Chromium med falsk mikrofon; Supabase og serverfunksjonene er mocket. Resultat 16.10.2026: **28/28**.

| Skudd | Kontroll |
|---|---|
| a01-lydvindu | Mikrofonikonet i lydressursen «Vind i trærne» (ingen kameraikon). Lydvinduet viser «Ta opp på denne datamaskinen» og QR-koden samtidig (L1, L2) og eksisterende takes. |
| a01b-to-opptak | To PC-opptak: «Ta opp på nytt» beholder det forrige. «Behold» laster opp og lager en ny versjon (ingenting erstattes). Advarsel ved lukking med et opptak som ikke er beholdt. |
| a02-replikk | Mikrofonikonet i inspektøren for en replikk på Manus-siden: hele replikken med karakter og scene, egen QR-kode. |
| a03a-takes | Mobilsiden: replikken med regianvisning (L3), Take 01 og Take 02 (L4) kan høres (L5), ingenting sendt før «Send». |
| a03b-sendt | Bare Take 01 sendt (L6), deretter det andre (L7); romlyd tatt opp og merket. |

Også kjørt etter endringen: dec0090 35/35, dec0089 26/26, dec0088 26/26, verifisering3 73/73, verifisering4 58/58 (avspillingstesten stopper nå før scenen går i løkke på en treg maskin), interactions 44/44, scene-video 39/39, image-tools 48/48.
