"""From Pen to Glass – felles Python-klient for Creative Connectors (C-8).

Speiler packages/ptg-connector-sdk: innlogging (enhetsflyt eller PKCE via loopback), manifest v1,
gjenopptakbar opplasting i biter med idempotensnøkkel, konflikter og nedlasting med kontrollsum.
Ingen hemmeligheter i koden: klienten er offentlig (PKCE), og tokens lagres bare i vertens lager.
Bare standardbiblioteket (Krita og Blender har egen Python). Transporten kan byttes ut i tester.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

CHUNK_BYTES = 8 * 1024 * 1024          # samme som src/core/connectors/transfer.ts
MAX_TRANSFER_BYTES = 64 * 1024 * 1024
MANIFEST_VERSION = 1
MAX_MANIFEST_ITEMS = 5000
SCOPES = "project:read manifest:read assets:read panels:read transfers:write conflicts:read"
_SECRET_KEY = re.compile(r"(^|_|-)(token|secret|password|passwd|authorization|api[_-]?key|access[_-]?key|refresh|cookie|bearer|code[_-]?verifier)($|_|-)", re.I)
_SECRET_KEY_CAMEL = re.compile(r"(token|secret|password|passwd|authorization|apikey|accesskey|codeverifier|cookie|bearer)$", re.I)
_SECRET_VALUE = re.compile(r"^(ptgc_|ptgr_|ptgd_|sr_|sk[-_]|sb_secret_|ghp_|xox[abp]-|Bearer\s)|^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.")
_KINDS = {"project", "production", "scene", "occurrence", "panel", "asset", "version"}


class ConnectorError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def pkce_challenge(verifier: str) -> str:
    return b64url(hashlib.sha256(verifier.encode("ascii")).digest())


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def idempotency_key(file_sha256: str, variant_id: str, base_version_id: str | None) -> str:
    """Samme formel som PtgConnector.idempotencyKey: samme fil til samme mål gjenopptas."""
    raw = f"{file_sha256}|{variant_id}|{base_version_id or ''}".encode("utf-8")
    return b64url(hashlib.sha256(raw).digest())[:43]


def chunk_count(n: int) -> int:
    return max(1, -(-n // CHUNK_BYTES))


def validate_manifest(m) -> list[str]:
    """Strukturkontroll av manifest v1 (samme regler som kjernen for det tilleggene bruker). Tom liste = gyldig."""
    issues: list[str] = []
    if not isinstance(m, dict):
        return ["$:type"]
    if m.get("manifestVersion") != MANIFEST_VERSION:
        issues.append("$.manifestVersion:version")
    if not isinstance(m.get("projectId"), str) or not m["projectId"]:
        issues.append("$.projectId:required")
    fr = m.get("frameRate")
    if not (isinstance(fr, dict) and isinstance(fr.get("num"), int) and isinstance(fr.get("den"), int) and fr["num"] > 0 and fr["den"] > 0):
        issues.append("$.frameRate:type")
    for k, f in (("sourceApp", "name"), ("adapter", "id")):
        o = m.get(k)
        if not isinstance(o, dict) or not isinstance(o.get(f), str) or not isinstance(o.get("version"), str):
            issues.append(f"$.{k}:required")
    items = m.get("items")
    if not isinstance(items, list):
        issues.append("$.items:type")
    elif len(items) > MAX_MANIFEST_ITEMS:
        issues.append("$.items:size")
    else:
        for i, it in enumerate(items):
            if not isinstance(it, dict) or it.get("kind") not in _KINDS or not isinstance(it.get("id"), str):
                issues.append(f"$.items[{i}]:format")

    def walk(v, path):
        if isinstance(v, dict):
            for k, x in v.items():
                if _SECRET_KEY.search(k) or _SECRET_KEY_CAMEL.search(k):
                    issues.append(f"{path}.{k}:secret")
                walk(x, f"{path}.{k}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{path}[{i}]")
        elif isinstance(v, str) and _SECRET_VALUE.search(v):
            issues.append(f"{path}:secret")
    walk(m, "$")
    return issues


def urllib_transport(method: str, url: str, body: bytes | None, headers: dict) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


class MemoryTokenStore:
    def __init__(self):
        self.value = None

    def load(self):
        return self.value

    def save(self, t):
        self.value = t


class FileTokenStore:
    """Tokenfil i brukerens konfigmappe med rettigheter 0600. Aldri i prosjektet eller repoet."""

    def __init__(self, path: str):
        self.path = path

    def load(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def save(self, t):
        if t is None:
            try:
                os.remove(self.path)
            except OSError:
                pass
            return
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(t, f)


class PtgClient:
    def __init__(self, base_url: str, client_id: str, tokens=None, transport=urllib_transport,
                 random=os.urandom, now=time.time, sleep=time.sleep):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.tokens = tokens or MemoryTokenStore()
        self.transport = transport
        self.random = random
        self.now = now
        self.sleep = sleep

    # ---------- Innlogging ----------
    def begin_authorization(self, redirect_uri: str, scope: str = SCOPES) -> dict:
        verifier, state = b64url(self.random(32)), b64url(self.random(16))
        q = urllib.parse.urlencode({"client_id": self.client_id, "redirect_uri": redirect_uri, "response_type": "code",
                                    "code_challenge": pkce_challenge(verifier), "code_challenge_method": "S256",
                                    "scope": scope, "state": state})
        return {"url": f"{self.base_url}/koble?{q}", "verifier": verifier, "state": state, "redirect_uri": redirect_uri}

    def complete_authorization(self, callback_url: str, expected: dict) -> dict:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(callback_url).query)
        if (q.get("state") or [""])[0] != expected["state"]:
            raise ConnectorError(400, "state_mismatch")
        if q.get("error"):
            raise ConnectorError(400, q["error"][0])
        return self._token({"grant_type": "authorization_code", "code": (q.get("code") or [""])[0],
                            "code_verifier": expected["verifier"], "redirect_uri": expected["redirect_uri"],
                            "client_id": self.client_id})

    def device_login(self, show, scope: str = SCOPES, cancelled=lambda: False) -> dict:
        d = self._json("POST", "/api/v1/oauth/device", {"client_id": self.client_id, "scope": scope}, auth=False)
        show({"userCode": d["user_code"], "verificationUri": d["verification_uri"],
              "verificationUriComplete": d["verification_uri_complete"]})
        interval = d["interval"]
        until = self.now() + d["expires_in"]
        while self.now() < until and not cancelled():
            self.sleep(interval)
            try:
                return self._token({"grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                                    "device_code": d["device_code"], "client_id": self.client_id})
            except ConnectorError as e:
                if e.code == "authorization_pending":
                    continue
                if e.code == "slow_down":
                    interval += 5
                    continue
                raise
        raise ConnectorError(400, "expired_token")

    def logout(self):
        t = self.tokens.load()
        if t:
            try:
                self._raw("POST", "/api/v1/oauth/revoke", json.dumps({"token": t["refreshToken"]}).encode(),
                          {"Content-Type": "application/json"}, auth=False)
            except ConnectorError:
                pass
        self.tokens.save(None)

    # ---------- Data ----------
    def session(self):
        return self._json("GET", "/api/v1/session")

    def manifest(self, project_id: str) -> dict:
        m = self._json("GET", f"/api/v1/projects/{project_id}/manifest")
        if validate_manifest(m):
            raise ConnectorError(502, "invalid_manifest")
        return m

    def assets(self, project_id):
        return self._json("GET", f"/api/v1/projects/{project_id}/assets")["assets"]

    def versions(self, project_id, asset_id):
        return self._json("GET", f"/api/v1/projects/{project_id}/assets/{asset_id}/versions")["versions"]

    def panels(self, project_id):
        return self._json("GET", f"/api/v1/projects/{project_id}/panels")["panels"]

    def conflicts(self, project_id):
        return self._json("GET", f"/api/v1/projects/{project_id}/conflicts")["conflicts"]

    def blender_cameras(self, project_id, occurrence_id):
        q = urllib.parse.urlencode({"occurrenceId": occurrence_id})
        return self._json("GET", f"/api/v1/projects/{project_id}/blender/cameras?{q}")

    def download(self, project_id, asset_id, version_id) -> dict:
        _, headers, body = self._raw("GET", f"/api/v1/projects/{project_id}/assets/{asset_id}/versions/{version_id}/file", None, {})
        digest = sha256_hex(body)
        declared = headers.get("x-content-sha256")
        if declared and declared != digest:
            raise ConnectorError(502, "checksum_mismatch")
        return {"bytes": body, "mimeType": headers.get("content-type", "application/octet-stream"), "sha256": digest}

    def resolve_conflict(self, project_id, conflict_id, choice: str, revision: int):
        """keep_both / choose_current / reject her; choose_incoming gir approve_in_app (godkjennes bare i appen)."""
        return self._json("POST", f"/api/v1/projects/{project_id}/conflicts/{conflict_id}/resolve",
                          {"choice": choice, "revision": revision})

    def upload(self, project_id, name: str, data: bytes, asset_id: str, variant_id: str, base_version_id, on_progress=None) -> dict:
        """Ny kandidatversjon. Gjenopptakbar: samme nøkkel hopper over biter serveren har. Godkjennes aldri automatisk."""
        if len(data) > MAX_TRANSFER_BYTES:
            raise ConnectorError(413, "too_large")
        digest = sha256_hex(data)
        key = idempotency_key(digest, variant_id, base_version_id)
        t = self._json("POST", f"/api/v1/projects/{project_id}/transfers",
                       {"fileName": name, "byteSize": len(data), "sha256": digest,
                        "target": {"assetId": asset_id, "variantId": variant_id}, "base": {"versionId": base_version_id}},
                       headers={"Idempotency-Key": key})
        if t["status"] == "candidate":
            return t
        n = chunk_count(len(data))
        done = n - len(t["missingChunks"])
        for i in t["missingChunks"]:
            part = data[i * CHUNK_BYTES:min(len(data), (i + 1) * CHUNK_BYTES)]
            self._retry(lambda: self._raw("PUT", f"/api/v1/projects/{project_id}/transfers/{t['id']}/chunks/{i}", part,
                                          {"Content-Type": "application/octet-stream"}))
            done += 1
            if on_progress:
                on_progress(done, n)
        return self._json("POST", f"/api/v1/projects/{project_id}/transfers/{t['id']}/complete", {})

    # ---------- Transport ----------
    def _token(self, body: dict) -> dict:
        r = self._json("POST", "/api/v1/oauth/token", body, auth=False)
        t = {"accessToken": r["access_token"], "refreshToken": r["refresh_token"], "expiresAt": self.now() + r["expires_in"],
             "scope": r["scope"], "projectId": r["project_id"]}
        self.tokens.save(t)
        return t

    def _bearer(self) -> str:
        t = self.tokens.load()
        if not t:
            raise ConnectorError(401, "not_signed_in")
        if t["expiresAt"] - 30 <= self.now():
            t = self._token({"grant_type": "refresh_token", "refresh_token": t["refreshToken"], "client_id": self.client_id})
        return t["accessToken"]

    def _raw(self, method, path, body, headers, auth=True):
        h = dict(headers)
        if auth:
            h["Authorization"] = "Bearer " + self._bearer()
        status, rh, data = self.transport(method, self.base_url + path, body, h)
        if status >= 400:
            try:
                code = json.loads(data.decode("utf-8")).get("error") or f"http_{status}"
            except ValueError:
                code = f"http_{status}"
            raise ConnectorError(status, code)
        return status, rh, data

    def _json(self, method, path, body=None, auth=True, headers=None):
        h = dict(headers or {})
        raw = None
        if body is not None:
            raw = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        _, _, data = self._raw(method, path, raw, h, auth)
        return json.loads(data.decode("utf-8"))

    def _retry(self, fn, tries=3):
        for i in range(tries):
            try:
                return fn()
            except ConnectorError as e:
                if i + 1 >= tries or (e.status < 500 and e.status != 429):
                    raise
                self.sleep(0.5 * 2 ** i)


def loopback_redirect(port: int, path: str = "/callback") -> str:
    """RFC 8252: http://127.0.0.1:<port>, godkjent for ptg.krita og ptg.blender i klientlisten (0111)."""
    return f"http://127.0.0.1:{int(port)}{path}"


def loopback_login(client: "PtgClient", open_url, timeout: float = 300, path: str = "/callback") -> dict:
    """PKCE via engangs loopback-server på 127.0.0.1 (tilfeldig port). Nettleseren åpnes av verten."""
    import http.server
    result = {}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            result["url"] = "http://127.0.0.1:%d%s" % (self.server.server_address[1], self.path)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("From Pen to Glass: OK".encode("utf-8"))

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    try:
        srv.timeout = timeout
        flow = client.begin_authorization(loopback_redirect(srv.server_address[1], path))
        open_url(flow["url"])
        srv.handle_request()
    finally:
        srv.server_close()
    if "url" not in result:
        raise ConnectorError(408, "login_timeout")
    return client.complete_authorization(result["url"], flow)
