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



APP = "https://jschmiedd.github.io/TrueGlide-Configurator/app/"
OUVRIR = [
    ("TRUEGLIDE CONFIGURATOR", APP, "le logiciel de réglage"),
    ("TRUEGLIDE STUDIO", APP + "#studio", "réglage de départ, ports, missions"),
    ("TRUEGLIDE ESC CONFIGURATOR", "https://jschmiedd.github.io/TrueGlide-ESC-Configurator/", "réglage et flash des ESC"),
]
GITHUB = [
    ("Firmware-TrueGlide", "https://github.com/Jschmiedd/Firmware-TrueGlide", "firmware"),
    ("TrueGlide-Configurator", "https://github.com/Jschmiedd/TrueGlide-Configurator", "logiciel et site"),
    ("TrueGlide-ESC-Configurator", "https://github.com/Jschmiedd/TrueGlide-ESC-Configurator", "ESC"),
]
# pages du menu « Projet » qui ont leur propre entrée dans l'en-tête
HORS_WIKI = {"telecharger", "nouvelles", "developpement"}


def entete(prefixe, courant):
    """En-tête commun à tout le site (accueil et documentation) ; prefixe = chemin vers la racine ("" ou "../").
    courant : "accueil", "wiki", ou le slug d'une page du menu (telecharger, nouvelles, developpement)."""
    liens = [
        ("Wiki", f"{prefixe}docs/index.html", courant == "wiki"),
        ("Télécharger", f"{prefixe}docs/telecharger.html", courant == "telecharger"),
        ("Essais", f"{prefixe}index.html#essais", False),
        ("Nouvelles", f"{prefixe}docs/nouvelles.html", courant == "nouvelles"),
        ("Développement", f"{prefixe}docs/developpement.html", courant == "developpement"),
    ]
    nav = "\n".join(
        f'        <a href="{href}"{" aria-current=\"page\"" if actif else ""}>{texte}</a>' for texte, href, actif in liens
    )

    def deroulant(titre, items):
        lignes = "\n".join(
            f'            <li><a href="{href}" target="_blank" rel="noopener"><b>{html.escape(nom)}</b><span>{html.escape(note)}</span></a></li>'
            for nom, href, note in items
        )
        return f"""        <details class="deroulant">
          <summary>{titre}</summary>
          <ul>
{lignes}
          </ul>
        </details>"""

    return f"""<header class="entete">
  <div class="large">
    <a class="marque" href="{prefixe}index.html"><img src="{prefixe}assets/img/embleme.png" alt="" width="38" height="38"><b>TRUE<span>GLIDE</span></b></a>
    <button class="bouton-icone theme-bouton" type="button" aria-pressed="false" title="Thème clair ou sombre">
      <span class="visuellement-cache">Thème sombre</span>
      <svg class="icone-lune" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="icone-soleil" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </button>
    <button class="bouton-icone menu-bouton" type="button" aria-expanded="false" aria-controls="menu-site">
      <span class="visuellement-cache">Menu</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <div class="menu-site" id="menu-site">
      <nav class="principal" aria-label="Site">
{nav}
      </nav>
      <div class="outils">
{deroulant("Ouvrir", OUVRIR)}
{deroulant("GitHub", GITHUB)}
        <div class="recherche" role="search">
          <label class="visuellement-cache" for="recherche">Rechercher dans le wiki</label>
          <input id="recherche" type="search" placeholder="Rechercher…" autocomplete="off" data-index="{prefixe}docs/recherche.json" data-base="{prefixe}docs/">
          <ul class="resultats" hidden></ul>
        </div>
      </div>
    </div>
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
<link rel="stylesheet" href="{prefixe}fonts/polices.css">
<link rel="stylesheet" href="{prefixe}assets/site.css">
<script src="{prefixe}assets/theme.js"></script>
<script src="{prefixe}assets/site.js" defer></script>
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
            page(f"{titre} · Documentation TRUEGLIDE", "../", slug if slug in HORS_WIKI else "wiki", corps, resumes[slug]), encoding="utf-8"
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
        page("Documentation · TRUEGLIDE", "../", "wiki", sommaire, "Documentation du firmware TRUEGLIDE et du logiciel TrueGlide Configurator."),
        encoding="utf-8",
    )

    # index de recherche : une entrée par page et par partie (titre, partie, résumé), lu par assets/site.js
    index = []
    for g in groupes:
        for p in g["pages"]:
            contenu = articles.get(p["slug"])
            if not contenu:
                continue
            titre = texte(re.search(r"<h1[^>]*>(.*?)</h1>", contenu, re.S).group(1))
            index.append({"t": titre, "p": "", "u": f"{p['slug']}.html", "x": resumes[p["slug"]][:220]})
            # texte de chaque partie (jusqu'au titre suivant) : la recherche trouve aussi les mots du corps
            morceaux = re.split(r'(<h2 id="[^"]+"[^>]*>.*?</h2>)', contenu, flags=re.S)
            for k in range(1, len(morceaux) - 1, 2):
                i, t = re.match(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', morceaux[k], re.S).groups()
                corps_partie = re.sub(r"\s+", " ", texte(morceaux[k + 1]))[:4000]
                index.append({"t": titre, "p": texte(t), "u": f"{p['slug']}.html#{i}", "x": corps_partie})
    (DOCS / "recherche.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # même en-tête sur l'accueil (index.html est écrit à la main : seul le bloc <header> est remplacé)
    accueil = SITE / "index.html"
    t = accueil.read_text(encoding="utf-8")
    t = re.sub(r'<header class="entete">.*?</header>', lambda m: entete("", "accueil"), t, count=1, flags=re.S)
    for script in ('<script src="assets/theme.js"></script>', '<script src="assets/site.js" defer></script>'):
        if script not in t:
            t = t.replace("</head>", script + "\n</head>", 1)
    accueil.write_text(t, encoding="utf-8")

    print(f"{len(articles)} pages construites")
    if manquantes:
        print("Pages sans article :", ", ".join(manquantes))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
