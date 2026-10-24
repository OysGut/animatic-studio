"""C-8 kontraktstest: Python-klienten og begge tilleggene mot det ekte /api/v1-handleren med falsk lagring.
Startes av tests/unit/c8-python.test.ts med en lokal server på 127.0.0.1 (ingen eksterne kall).
Skriver ett JSON-resultat på stdout."""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGINS = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [HERE, os.path.join(PLUGINS, "python-common"), os.path.join(PLUGINS, "krita"), os.path.join(PLUGINS, "blender")]
import fakes  # noqa: E402
fakes.install_krita()
fakes.install_bpy_stub()
import ptg_client  # noqa: E402
from ptg_krita import logic as krita  # noqa: E402
from pentoglass import logic as blender  # noqa: E402

cfg = json.loads(sys.argv[1])
out = {"parity": {
    "timecode": [blender.frames_to_timecode(f, r) for f, r in cfg["timecodes"]],
    "idempotency": ptg_client.idempotency_key(*cfg["idem"]),
    "pkce": ptg_client.pkce_challenge(cfg["verifier"]),
}}
tmp = tempfile.mkdtemp()
png = bytes.fromhex(cfg["pngHex"])


def client(cid):
    c = ptg_client.PtgClient(cfg["base"], cid, sleep=lambda s: None)
    shown = []
    c.device_login(shown.append)
    return c, shown[0]


# ---------- Krita ----------
k, shown = client("ptg.krita")
out["deviceShown"] = sorted(shown)
pid = k.tokens.load()["projectId"]
m = k.manifest(pid)
out["manifestItems"] = len(m["items"])
asset = next(a for a in k.assets(pid) if a["id"] == cfg["assetId"])
ver = next(v for v in k.versions(pid, asset["id"]) if v["id"] == cfg["v1"])
app = fakes.FakeKritaApp(lambda p: [fakes.FakeNode("Lag 1")], png)
doc = krita.open_version(app, k, pid, asset, ver, tmp)
out["kritaLink"] = krita.read_link(doc)
out["kritaOpenedName"] = os.path.basename(doc.path)
t1 = krita.send_back(k, doc, tmp)
t2 = krita.send_back(k, doc, tmp)
out["krita"] = {"status": t1["status"], "candidate": t1["candidateVersionId"], "conflict": t1["conflictId"], "sameTransfer": t1["id"] == t2["id"]}

# ---------- Blender ----------
b, _ = client("ptg.blender")
plan = b.blender_cameras(pid, cfg["occurrenceId"])
out["plan"] = plan
bpy = fakes.make_bpy()
obj = blender.apply_camera_plan(bpy, plan)
out["blenderCamera"] = {"lens": obj.data.lens, "sensorWidth": obj.data.sensor_width, "sensorHeight": obj.data.sensor_height,
                        "fov": blender.fov_deg(obj.data.lens, obj.data.sensor_width), "resolution": [bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y]}
link = json.loads(bpy.context.scene[blender.LINK_KEY])
files = []
for f in (0, 25):
    p = os.path.join(tmp, "render_%04d.png" % f)
    with open(p, "wb") as fh:
        fh.write(png)
    files.append((f, p))
res = blender.send_renders(b, link, plan["fps"], files, {"assetId": cfg["assetId"], "variantId": cfg["variantId"], "baseVersionId": None}, "2026-10-24T12:00:00Z")
out["renders"] = [{"status": r["status"], "candidate": r["candidateVersionId"], "conflict": r["conflictId"]} for r in res]
conflict = krita.find_conflict(b, pid, res[0]["conflictId"]) if res[0]["conflictId"] else None
out["resolveIncoming"] = krita.resolve(b, pid, conflict, "choose_incoming") if conflict else None
out["resolveKeepBoth"] = krita.resolve(b, pid, conflict, "keep_both") if conflict else None
try:
    b.blender_cameras(pid, "bad id!")
    out["badRequest"] = None
except ptg_client.ConnectorError as e:
    out["badRequest"] = e.code

b.logout()
try:
    b.session()
    out["afterLogout"] = "ok"
except ptg_client.ConnectorError as e:
    out["afterLogout"] = e.code
print(json.dumps(out))
