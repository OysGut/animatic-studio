"""Krita-menyen «Verktøy → Skript → From Pen to Glass». Tynt Qt-lag over logic.py (bygget, ikke prøvd i Krita)."""
import os
import webbrowser

from krita import Extension  # type: ignore
from PyQt5.QtCore import QLocale, QStandardPaths  # type: ignore
from PyQt5.QtWidgets import QFileDialog, QInputDialog, QMessageBox  # type: ignore

from . import logic
try:
    from . import ptg_client
    from .ptg_strings import tr
except ImportError:  # utvikling
    import ptg_client  # type: ignore
    from ptg_strings import tr  # type: ignore

BASE_URL = os.environ.get("PTG_BASE_URL", "https://pentoglass.com")


def _config_dir():
    return os.path.join(QStandardPaths.writableLocation(QStandardPaths.AppConfigLocation), "pentoglass")


class PtgExtension(Extension):
    def __init__(self, parent):
        super().__init__(parent)
        self.lang = QLocale.system().name()
        self.client = ptg_client.PtgClient(BASE_URL, logic.CLIENT_ID, tokens=ptg_client.FileTokenStore(os.path.join(_config_dir(), "krita-session.json")))
        self.work = os.path.join(QStandardPaths.writableLocation(QStandardPaths.TempLocation), "pentoglass-krita")

    def setup(self):
        pass

    def createActions(self, window):
        for key, fn in (("signIn", self.sign_in), ("openAsset", self.open_asset), ("openHandoff", self.open_handoff),
                        ("sendBack", self.send_back), ("signOut", self.sign_out)):
            a = window.createAction("ptg_" + key, tr(self.lang, key), "tools/scripts/pentoglass")
            a.triggered.connect(fn)

    def _say(self, key, **kw):
        QMessageBox.information(None, "From Pen to Glass", tr(self.lang, key, **kw))

    def _guard(self, fn):
        try:
            return fn()
        except ptg_client.ConnectorError as e:
            self._say("error", code=e.code)

    def sign_in(self):
        self._guard(lambda: (ptg_client.loopback_login(self.client, webbrowser.open), self._say("signedIn")))

    def sign_out(self):
        self._guard(lambda: (self.client.logout(), self._say("signedOut")))

    def _pick(self, title, items, label):
        if not items:
            return None
        names = [label(i) for i in items]
        name, ok = QInputDialog.getItem(None, "From Pen to Glass", title, names, 0, False)
        return items[names.index(name)] if ok else None

    def open_asset(self):
        def run():
            pid = self.client.tokens.load()["projectId"]
            asset = self._pick(tr(self.lang, "chooseAsset"), [a for a in self.client.assets(pid) if a["kind"] != "sound"], lambda a: a["name"])
            if not asset:
                return
            vers = [v for v in self.client.versions(pid, asset["id"]) if v["mimeType"] in logic._EXT]
            ver = self._pick(tr(self.lang, "chooseVersion"), vers, lambda v: f"v{v['number']}" + (" ✓" if v["approved"] else ""))
            if ver:
                logic.open_version(self.parent(), self.client, pid, asset, ver, self.work)
        self._guard(run)

    def open_handoff(self):
        path, _ = QFileDialog.getOpenFileName(None, tr(self.lang, "openHandoff"), "", "From Pen to Glass (*.zip manifest.json)")
        if path:
            folder = os.path.dirname(path) if path.endswith("manifest.json") else path
            self._guard(lambda: logic.open_handoff(self.parent(), self.client if self.client.tokens.load() else None, folder, self.work))

    def send_back(self):
        def run():
            doc = self.parent().activeDocument()
            if not doc:
                return self._say("noDocument")
            t = logic.send_back(self.client, doc, self.work)
            if t.get("status") == "use_return_page":
                if t.get("returnUrl"):
                    webbrowser.open(t["returnUrl"])
                return self._say("usePage")
            if t.get("conflictId"):
                link = logic.read_link(doc)
                conflict = logic.find_conflict(self.client, link["projectId"], t["conflictId"])
                labels = [tr(self.lang, c) for c in logic.CONFLICT_CHOICES]
                name, ok = QInputDialog.getItem(None, "From Pen to Glass", tr(self.lang, "conflict"), labels, 0, False)
                if ok and conflict:
                    r = logic.resolve(self.client, link["projectId"], conflict, logic.CONFLICT_CHOICES[labels.index(name)])
                    return self._say("approveInApp" if r.get("approveInApp") else "candidate")
            self._say("candidate")
        self._guard(run)
