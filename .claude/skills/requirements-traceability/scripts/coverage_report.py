#!/usr/bin/env python3
"""Dekningsrapport for kravregisteret (milepælsrevisjon, del B4).

Kjør fra hvor som helst i repoet:
    python3 .claude/skills/requirements-traceability/scripts/coverage_report.py [--phase N] [--all] [--limit N]

Skriver ut:
  1. Krav per status og per fase (og P0 per fase).
  2. P0-krav uten automatisert test registrert i `verification` (format `filsti::testnavn`),
     og P0-krav uten planlagte tester i `tests`.
  3. Krav med `implementation` men uten `verification`.
  4. Implementering/verifikasjon som peker på filer som ikke finnes, eller har ukjent format.
  5. Krav i inneværende fase som ikke er nevnt i CURRENT_WORK.md eller ROADMAP.md.

Inneværende fase: --phase, ellers «Fase N» i docs/development/CURRENT_WORK.md, ellers laveste fase
med krav som ikke er Verifisert/Utsatt/Utgått. Kilden for valget skrives ut.

Leser bare; endrer ingen filer. Avslutter med kode 0 (rapport), 2 ved manglende repo/kb_lib.
Gjenbruker scripts/kb/kb_lib.py (STATUSES, PRIORITIES, load_reqs, ROOT).
"""
import argparse
import collections
import pathlib
import re
import sys


def find_repo_root(start: pathlib.Path) -> pathlib.Path:
    for p in [start, *start.parents]:
        if (p / "scripts/kb/kb_lib.py").is_file():
            return p
    sys.exit("Fant ikke repo-rot (scripts/kb/kb_lib.py) over " + str(start))


REPO = find_repo_root(pathlib.Path(__file__).resolve().parent)
sys.path.insert(0, str(REPO / "scripts/kb"))
try:
    import kb_lib  # noqa: E402
except ImportError as exc:  # pragma: no cover
    print(f"Kunne ikke importere kb_lib: {exc}", file=sys.stderr)
    sys.exit(2)

DEV = REPO / "docs/development"
PLAN_FILES = [DEV / "CURRENT_WORK.md", DEV / "ROADMAP.md", REPO / "docs/product/ROADMAP.md"]
DONE = {"Verifisert", "Utsatt", "Utgått"}
AUTO_TEST = re.compile(r"^\s*([^\s:][^:]*?)::(.+)$")  # filsti::testnavn
MANUAL = re.compile(r"^\s*manuell:\s*\d{4}-\d{2}-\d{2}\s+\S")


def phase_label(ph):
    return "Tverrgående" if ph is None else f"Fase {ph}"


def short(items, limit, show_all):
    items = list(items)
    if show_all or len(items) <= limit:
        return items, 0
    return items[:limit], len(items) - limit


def print_list(title, rows, limit, show_all):
    print(f"\n## {title}: {len(rows)}")
    shown, rest = short(rows, limit, show_all)
    for r in shown:
        print("  - " + r)
    if rest:
        print(f"  … og {rest} til (bruk --all)")


def detect_phase(reqs, arg_phase):
    if arg_phase is not None:
        return arg_phase, "--phase"
    cw = DEV / "CURRENT_WORK.md"
    if cw.is_file():
        m = re.search(r"\b[Ff]ase\s*:?\s*(\d)\b", cw.read_text(encoding="utf-8"))
        if m:
            return int(m.group(1)), "CURRENT_WORK.md"
    open_phases = sorted({r["phase"] for r in reqs if r["phase"] is not None and r["status"] not in DONE})
    if open_phases:
        return open_phases[0], "laveste fase med åpne krav (fant ikke «Fase N» i CURRENT_WORK.md)"
    return None, "ingen åpne faser"


def main():
    ap = argparse.ArgumentParser(description="Dekningsrapport for requirements.yaml")
    ap.add_argument("--phase", type=int, help="Inneværende fase (1–8)")
    ap.add_argument("--all", action="store_true", help="Vis alle linjer i listene")
    ap.add_argument("--limit", type=int, default=15, help="Maks linjer per liste (standard 15)")
    a = ap.parse_args()

    reqs = kb_lib.load_reqs()["requirements"]
    print(f"# Dekningsrapport – {len(reqs)} krav ({kb_lib.REQS.relative_to(REPO)})")

    # 1 status og fase
    st = collections.Counter(r["status"] for r in reqs)
    print("\n## Krav per status")
    for s in kb_lib.STATUSES:
        print(f"  {s:<32} {st.get(s, 0):>4}")
    unknown = set(st) - set(kb_lib.STATUSES)
    if unknown:
        print("  UKJENTE STATUSER:", ", ".join(sorted(unknown)))

    phases = sorted({r["phase"] for r in reqs}, key=lambda p: (p is None, p or 0))
    print("\n## Krav per fase (totalt / P0 / implementert / verifisert)")
    for ph in phases:
        rs = [r for r in reqs if r["phase"] == ph]
        print(f"  {phase_label(ph):<12} {len(rs):>4} / {sum(r['priority'] == 'P0' for r in rs):>3}"
              f" / {sum(bool(r['implementation']) for r in rs):>3} / {sum(r['status'] == 'Verifisert' for r in rs):>3}")

    # 2 P0 uten tester
    def has_auto(r):
        return any(AUTO_TEST.match(str(v)) for v in r.get("verification", []))

    p0 = [r for r in reqs if r["priority"] == "P0" and r["status"] != "Utgått"]
    print_list("P0-krav uten automatisert test i verification",
               [f"{r['id']} [{phase_label(r['phase'])}] {r['title']} – {r['status']}" for r in p0 if not has_auto(r)],
               a.limit, a.all)
    print_list("P0-krav uten planlagte tester (tests er tom)",
               [f"{r['id']} {r['title']}" for r in p0 if not r.get("tests")], a.limit, a.all)

    # 3 implementering uten verifikasjon
    print_list("Krav med implementering men uten verifikasjon",
               [f"{r['id']} {r['title']} – {r['status']} – {', '.join(map(str, r['implementation']))}"
                for r in reqs if r.get("implementation") and not r.get("verification")], a.limit, a.all)

    # 4 ugyldige/uløste verifikasjoner
    bad = []
    for r in reqs:
        for impl in r.get("implementation", []):
            path = str(impl).split("#", 1)[0].strip()
            if path and not (REPO / path).exists():
                bad.append(f"{r['id']}: implementeringsfil finnes ikke – {impl}")
        for v in r.get("verification", []):
            v = str(v)
            m = AUTO_TEST.match(v)
            if m:
                if not (REPO / m.group(1).strip()).is_file():
                    bad.append(f"{r['id']}: testfil finnes ikke – {v}")
            elif not MANUAL.match(v):
                bad.append(f"{r['id']}: ukjent format (forvent «fil::test» eller «manuell: ÅÅÅÅ-MM-DD …») – {v}")
    print_list("Implementering/verifikasjon som ikke kan etterprøves", bad, a.limit, a.all)

    # 5 inneværende fase vs. plan
    phase, how = detect_phase(reqs, a.phase)
    plan_text = ""
    found = [p for p in PLAN_FILES if p.is_file()]
    for p in found:
        plan_text += p.read_text(encoding="utf-8")
    mentioned = set(re.findall(r"REQ-\d{4}", plan_text))
    print(f"\n## Inneværende fase: {phase_label(phase) if phase is not None else '–'} (kilde: {how})")
    print("  Planfiler lest: " + (", ".join(str(p.relative_to(REPO)) for p in found) if found else
                                 "ingen (CURRENT_WORK.md/ROADMAP.md finnes ikke ennå)"))
    if phase is not None:
        missing = [f"{r['id']} {r['priority']} {r['title']} – {r['status']}" for r in reqs
                   if r["phase"] == phase and r["status"] not in DONE and r["id"] not in mentioned]
        print_list(f"Åpne krav i {phase_label(phase)} som ikke er nevnt i CURRENT_WORK/ROADMAP", missing, a.limit, a.all)
    return 0


if __name__ == "__main__":
    sys.exit(main())
