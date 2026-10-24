"""C-8: pakker Krita- og Blender-tilleggene til dist/ (ZIP for «Importer Python-tillegg» og Blender-extension).
Kopierer den felles klienten (python-common) inn i hvert tillegg. Kjør: python3 plugins/scripts/pack-python.py"""
import os, shutil, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMON = [os.path.join(ROOT, "python-common", f) for f in ("ptg_client.py", "ptg_strings.py")]

def zipdir(src, out, prefix):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(src):
            for f in sorted(files):
                if f.endswith(".pyc") or "__pycache__" in base:
                    continue
                p = os.path.join(base, f)
                z.write(p, os.path.join(prefix, os.path.relpath(p, src)))

def stage(name, pkg, extra=()):
    dist = os.path.join(ROOT, name, "dist"); shutil.rmtree(dist, ignore_errors=True)
    tmp = os.path.join(dist, "stage"); shutil.copytree(os.path.join(ROOT, name, pkg), os.path.join(tmp, pkg))
    for c in COMMON: shutil.copy(c, os.path.join(tmp, pkg))
    for e in extra: shutil.copy(os.path.join(ROOT, name, e), tmp)
    return dist, tmp

d, t = stage("krita", "ptg_krita", ["ptg_krita.desktop"])
zipdir(t, os.path.join(d, "pentoglass-krita-0.1.0.zip"), ""); shutil.rmtree(t)
d, t = stage("blender", "pentoglass")
zipdir(os.path.join(t, "pentoglass"), os.path.join(d, "pentoglass-blender-0.1.0.zip"), ""); shutil.rmtree(t)
print("Laget plugins/krita/dist og plugins/blender/dist (usignert)")
