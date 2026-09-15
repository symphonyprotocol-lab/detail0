#!/usr/bin/env python3
"""Fetch a public ghcr.io image (linux/arm64) over the registry HTTP API and write a
tar that `docker load` accepts. For a Docker daemon that cannot reach ghcr.io itself
(e.g. Docker Desktop answering "denied" to every ghcr pull):

  python3 docker/firecrawl/pull-ghcr-image.py firecrawl/firecrawl latest /tmp/firecrawl.tar
  docker load -i /tmp/firecrawl.tar

Repeat for firecrawl/playwright-service. nuq-postgres is built locally.
"""
import hashlib, json, os, shutil, sys, tarfile, urllib.request

repo, tag, out = sys.argv[1], sys.argv[2], sys.argv[3]
ARCH, OS = "arm64", "linux"
tok = json.load(urllib.request.urlopen(f"https://ghcr.io/token?scope=repository:{repo}:pull"))["token"]
H = {"Authorization": f"Bearer {tok}"}
ACCEPT = ", ".join([
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
])

def get(path, accept=None, stream=False):
    req = urllib.request.Request(f"https://ghcr.io/v2/{repo}/{path}", headers={**H, "Accept": accept or ACCEPT})
    return urllib.request.urlopen(req, timeout=120)

layout = f"{out}.oci"
blobs = f"{layout}/blobs/sha256"; os.makedirs(blobs, exist_ok=True)

def save_blob(digest, size=None, data=None):
    name = digest.split(":")[1]; path = f"{blobs}/{name}"
    if data is not None:
        open(path, "wb").write(data); return
    if os.path.exists(path) and (size is None or os.path.getsize(path) == size): return
    h = hashlib.sha256()
    with get(f"blobs/{digest}", accept="*/*") as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk: break
            h.update(chunk); f.write(chunk)
    assert h.hexdigest() == name, f"digest mismatch for {digest}"
    print(f"  layer {name[:12]} {os.path.getsize(path)/1e6:.1f} MB", flush=True)

r = get(f"manifests/{tag}")
raw = r.read(); ctype = r.headers.get("Content-Type", ""); top = json.loads(raw)
if "manifests" in top:
    m = next(x for x in top["manifests"] if x["platform"].get("architecture") == ARCH and x["platform"].get("os") == OS)
    digest = m["digest"]; r = get(f"manifests/{digest}"); raw = r.read(); ctype = r.headers.get("Content-Type", ""); man = json.loads(raw)
else:
    man = top; digest = "sha256:" + hashlib.sha256(raw).hexdigest()
print(f"{repo}:{tag} -> {digest[:19]} ({len(man['layers'])} layers)", flush=True)
save_blob(digest, data=raw)
save_blob(man["config"]["digest"], man["config"].get("size"))
for l in man["layers"]:
    save_blob(l["digest"], l["size"])
open(f"{layout}/oci-layout", "w").write(json.dumps({"imageLayoutVersion": "1.0.0"}))
open(f"{layout}/index.json", "w").write(json.dumps({"schemaVersion": 2, "manifests": [{
    "mediaType": ctype or "application/vnd.oci.image.manifest.v1+json", "digest": digest, "size": len(raw),
    "platform": {"architecture": ARCH, "os": OS},
    "annotations": {"org.opencontainers.image.ref.name": f"ghcr.io/{repo}:{tag}", "io.containerd.image.name": f"ghcr.io/{repo}:{tag}"}}]}))
# Legacy docker-load manifest as well, for a daemon without the containerd image store.
open(f"{layout}/manifest.json", "w").write(json.dumps([{
    "Config": "blobs/sha256/" + man["config"]["digest"].split(":")[1],
    "RepoTags": [f"ghcr.io/{repo}:{tag}"],
    "Layers": ["blobs/sha256/" + l["digest"].split(":")[1] for l in man["layers"]]}]))
with tarfile.open(out, "w") as t:
    for n in ("oci-layout", "index.json", "manifest.json", "blobs"):
        t.add(f"{layout}/{n}", arcname=n)
print("wrote", out, flush=True)
