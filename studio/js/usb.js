// TrueGlide Studio : carte branchée en USB (Web Serial, Chrome ou Edge sur ordinateur).
// TrueGlide - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// Par le CLI du firmware : « # » l'ouvre, chaque commande attend l'invite « # ».
//  - Lire : « diff all », puis « exit » redémarre la carte sans rien enregistrer (src/main/cli/cli.c : « leaving CLI
//    mode, unsaved changes lost »).
//  - Envoyer : les commandes une par une ; à la première erreur, « exit » (rien n'est enregistré) ; sinon « save ».
(function (root) {
  'use strict';

  var DELAI_CALME_MS = 400;        // fin d'une réponse : invite « # » puis plus rien pendant ce délai
  var DELAI_ENTREE_MS = 3000;
  var DELAI_COMMANDE_MS = 5000;
  var DELAI_DIFF_MS = 20000;

  // Fin d'une réponse du CLI : l'invite « # » seule sur la dernière ligne.
  function invite(texte) { return /(^|\n)# ?$/.test(String(texte).replace(/\r/g, '')); }

  // Réponse brute d'une commande -> lignes, sans l'écho de la commande ni l'invite finale.
  function lignesReponse(brut, commande) {
    var lignes = String(brut || '').replace(/\r/g, '').split('\n');
    var echo = -1;
    lignes.forEach(function (l, i) { if (echo < 0 && l.replace(/^#\s?/, '').trim() === commande.trim()) echo = i; });
    if (echo >= 0) lignes = lignes.slice(echo + 1);
    while (lignes.length && /^#?\s*$/.test(lignes[lignes.length - 1])) lignes.pop();
    while (lignes.length && !lignes[0].trim()) lignes.shift();
    return lignes;
  }
  function nettoyer(brut) { return lignesReponse(brut, 'diff all').join('\n'); }

  // Une configuration utilisable : au moins une ligne de configuration, pas d'erreur du CLI.
  function utilisable(texte) {
    return !/^###ERROR/m.test(texte) && /^\s*(set|board_name|serial|resource|feature)\s/m.test(texte);
  }

  // Erreur dans la réponse d'une commande (mêmes contrôles que l'onglet Protections de TrueGlide Configurator).
  function erreur(lignes) {
    return lignes.filter(function (l) { return /^###ERROR/.test(l) || /Invalid|out of range|ERROR|Unknown command/i.test(l); })[0] || null;
  }

  // Commandes à envoyer : sans commentaires, lignes vides, « save », « exit » ni « defaults » (jamais d'effacement).
  function aEnvoyer(texte) {
    return String(texte || '').replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l[0] !== '#' && !/^(save|exit|defaults)\b/i.test(l); });
  }

  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Ouvre le port et le CLI. Rend { commande(texte, délai) -> lignes, fin(texte), fermer() }.
  async function session(serial, port) {
    port = port || await serial.requestPort();
    await port.open({ baudRate: 115200 });
    var lecteur = port.readable.getReader(), ecrivain = port.writable.getWriter();
    var decodeur = new TextDecoder(), tampon = '', dernier = Date.now(), ferme = false;
    var lecture = (async function () {
      try {
        for (;;) {
          var r = await lecteur.read();
          if (r.done) break;
          tampon += decodeur.decode(r.value, { stream: true });
          dernier = Date.now();
        }
      } catch (e) { /* port fermé */ }
      ferme = true;
    })();
    async function envoyer(t) { await ecrivain.write(new TextEncoder().encode(t)); }
    async function reponse(limite) {
      var t0 = Date.now();
      for (;;) {
        await attendre(30);
        if (ferme) throw new Error('La carte s\'est déconnectée.');
        if (invite(tampon) && Date.now() - dernier >= DELAI_CALME_MS) return;
        if (Date.now() - t0 > limite) throw new Error('La carte ne répond pas (pas d\'invite du CLI).');
      }
    }
    async function fermer() {
      try { await lecteur.cancel(); } catch (e) { }
      try { ecrivain.releaseLock(); } catch (e) { }
      await lecture;
      try { lecteur.releaseLock(); } catch (e) { }
      try { await port.close(); } catch (e) { }
    }
    try {
      await envoyer('#\r\n');          // entre dans le CLI (ligne vide s'il y est déjà)
      await reponse(DELAI_ENTREE_MS);
    } catch (e) { await fermer(); throw e; }
    return {
      commande: async function (texte, limite) {
        tampon = '';
        await envoyer(texte + '\r\n');
        await reponse(limite || DELAI_COMMANDE_MS);
        return lignesReponse(tampon, texte);
      },
      // « exit » ou « save » : la carte redémarre, le port se ferme
      fin: async function (texte) {
        try { await envoyer(texte + '\r\n'); await attendre(600); } catch (e) { }
        await fermer();
      },
      fermer: fermer
    };
  }

  // Lit la configuration (diff all) ; la carte redémarre ensuite sans rien enregistrer.
  async function lireConfiguration(serial, port) {
    var s = await session(serial, port), texte;
    try {
      texte = (await s.commande('diff all', DELAI_DIFF_MS)).join('\n');
    } catch (e) { await s.fin('exit'); throw e; }
    await s.fin('exit');
    if (!utilisable(texte)) throw new Error('La carte n\'a renvoyé aucune configuration.');
    return texte;
  }

  // Envoie les commandes ; à la première erreur, rien n'est enregistré. Rend { envoyees, erreur: { ligne, reponse } | null }.
  async function envoyerCommandes(serial, texte, port) {
    var lignes = aEnvoyer(texte);
    if (!lignes.length) throw new Error('Aucune commande à envoyer.');
    var s = await session(serial, port), envoyees = 0;
    try {
      for (var i = 0; i < lignes.length; i++) {
        var rep = await s.commande(lignes[i]);
        var e = erreur(rep);
        if (e) { await s.fin('exit'); return { envoyees: envoyees, total: lignes.length, erreur: { ligne: lignes[i], reponse: e } }; }
        envoyees++;
      }
    } catch (err) { await s.fin('exit'); throw err; }
    await s.fin('save');
    return { envoyees: envoyees, total: lignes.length, erreur: null };
  }

  var API = { nettoyer: nettoyer, lignesReponse: lignesReponse, utilisable: utilisable, invite: invite, erreur: erreur,
    aEnvoyer: aEnvoyer, lireConfiguration: lireConfiguration, envoyerCommandes: envoyerCommandes,
    disponible: function (nav, win) { return !!(nav && nav.serial) && (!win || win.parent === win); } };
  if (typeof module !== 'undefined') module.exports = API; else root.TFUsb = API;
})(this);
