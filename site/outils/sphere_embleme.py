# Sphère TRUEGLIDE en rotation : l'emblème (assets/img/embleme.png) collé sur une boule noire brillante, comme la sphère
# du site du calculateur. Calcul image par image (numpy), fond transparent, puis assemblage en WebP animé (lu par tous
# les navigateurs récents, Safari compris) et une image fixe pour « réduire les animations ».
# Usage : python3 site/outils/sphere_embleme.py site
import sys
from pathlib import Path
import numpy as np
from PIL import Image

TAILLE, IMAGES, TOUR = 320, 40, 2.0          # pixels, images par demi-tour, secondes par demi-tour (l'emblème est sur 2 faces)
QUALITE = 60
SUR = 2                                      # suréchantillonnage : bords lisses

def charge(site):
    tex = Image.open(site / "assets/img/embleme.png").convert("RGBA")
    return np.asarray(tex).astype(np.float32) / 255.0

def image(tex, angle):
    n = TAILLE * SUR
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (x + 0.5) / n * 2 - 1; y = 1 - (y + 0.5) / n * 2
    r2 = x*x + y*y; dedans = r2 <= 1.0
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    # point de la sphère, tourné autour de l'axe vertical
    c, s = np.cos(angle), np.sin(angle)
    px, pz = x*c + z*s, -x*s + z*c
    # décalque : l'emblème projeté de face sur l'avant (pz > 0) et sur l'arrière (pz < 0, retourné)
    u = np.where(pz >= 0, px, -px); v = y
    th, tw = tex.shape[:2]
    ti = np.clip(((1 - v) / 2 * (th - 1)).astype(int), 0, th - 1)
    tj = np.clip(((u + 1) / 2 * (tw - 1)).astype(int), 0, tw - 1)
    col = tex[ti, tj, :3]; a = tex[ti, tj, 3:4]
    noir = np.array([0.04, 0.045, 0.04], np.float32)
    base = col * a + noir * (1 - a)
    # sur le bord du décalque (près du profil), l'emblème s'efface dans le noir comme sur le calculateur
    fondu = np.clip(np.abs(pz) * 3.0, 0, 1)[..., None]
    base = base * fondu + noir * (1 - fondu)
    # lumière : diffuse douce + reflet spéculaire en haut à gauche + liseré sur le contour
    L = np.array([-0.25, 0.75, 0.6], np.float32); L /= np.linalg.norm(L)
    nd = np.clip(x*L[0] + y*L[1] + z*L[2], 0, 1)[..., None]
    h = np.array([L[0], L[1], L[2] + 1], np.float32); h /= np.linalg.norm(h)
    spec = np.clip(x*h[0] + y*h[1] + z*h[2], 0, 1) ** 220
    bord = (1 - z) ** 3 * 0.18
    rgb = base * (0.55 + 0.45*nd) + (spec*0.7 + bord)[..., None] * np.array([0.85, 0.95, 0.6], np.float32)
    rgba = np.dstack([np.clip(rgb, 0, 1), dedans.astype(np.float32)])
    im = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")
    return im.resize((TAILLE, TAILLE), Image.LANCZOS)

if __name__ == "__main__":
    site = Path(sys.argv[1]); tex = charge(site)
    images = [image(tex, np.pi * k / IMAGES) for k in range(IMAGES)]
    dest = site / "assets/img"
    images[0].save(dest / "sphere-embleme.webp", save_all=True, append_images=images[1:], duration=int(TOUR*1000/IMAGES),
                   loop=0, quality=QUALITE, method=6, lossless=False, minimize_size=True)
    images[0].save(dest / "sphere-embleme-fixe.webp", quality=85, method=6)
    print("ok", (dest / "sphere-embleme.webp").stat().st_size, "octets")
