#!/usr/bin/env python3
"""Kontrollerer kunnskapsbasen. Kjør: python3 scripts/kb/check_kb.py  (avslutter med feilkode ved feil)

Kontroller:
 1. MASTER_SPECIFICATION.md er byte-identisk med registrert kontrollsum (aldri endres).
 2. requirements.yaml: gyldige felt, unike og fortløpende ID-er, gyldige verdier, avhengigheter peker på eksisterende krav.
 3. Kravdekning: hver innholdslinje i mandatet er dekket av minst ett krav (rapport), hver ##-overskrift i spec_coverage.
 4. Status-regel: «Verifisert» krever minst én verifikasjon (test/kontroll). «Implementert» krever implementeringsreferanse.
 5. Skills: gyldig frontmatter etter Agent Skills-spesifikasjonen.
 6. Genererte dokumenter er oppdatert (REQUIREMENTS.md / TRACEABILITY_MATRIX.md).
"""
import re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from kb_lib import *

errors, warnings = [], []

# 1 spesifikasjonen
man = load_yaml(SPEC_MANIFEST)
if sha256(SPEC) != man["sha256"]:
    errors.append("MASTER_SPECIFICATION.md er ENDRET (kontrollsum stemmer ikke). Den skal aldri endres – endringer registreres som beslutninger.")

# 2 krav
data = load_reqs(); reqs = data["requirements"]; ids = [r["id"] for r in reqs]
if len(ids) != len(set(ids)): errors.append("Dupliserte krav-ID-er")
for i, rid in enumerate(ids, 1):
    if rid != f"REQ-{i:04d}": errors.append(f"ID-rekkefølge brutt ved {rid} (forventet REQ-{i:04d}). ID-er skal aldri omnummereres eller fjernes."); break
idset = set(ids)
required = ["id","title","text","origin","source","type","priority","phase","modules","invariants","dependencies","acceptance","tests","status","implementation","verification","history"]
for r in reqs:
    for k in required:
        if k not in r: errors.append(f"{r.get('id')}: mangler felt {k}")
    if r.get("priority") not in PRIORITIES: errors.append(f"{r['id']}: ugyldig prioritet {r.get('priority')}")
    if r.get("type") not in TYPES: errors.append(f"{r['id']}: ugyldig type {r.get('type')}")
    if r.get("origin") not in ORIGINS: errors.append(f"{r['id']}: ugyldig opprinnelse {r.get('origin')}")
    if r.get("status") not in STATUSES: errors.append(f"{r['id']}: ugyldig status {r.get('status')}")
    for m in r.get("modules", []):
        if m not in MODULES: errors.append(f"{r['id']}: ukjent modul {m}")
    for v in r.get("invariants", []):
        if v not in INVARIANTS: errors.append(f"{r['id']}: ukjent invariant {v}")
    for d in r.get("dependencies", []):
        for ref in re.findall(r"REQ-\d{4}", str(d)):
            if ref not in idset: errors.append(f"{r['id']}: avhengighet til ukjent {ref}")
    if not r.get("acceptance"): errors.append(f"{r['id']}: mangler akseptansekriterier")
    if r.get("origin") == "mandat" and not r["source"].get("section"): errors.append(f"{r['id']}: mandatkrav uten kapittelreferanse")
    if r.get("origin") != "mandat" and not r["source"].get("decision"): errors.append(f"{r['id']}: krav utenfor mandatet må vise til en beslutning (DEC-xxxx)")
    if r.get("status") == "Verifisert" and not r.get("verification"):
        errors.append(f"{r['id']}: status Verifisert uten registrert verifikasjon")
    if r.get("status") in ("Implementert – ikke verifisert", "Verifisert") and not r.get("implementation"):
        errors.append(f"{r['id']}: status {r['status']} uten implementeringsreferanse")
    if r.get("status") == "Utgått" and not any(h.get("decision") for h in r.get("history", [])[1:]):
        errors.append(f"{r['id']}: Utgått uten beslutning i historikken")

# 3 dekning
spec_lines = SPEC.read_text(encoding="utf-8").splitlines()
covered = set()
for r in reqs:
    if r.get("origin") == "mandat": covered |= parse_lines(r["source"].get("lines"))
uncovered = [i for i, l in enumerate(spec_lines, 1)
             if l.strip() and not l.lstrip().startswith("##") and not l.strip().startswith("```") and not l.rstrip().endswith(":") and i not in covered]  # innledningslinjer («…:») teller ikke
cov = load_yaml(COVERAGE)["coverage"]
heads = [l for l in spec_lines if l.startswith("## ")]
if len(cov) < 150: warnings.append(f"spec_coverage.yaml har bare {len(cov)} poster")
for c in cov:
    if not c.get("reqs") and not c.get("no_req_reason"):
        errors.append(f"Overskrift {c.get('section')} uten krav og uten begrunnelse")

# 5 skills
skills = sorted((ROOT / ".claude/skills").glob("*/SKILL.md"))
for s in skills:
    txt = s.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m: errors.append(f"{s}: mangler YAML-frontmatter"); continue
    try:
        fm = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        errors.append(f"{s.parent.name}: ugyldig YAML i frontmatter ({str(e).splitlines()[0]}) – sett description i anførselstegn eller unngå «: »"); continue
    name, desc = fm.get("name"), fm.get("description", "")
    if name != s.parent.name: errors.append(f"{s.parent.name}: name «{name}» må være lik mappenavnet")
    if not name or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name) or len(name) > 64: errors.append(f"{s.parent.name}: ugyldig name")
    if not desc or len(desc) > 1024: errors.append(f"{s.parent.name}: description mangler eller er over 1024 tegn")
    if len(txt.splitlines()) > 500: warnings.append(f"{s.parent.name}: SKILL.md over 500 linjer – flytt stoff til references/")
    for ref in re.findall(r"\]\(((?:references|scripts|assets)/[^)#]+)\)", txt):
        if not (s.parent / ref).exists(): errors.append(f"{s.parent.name}: lenke til manglende fil {ref}")

# 6 genererte filer
import subprocess
res = subprocess.run([sys.executable, str(pathlib.Path(__file__).parent / "build_docs.py"), "--check"], capture_output=True, text=True)
if res.returncode != 0: errors.append("REQUIREMENTS.md/TRACEABILITY_MATRIX.md er ikke regenerert etter endring i requirements.yaml (kjør scripts/kb/build_docs.py)")

print(f"Krav: {len(reqs)} | Skills: {len(skills)} | Mandatlinjer uten kravreferanse: {len(uncovered)}")
if uncovered and "-v" in sys.argv:
    for i in uncovered: print(f"  linje {i}: {spec_lines[i-1].strip()[:100]}")
for w in warnings: print("ADVARSEL:", w)
for e in errors: print("FEIL:", e)
print("OK" if not errors else f"{len(errors)} feil")
sys.exit(1 if errors else 0)
