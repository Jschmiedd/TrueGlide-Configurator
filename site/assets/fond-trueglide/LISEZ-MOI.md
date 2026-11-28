# Fond « carte imprimée » TRUEGLIDE

Le fond du haut de la page d'accueil, prêt à réutiliser sur les autres pages TRUEGLIDE.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `fond-circuit-clair.svg` | dessin pour le thème clair (olive `#4b5e0b`, très pâle) |
| `fond-circuit-sombre.svg` | même dessin pour le thème sombre (vert-jaune `#c6f700`, très pâle) |
| `fond-trueglide.css` | les classes `fond-trueglide` et `fond-trueglide-fixe` |
| `exemple.html` | page de démonstration |

## Utilisation dans une autre page

1. Copier le dossier `fond-trueglide/` entier à côté de la page.
2. Dans le `<head>` : `<link rel="stylesheet" href="fond-trueglide/fond-trueglide.css">`
3. Ajouter la classe au bloc voulu :
   - un haut de page ou une section : `<section class="fond-trueglide">…</section>`
   - toute la page, le dessin restant en place au défilement : `<body class="fond-trueglide fond-trueglide-fixe">`

Le texte posé sur le fond doit avoir son propre fond, légèrement transparent, comme la « vitre » de l'accueil, pour rester lisible.

## Thème clair ou sombre

Le fond passe en sombre :
- si le système est en sombre, sauf si la page a `<html data-theme="light">` ;
- si la page a `<html data-theme="dark">` (site TRUEGLIDE) ;
- si la page a `<html class="dark">` (TRUEGLIDE CONFIGURATOR, Nuxt UI).

## Refaire le dessin

Le dessin est calculé par `site/outils/fond_circuit.py` : aucun élément ne se chevauche. Le dessin actuel est la graine 11 :

```
python3 site/outils/fond_circuit.py site 11
```

Une autre graine donne un autre tirage, avec le même style.
