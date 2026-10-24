"""C-8 enhetstester uten Krita og Blender (falske moduler). Kjøres fra npm test via tests/unit/c8-python.test.ts."""
import json
import math
import os
import struct
import sys
import tempfile
import unittest
import zipfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGINS = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [HERE, os.path.join(PLUGINS, "python-common"), os.path.join(PLUGINS, "krita"), os.path.join(PLUGINS, "blender")]

import fakes  # noqa: E402
fakes.install_krita()
import ptg_client  # noqa: E402
import ptg_strings  # noqa: E402
from ptg_krita import logic as krita  # noqa: E402
from pentoglass import logic as blender  # noqa: E402


def tiny_png():
    raw = b"\x00\x00\x00\x00\x00"
    def chunk(k, b): return struct.pack(">I", len(b)) + k + b + struct.pack(">I", zlib.crc32(k + b) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


MANIFEST = {"manifestVersion": 1, "createdAt": "2026-10-24T12:00:00Z", "projectId": "p1", "frameRate": {"num": 25, "den": 1},
            "sampleRate": 48000, "sourceApp": {"name": "x", "version": "1"}, "adapter": {"id": "krita-python", "version": "1"},
            "items": [{"kind": "asset", "id": "a1"}]}


class ClientCore(unittest.TestCase):
    def test_manifest_valid_and_rejects_secrets_and_version(self):
        self.assertEqual(ptg_client.validate_manifest(MANIFEST), [])
        self.assertIn("$.manifestVersion:version", ptg_client.validate_manifest({**MANIFEST, "manifestVersion": 2}))
        self.assertTrue(any(i.endswith(":secret") for i in ptg_client.validate_manifest({**MANIFEST, "accessToken": "x"})))
        self.assertTrue(any(i.endswith(":secret") for i in ptg_client.validate_manifest({**MANIFEST, "note": "ptgc_abc"})))
        self.assertTrue(ptg_client.validate_manifest({**MANIFEST, "items": [{"kind": "file", "id": "x"}]}))

    def test_pkce_and_begin_authorization(self):
        c = ptg_client.PtgClient("https://ptg.test", "ptg.krita", random=lambda n: bytes(range(n)))
        f = c.begin_authorization(ptg_client.loopback_redirect(51234))
        self.assertIn("client_id=ptg.krita", f["url"])
        self.assertIn("redirect_uri=http%3A%2F%2F127.0.0.1%3A51234%2Fcallback", f["url"])
        self.assertIn("code_challenge=" + ptg_client.pkce_challenge(f["verifier"]), f["url"])
        with self.assertRaises(ptg_client.ConnectorError):
            c.complete_authorization("http://127.0.0.1:51234/callback?code=x&state=wrong", f)

    def test_no_secrets_in_plugin_sources(self):
        for base, _, files in os.walk(PLUGINS):
            if "dist" in base or base.startswith(os.path.join(PLUGINS, "node_modules")):
                continue
            for f in files:
                if f.endswith((".py", ".toml", ".desktop")):
                    txt = open(os.path.join(base, f), encoding="utf-8").read()
                    self.assertNotRegex(txt, r"(ptgc_|ptgr_|sb_secret_|sk-)[A-Za-z0-9]{8,}", f)

    def test_strings_have_all_languages(self):
        for k, v in ptg_strings.STRINGS.items():
            self.assertEqual(sorted(v), sorted(ptg_strings.LANGS), k)
        self.assertEqual(ptg_strings.pick_lang("nb_NO"), "nb")
        self.assertEqual(ptg_strings.tr("ja_JP", "error", code="x"), "問題が発生しました: x")


class Krita(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        layers = lambda p: [fakes.FakeNode("Bakgrunn", True, 255), fakes.FakeNode("Figur", False, 128, children=[fakes.FakeNode("Strek", True, 64)])]
        self.app = fakes.FakeKritaApp(layers, tiny_png())

    def test_link_roundtrip_and_layers(self):
        doc = self.app.openDocument(self._file("x.psd", b"8BPS"))
        link = krita.make_link("p1", "a1", "va1", "v1", 3)
        krita.write_link(doc, link)
        self.assertEqual(krita.read_link(doc), link)
        self.assertEqual(krita.layer_summary(doc), [
            {"name": "Bakgrunn", "visible": True, "opacity": 1.0, "type": "paintlayer", "depth": 0},
            {"name": "Figur", "visible": False, "opacity": 0.502, "type": "paintlayer", "depth": 0},
            {"name": "Strek", "visible": True, "opacity": 0.251, "type": "paintlayer", "depth": 1}])

    def test_handoff_package_links_on_ids_not_filename(self):
        data = b"8BPS fake psd"
        m = json.loads(json.dumps(MANIFEST))
        m["items"] = [{"kind": "project", "id": "p1"}, {"kind": "asset", "id": "a1", "revision": 2, "targetKind": "asset",
                       "base": {"entity": "asset_version", "id": "v1", "revision": 2},
                       "files": [{"path": "helt-annet-navn.psd", "sha256": ptg_client.sha256_hex(data), "byteSize": len(data), "mimeType": "image/vnd.adobe.photoshop"}]}]
        z = os.path.join(self.tmp, "pakke.zip")
        with zipfile.ZipFile(z, "w") as f:
            f.writestr("helt-annet-navn.psd", data); f.writestr("manifest.json", json.dumps(m))
            f.writestr("README.txt", "Send tilbake: https://pentoglass.com/retur?t=abc\n")
        h = krita.read_handoff(z)
        self.assertEqual((h["baseVersionId"], h["returnUrl"]), ("v1", "https://pentoglass.com/retur?t=abc"))
        client = type("C", (), {"versions": lambda s, p, a: [{"id": "v1", "variantId": "va1"}]})()
        doc = krita.open_handoff(self.app, client, z, self.tmp)
        self.assertEqual(krita.read_link(doc)["variantId"], "va1")
        self.assertTrue(doc.path.endswith("a1.psd"))
        with zipfile.ZipFile(z, "a") as f:
            pass
        bad = os.path.join(self.tmp, "bad.zip")
        with zipfile.ZipFile(bad, "w") as f:
            f.writestr("helt-annet-navn.psd", b"endret"); f.writestr("manifest.json", json.dumps(m))
        with self.assertRaises(ptg_client.ConnectorError):
            krita.read_handoff(bad)

    def test_send_back_unlinked_and_panel(self):
        doc = self.app.openDocument(self._file("y.png", tiny_png()))
        with self.assertRaises(ptg_client.ConnectorError):
            krita.send_back(None, doc, self.tmp)
        krita.write_link(doc, krita.make_link("p1", None, None, None, 1, "panel", "https://pentoglass.com/retur?t=x"))
        r = krita.send_back(None, doc, self.tmp)
        self.assertEqual(r["status"], "use_return_page")
        self.assertEqual(doc.exports[0][1]["alpha"], True)

    def _file(self, name, data):
        p = os.path.join(self.tmp, name)
        open(p, "wb").write(data)
        return p


PLAN = {"version": 1, "projectId": "p1", "occurrenceId": "o1", "sceneId": "s1", "fps": {"num": 24000, "den": 1001},
        "frameSize": {"width": 2048, "height": 858}, "truncated": False, "keys": [
            {"panelId": "pa", "panelName": "1A", "frame": 0, "durationFrames": 48, "width": 2048, "height": 858,
             "camera": {"id": "c1", "x": 2, "y": 3, "heading": 0, "focalMm": 35, "sensorWidthMm": 24.89, "sensorHeightMm": 24.89 * 858 / 2048, "fovHorizontalDeg": 0, "fovVerticalDeg": 0}},
            {"panelId": "pb", "panelName": "1B", "frame": 48, "durationFrames": 24, "width": 2048, "height": 858, "camera": None},
            {"panelId": "pc", "panelName": "1C", "frame": 72, "durationFrames": 12, "width": 2048, "height": 858,
             "camera": {"id": "c2", "x": 5, "y": 1, "heading": 90, "focalMm": 85, "sensorWidthMm": 24.89, "sensorHeightMm": 24.89 * 858 / 2048, "fovHorizontalDeg": 0, "fovVerticalDeg": 0}}]}


class Blender(unittest.TestCase):
    def test_camera_geometry_and_keys(self):
        bpy = fakes.make_bpy()
        obj = blender.apply_camera_plan(bpy, PLAN)
        sc = bpy.context.scene
        self.assertEqual((sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage), (2048, 858, 100))
        self.assertAlmostEqual(sc.render.fps / sc.render.fps_base, 24000 / 1001)
        self.assertEqual(obj.data.sensor_fit, "HORIZONTAL")
        lens = next(f for f in obj.data.animation_data.action.fcurves if f.data_path == "lens")
        # Panel uten kamera beholder forrige kamera: ett nøkkelbilde på 1B også.
        self.assertEqual([k.co for k in lens.keyframe_points], [(1, 35.0), (49, 35.0), (73, 85.0)])
        self.assertTrue(all(k.interpolation == "CONSTANT" for k in lens.keyframe_points))
        self.assertAlmostEqual(obj.data.sensor_width / obj.data.sensor_height, 2048 / 858)
        self.assertEqual([m.name.split(" ")[0] for m in sc.timeline_markers], ["ptg:pa", "ptg:pb", "ptg:pc"])
        self.assertEqual(sc.frame_end, 1 + 72 + 12 - 1)
        self.assertEqual(json.loads(sc[blender.LINK_KEY])["occurrenceId"], "o1")

    def test_fov_matches_sb9_formula(self):
        self.assertAlmostEqual(blender.fov_deg(35, 36), 2 * math.degrees(math.atan(36 / 70)))

    def test_references_and_fbx(self):
        bpy = fakes.make_bpy()
        blender.apply_camera_plan(bpy, PLAN)
        bg = blender.add_reference(bpy, "/tmp/panel.png", 0.4)
        self.assertEqual((bg.alpha, bg.display_depth), (0.4, "BACK"))
        self.assertTrue(bpy.data.objects.get(blender.CAMERA_NAME).data.show_background_images)
        blender.import_fbx(bpy, "/tmp/SC01_SH010_v001.fbx")
        self.assertEqual(bpy._fbx, ["/tmp/SC01_SH010_v001.fbx"])
        with self.assertRaises(ptg_client.ConnectorError):
            blender.import_fbx(bpy, "/tmp/x.obj")

    def test_png_text_keeps_pixels(self):
        src = tiny_png()
        out = blender.png_with_text(src, {"ptg:timecode": "00:00:01:00"})
        self.assertEqual(blender.read_png_text(out), {"ptg:timecode": "00:00:01:00"})
        self.assertEqual(out.replace(out[33:33 + 12 + len(b"ptg:timecode\x0000:00:01:00")], b""), src)

    def test_send_limits(self):
        with self.assertRaises(ptg_client.ConnectorError):
            blender.send_renders(None, {"projectId": "p", "occurrenceId": "o"}, {"num": 25, "den": 1}, [], {}, "x")
        many = [(i, "/x/%04d.png" % i) for i in range(blender.MAX_RETURN_FRAMES + 1)]
        with self.assertRaises(ptg_client.ConnectorError) as e:
            blender.send_renders(None, {"projectId": "p", "occurrenceId": "o"}, {"num": 25, "den": 1}, many, {}, "x")
        self.assertEqual(e.exception.code, "too_many_frames")


if __name__ == "__main__":
    unittest.main()
