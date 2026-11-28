// Chargé dans <head>, avant l'affichage : applique le thème choisi par le visiteur (sinon celui du système), sans flash.
// Le choix n'est gardé que dans ce navigateur ; s'il n'est pas lisible, le thème du système s'applique.
(function () {
    var d = document.documentElement;
    d.classList.add("js");
    try {
        var t = localStorage.getItem("trueglide-theme");
        if (t === "dark" || t === "light") {
            d.setAttribute("data-theme", t);
        }
    } catch (e) {
        /* stockage bloqué */
    }
})();
