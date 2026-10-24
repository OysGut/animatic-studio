"""From Pen to Glass for Blender 4.2+ (extension, C-8). Tynt bpy-lag over logic.py (bygget, ikke prøvd i Blender)."""
import datetime
import glob
import os
import webbrowser

import bpy  # type: ignore

from . import logic, ptg_client, ptg_strings

BASE_URL = os.environ.get("PTG_BASE_URL", "https://pentoglass.com")


def _t(key, **kw):
    return ptg_strings.tr(bpy.app.translations.locale, key, **kw)


def _client():
    folder = bpy.utils.extension_path_user(__package__, path="", create=True)
    return ptg_client.PtgClient(BASE_URL, logic.CLIENT_ID, tokens=ptg_client.FileTokenStore(os.path.join(folder, "session.json")))


def _guard(op, fn):
    try:
        fn()
        return {"FINISHED"}
    except ptg_client.ConnectorError as e:
        op.report({"ERROR"}, _t("error", code=e.code))
        return {"CANCELLED"}


class PTG_OT_sign_in(bpy.types.Operator):
    bl_idname = "pentoglass.sign_in"
    bl_label = "Sign in"

    def execute(self, context):
        return _guard(self, lambda: ptg_client.loopback_login(_client(), webbrowser.open))


class PTG_OT_sign_out(bpy.types.Operator):
    bl_idname = "pentoglass.sign_out"
    bl_label = "Sign out"

    def execute(self, context):
        return _guard(self, lambda: _client().logout())


class PTG_OT_cameras(bpy.types.Operator):
    bl_idname = "pentoglass.import_cameras"
    bl_label = "Import cameras"
    occurrence_id: bpy.props.StringProperty(name="Occurrence")

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        def run():
            c = _client()
            logic.apply_camera_plan(bpy, c.blender_cameras(c.tokens.load()["projectId"], self.occurrence_id.strip()))
        return _guard(self, run)


class PTG_OT_fbx(bpy.types.Operator):
    bl_idname = "pentoglass.import_fbx"
    bl_label = "Import PTG3 FBX"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")
    filter_glob: bpy.props.StringProperty(default="*.fbx", options={"HIDDEN"})

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        return _guard(self, lambda: logic.import_fbx(bpy, self.filepath))


class PTG_OT_reference(bpy.types.Operator):
    bl_idname = "pentoglass.add_reference"
    bl_label = "Add reference"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, context):
        return _guard(self, lambda: logic.add_reference(bpy, self.filepath))


class PTG_OT_send(bpy.types.Operator):
    bl_idname = "pentoglass.send_render"
    bl_label = "Send render back"
    asset_id: bpy.props.StringProperty(name="Asset")
    variant_id: bpy.props.StringProperty(name="Variant")
    base_version_id: bpy.props.StringProperty(name="Base version")

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

    def execute(self, context):
        def run():
            link = logic.scene_link(bpy)
            if not link:
                raise ptg_client.ConnectorError(400, "not_linked")
            scene = context.scene
            out = bpy.path.abspath(scene.render.filepath)
            files = []
            for f in range(scene.frame_start, scene.frame_end + 1):
                p = scene.render.frame_path(frame=f)
                if os.path.exists(p):
                    files.append((f - scene.frame_start, p))
            videos = sorted(glob.glob(os.path.join(os.path.dirname(out), "*.mp4")) + glob.glob(os.path.join(os.path.dirname(out), "*.mov")))
            if not files and videos:
                files = [(0, videos[-1])]
            fps = {"num": int(round(scene.render.fps * 1000)), "den": int(round(scene.render.fps_base * 1000))}
            now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
            target = {"assetId": self.asset_id.strip(), "variantId": self.variant_id.strip(), "baseVersionId": self.base_version_id.strip() or None}
            res = logic.send_renders(_client(), link, fps, files, target, now)
            self.report({"INFO"}, _t("candidate") + (" " + _t("conflict") if any(r.get("conflictId") for r in res) else ""))
        return _guard(self, run)


class PTG_PT_panel(bpy.types.Panel):
    bl_label = "From Pen to Glass"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Pen to Glass"

    def draw(self, context):
        col = self.layout.column()
        col.operator("pentoglass.sign_in", text=_t("signIn"))
        col.operator("pentoglass.import_cameras", text=_t("importCameras"))
        col.operator("pentoglass.import_fbx", text=_t("importFbx"))
        col.operator("pentoglass.add_reference", text=_t("importReferences"))
        col.operator("pentoglass.send_render", text=_t("sendRender"))
        col.operator("pentoglass.sign_out", text=_t("signOut"))


CLASSES = (PTG_OT_sign_in, PTG_OT_sign_out, PTG_OT_cameras, PTG_OT_fbx, PTG_OT_reference, PTG_OT_send, PTG_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)
