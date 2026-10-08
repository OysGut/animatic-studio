"""Felles hjelpefunksjoner for kunnskapsbasen (krav, sporbarhet, kontroller)."""
import re, hashlib, pathlib, yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs/product/MASTER_SPECIFICATION.md"
SPEC_MANIFEST = ROOT / "docs/product/SPEC_MANIFEST.yaml"
REQS = ROOT / "docs/product/requirements.yaml"
COVERAGE = ROOT / "docs/product/spec_coverage.yaml"

STATUSES = ["Ikke startet", "Under arbeid", "Implementert – ikke verifisert", "Verifisert",
            "Endret – må reverifiseres", "Utsatt", "Utgått"]
PRIORITIES = ["P0", "P1", "P2", "P3"]
TYPES = ["funksjonell", "arkitektur", "data", "sikkerhet", "design", "ux", "ikke-funksjonell", "prosess", "prinsipp"]
ORIGINS = ["mandat", "brukerbeslutning", "teknisk-anbefaling"]
MODULES = {
    "CORE": "Project Core", "SCRIPT": "Screenplay Engine", "TIMELINE": "Timeline & Assembly Engine",
    "LIBRARY": "Resource Library", "CONTINUITY": "Continuity Engine", "COMPOSE": "2D Composition Engine",
    "CAMERA": "Camera & Motion Engine", "AUDIO": "Audio Engine", "PROMPT": "Prompt Orchestration Engine",
    "PROVIDER": "Provider Adapters", "QUALITYCOST": "Quality & Cost Engine", "QUEUE": "Render Queue",
    "VERSION": "Version & Dependency Engine", "L10N": "Localization Engine", "PRESENT": "Presentation Engine",
    "EXPORT": "Export Engine", "SECURITY": "Security & Storage", "COLLAB": "Collaboration & Access",
    "UI": "Brukergrensesnitt og designsystem", "PROCESS": "Arbeidsmåte og utviklingsprosess",
}
INVARIANTS = {
    "INV-01": "Manus og film er to visninger av samme aktive produksjonsstruktur.",
    "INV-02": "Scenenumre er ikke permanente identifikatorer.",
    "INV-03": "En scene beholder identitet gjennom flytting og omnummerering.",
    "INV-04": "Spinoffer kan bruke samme kildescene med selvstendig rekkefølge og lokale endringer.",
    "INV-05": "Norsk er hovedmanus.",
    "INV-06": "Andre språkversjoner endrer ikke norsk hovedmanus automatisk.",
    "INV-07": "Ferdige filmsekvenser overskrives ikke automatisk etter manusendringer.",
    "INV-08": "Brukeren kan godkjenne avvik, oppdatere produksjonsmateriale eller angre relevant endring.",
    "INV-09": "Karakterkontinuitet følger fortellingstid, også ved flashbacks.",
    "INV-10": "Produksjonsteknisk segmentering endrer ikke manusscenenes identiteter.",
    "INV-11": "Generativ AI er valgfritt for ordinær 2D-animatic-avspilling og eksport.",
    "INV-12": "Betalte API-kall følger eksplisitte kostnadsgodkjenninger.",
    "INV-13": "Delte ressurser er versjonerte og ikke-destruktive.",
    "INV-14": "Deaktivering/skjuling er aldri sletting; materiale kan gjenaktiveres.",
    "INV-C1": "Ingen stille overskriving ved samarbeid (revisjonskontroll) – DEC-0003/DEC-0010.",
    "INV-C2": "Tilgang håndheves i backend (RLS) – teknisk, DEC-0010.",
    "INV-C3": "Bare medlemmer med kostnadsrett kan godkjenne betalte kall – midlertidig, DEC-0018/Q-01.",
}

def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()

def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

def load_reqs():
    return load_yaml(REQS)

def parse_lines(spec_str):
    """'7, 24' / '8-23' / '93-109; 120' -> set of ints"""
    out = set()
    for part in re.split(r"[,;]\s*", str(spec_str or "")):
        m = re.match(r"\s*(\d+)\s*(?:[-–]\s*(\d+))?", part)
        if m:
            a = int(m.group(1)); b = int(m.group(2) or a)
            out.update(range(a, b + 1))
    return out
