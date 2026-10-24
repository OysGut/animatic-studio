---
name: ptg-audio-roundtrip
description: "Lydrundtur med DAW (Pro Tools, Reaper, Logic) via Manifest v1: samplingfrekvens, tidskode, BWF/WAV, AIFF, takes og dialogversjoner uten å endre kilder. Bruk ved lydeksport/-import og DAW-adaptere."
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-audio-roundtrip

## Kilder (offisielle)
- EBU Tech 3285 (Broadcast Wave Format): https://tech.ebu.ch/publications/tech3285
- Apple AIFF/AIFC-spesifikasjon; SMPTE ST 12-1 (tidskode).
- AAF/OMF dokumentasjon fra AMWA: https://www.amwa.tv

## Regler
1. `sampleRate` i manifestet er heltall i Hz; bildefrekvens er brøk.
2. Mottatt lyd blir ny versjon; dialogklipp eier plassering, versjoner eier fil (AGENTS 26).
3. Kapabiliteter: read, write, audio, timeline. Uten tidslinjeskriving vises «Eksporter for DAW».
