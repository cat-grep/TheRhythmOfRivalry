"""
Build the processed data used by the web app.

    python analysis/build_data.py

Inputs  (data/):
    fight-songs-with-coordinates.csv   538 + BTAA fight song data with stadium coordinates
    schools-extra.csv                  state + conference membership in 2019 and 2024
    rivalries.csv                      hand-curated rivalry pairs

Outputs (data/processed/):
    songs.json      one record per school, with derived fields (folded tempo, archetype, LISA, ...)
    analysis.json   summary statistics (Moran's I, Mantel test, trope stats, conference dispersion, ...)

Only numpy / scipy / scikit-learn are required. Every permutation test uses a fixed seed so
the output is reproducible.
"""

import csv
import json
import math
from itertools import combinations
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from scipy.stats import pearsonr
from sklearn.manifold import MDS

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "processed"

RNG = np.random.default_rng(2025)
N_PERM = 9999
EARTH_RADIUS_KM = 6371.0088

# The eight lyric tropes used by FiveThirtyEight's trope_count.
TROPES = [
    ("fight", "Fight"),
    ("victory_win_won", "Victory / Win"),
    ("rah", "Rah"),
    ("nonsense", "Nonsense"),
    ("colors", "Colors"),
    ("men", "Men"),
    ("opponents", "Opponents"),
    ("spelling", "Spelling"),
]
TROPE_KEYS = [k for k, _ in TROPES]
ERAS = ["2019", "2024"]

# Songs notated in cut time are often reported at half tempo. Doubling every song under this
# threshold puts all songs on the same "march pulse" scale.
FOLD_THRESHOLD = 100


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def read_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_songs():
    raw = read_csv(DATA / "fight-songs-with-coordinates.csv")
    extra = {r["school"]: r for r in read_csv(DATA / "schools-extra.csv")}
    songs = []
    for r in raw:
        e = extra[r["school"]]
        bpm = int(r["bpm"])
        year = int(r["year"]) if r["year"].isdigit() else None
        student = {"Yes": 1, "No": 0}.get(r["student_writer"])
        songs.append({
            "school": r["school"],
            "song_name": r["song_name"],
            "writers": r["writers"],
            "year": year,
            "student_writer": r["student_writer"],
            "_student": student,
            "official_song": r["official_song"],
            "contest": r["contest"],
            "bpm": bpm,
            "bpm_folded": bpm * 2 if bpm < FOLD_THRESHOLD else bpm,
            "folded": bpm < FOLD_THRESHOLD,
            "sec_duration": int(r["sec_duration"]),
            "number_fights": int(r["number_fights"]),
            "tropes": {k: r[k] == "Yes" for k in TROPE_KEYS},
            "trope_count": int(r["trope_count"]),
            "spotify_id": r["spotify_id"],
            "lat": float(r["latitude"]),
            "lon": float(r["longitude"]),
            "state": e["state"],
            "conf": {"dataset": r["conference"], "2019": e["conf_2019"], "2024": e["conf_2024"]},
        })
    return songs


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def haversine_matrix(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    dlat = la[:, None] - la[None, :]
    dlon = lo[:, None] - lo[None, :]
    a = np.sin(dlat / 2) ** 2 + np.cos(la[:, None]) * np.cos(la[None, :]) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def spherical_center(lat, lon, weights=None):
    la, lo = np.radians(lat), np.radians(lon)
    xyz = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=1)
    w = np.ones(len(lat)) if weights is None else np.asarray(weights, float)
    m = (xyz * w[:, None]).sum(0) / w.sum()
    return float(np.degrees(math.atan2(m[2], math.hypot(m[0], m[1])))), float(np.degrees(math.atan2(m[1], m[0])))


def knn_weights(dist, k=5):
    """Row-standardised k-nearest-neighbour spatial weights."""
    n = len(dist)
    w = np.zeros((n, n))
    for i in range(n):
        order = np.argsort(dist[i])
        nbrs = [j for j in order if j != i][:k]
        w[i, nbrs] = 1 / k
    return w


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------
def wilson(k, n, z=1.96):
    if n == 0:
        return [0.0, 0.0]
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [max(0.0, centre - half), min(1.0, centre + half)]


def bimodality_coefficient(x):
    """Sarle's bimodality coefficient; values above ~0.555 suggest bimodality."""
    x = np.asarray(x, float)
    n = len(x)
    m = x - x.mean()
    s2 = (m ** 2).mean()
    skew = (m ** 3).mean() / s2 ** 1.5
    kurt = (m ** 4).mean() / s2 ** 2 - 3
    # sample-size corrected skewness / excess kurtosis
    g1 = skew * math.sqrt(n * (n - 1)) / (n - 2)
    g2 = ((n + 1) * kurt + 6) * (n - 1) / ((n - 2) * (n - 3))
    return (g1 ** 2 + 1) / (g2 + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)))


def morans_i(values, dist, k=5):
    v = np.asarray(values, float)
    w = knn_weights(dist, k)
    z = v - v.mean()

    def stat(zz):
        return float(zz @ w @ zz / (zz @ zz))

    obs = stat(z)
    perms = np.array([stat(RNG.permutation(z)) for _ in range(N_PERM)])
    expected = -1 / (len(v) - 1)
    # one-sided pseudo p-value in the direction of the observed statistic (as in PySAL)
    if obs >= perms.mean():
        larger = (perms >= obs).sum()
    else:
        larger = (perms <= obs).sum()
    p = (larger + 1) / (N_PERM + 1)
    return {"I": obs, "expected": expected, "p": float(p), "z": float((obs - perms.mean()) / perms.std()),
            "n": len(v), "k": k, "perm_hist": histogram(perms, obs)}


def local_morans(values, dist, k=5, perms=999):
    v = np.asarray(values, float)
    w = knn_weights(dist, k)
    z = (v - v.mean()) / v.std()
    lag = w @ z
    local = z * lag
    n = len(v)
    p = np.zeros(n)
    for i in range(n):
        others = np.delete(z, i)
        sims = np.array([z[i] * RNG.choice(others, k, replace=False).mean() for _ in range(perms)])
        if local[i] >= 0:
            larger = (sims >= local[i]).sum()
        else:
            larger = (sims <= local[i]).sum()
        p[i] = (larger + 1) / (perms + 1)
    quad = np.where(z > 0, np.where(lag > 0, "HH", "HL"), np.where(lag > 0, "LH", "LL"))
    return [{"I": float(local[i]), "p": float(p[i]), "quad": str(quad[i]), "z": float(z[i]), "lag": float(lag[i])}
            for i in range(n)]


def histogram(samples, observed, bins=40):
    counts, edges = np.histogram(samples, bins=bins)
    return {"counts": counts.tolist(), "edges": [float(e) for e in edges], "observed": float(observed)}


def gower_matrix(songs):
    """Gower distance on tempo, length, year, writer and the eight lyric tropes."""
    n = len(songs)
    numeric = {
        "bpm_folded": (2.0, [s["bpm_folded"] for s in songs]),
        "sec_duration": (1.0, [s["sec_duration"] for s in songs]),
        "year": (1.0, [s["year"] if s["year"] is not None else np.nan for s in songs]),
    }
    binary = {k: (1.0, [float(s["tropes"][k]) for s in songs]) for k in TROPE_KEYS}
    binary["student"] = (1.0, [s["_student"] if s["_student"] is not None else np.nan for s in songs])

    num = np.zeros((n, n))
    den = np.zeros((n, n))
    for weight, vals in numeric.values():
        x = np.asarray(vals, float)
        rng = np.nanmax(x) - np.nanmin(x)
        d = np.abs(x[:, None] - x[None, :]) / rng
        ok = ~np.isnan(d)
        num[ok] += weight * d[ok]
        den[ok] += weight
    for weight, vals in binary.values():
        x = np.asarray(vals, float)
        d = (x[:, None] != x[None, :]).astype(float)
        ok = ~(np.isnan(x)[:, None] | np.isnan(x)[None, :])
        num[ok] += weight * d[ok]
        den[ok] += weight
    g = num / den
    np.fill_diagonal(g, 0)
    return g


def mantel(a, b):
    iu = np.triu_indices(len(a), 1)
    obs = pearsonr(a[iu], b[iu])[0]
    n = len(a)
    perms = []
    for _ in range(N_PERM):
        p = RNG.permutation(n)
        perms.append(np.corrcoef(a[iu], b[p][:, p][iu])[0, 1])
    perms = np.array(perms)
    p = ((np.abs(perms) >= abs(obs)).sum() + 1) / (N_PERM + 1)
    return {"r": float(obs), "p": float(p), "perm_hist": histogram(perms, obs)}


def perm_chi2(groups, flags):
    """Permutation chi-square test of independence between conference and a binary trope."""
    groups = np.asarray(groups)
    flags = np.asarray(flags, int)
    labels = sorted(set(groups))

    def chi2(g):
        total = flags.sum()
        n = len(flags)
        s = 0.0
        for lab in labels:
            m = g == lab
            nk = m.sum()
            exp1 = nk * total / n
            exp0 = nk - exp1
            o1 = flags[m].sum()
            o0 = nk - o1
            if exp1 > 0:
                s += (o1 - exp1) ** 2 / exp1
            if exp0 > 0:
                s += (o0 - exp0) ** 2 / exp0
        return s

    obs = chi2(groups)
    perms = np.array([chi2(RNG.permutation(groups)) for _ in range(N_PERM)])
    return float(obs), float(((perms >= obs).sum() + 1) / (N_PERM + 1))


# ---------------------------------------------------------------------------
# Archetypes
# ---------------------------------------------------------------------------
def name_archetypes(songs, labels):
    """Describe each cluster by its most distinctive features, then give it a readable name."""
    overall = {k: np.mean([s["tropes"][k] for s in songs]) for k in TROPE_KEYS}
    out = {}
    for c in sorted(set(labels)):
        members = [s for s, l in zip(songs, labels) if l == c]
        prof = {
            "n": len(members),
            "bpm_folded": float(np.mean([s["bpm_folded"] for s in members])),
            "sec_duration": float(np.mean([s["sec_duration"] for s in members])),
            "year": float(np.mean([s["year"] for s in members if s["year"]])),
            "trope_count": float(np.mean([s["trope_count"] for s in members])),
            "student": float(np.mean([s["_student"] for s in members if s["_student"] is not None])),
            "tropes": {k: float(np.mean([s["tropes"][k] for s in members])) for k in TROPE_KEYS},
        }
        prof["lift"] = {k: prof["tropes"][k] - overall[k] for k in TROPE_KEYS}
        out[int(c)] = prof
    return out


def assign_names(profiles):
    """
    Name each cluster by the trait that sets it apart (largest lift over the overall rate),
    so the names stay sensible if the clustering is re-run.
    """
    names = {}
    remaining = dict(profiles)

    def take(key_fn, name, blurb):
        if not remaining:
            return
        c = max(remaining, key=key_fn)
        names[c] = {"name": name, "blurb": blurb}
        del remaining[c]

    take(lambda c: remaining[c]["lift"]["fight"] + remaining[c]["lift"]["victory_win_won"],
         "The Classic March", "The template: a brisk march that says “fight” and promises victory.")
    take(lambda c: remaining[c]["lift"]["men"] + remaining[c]["lift"]["opponents"],
         "The Old Guard", "Older and wordier: sings about “our men” and the other team more than about fighting.")
    take(lambda c: remaining[c]["lift"]["spelling"] + remaining[c]["lift"]["rah"],
         "The Cheer", "Built for the student section: rah-rahs and a spelled-out name.")
    for c in list(remaining):
        names[c] = {"name": "The Anthem",
                    "blurb": "Few tropes and little trash talk; closer to an alma mater than a battle cry."}
        del remaining[c]
    return names


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    songs = load_songs()
    rivalries = read_csv(DATA / "rivalries.csv")
    n = len(songs)
    idx = {s["school"]: i for i, s in enumerate(songs)}
    for r in rivalries:
        assert r["school_a"] in idx and r["school_b"] in idx, r

    lat = np.array([s["lat"] for s in songs])
    lon = np.array([s["lon"] for s in songs])
    geo = haversine_matrix(lat, lon)

    # --- nearest neighbours (for the detail card) ---
    for i, s in enumerate(songs):
        order = [j for j in np.argsort(geo[i]) if j != i][:3]
        s["nearest"] = [{"school": songs[j]["school"], "km": round(float(geo[i, j]))} for j in order]

    # --- tempo ---
    tempo = {
        "fold_threshold": FOLD_THRESHOLD,
        "n_folded": int(sum(s["folded"] for s in songs)),
        "bc_raw": bimodality_coefficient([s["bpm"] for s in songs]),
        "bc_folded": bimodality_coefficient([s["bpm_folded"] for s in songs]),
        "median_raw": float(np.median([s["bpm"] for s in songs])),
        "median_folded": float(np.median([s["bpm_folded"] for s in songs])),
    }

    # --- archetypes: Gower distance -> Ward clustering + MDS layout ---
    gower = gower_matrix(songs)
    Z = linkage(squareform(gower, checks=False), method="ward")
    labels = fcluster(Z, t=4, criterion="maxclust")
    profiles = name_archetypes(songs, labels)
    names = assign_names(profiles)
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=7, n_init=8, normalized_stress="auto")
    xy = mds.fit_transform(gower)
    xy = (xy - xy.mean(0)) / np.abs(xy).max()
    for i, s in enumerate(songs):
        c = int(labels[i])
        s["archetype"] = names[c]["name"]
        s["mds"] = [round(float(xy[i, 0]), 4), round(float(xy[i, 1]), 4)]
    archetypes = [{**names[c], **profiles[c]} for c in sorted(profiles)]

    # --- spatial autocorrelation ---
    moran_vars = {
        "bpm_folded": ("Tempo (folded BPM)", [s["bpm_folded"] for s in songs]),
        "bpm": ("Tempo (raw BPM)", [s["bpm"] for s in songs]),
        "sec_duration": ("Song length", [s["sec_duration"] for s in songs]),
        "trope_count": ("Number of tropes", [s["trope_count"] for s in songs]),
        "year": ("Year written", [s["year"] for s in songs]),
        "student": ("Student-written", [s["_student"] for s in songs]),
    }
    moran = {}
    for key, (label, vals) in moran_vars.items():
        keep = [i for i, v in enumerate(vals) if v is not None]
        res = morans_i([vals[i] for i in keep], geo[np.ix_(keep, keep)])
        moran[key] = {"label": label, **res}

    for key in ["bpm_folded", "trope_count"]:
        lisa = local_morans([s[key] for s in songs], geo)
        for s, l in zip(songs, lisa):
            s.setdefault("lisa", {})[key] = {"quad": l["quad"], "p": round(l["p"], 4)}

    # --- geography vs music ---
    mantel_res = mantel(geo, gower)
    iu = np.triu_indices(n, 1)
    pair_sample = [
        {"a": songs[i]["school"], "b": songs[j]["school"],
         "km": round(float(geo[i, j])), "d": round(float(gower[i, j]), 4)}
        for i, j in zip(*iu)
    ]

    rival_idx = [(idx[r["school_a"]], idx[r["school_b"]]) for r in rivalries]
    rival_d = np.array([gower[i, j] for i, j in rival_idx])
    rival_km = np.array([geo[i, j] for i, j in rival_idx])
    all_d = gower[iu]
    sims = np.array([all_d[RNG.choice(len(all_d), len(rival_idx), replace=False)].mean() for _ in range(N_PERM)])
    rival_test = {
        "n": len(rival_idx),
        "mean_d_rivals": float(rival_d.mean()),
        "mean_d_all": float(all_d.mean()),
        "mean_km_rivals": float(rival_km.mean()),
        "mean_km_all": float(geo[iu].mean()),
        "p_more_similar": float(((sims <= rival_d.mean()).sum() + 1) / (N_PERM + 1)),
        "perm_hist": histogram(sims, rival_d.mean()),
    }
    rival_out = []
    for r, (i, j) in zip(rivalries, rival_idx):
        a, b = songs[i], songs[j]
        rival_out.append({
            **r, "since": int(r["since"]),
            "km": round(float(geo[i, j])),
            "music_distance": round(float(gower[i, j]), 4),
            "bpm_diff": abs(a["bpm"] - b["bpm"]),
            "bpm_folded_diff": abs(a["bpm_folded"] - b["bpm_folded"]),
            "shared_tropes": [k for k in TROPE_KEYS if a["tropes"][k] and b["tropes"][k]],
        })

    # --- conference geography per era ---
    dispersion = {}
    for era in ERAS:
        dispersion[era] = {}
        for conf in sorted({s["conf"][era] for s in songs}):
            m = [i for i, s in enumerate(songs) if s["conf"][era] == conf]
            if len(m) < 2:
                continue
            sub = geo[np.ix_(m, m)]
            pairs = [(sub[a, b], a, b) for a, b in combinations(range(len(m)), 2)]
            far = max(pairs)
            clat, clon = spherical_center(lat[m], lon[m])
            to_c = haversine_matrix(np.append(lat[m], clat), np.append(lon[m], clon))[-1, :-1]
            dispersion[era][conf] = {
                "n": len(m),
                "mean_pair_km": float(np.mean([p[0] for p in pairs])),
                "max_pair_km": float(far[0]),
                "max_pair": [songs[m[far[1]]]["school"], songs[m[far[2]]]["school"]],
                "center": [clon, clat],
                "standard_distance_km": float(np.sqrt((to_c ** 2).mean())),
            }

    # --- where songs were written, decade by decade ---
    decades = []
    dated = [s for s in songs if s["year"]]
    for d0 in range(1890, 1970, 10):
        inside = [s for s in dated if d0 <= s["year"] < d0 + 10]
        upto = [s for s in dated if s["year"] < d0 + 10]
        rec = {"decade": d0, "n": len(inside), "cumulative": len(upto)}
        if inside:
            rec["center"] = list(spherical_center([s["lat"] for s in inside], [s["lon"] for s in inside]))[::-1]
        if upto:
            rec["cum_center"] = list(spherical_center([s["lat"] for s in upto], [s["lon"] for s in upto]))[::-1]
        decades.append(rec)

    # --- lyric tropes ---
    flags = np.array([[s["tropes"][k] for k in TROPE_KEYS] for s in songs], int)
    phi = []
    for a, (ka, la) in enumerate(TROPES):
        for b, (kb, lb) in enumerate(TROPES):
            x, y = flags[:, a], flags[:, b]
            n11 = int((x & y).sum())
            n1_, n_1 = int(x.sum()), int(y.sum())
            n10, n01 = n1_ - n11, n_1 - n11
            n00 = n - n11 - n10 - n01
            den = math.sqrt(n1_ * (n - n1_) * n_1 * (n - n_1)) or 1
            phi.append({"a": ka, "b": kb, "count": n11, "expected": n1_ * n_1 / n,
                        "phi": (n11 * n00 - n10 * n01) / den})

    trope_stats = {}
    for era in ERAS:
        confs = [s["conf"][era] for s in songs]
        rows = []
        for t, (k, label) in enumerate(TROPES):
            keep = [i for i, c in enumerate(confs) if c != "Independent"]
            chi, p = perm_chi2([confs[i] for i in keep], flags[keep, t])
            by_conf = {}
            for conf in sorted(set(confs)):
                m = [i for i, c in enumerate(confs) if c == conf]
                kk = int(flags[m, t].sum())
                by_conf[conf] = {"k": kk, "n": len(m), "rate": kk / len(m), "ci": wilson(kk, len(m))}
            rows.append({"key": k, "label": label, "chi2": chi, "p": p, "overall": float(flags[:, t].mean()),
                         "by_conf": by_conf})
        trope_stats[era] = rows

    # --- write ---
    for s in songs:
        s.pop("_student")
    with open(OUT / "songs.json", "w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, separators=(",", ":"))

    analysis = {
        "tropes": [{"key": k, "label": l} for k, l in TROPES],
        "tempo": tempo,
        "archetypes": archetypes,
        "moran": moran,
        "mantel": mantel_res,
        "pairs": pair_sample,
        "rivalry_test": rival_test,
        "rivalries": rival_out,
        "dispersion": dispersion,
        "decades": decades,
        "phi": phi,
        "trope_stats": trope_stats,
    }
    with open(OUT / "analysis.json", "w", encoding="utf-8") as f:
        json.dump(analysis, f, ensure_ascii=False, separators=(",", ":"))

    # --- console summary ---
    print(f"songs: {n}, rivalries: {len(rivalries)}")
    print(f"tempo: folded {tempo['n_folded']} songs; BC raw {tempo['bc_raw']:.3f} -> folded {tempo['bc_folded']:.3f}")
    for key, m in moran.items():
        print(f"Moran's I {key:13s} I={m['I']:+.3f}  p={m['p']:.4f}  n={m['n']}")
    print(f"Mantel geo vs music r={mantel_res['r']:+.3f} p={mantel_res['p']:.4f}")
    print(f"Rivals: mean music distance {rival_test['mean_d_rivals']:.3f} vs all {rival_test['mean_d_all']:.3f} "
          f"p={rival_test['p_more_similar']:.4f}")
    for a in archetypes:
        print(f"  {a['name']:18s} n={a['n']:2d} bpm={a['bpm_folded']:.0f} tropes={a['trope_count']:.1f} "
              f"year={a['year']:.0f} " + " ".join(f"{k}={v:.2f}" for k, v in a["tropes"].items()))
    for era in ERAS:
        print(era, {c: round(v["mean_pair_km"]) for c, v in dispersion[era].items()})
    for row in trope_stats["2019"]:
        print(f"  trope {row['key']:16s} p(2019)={row['p']:.3f}  p(2024)="
              f"{next(r['p'] for r in trope_stats['2024'] if r['key'] == row['key']):.3f}")


if __name__ == "__main__":
    main()
