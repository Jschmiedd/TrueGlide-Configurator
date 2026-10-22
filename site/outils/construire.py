#!/usr/bin/env python3
"""Assemble la documentation du site TRUEGLIDE.

Entrées :
  outils/pages.json          liste des pages (mêmes groupes et même ordre que le menu du logiciel)
  docs/_articles/<slug>.html contenu de chaque page (h1, chapeau, capture, parties h2 avec id)
  assets/img/onglets/*.png   captures faites par outils/captures.cjs

Sorties :
  docs/<slug>.html           page complète : en-tête, menu de la documentation, « Sur cette page », article, pied
  docs/index.html            sommaire en cartes, une section par groupe
  assets/img/onglets/*.webp  captures converties (les .png sont supprimés)

Lancer depuis n'importe où : python3 site/outils/construire.py
"""
import html
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
DOCS = SITE / "docs"
ARTICLES = DOCS / "_articles"
CAPTURES = SITE / "assets" / "img" / "onglets"

POLICES = (
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500"
    "&amp;family=IBM+Plex+Sans:wght@400;500;600&amp;family=Saira+Semi+Condensed:wght@500;600;700&amp;display=swap"
)


def entete(prefixe, courant):
    """En-tête commun ; prefixe = chemin vers la racine du site ("" ou "../")."""
    liens = [
        ("Accueil", f"{prefixe}index.html", courant == "accueil"),
        ("Documentation", f"{prefixe}docs/index.html", courant == "docs"),
        ("Télécharger", f"{prefixe}index.html#telecharger", False),
        ("Essais", f"{prefixe}index.html#essais", False),
    ]
    nav = "\n".join(
        f'      <a href="{href}"{" aria-current=\"page\"" if actif else ""}>{texte}</a>' for texte, href, actif in liens
    )
    return f"""<header class="entete">
  <div class="large">
    <a class="marque" href="{prefixe}index.html"><img src="{prefixe}assets/img/embleme.png" alt="">TRUE<span>GLIDE</span></a>
    <nav aria-label="Site">
{nav}
    </nav>
  </div>
</header>"""


PIED = """<footer class="pied">
  <div class="large">
    <span><b>TRUEGLIDE</b> · Talk True FPV</span>
    <span>Firmware et logiciel libres (licence GPL-3.0), dérivés de Betaflight, fournis sans garantie. Le nom et le logo TRUEGLIDE sont la marque de Talk True FPV.</span>
  </div>
</footer>"""


def page(titre, prefixe, courant, corps, description=""):
    meta = f'\n<meta name="description" content="{html.escape(description)}">' if description else ""
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(titre)}</title>{meta}
<link rel="icon" href="{prefixe}assets/img/embleme.png">
<link rel="stylesheet" href="{POLICES}">
<link rel="stylesheet" href="{prefixe}assets/site.css">
</head>
<body>
{entete(prefixe, courant)}

{corps}

{PIED}
</body>
</html>
"""


def texte(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def convertir_captures():
    from PIL import Image

    for png in sorted(CAPTURES.glob("*.png")):
        webp = png.with_suffix(".webp")
        Image.open(png).convert("RGB").save(webp, "WEBP", quality=82, method=6)
        png.unlink()


def main():
    groupes = json.loads((SITE / "outils" / "pages.json").read_text(encoding="utf-8"))["groupes"]
    convertir_captures()

    articles = {}
    manquantes = []
    for g in groupes:
        for p in g["pages"]:
            f = ARTICLES / f"{p['slug']}.html"
            if f.exists():
                articles[p["slug"]] = f.read_text(encoding="utf-8")
            else:
                manquantes.append(p["slug"])

    def menu(courant):
        blocs = ['    <h2>Documentation</h2>\n    <ul>\n      <li><a href="index.html"'
                 + (' aria-current="page"' if courant == "index" else "") + ">Toute la documentation</a></li>\n    </ul>"]
        for g in groupes:
            items = []
            for p in g["pages"]:
                if p["slug"] not in articles:
                    continue
                actif = ' aria-current="page"' if p["slug"] == courant else ""
                items.append(f'      <li><a href="{p["slug"]}.html"{actif}>{html.escape(p["titre"])}</a></li>')
            if items:
                blocs.append(f"    <h2>{html.escape(g['titre'])}</h2>\n    <ul>\n" + "\n".join(items) + "\n    </ul>")
        return "\n".join(blocs)

    resumes = {}
    for slug, contenu in articles.items():
        contenu = re.sub(r'(\.\./assets/img/onglets/[^"]+)\.png"', r'\1.webp"', contenu)
        titre = texte(re.search(r"<h1[^>]*>(.*?)</h1>", contenu, re.S).group(1))
        chapeau = re.search(r'<p class="chapeau">(.*?)</p>', contenu, re.S)
        resumes[slug] = texte(chapeau.group(1)) if chapeau else ""
        parties = re.findall(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', contenu, re.S)
        sur_page = ""
        if parties:
            items = "\n".join(f'      <li><a href="#{i}">{html.escape(texte(t))}</a></li>' for i, t in parties)
            sur_page = f"\n    <h2>Sur cette page</h2>\n    <ul>\n{items}\n    </ul>"
        corps = f"""<div class="large doc">
  <aside>
{menu(slug)}{sur_page}
  </aside>

  <article>
{contenu.strip()}
  </article>
</div>"""
        (DOCS / f"{slug}.html").write_text(
            page(f"{titre} · Documentation TRUEGLIDE", "../", "docs", corps, resumes[slug]), encoding="utf-8"
        )

    sections = []
    for g in groupes:
        cartes = [
            f'      <a href="{p["slug"]}.html"><b>{html.escape(p["titre"])}</b><span>{html.escape(resumes[p["slug"]])}</span></a>'
            for p in g["pages"]
            if p["slug"] in articles
        ]
        if cartes:
            sections.append(f"    <h2>{html.escape(g['titre'])}</h2>\n    <div class=\"cartes\">\n" + "\n".join(cartes) + "\n    </div>")
    sommaire = f"""<div class="large doc">
  <aside>
{menu("index")}
  </aside>

  <article class="sommaire">
    <h1>Documentation</h1>
    <p class="chapeau">Une page par onglet du logiciel TrueGlide Configurator, dans l'ordre du menu, et les premiers pas pour installer <b>TRUEGLIDE</b> et faire voler le drone.</p>
{chr(10).join(sections)}
  </article>
</div>"""
    (DOCS / "index.html").write_text(
        page("Documentation · TRUEGLIDE", "../", "docs", sommaire, "Documentation du firmware TRUEGLIDE et du logiciel TrueGlide Configurator."),
        encoding="utf-8",
    )

    print(f"{len(articles)} pages construites")
    if manquantes:
        print("Pages sans article :", ", ".join(manquantes))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
