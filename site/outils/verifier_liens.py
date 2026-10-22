#!/usr/bin/env python3
"""Contrôle des liens du site : fichiers manquants, ancres absentes. Lancer : python3 site/outils/verifier_liens.py"""
import glob
import os
import re
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(SITE)
erreurs = 0
for p in glob.glob("*.html") + glob.glob("docs/*.html"):
    s = open(p, encoding="utf-8").read()
    for h, a in re.findall(r'(?:href|src)="([^"#:]+)(?:#([^"]*))?"', s):
        f = os.path.normpath(os.path.join(os.path.dirname(p), h))
        if not os.path.exists(f):
            print(p, "->", h)
            erreurs += 1
        elif a and f.endswith(".html") and f'id="{a}"' not in open(f, encoding="utf-8").read():
            print(p, "-> ancre", h, a)
            erreurs += 1
    for a in re.findall(r'href="#([^"]+)"', s):
        if f'id="{a}"' not in s:
            print(p, "ancre locale", a)
            erreurs += 1
print(f"{erreurs} erreur(s)")
sys.exit(1 if erreurs else 0)
