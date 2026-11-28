// En-tête du site : bouton de thème, menu repliable sur téléphone, menus déroulants « Ouvrir » et « GitHub »,
// recherche dans le wiki (index docs/recherche.json, chargé au premier usage). Aucun appel hors du site.
(function () {
    var d = document.documentElement;
    var sombre = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    function estSombre() {
        var t = d.getAttribute("data-theme");
        return t ? t === "dark" : Boolean(sombre && sombre.matches);
    }

    // thème : bascule clair / sombre, mémorisée dans ce navigateur
    var theme = document.querySelector(".theme-bouton");
    if (theme) {
        var maj = function () {
            theme.setAttribute("aria-pressed", estSombre() ? "true" : "false");
        };
        maj();
        theme.addEventListener("click", function () {
            var t = estSombre() ? "light" : "dark";
            d.setAttribute("data-theme", t);
            try {
                localStorage.setItem("trueglide-theme", t);
            } catch (e) {
                /* stockage bloqué : le choix vaut pour cette page */
            }
            maj();
        });
    }

    // menu repliable (téléphone)
    var bouton = document.querySelector(".menu-bouton");
    var menu = document.getElementById("menu-site");
    function ouvrirMenu(oui) {
        if (!bouton || !menu) return;
        menu.setAttribute("data-ouvert", oui ? "true" : "false");
        bouton.setAttribute("aria-expanded", oui ? "true" : "false");
    }
    if (bouton && menu) {
        ouvrirMenu(false);
        bouton.addEventListener("click", function () {
            ouvrirMenu(bouton.getAttribute("aria-expanded") !== "true");
        });
    }

    // menus déroulants : un seul ouvert à la fois, fermés par un clic ailleurs ou par Échap
    var deroulants = Array.prototype.slice.call(document.querySelectorAll(".entete details.deroulant"));
    deroulants.forEach(function (dd) {
        dd.addEventListener("toggle", function () {
            if (dd.open) deroulants.forEach(function (autre) { if (autre !== dd) autre.open = false; });
        });
    });
    document.addEventListener("click", function (e) {
        deroulants.forEach(function (dd) { if (dd.open && !dd.contains(e.target)) dd.open = false; });
    });

    // recherche dans le wiki
    var champ = document.getElementById("recherche");
    var liste = champ ? champ.parentNode.querySelector(".resultats") : null;
    var index = null;
    var chargement = null;

    function normal(s) {
        return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }
    function charger() {
        if (!chargement) {
            chargement = fetch(champ.getAttribute("data-index"))
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    index = j.map(function (e) { e.n = normal(e.t + " " + e.p + " " + e.x); e.nt = normal(e.t + " " + e.p); return e; });
                })
                .catch(function () { index = []; });
        }
        return chargement;
    }
    function vider() {
        liste.hidden = true;
        liste.textContent = "";
        champ.removeAttribute("aria-activedescendant");
    }
    function chercher() {
        var mots = normal(champ.value).split(/\s+/).filter(Boolean);
        if (!mots.length || !index) return vider();
        var trouves = index
            .filter(function (e) { return mots.every(function (m) { return e.n.indexOf(m) >= 0; }); })
            .sort(function (a, b) {
                var sa = mots.filter(function (m) { return a.nt.indexOf(m) >= 0; }).length - (a.p ? 0.5 : 0);
                var sb = mots.filter(function (m) { return b.nt.indexOf(m) >= 0; }).length - (b.p ? 0.5 : 0);
                return sb - sa;
            })
            .slice(0, 8);
        liste.textContent = "";
        if (!trouves.length) {
            var vide = document.createElement("li");
            vide.className = "vide";
            vide.textContent = "Aucune page trouvée";
            liste.appendChild(vide);
        }
        trouves.forEach(function (e) {
            var li = document.createElement("li");
            var a = document.createElement("a");
            a.href = champ.getAttribute("data-base") + e.u;
            var b = document.createElement("b");
            b.textContent = e.t;
            a.appendChild(b);
            if (e.p) {
                var s = document.createElement("span");
                s.textContent = e.p;
                a.appendChild(s);
            }
            li.appendChild(a);
            liste.appendChild(li);
        });
        liste.hidden = false;
    }
    if (champ && liste) {
        champ.addEventListener("focus", charger);
        champ.addEventListener("input", function () { charger().then(chercher); });
        champ.addEventListener("keydown", function (e) {
            var liens = liste.querySelectorAll("a");
            if (e.key === "ArrowDown" && liens.length) { e.preventDefault(); liens[0].focus(); }
            if (e.key === "Enter" && liens.length) { e.preventDefault(); window.location.href = liens[0].href; }
        });
        liste.addEventListener("keydown", function (e) {
            var liens = Array.prototype.slice.call(liste.querySelectorAll("a"));
            var i = liens.indexOf(document.activeElement);
            if (e.key === "ArrowDown" && i < liens.length - 1) { e.preventDefault(); liens[i + 1].focus(); }
            if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? liens[i - 1] : champ).focus(); }
        });
        document.addEventListener("click", function (e) {
            if (!champ.parentNode.contains(e.target)) vider();
        });
    }

    // Échap : ferme ce qui est ouvert
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        deroulants.forEach(function (dd) { if (dd.open) { dd.open = false; dd.querySelector("summary").focus(); } });
        if (liste && !liste.hidden) { vider(); champ.focus(); }
        if (bouton && bouton.getAttribute("aria-expanded") === "true") { ouvrirMenu(false); bouton.focus(); }
    });
})();
