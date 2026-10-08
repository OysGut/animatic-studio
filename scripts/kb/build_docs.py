#!/usr/bin/env python3
"""Genererer docs/product/REQUIREMENTS.md og docs/product/TRACEABILITY_MATRIX.md fra requirements.yaml.
Kjør etter hver endring i requirements.yaml. `--check` feiler hvis filene ikke er oppdatert."""
import sys, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from kb_lib import *

data = load_reqs(); reqs = data["requirements"]
HDR = "<!-- GENERERT FIL – ikke rediger. Kilde: docs/product/requirements.yaml. Kjør: python3 scripts/kb/build_docs.py -->\n"

def esc(s): return str(s).replace("|", "\\|").replace("\n", " ")
def src(r):
    s = r["source"]
    return f"Beslutning {s['decision']}" if s.get("decision") else f"Kap. {s.get('section')} (l. {s.get('lines')})"

def requirements_md():
    o = [HDR, "# Kravregister – Animatic Studio\n",
         "Autoritativ kilde for krav-ID-er. Mandatkrav er utledet fra `MASTER_SPECIFICATION.md` (v14). ",
         "Krav utenfor mandatet viser til en beslutning i `docs/decisions/DECISION_LOG.md`.\n",
         f"\n**{data['meta']['id_policy']}**\n",
         "\n## Nøkkeltall\n"]
    c = collections.Counter(r["priority"] for r in reqs); org = collections.Counter(r["origin"] for r in reqs)
    st = collections.Counter(r["status"] for r in reqs)
    o.append(f"- Antall krav: **{len(reqs)}**\n- Prioritet: " + ", ".join(f"{p}: {c[p]}" for p in PRIORITIES) + "\n")
    o.append("- Opprinnelse: " + ", ".join(f"{k}: {v}" for k, v in org.items()) + "\n")
    o.append("- Status: " + ", ".join(f"{k}: {v}" for k, v in st.items()) + "\n")
    o.append("\n## Prioritetsdefinisjoner\n- **P0** Kritisk – ufravikelig prinsipp/systeminvariant. Gjelder fra første kodelinje som berører området, også når selve funksjonen bygges i en senere fase (feltet `phase`).\n"
             "- **P1** Høy – nødvendig i fase 1–4, eller tverrgående prosesskrav (fase tom).\n- **P2** Middels – fase 5–7.\n- **P3** Senere – fase 8 eller betinget formulert («dersom», «kan hente inspirasjon»).\n")
    o.append("\n## Opprinnelse\n- **mandat** – står i MASTER_SPECIFICATION v14.\n- **brukerbeslutning** – vedtatt av Mars senere (se beslutningsloggen).\n"
             "- **teknisk-anbefaling** – Claudes anbefaling for å oppfylle et vedtatt krav. Kan endres uten produktbeslutning, men endringen logges.\n")
    o.append("\n## Krav per kapittel\n")
    cur = None
    for r in reqs:
        sec = r["source"].get("section") or "Brukerbeslutninger"
        top = sec.split(".")[0] if r["origin"] == "mandat" else "Tillegg"
        if top != cur:
            cur = top; o.append(f"\n### {'Kapittel ' + top if top != 'Tillegg' else 'Tillegg etter mandatet (brukerbeslutninger og tekniske anbefalinger)'}\n")
        o.append(f"\n#### {r['id']} – {r['title']}\n")
        o.append(f"{r['text']}\n\n")
        o.append(f"- **Kilde:** {src(r)} · **Opprinnelse:** {r['origin']} · **Type:** {r['type']} · **Prioritet:** {r['priority']} · **Fase:** {r['phase'] if r['phase'] is not None else '–'}\n")
        o.append(f"- **Moduler:** {', '.join(r['modules'])}" + (f" · **Invarianter:** {', '.join(r['invariants'])}" if r['invariants'] else "") + "\n")
        if r["dependencies"]: o.append(f"- **Avhengigheter:** {'; '.join(map(str, r['dependencies']))}\n")
        o.append(f"- **Status:** {r['status']}\n")
        o.append("- **Akseptansekriterier:**\n" + "".join(f"  - {a}\n" for a in r["acceptance"]))
        o.append("- **Tester:**\n" + "".join(f"  - {t}\n" for t in r["tests"]))
        if r["implementation"]: o.append(f"- **Implementering:** {', '.join(r['implementation'])}\n")
        if r.get("notes"): o.append(f"- **Merknad:** {r['notes']}\n")
    return "".join(o)

def traceability_md():
    o = [HDR, "# Sporbarhetsmatrise – Animatic Studio\n\n",
         "Svarer på: hvor kravet kommer fra, hvilken modul som oppfyller det, hvilke filer som implementerer det, hvordan det testes, ",
         "om det er implementert, om det er endret og hvilken beslutning som tillot endringen.\n\n",
         "**Regel:** Et krav er ikke ferdig fordi kode er skrevet. Status *Verifisert* krever registrert verifikasjon (test eller kontroll) – håndheves av `scripts/kb/check_kb.py`.\n\n"]
    o.append("## Invarianter (kritiske systemregler)\n\n| Invariant | Beskrivelse | Krav | Verifiserte |\n|---|---|---|---|\n")
    for k, v in INVARIANTS.items():
        rs = [r for r in reqs if k in r["invariants"]]
        o.append(f"| {k} | {v} | {len(rs)} | {sum(r['status']=='Verifisert' for r in rs)} |\n")
    o.append("\n## Dekning per modul\n\n| Modul | Navn | Krav | P0 | Implementert | Verifisert |\n|---|---|---|---|---|---|\n")
    for k, v in MODULES.items():
        rs = [r for r in reqs if k in r["modules"]]
        o.append(f"| {k} | {v} | {len(rs)} | {sum(r['priority']=='P0' for r in rs)} | {sum(bool(r['implementation']) for r in rs)} | {sum(r['status']=='Verifisert' for r in rs)} |\n")
    o.append("\n## Dekning per fase\n\n| Fase | Krav | Verifisert |\n|---|---|---|\n")
    for ph in [1,2,3,4,5,6,7,8,None]:
        rs = [r for r in reqs if r["phase"] == ph]
        o.append(f"| {ph if ph else 'Tverrgående/prosess'} | {len(rs)} | {sum(r['status']=='Verifisert' for r in rs)} |\n")
    o.append("\n## Matrise\n\n| Krav | Kilde | Moduler | Implementering | Tester (plan) | Verifikasjon | Status | Siste endring |\n|---|---|---|---|---|---|---|---|\n")
    for r in reqs:
        h = r["history"][-1]
        o.append(f"| {r['id']} | {esc(src(r))} | {', '.join(r['modules'])} | {esc(', '.join(r['implementation']) or '–')} | {len(r['tests'])} | "
                 f"{esc(', '.join(map(str, r['verification'])) or '–')} | {r['status']} | {h['date']} {h.get('decision','')}: {esc(h['change'])} |\n")
    return "".join(o)

targets = {ROOT/"docs/product/REQUIREMENTS.md": requirements_md(), ROOT/"docs/product/TRACEABILITY_MATRIX.md": traceability_md()}
if "--check" in sys.argv:
    stale = [p.name for p, t in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != t]
    print("Utdatert: " + ", ".join(stale) if stale else "Oppdatert"); sys.exit(1 if stale else 0)
for p, t in targets.items(): p.write_text(t, encoding="utf-8")
print("Skrev", ", ".join(p.name for p in targets))
