"""Falske krita- og bpy-moduler for C-8-testene (ingen Krita eller Blender trengs)."""
import os
import sys
import types


# ---------- krita ----------
class FakeNode:
    def __init__(self, name, visible=True, opacity=255, kind="paintlayer", children=()):
        self._name, self._visible, self._opacity, self._type, self._children = name, visible, opacity, kind, list(children)

    def name(self): return self._name
    def visible(self): return self._visible
    def opacity(self): return self._opacity
    def type(self): return self._type
    def childNodes(self): return self._children


class FakeDoc:
    def __init__(self, path, nodes, png_bytes):
        self.path, self.annotations, self.exports, self.batch = path, {}, [], []
        self.root = FakeNode("root", children=nodes)
        self.png = png_bytes

    def rootNode(self): return self.root
    def setAnnotation(self, kind, desc, data): self.annotations[kind] = (desc, bytes(data))
    def annotation(self, kind): return self.annotations.get(kind, (None, b""))[1]
    def setBatchmode(self, v): self.batch.append(v)
    def refreshProjection(self): pass

    def exportImage(self, path, info):
        self.exports.append((path, dict(info.props)))
        with open(path, "wb") as f:
            f.write(self.png)
        return True


class FakeInfo:
    def __init__(self): self.props = {}
    def setProperty(self, k, v): self.props[k] = v


class FakeKritaApp:
    """openDocument «leser» lag slik Krita gjør for PSD: lagene gis inn av testen."""
    def __init__(self, layers_for, png):
        self.layers_for, self.png, self.opened, self.views = layers_for, png, [], []

    def openDocument(self, path):
        assert os.path.exists(path)
        d = FakeDoc(path, self.layers_for(path), self.png)
        self.opened.append(d)
        return d

    def activeWindow(self):
        app = self
        return types.SimpleNamespace(addView=lambda d: app.views.append(d))


def install_krita():
    m = types.ModuleType("krita")
    m.InfoObject = FakeInfo
    sys.modules["krita"] = m
    return m


# ---------- bpy ----------
class KP:
    def __init__(self, frame, value): self.co, self.interpolation = (frame, value), "BEZIER"


class FCurve:
    def __init__(self, path): self.data_path, self.keyframe_points = path, []


class Animated:
    def __init__(self):
        self.animation_data = None

    def keyframe_insert(self, data_path, frame):
        if self.animation_data is None:
            self.animation_data = types.SimpleNamespace(action=types.SimpleNamespace(fcurves=[]))
        fcs = self.animation_data.action.fcurves
        fc = next((f for f in fcs if f.data_path == data_path), None)
        if fc is None:
            fc = FCurve(data_path); fcs.append(fc)
        fc.keyframe_points.append(KP(frame, getattr(self, data_path)))


class BgImages(list):
    def new(self):
        b = types.SimpleNamespace(image=None, alpha=1.0, display_depth="FRONT"); self.append(b); return b


class CameraData(Animated):
    def __init__(self, name):
        super().__init__()
        self.name, self.lens, self.sensor_width, self.sensor_height, self.sensor_fit = name, 50.0, 36.0, 24.0, "AUTO"
        self.background_images, self.show_background_images = BgImages(), False


class Obj(Animated):
    def __init__(self, name, data):
        super().__init__()
        self.name, self.data, self.location, self.rotation_euler = name, data, (0, 0, 0), (0, 0, 0)


class Markers(list):
    def new(self, name, frame):
        m = types.SimpleNamespace(name=name, frame=frame, camera=None); self.append(m); return m


class Scene(dict):
    def __init__(self):
        super().__init__()
        self.render = types.SimpleNamespace(fps=24, fps_base=1.0, resolution_x=0, resolution_y=0, resolution_percentage=50)
        self.frame_start, self.frame_end, self.camera = 1, 250, None
        self.timeline_markers = Markers()
        self.collection = types.SimpleNamespace(objects=types.SimpleNamespace(link=lambda o: None))


def make_bpy():
    objects, images, fbx = {}, [], []
    bpy = types.SimpleNamespace()
    bpy.context = types.SimpleNamespace(scene=Scene())

    def obj_new(name, data):
        o = Obj(name, data); objects[name] = o; return o
    bpy.data = types.SimpleNamespace(
        objects=types.SimpleNamespace(get=objects.get, new=obj_new),
        cameras=types.SimpleNamespace(new=CameraData),
        images=types.SimpleNamespace(load=lambda p, check_existing=True: images.append(p) or types.SimpleNamespace(filepath=p)),
    )
    bpy.ops = types.SimpleNamespace(import_scene=types.SimpleNamespace(fbx=lambda filepath: fbx.append(filepath)))
    bpy._images, bpy._fbx = images, fbx
    return bpy


def install_bpy_stub():
    """Nok av bpy til at tilleggets __init__ kan importeres og registreres."""
    m = types.ModuleType("bpy")
    class _Base: pass
    m.types = types.SimpleNamespace(Operator=_Base, Panel=_Base)
    m.props = types.SimpleNamespace(StringProperty=lambda **k: ("str", k))
    registered = []
    m.utils = types.SimpleNamespace(register_class=registered.append, unregister_class=registered.remove,
                                    extension_path_user=lambda pkg, path="", create=False: "/tmp/ptg-blender")
    m.app = types.SimpleNamespace(translations=types.SimpleNamespace(locale="nb_NO"))
    m._registered = registered
    sys.modules["bpy"] = m
    return m
