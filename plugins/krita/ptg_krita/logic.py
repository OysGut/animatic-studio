"""C-8 Krita: ren logikk uten Qt-avhengighet, så den kan testes med en falsk `krita`-modul.

- Åpne: en ressursversjon hentes fra API v1 (PSD med lag eller PNG) og åpnes i Krita. Krita leser PSD-lag
  selv (navn, synlighet, opasitet og alfa). En C-1-pakke (mappe eller ZIP med manifest.json) kan også åpnes.
- Koblingen til Pen to Glass lagres som dokumentannotasjon «ptg-link» (JSON med prosjekt-, ressurs-,
  variant- og versjons-ID fra manifestet). Filnavn brukes aldri til kobling.
- Send tilbake: dokumentet flates til PNG med alfa og lastes opp som ny kandidatversjon via C-0 med
  revisjonsgrunnlaget fra koblingen. Konflikter får de tre valgene. Ingenting brukes automatisk.
Takhøyder per dokument: 64 MB per fil (C-0), 500 lag i oversikten.
"""
from __future__ import annotations

import json
import os
import re
import zipfile

try:  # i Krita ligger klienten ved siden av tillegget (pakkeskriptet kopierer den inn)
    from . import ptg_client as _c  # type: ignore
except ImportError:  # tester og utvikling
    import ptg_client as _c  # type: ignore

CLIENT_ID = "ptg.krita"
ADAPTER = {"id": "krita-python", "version": "1"}
LINK_ANNOTATION = "ptg-link"
MAX_LAYERS = 500
CONFLICT_CHOICES = ("keep_both", "choose_current", "choose_incoming")
_EXT = {"image/vnd.adobe.photoshop": "psd", "image/png": "png", "image/jpeg": "jpg", "image/tiff": "tif"}


def _bytes(v) -> bytes:
    if isinstance(v, (bytes, bytearray)):
        return bytes(v)
    data = getattr(v, "data", None)  # QByteArray
    return bytes(data()) if callable(data) else bytes(v)


def make_link(project_id, asset_id, variant_id, version_id, revision, target_kind="asset", return_url=None) -> dict:
    return {"v": 1, "projectId": project_id, "assetId": asset_id, "variantId": variant_id, "baseVersionId": version_id,
            "revision": revision, "targetKind": target_kind, "returnUrl": return_url}


def write_link(doc, link: dict) -> None:
    doc.setAnnotation(LINK_ANNOTATION, "From Pen to Glass", json.dumps(link, sort_keys=True).encode("utf-8"))


def read_link(doc) -> dict | None:
    try:
        raw = doc.annotation(LINK_ANNOTATION)
    except Exception:  # noqa: BLE001 – eldre Krita uten annotasjoner
        return None
    if not raw:
        return None
    try:
        link = json.loads(_bytes(raw).decode("utf-8"))
    except ValueError:
        return None
    return link if isinstance(link, dict) and link.get("v") == 1 and link.get("projectId") else None


def layer_summary(doc) -> list[dict]:
    """Lag i dokumentet (navn, synlighet, opasitet 0–1, type). Brukes i panelet og i testene."""
    out: list[dict] = []

    def walk(node, depth):
        for child in node.childNodes():
            if len(out) >= MAX_LAYERS:
                return
            out.append({"name": child.name(), "visible": bool(child.visible()), "opacity": round(child.opacity() / 255, 4),
                        "type": child.type(), "depth": depth})
            walk(child, depth + 1)
    walk(doc.rootNode(), 0)
    return out


def open_version(app, client, project_id: str, asset: dict, version: dict, workdir: str):
    """Henter en versjon og åpner den. PSD beholder lagene; PNG blir ett lag med alfa."""
    got = client.download(project_id, asset["id"], version["id"])
    ext = _EXT.get(version.get("mimeType") or got["mimeType"])
    if not ext:
        raise _c.ConnectorError(415, "unsupported_type")
    os.makedirs(workdir, exist_ok=True)
    path = os.path.join(workdir, f"{version['id']}.{ext}")  # filnavn er bare lagring, aldri kobling
    with open(path, "wb") as f:
        f.write(got["bytes"])
    doc = app.openDocument(path)
    write_link(doc, make_link(project_id, asset["id"], version["variantId"], version["id"], asset.get("revision", 0)))
    _show(app, doc)
    return doc


def read_handoff(path: str) -> dict:
    """Leser en C-1-pakke (mappe eller ZIP): manifest.json, fil og returlenke fra README.txt."""
    def read(name):
        if os.path.isdir(path):
            p = os.path.join(path, name)
            return open(p, "rb").read() if os.path.exists(p) else None
        with zipfile.ZipFile(path) as z:
            return z.read(name) if name in z.namelist() else None
    raw = read("manifest.json")
    if raw is None:
        raise _c.ConnectorError(400, "missing_manifest")
    m = json.loads(raw.decode("utf-8"))
    issues = _c.validate_manifest(m)
    if issues:
        raise _c.ConnectorError(400, "invalid_manifest")
    item = next((i for i in m["items"] if i.get("files") and i["kind"] in ("asset", "panel")), None)
    if not item:
        raise _c.ConnectorError(400, "no_target")
    f = item["files"][0]
    data = read(f["path"])
    if data is None or _c.sha256_hex(data) != f.get("sha256"):
        raise _c.ConnectorError(400, "checksum_mismatch")
    readme = (read("README.txt") or b"").decode("utf-8", "replace")
    url = re.search(r"https://[^\s<>\"]+/retur[^\s<>\"]*", readme)
    base = item.get("base") or {}
    return {"manifest": m, "item": item, "file": f, "data": data,
            "returnUrl": url.group(0) if url else None,
            "baseVersionId": base.get("id") if base.get("entity") == "asset_version" else None}


def open_handoff(app, client, path: str, workdir: str):
    h = read_handoff(path)
    m, item = h["manifest"], h["item"]
    os.makedirs(workdir, exist_ok=True)
    ext = "psd" if h["file"]["mimeType"] == "image/vnd.adobe.photoshop" else "png"
    local = os.path.join(workdir, f"{item['id']}.{ext}")
    with open(local, "wb") as f:
        f.write(h["data"])
    variant_id = None
    if item["kind"] == "asset" and h["baseVersionId"] and client is not None:
        v = next((v for v in client.versions(m["projectId"], item["id"]) if v["id"] == h["baseVersionId"]), None)
        variant_id = v["variantId"] if v else None
    doc = app.openDocument(local)
    write_link(doc, make_link(m["projectId"], item["id"] if item["kind"] == "asset" else None, variant_id,
                              h["baseVersionId"], item.get("revision", 0), item.get("targetKind", item["kind"]), h["returnUrl"]))
    _show(app, doc)
    return doc


def export_png(doc, path: str) -> bytes:
    """Flater til PNG med alfa (Krita sin egen eksport). Lagene blir værende i Krita-dokumentet."""
    from krita import InfoObject  # type: ignore
    info = InfoObject()
    info.setProperty("alpha", True)
    info.setProperty("compression", 6)
    info.setProperty("saveSRGBProfile", True)
    doc.setBatchmode(True)
    try:
        doc.refreshProjection()
        if not doc.exportImage(path, info):
            raise _c.ConnectorError(500, "export_failed")
    finally:
        doc.setBatchmode(False)
    with open(path, "rb") as f:
        return f.read()


def send_back(client, doc, workdir: str, on_progress=None) -> dict:
    """Ny kandidatversjon via C-0 med revisjonsgrunnlag. Returnerer overføringen (med conflictId ved konflikt)."""
    link = read_link(doc)
    if not link:
        raise _c.ConnectorError(400, "not_linked")
    os.makedirs(workdir, exist_ok=True)
    data = export_png(doc, os.path.join(workdir, "ptg-return.png"))
    if not link.get("assetId") or not link.get("variantId"):
        # Panel fra C-1: kandidaten lages på C-1-retursiden (som for andre panelreturer), ikke her.
        return {"status": "use_return_page", "returnUrl": link.get("returnUrl"), "bytes": len(data)}
    name = f"{link['assetId']}.png"
    t = client.upload(link["projectId"], name, data, link["assetId"], link["variantId"], link.get("baseVersionId"), on_progress)
    return t


def find_conflict(client, project_id: str, conflict_id: str) -> dict | None:
    return next((c for c in client.conflicts(project_id) if c["id"] == conflict_id), None)


def resolve(client, project_id: str, conflict: dict, choice: str) -> dict:
    if choice not in CONFLICT_CHOICES:
        raise ValueError(choice)
    try:
        return client.resolve_conflict(project_id, conflict["id"], choice, conflict["revision"])
    except _c.ConnectorError as e:
        if e.code == "approve_in_app":
            return {"resolved": False, "choice": "choose_incoming", "approveInApp": True}
        raise


def _show(app, doc):
    w = app.activeWindow() if hasattr(app, "activeWindow") else None
    if w is not None:
        w.addView(doc)
