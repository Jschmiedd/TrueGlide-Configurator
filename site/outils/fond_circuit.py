# Fond « carte imprimée » TRUEGLIDE, sans chevauchement.
# Chaque élément (X de l'emblème, puce, faisceau de pistes, résistances, condensateurs, vias) est d'abord décrit
# en coordonnées de la page, puis posé seulement si toutes ses cases (grille de 6 px, marge comprise) sont libres.
# Usage : python3 site/outils/fond_circuit.py site 11   (graine 11 = dessin publié ; une autre graine = autre tirage)
import math, random, re, sys
from pathlib import Path

W, H, G, MARGE = 2000, 1300, 6, 8
occupe = set()

# ---------- géométrie ----------
def norm(v):
    l = math.hypot(*v) or 1
    return (v[0] / l, v[1] / l)

def offset(poly, d):
    """Ligne brisée décalée de d (onglet aux coudes) : pistes parallèles d'un faisceau."""
    out = []
    for i, p in enumerate(poly):
        ns = []
        if i > 0:
            s = norm((p[0] - poly[i-1][0], p[1] - poly[i-1][1])); ns.append((-s[1], s[0]))
        if i < len(poly) - 1:
            s = norm((poly[i+1][0] - p[0], poly[i+1][1] - p[1])); ns.append((-s[1], s[0]))
        n = norm((sum(a[0] for a in ns), sum(a[1] for a in ns)))
        k = d / max(0.5, n[0]*ns[0][0] + n[1]*ns[0][1])
        out.append((p[0] + n[0]*k, p[1] + n[1]*k))
    return out

def cases(prims, marge):
    """Cases de la grille couvertes par les primitives, élargies de la marge."""
    m = int(math.ceil(marge / G)); res = set()
    def point(x, y, r=0):
        rr = m + int(math.ceil(r / G))
        cx, cy = int(x // G), int(y // G)
        for a in range(-rr, rr + 1):
            for b in range(-rr, rr + 1):
                res.add((cx + a, cy + b))
    for p in prims:
        if p[0] == "s":
            for (a, b), (c, d) in zip(p[1], p[1][1:]):
                n = max(1, int(math.hypot(c - a, d - b) // 3))
                for k in range(n + 1): point(a + (c - a)*k/n, b + (d - b)*k/n)
        elif p[0] == "r":
            _, x, y, w, h, _ = p
            for i in range(int(x // G) - m, int((x + w) // G) + m + 1):
                for j in range(int(y // G) - m, int((y + h) // G) + m + 1): res.add((i, j))
        elif p[0] == "c":
            point(p[1], p[2], p[3])
    return res

def libre(prims, ignorer=frozenset()):
    return not ((cases(prims, MARGE) - ignorer) & occupe)

def poser(prims, liste, o, ignorer=frozenset()):
    if not libre(prims, ignorer): return False
    occupe.update(cases(prims, 0)); liste.append((o, prims)); return True

def dedans(prims, bord=-40):
    for p in prims:
        pts = p[1] if p[0] == "s" else [(p[1], p[2])]
        for x, y in pts:
            if not (bord <= x <= W - bord and bord <= y <= H - bord): return False
    return True

# ---------- éléments ----------
SORTIE = [(-1, 0), (0, -1), (1, 0), (0, 1)]          # faces : gauche, haut, droite, bas

def faisceau(depart, d, R, n, ecart, s=1.0):
    """n pistes parallèles qui sortent dans la direction d, se coudent à 45°, puis repartent ; vias au bout."""
    cote = R.choice([1, -1])
    diag = norm((d[0] - cote*d[1], d[1] + cote*d[0]))
    L1, L2, L3 = R.uniform(18, 60)*s, R.uniform(40, 130)*s, R.uniform(30, 150)*s
    p1 = (depart[0] + d[0]*L1, depart[1] + d[1]*L1)
    p2 = (p1[0] + diag[0]*L2, p1[1] + diag[1]*L2)
    p3 = (p2[0] + d[0]*L3, p2[1] + d[1]*L3)
    prims = []
    for k in range(n):
        q = offset([depart, p1, p2, p3], (k - (n - 1)/2) * ecart)
        prims.append(("s", q)); prims.append(("c", q[-1][0], q[-1][1], 3.2, False))
    return prims

def piece_x(x, y, s, r, R):
    """Le motif aimé : X de l'emblème, puce centrale à broches, moteurs, pistes latérales, faisceaux."""
    a = math.radians(r)
    def T(px, py):
        px, py = px - 130, py - 130
        return (x + (px*math.cos(a) - py*math.sin(a) + 130)*s, y + (px*math.sin(a) + py*math.cos(a) + 130)*s)
    def D(v): return (v[0]*math.cos(a) - v[1]*math.sin(a), v[0]*math.sin(a) + v[1]*math.cos(a))
    prims = []
    pads = [(40, 40), (220, 40), (40, 220), (220, 220)]
    bras = [((40, 40), (100, 100)), ((220, 40), (160, 100)), ((40, 220), (100, 160)), ((220, 220), (160, 160))]
    garde = [i for i in range(4) if R.random() > 0.15] or [0]
    for i in garde:
        prims.append(("s", [T(*bras[i][0]), T(*bras[i][1])]))
        prims.append(("c", *T(*pads[i]), 9*s, False)); prims.append(("c", *T(*pads[i]), 3*s, True))
    c0, c1 = T(100, 100), T(160, 160)
    prims.append(("r", min(c0[0], c1[0]), min(c0[1], c1[1]), 60*s, 60*s, 6*s))
    milieu = [(100, 130), (130, 100), (160, 130), (130, 160)]
    cotes = [[(100, 115), (82, 115), (82, 70), (40, 70)], [(145, 100), (145, 82), (190, 82), (190, 40)],
             [(160, 145), (178, 145), (178, 190), (220, 190)], [(115, 160), (115, 178), (70, 178), (70, 220)]]
    faces = R.sample(range(4), R.choice([1, 2, 2]))
    for f in range(4):
        (mx, my), (dx, dy) = milieu[f], SORTIE[f]
        for k in (-18, -6, 6, 18):
            prims.append(("c", *T(mx + (k if dy else 0) + dx*5, my + (k if dx else 0) + dy*5), 1.8*s, True))
        if f not in faces and R.random() > 0.35:
            prims.append(("s", [T(*p) for p in cotes[f]]))
    for f in faces:
        (mx, my), d = milieu[f], D(SORTIE[f])
        prims += faisceau(T(mx + SORTIE[f][0]*5, my + SORTIE[f][1]*5), d, R, R.choice([3, 4]), 12*s, s)
    return prims, [T(*pads[i]) for i in garde]

def puce(x, y, R, grande=False):
    w, h = R.choice([(110, 60), (60, 110), (80, 80), (90, 50)] if grande else [(50, 50), (70, 40), (40, 70), (56, 32)])
    prims = [("r", x, y, w, h, 4)]
    for i in range(8, w - 4, 10):
        prims.append(("s", [(x + i, y), (x + i, y - 6)])); prims.append(("s", [(x + i, y + h), (x + i, y + h + 6)]))
    for i in range(8, h - 4, 10):
        prims.append(("s", [(x, y + i), (x - 6, y + i)])); prims.append(("s", [(x + w, y + i), (x + w + 6, y + i)]))
    f = R.randrange(4); d = SORTIE[f]; n = R.choice([2, 3, 4])
    centre = {0: (x - 6, y + h/2), 1: (x + w/2, y - 6), 2: (x + w + 6, y + h/2), 3: (x + w/2, y + h + 6)}[f]
    prims += faisceau(centre, d, R, n, 10, 0.8 if not grande else 1.0)
    return prims

def bus(R):
    x, y = R.uniform(0, W), R.uniform(0, H)
    di = R.choice([0, 2, 4, 6]); dirs = [(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1),(0,-1),(1,-1)]
    poly = [(x, y)]
    for _ in range(R.randint(2, 4)):
        L = R.uniform(60, 220); dx, dy = dirs[di]; f = 1/math.sqrt(2) if dx and dy else 1
        x += dx*L*f; y += dy*L*f; poly.append((x, y)); di = (di + R.choice([1, -1])) % 8
    n = R.randint(2, 5); prims = []
    for k in range(n):
        q = offset(poly, (k - (n - 1)/2) * 11)
        prims.append(("s", q))
        for p in (q[0], q[-1]): prims.append(("c", p[0], p[1], 3.2, False))
    return prims

def resistances(x, y, R):
    prims = []; vert = R.random() < 0.5
    for k in range(R.randint(2, 4)):
        if vert:
            a = x + k*16
            prims += [("s", [(a, y), (a, y + 12)]), ("r", a - 5, y + 12, 10, 28, 2), ("s", [(a, y + 40), (a, y + 52)])]
        else:
            b = y + k*16
            prims += [("s", [(x, b), (x + 12, b)]), ("r", x + 12, b - 5, 28, 10, 2), ("s", [(x + 40, b), (x + 52, b)])]
    return prims

def condensateurs(x, y, R):
    prims = []
    for k in range(R.randint(1, 3)):
        a = x + k*26
        prims += [("s", [(a, y), (a, y + 16)]), ("s", [(a - 9, y + 16), (a + 9, y + 16)]),
                  ("s", [(a - 9, y + 22), (a + 9, y + 22)]), ("s", [(a, y + 22), (a, y + 38)]),
                  ("c", a, y, 2.6, True), ("c", a, y + 38, 2.6, True)]
    return prims

def vias(x, y, R):
    return [("c", x + i*14, y + j*14, 3, False) for i in range(R.randint(2, 4)) for j in range(R.randint(1, 3))]

def route(p, q):
    dx, dy = q[0] - p[0], q[1] - p[1]; sx, sy = math.copysign(1, dx), math.copysign(1, dy)
    if abs(dx) >= abs(dy):
        h = (abs(dx) - abs(dy)) / 2
        return [p, (p[0] + sx*h, p[1]), (p[0] + sx*(h + abs(dy)), q[1]), q]
    v = (abs(dy) - abs(dx)) / 2
    return [p, (p[0], p[1] + sy*v), (q[0], p[1] + sy*(v + abs(dx))), q]

# ---------- composition ----------
def composer(graine):
    R = random.Random(graine); occupe.clear(); liste = []
    def op(x, y): return 0.45 if abs(x - W/2) < 560 and 140 < y < 1050 else R.uniform(0.75, 1.0)
    # 1. les X de l'emblème, bien répartis
    xs = []
    for _ in range(3000):
        if len(xs) >= 13: break
        x, y, s = R.uniform(-40, W - 220), R.uniform(-40, H - 220), R.uniform(0.85, 1.05)
        if any(math.hypot(x - a, y - b) < 330 for a, b, *_ in xs): continue
        prims, pads = piece_x(x, y, s, R.choice([0, 90, 180, 270]), R)
        if dedans(prims, -60) and poser(prims, liste, op(x + 130, y + 130)): xs.append((x, y, pads))
    # 2. liaisons moteur à moteur entre X voisins (les pastilles de départ et d'arrivée sont permises)
    for i, (x, y, pads) in enumerate(xs):
        for _, j in sorted((math.hypot(x - b[0], y - b[1]), j) for j, b in enumerate(xs) if j != i)[:2]:
            if j < i: continue
            for p in pads:
                q = min(xs[j][2], key=lambda t: math.hypot(t[0] - p[0], t[1] - p[1]))
                if math.hypot(q[0] - p[0], q[1] - p[1]) > 520: continue
                n = R.choice([1, 2]); prims = [("s", offset(route(p, q), k*9)) for k in range(n)]
                ign = cases([("c", p[0], p[1], 14, False), ("c", q[0], q[1], 14, False)], MARGE)
                if poser(prims, liste, op(*p), ign): break
    # 3. grandes puces, puis faisceaux libres
    for _ in range(400): x, y = R.uniform(0, W - 120), R.uniform(0, H - 120); poser(puce(x, y, R, True), liste, op(x, y))
    for _ in range(500):
        b = bus(R)
        if dedans(b, -80): poser(b, liste, op(*b[0][1][0]))
    # 4. remplissage : petites puces, résistances, condensateurs, vias, partout où il reste de la place
    for _ in range(9000):
        x, y = R.uniform(0, W - 60), R.uniform(0, H - 60); t = R.random()
        el = puce(x, y, R) if t < 0.3 else resistances(x, y, R) if t < 0.55 else condensateurs(x, y, R) if t < 0.78 else vias(x, y, R)
        poser(el, liste, op(x, y))
    return liste

def rendu(liste, c, base):
    out = []
    for o, prims in liste:
        a = f"{base*o:.3f}"; g = []
        for p in prims:
            if p[0] == "s": g.append("<path d='M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p[1]) + "'/>")
            elif p[0] == "r": g.append(f"<rect x='{p[1]:.1f}' y='{p[2]:.1f}' width='{p[3]:.1f}' height='{p[4]:.1f}' rx='{p[5]:.1f}'/>")
            elif p[4]: g.append(f"<circle cx='{p[1]:.1f}' cy='{p[2]:.1f}' r='{p[3]:.1f}' fill='{c}' stroke='none'/>")
            else: g.append(f"<circle cx='{p[1]:.1f}' cy='{p[2]:.1f}' r='{p[3]:.1f}'/>")
        out.append(f"<g stroke-opacity='{a}' fill-opacity='{a}'>{''.join(g)}</g>")
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}' fill='none' stroke='{c}' "
            f"stroke-width='1.35' stroke-linejoin='round' stroke-linecap='round'>{''.join(out)}</svg>\n")

if __name__ == "__main__":
    d = Path(sys.argv[1]); graine = int(sys.argv[2])
    liste = composer(graine)
    (d / "assets/img/fond-circuit-clair.svg").write_text(rendu(liste, "#4b5e0b", 0.19))
    (d / "assets/img/fond-circuit-sombre.svg").write_text(rendu(liste, "#c6f700", 0.12))
    print("éléments posés :", len(liste))
