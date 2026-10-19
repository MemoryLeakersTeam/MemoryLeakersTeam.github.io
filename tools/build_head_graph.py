"""Converte assets/LeePerrySmith.glb in un grafo (nodi + archi) per il rendering "rete neurale".
Uso: python3 tools/build_head_graph.py  ->  scrive js/head-data.js
Modello: Lee Perry-Smith (Infinite Realities), CC BY 3.0, da three.js/examples."""
import json, struct, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
from scipy.spatial import cKDTree

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 900
b = open("assets/LeePerrySmith.glb", "rb").read()
jl, _ = struct.unpack("<II", b[12:20]); j = json.loads(b[20:20 + jl])
bin0 = 20 + jl + 8
def acc(i, dt, n):
    a = j["accessors"][i]; v = j["bufferViews"][a["bufferView"]]
    off = bin0 + v.get("byteOffset", 0) + a.get("byteOffset", 0)
    return np.frombuffer(b, dtype=dt, count=a["count"] * n, offset=off).reshape(a["count"], n) if n > 1 else np.frombuffer(b, dtype=dt, count=a["count"], offset=off)
p = j["meshes"][0]["primitives"][0]
pos = acc(p["attributes"]["POSITION"], "<f4", 3).astype(np.float64)
nor = acc(p["attributes"]["NORMAL"], "<f4", 3).astype(np.float64)
idx = acc(p["indices"], "<u2", 1).astype(np.int64).reshape(-1, 3)

# saldatura vertici duplicati (cuciture UV)
key = np.round(pos, 4)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
inv = inv.ravel()
P = pos[first]; Nn = np.zeros_like(P)
np.add.at(Nn, inv, nor); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
T = inv[idx]

# orientamento: la punta del naso è il vertice più avanti; deve stare su +z
print("bbox", P.min(0).round(2), P.max(0).round(2))
tip = P[np.argmax(P[:, 2])]; tipn = P[np.argmin(P[:, 2])]
print("max z", tip.round(2), "min z", tipn.round(2))

# centro e scala: altezza ~ 2.9 unità
c = (P.min(0) + P.max(0)) / 2
H = P[:, 1].max() - P[:, 1].min()
sc = 2.9 / H
P = (P - c) * sc

# campionamento a distanza minima (Poisson greedy), raggio regolato per ottenere ~TARGET nodi
rng = np.random.default_rng(3)
order = rng.permutation(len(P)); tree = cKDTree(P)
def poisson(r):
    taken = np.zeros(len(P), bool); keep = []
    for i in order:
        if taken[i]: continue
        keep.append(i)
        for k in tree.query_ball_point(P[i], r): taken[k] = True
    return np.array(keep)
lo, hi = 0.01, 0.3
for _ in range(14):
    r = (lo + hi) / 2; k = poisson(r)
    lo, hi = (r, hi) if len(k) > TARGET else (lo, r)
keep = poisson(hi)
print("nodi", len(keep), "raggio", round(hi, 4))

# cluster: ogni vertice → nodo più vicino; archi dai triangoli
_, owner = cKDTree(P[keep]).query(P)
E = set()
for a, b_, c_ in T:
    for u, v in ((a, b_), (b_, c_), (c_, a)):
        x, y = owner[u], owner[v]
        if x != y: E.add((min(x, y), max(x, y)))
# normali medie per nodo
NN = np.zeros((len(keep), 3)); np.add.at(NN, owner, Nn[np.arange(len(P))])
NN /= np.linalg.norm(NN, axis=1, keepdims=True) + 1e-9
print("archi", len(E))

out = {
  "n": len(keep),
  "p": np.round(P[keep], 3).ravel().tolist(),
  "nr": np.round(NN, 2).ravel().tolist(),
  "e": [int(v) for e in sorted(E) for v in e],
}
open("js/head-data.js", "w").write("/* Generato da tools/build_head_graph.py – modello: Lee Perry-Smith (CC BY 3.0) */\nwindow.HEAD_DATA=" + json.dumps(out, separators=(",", ":")) + ";\n")
print("ok", round(len(json.dumps(out)) / 1024), "KB")
