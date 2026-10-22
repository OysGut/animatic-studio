# N6 – Verifiseringsrunde 2 (22.10.2026)

Samme metode og regler som N4: et krav flyttes bare til «Verifisert» når en navngitt test sjekker akseptkriteriet og besto i denne runden. Ingen nye funksjoner, ingen migrasjon, ingen betalte kall, ikke publisert.

## Tall

| | Før | Etter |
|---|---|---|
| Implementert – ikke verifisert | 64 | 34 |
| Flyttet til Verifisert | – | 30 |

(N5 flyttet REQ-0269, derfor 64 og ikke 65 ved start.)

## Nye tester

`tests/visual/dv3-dialogue-editor.mjs` har fått nye kontroller (kjørt mot både visual- og mts-fixture, 58/58 begge):
- D2 (REQ-0756): konteksten før og etter vises med opasitet 0,7, den aktive replikken med 1.
- D5 (REQ-0759): en annen replikk kan velges i nedtrekkslisten, valget skriver ingenting, og den opprinnelige kan velges igjen.

## Kjørte suiter (alle grønne, nb og en)

dv1-script-nav 15/0, dv3-dialogue-editor 58/0, dv4-voice 24/0, dv5-batch 20/0, dv6-languages 16/0, dv7-drift 28/0, dv8-notes 26/0 (dv7/dv8 med mts-fixture), p4-alpha-export 41/0, p8-style-harmonize 110/0. Enhetstester for harmonisering og DV: 68/68.

## Verifisert i N6 (30)

- Navigering: REQ-0751, 0752, 0753
- Dialogeditor: REQ-0755, 0756, 0758, 0759, 0766, 0767
- Stemme: REQ-0773, 0774, 0777
- Massegenerering: REQ-0780, 0789
- Talespråk: REQ-0793, 0794, 0797, 0799
- Avvik manus/lyd: REQ-0804, 0807, 0808, 0814
- Prosjektsiden: REQ-0831 (H9)
- Stilharmonisering: REQ-0137, 0138, 0140, 0141, 0142, 0144, 0400

Hver har testnavnene under `verification` i requirements.yaml.

## Avvik

Ingen nye avvik funnet.

## Krever ekstern prøving

- REQ-0139: gjenkjennelighet må vurderes av et menneske på ekte genererte bilder (betalt kall).
- Fortsatt fra N4: REQ-0291, 0293, 0504, 0685, 0687, 0689, 0711.

## Gjenstår uten målrettet test (ikke avvik)

REQ-0757 (testdataene har ikke noe omslagsbilde), 0760, 0762, 0764, 0778, 0781–0783, 0790, 0798, 0800, 0805, 0806, 0813, 0815, 0816, 0121, 0143, 0401, 0402, 0571, 0699, 0704, 0708, 0709, 0839 (VP9 med alfa krever en nettleser som faktisk koder alfa; suiten sjekker bare sperren).

## Testresultater

tsc 0 · Vitest 2465 bestått / 10 hoppet over / 0 feilet · DB 180/0 lokalt · build_docs og check_kb OK. Ingen nye tekster i grensesnittet, så språkfilene er ikke endret.
