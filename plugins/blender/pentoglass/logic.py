"""C-8 Blender: ren logikk. `bpy` gis inn, så alt kan testes med en falsk bpy-modul.

- Kamera: SB-9-kameraene per panel (API v1 /blender/cameras) blir ett Blender-kamera med nøkkelbilder på
  hvert panels start (konstant interpolasjon), brennvidde i mm, sensorbredde og -høyde fra panelets
  bildeformat (sensor_fit HORIZONTAL), oppløsning og bildefrekvens fra prosjektet. Markører bærer panel-ID.
- Bevegelse innen skudd: den eksisterende PTG3/FBX-eksporten (Til produksjonen) importeres uendret.
- Referanser: bilder (ressursversjoner eller paneler fra en C-1-pakke) som bakgrunn i kameravisningen.
- Rendringer tilbake: PNG-sekvens (tidskode og manifest i tEXt-biter per bilde) eller video (MP4/MOV) blir
  kandidatversjoner via C-0. Ingenting tas i bruk automatisk. Kobling på ID, aldri filnavn.
Takhøyder per sending: 250 bilder i en PNG-sekvens, 64 MB per fil (C-0), 2000 paneler per plan.
"""
from __future__ import annotations

import json
import math
import os
import struct
import zlib

try:
    from . import ptg_client as _c  # type: ignore
except ImportError:
    import ptg_client as _c  # type: ignore

CLIENT_ID = "ptg.blender"
ADAPTER = {"id": "blender-python", "version": "1"}
CAMERA_NAME = "PTG Camera"
LINK_KEY = "ptg_link"
EYE_HEIGHT_M = 1.6
MAX_RETURN_FRAMES = 250


def frames_to_timecode(frames: int, fps: dict) -> str:
    """Samme regel som framesToTimecode i kjernen (ikke-dropframe, avrundet bildefrekvens)."""
    n = round(fps["num"] / fps["den"]) or 1
    f = max(0, int(math.floor(frames)))
    return "%02d:%02d:%02d:%02d" % (f // (n * 3600), (f // (n * 60)) % 60, (f // n) % 60, f % n)


def fov_deg(focal_mm: float, sensor_mm: float) -> float:
    """Synsvinkel som Blender regner den (samme formel som fieldOfView i SB-9)."""
    return 2 * math.atan(sensor_mm / (2 * focal_mm)) * 180 / math.pi


def apply_camera_plan(bpy, plan: dict) -> object:
    """Lager eller oppdaterer «PTG Camera» og scenens format. Returnerer kameraobjektet."""
    scene = bpy.context.scene
    fps = plan["fps"]
    scene.render.fps = max(1, round(fps["num"] / fps["den"]))
    scene.render.fps_base = scene.render.fps * fps["den"] / fps["num"]
    scene.render.resolution_x = int(plan["frameSize"]["width"])
    scene.render.resolution_y = int(plan["frameSize"]["height"])
    scene.render.resolution_percentage = 100
    obj = bpy.data.objects.get(CAMERA_NAME)
    if obj is None:
        data = bpy.data.cameras.new(CAMERA_NAME)
        obj = bpy.data.objects.new(CAMERA_NAME, data)
        scene.collection.objects.link(obj)
    cam = obj.data
    cam.sensor_fit = "HORIZONTAL"
    scene.camera = obj
    start = scene.frame_start
    for m in [m for m in scene.timeline_markers if m.name.startswith("ptg:")]:
        scene.timeline_markers.remove(m)
    last = None
    for k in plan["keys"]:
        frame = start + int(k["frame"])
        marker = scene.timeline_markers.new("ptg:%s %s" % (k["panelId"], k["panelName"]), frame=frame)
        marker.camera = obj
        c = k.get("camera") or last
        if not c:
            continue
        last = c
        cam.lens = float(c["focalMm"])
        cam.sensor_width = float(c["sensorWidthMm"])
        cam.sensor_height = float(c["sensorHeightMm"])
        # Blokkingplanen er sett ovenfra (x mot høyre, y nedover); Blender: y oppover, z opp.
        obj.location = (float(c["x"]), -float(c["y"]), EYE_HEIGHT_M)
        obj.rotation_euler = (math.pi / 2, 0.0, math.radians(-float(c["heading"]) - 90.0))
        for path, owner in (("lens", cam), ("sensor_width", cam), ("sensor_height", cam), ("location", obj), ("rotation_euler", obj)):
            owner.keyframe_insert(data_path=path, frame=frame)
    for owner in (obj, cam):
        ad = getattr(owner, "animation_data", None)
        if ad and ad.action:
            for fc in ad.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "CONSTANT"
    if plan["keys"]:
        tail = plan["keys"][-1]
        scene.frame_end = start + int(tail["frame"]) + max(1, int(tail["durationFrames"])) - 1
    scene[LINK_KEY] = json.dumps({"v": 1, "projectId": plan["projectId"], "occurrenceId": plan["occurrenceId"], "sceneId": plan["sceneId"]})
    return obj


def import_fbx(bpy, path: str) -> None:
    """PTG3: FBX fra «Til produksjonen» (Dragonframe-pakken). Bruker Blenders egen FBX-import uendret."""
    if not path.lower().endswith(".fbx"):
        raise _c.ConnectorError(415, "unsupported_type")
    bpy.ops.import_scene.fbx(filepath=path)


def add_reference(bpy, image_path: str, alpha: float = 0.5, depth: str = "BACK") -> object:
    obj = bpy.data.objects.get(CAMERA_NAME) or bpy.context.scene.camera
    if obj is None:
        raise _c.ConnectorError(400, "no_camera")
    img = bpy.data.images.load(image_path, check_existing=True)
    bg = obj.data.background_images.new()
    bg.image = img
    bg.alpha = alpha
    bg.display_depth = depth
    obj.data.show_background_images = True
    return bg


def png_with_text(png: bytes, fields: dict) -> bytes:
    """Legger tEXt-biter inn rett etter IHDR. Pikslene endres ikke."""
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise _c.ConnectorError(415, "unsupported_type")
    ihdr_end = 8 + 8 + struct.unpack(">I", png[8:12])[0] + 4
    chunks = b""
    for k, v in fields.items():
        body = k.encode("latin-1") + b"\x00" + v.encode("latin-1", "replace")
        chunks += struct.pack(">I", len(body)) + b"tEXt" + body + struct.pack(">I", zlib.crc32(b"tEXt" + body) & 0xffffffff)
    return png[:ihdr_end] + chunks + png[ihdr_end:]


def read_png_text(png: bytes) -> dict:
    out, p = {}, 8
    while p + 8 <= len(png):
        n = struct.unpack(">I", png[p:p + 4])[0]
        kind = png[p + 4:p + 8]
        if kind == b"tEXt":
            k, _, v = png[p + 8:p + 8 + n].partition(b"\x00")
            out[k.decode("latin-1")] = v.decode("latin-1")
        p += 12 + n
    return out


def render_manifest(link: dict, fps: dict, frame: int, target: dict, now_iso: str) -> dict:
    m = {"manifestVersion": 1, "createdAt": now_iso, "projectId": link["projectId"], "frameRate": {"num": fps["num"], "den": fps["den"]},
         "sampleRate": 48000, "sourceApp": {"name": "Blender", "version": "4.2"}, "adapter": dict(ADAPTER),
         "items": [{"kind": "occurrence", "id": link["occurrenceId"], "timecode": frames_to_timecode(frame, fps)},
                   {"kind": "asset", "id": target["assetId"], "base": {"entity": "asset_version", "id": target.get("baseVersionId") or target["assetId"], "revision": 0}}]}
    assert not _c.validate_manifest(m)
    return m


def send_renders(client, link: dict, fps: dict, files: list, target: dict, now_iso: str, on_progress=None) -> list:
    """files: [(frame, path)]. PNG-sekvens eller én video. Hver fil blir en kandidatversjon."""
    if not files:
        raise _c.ConnectorError(400, "no_files")
    videos = [f for f in files if f[1].lower().endswith((".mp4", ".mov"))]
    if videos and len(files) > 1:
        raise _c.ConnectorError(400, "mixed_files")
    if len(files) > MAX_RETURN_FRAMES:
        raise _c.ConnectorError(413, "too_many_frames")
    out = []
    for i, (frame, path) in enumerate(sorted(files)):
        with open(path, "rb") as f:
            data = f.read()
        if not videos:
            m = render_manifest(link, fps, frame, target, now_iso)
            data = png_with_text(data, {"ptg:timecode": frames_to_timecode(frame, fps), "ptg:frame": str(frame),
                                        "ptg:occurrence": link["occurrenceId"], "ptg:manifest": json.dumps(m, sort_keys=True, separators=(",", ":"))})
        ext = os.path.splitext(path)[1].lower()
        name = "%s_%s%s" % (target["assetId"], frames_to_timecode(frame, fps).replace(":", ""), ext)
        out.append(client.upload(link["projectId"], name, data, target["assetId"], target["variantId"], target.get("baseVersionId")))
        if on_progress:
            on_progress(i + 1, len(files))
    return out


def scene_link(bpy) -> dict | None:
    raw = bpy.context.scene.get(LINK_KEY) if hasattr(bpy.context.scene, "get") else None
    try:
        link = json.loads(raw) if raw else None
    except ValueError:
        return None
    return link if isinstance(link, dict) and link.get("v") == 1 else None
