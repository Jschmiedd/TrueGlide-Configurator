// TrueGlide Studio : ports série (UART) préparés sans la carte, et fichier drone.
// TrueGlide - Copyright (C) 2026 TalkTrueFPV. Derived from Betaflight.
// Free software under the GPL-3.0 license, WITHOUT ANY WARRANTY; see the LICENSE file.
// Produit les commandes CLI exactes du firmware :
//   serial <UARTn> <fonctions> <msp baud> <gps baud> <télémétrie baud, 0 = auto> <blackbox baud>
// Fonctions (src/main/io/serial.h) : MSP 1, GPS 2, RX_SERIAL 64, ESC_SENSOR 1024, VTX_SMARTAUDIO 2048, VTX_TRAMP 8192,
// VTX_MSP 131072, GIMBAL 262144.
(function (root) {
  'use strict';

  // Langue des textes produits ('fr' par défaut, 'en') : évaluée à chaque appel, jamais au chargement.
  var LANGUE = 'fr';
  function tr(fr, en) { return LANGUE === 'en' ? en : fr; }

  var BAUDS_DEFAUT = [115200, 57600, 0, 115200];   // pgResetFn_serialConfig : MSP, GPS, télémétrie (auto), blackbox

  // broches : ce que le composant utilise ("TR" : les deux fils, "T" : TX seul, "R" : RX seul)
  var COMPOSANTS = [
    { id: 'aucun', masque: 0, broches: '', get nom() { return tr('Rien', 'Nothing'); } },
    { id: 'rx_crsf', masque: 64, broches: 'TR', rx: 'CRSF', telemetrie: true, get nom() { return tr('Récepteur ExpressLRS / Crossfire (CRSF)', 'ExpressLRS / Crossfire receiver (CRSF)'); } },
    { id: 'rx_ghst', masque: 64, broches: 'TR', rx: 'GHST', telemetrie: true, get nom() { return tr('Récepteur ImmersionRC Ghost (GHST)', 'ImmersionRC Ghost receiver (GHST)'); } },
    { id: 'rx_sbus', masque: 64, broches: 'R', rx: 'SBUS', get nom() { return tr('Récepteur SBUS (FrSky, Futaba…)', 'SBUS receiver (FrSky, Futaba…)'); } },
    { id: 'rx_ibus', masque: 64, broches: 'R', rx: 'IBUS', get nom() { return tr('Récepteur FlySky IBUS', 'FlySky IBUS receiver'); } },
    { id: 'gps', masque: 2, broches: 'TR', get nom() { return tr('GPS (u-blox)', 'GPS (u-blox)'); } },
    { id: 'vtx_hd', masque: 131073, broches: 'TR', get nom() { return tr('Vidéo numérique DJI / Walksnail / HDZero (OSD MSP)', 'DJI / Walksnail / HDZero digital video (MSP OSD)'); } },
    { id: 'vtx_sa', masque: 2048, broches: 'T', get nom() { return tr('VTX analogique SmartAudio (TBS)', 'Analog VTX SmartAudio (TBS)'); } },
    { id: 'vtx_tramp', masque: 8192, broches: 'T', get nom() { return tr('VTX analogique Tramp (ImmersionRC)', 'Analog VTX Tramp (ImmersionRC)'); } },
    { id: 'esc_tlm', masque: 1024, broches: 'R', get nom() { return tr('Télémétrie série des ESC (fil TLM)', 'ESC serial telemetry (TLM wire)'); } },
    { id: 'msp', masque: 1, broches: 'TR', get nom() { return tr('MSP (Bluetooth, module, ordinateur de bord)', 'MSP (Bluetooth, module, companion computer)'); } },
    { id: 'gimbal', masque: 262144, broches: 'TR', get nom() { return tr('Nacelle Caddx GM3', 'Caddx GM3 gimbal'); } }
  ];
  function composant(id) { return COMPOSANTS.filter(function (c) { return c.id === id; })[0] || null; }

  // Composant correspondant à un masque de fonctions ; un récepteur série se distingue par serialrx_provider.
  // Un masque inconnu reste « autre:<masque> » pour être gardé tel quel.
  function depuisMasque(masque, fournisseurRx) {
    if (masque === 64) {
      var rx = COMPOSANTS.filter(function (c) { return c.rx && c.rx === fournisseurRx; })[0];
      return rx ? rx.id : 'autre:64';
    }
    var c = COMPOSANTS.filter(function (x) { return x.masque === masque && !x.rx; })[0];
    return c ? c.id : 'autre:' + masque;
  }
  function masqueDe(id) {
    if (String(id).indexOf('autre:') === 0) return Number(id.slice(6));
    var c = composant(id); return c ? c.masque : 0;
  }

  // Lignes « serial » et serialrx_provider d'un diff all ou d'un dump.
  function lireSerial(texte) {
    var ports = {}, fournisseur = null;
    String(texte || '').split(/\r?\n/).forEach(function (l) {
      var m = l.trim().match(/^serial\s+(\S+)\s+(\d+)(?:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+))?/i);
      if (m) {
        var nom = m[1].toUpperCase();
        if (/^\d+$/.test(nom)) nom = 'UART' + (Number(nom) + 1);   // ancienne numérotation : 0 = UART1
        ports[nom] = { masque: Number(m[2]), bauds: m[3] ? [m[3], m[4], m[5], m[6]].map(Number) : BAUDS_DEFAUT.slice() };
      }
      var p = l.trim().match(/^set\s+serialrx_provider\s*=\s*(\S+)/i);
      if (p) fournisseur = p[1].toUpperCase();
    });
    return { ports: ports, fournisseurRx: fournisseur };
  }

  // Lignes « resource » d'un dump all ou d'un diff all : { 'SERIAL_TX 1': 'A09', 'MOTOR 5': null (NONE), ... }.
  function lireResources(texte) {
    var r = {};
    String(texte || '').split(/\r?\n/).forEach(function (l) {
      var m = l.trim().match(/^resource\s+(\w+)\s+(\d+)\s+(\S+)/i);
      if (!m) return;
      var b = m[3].toUpperCase().match(/^P?([A-K])(\d{1,2})$/);
      if (b || m[3].toUpperCase() === 'NONE') r[m[1].toUpperCase() + ' ' + Number(m[2])] = b ? b[1] + ('0' + b[2]).slice(-2) : null;
    });
    return r;
  }
  // 'SERIAL_TX 2' -> ['UART2', 'T'] ; 'LPUART_RX 1' -> ['LPUART1', 'R'] ; autre chose -> null
  function portDeRessource(nom) {
    var m = nom.match(/^(SERIAL|LPUART)_(TX|RX) (\d+)$/);
    return m ? [(m[1] === 'SERIAL' ? 'UART' : 'LPUART') + m[3], m[2][0]] : null;
  }

  // Carte telle que la configuration collée la décrit : broches d'usine (carte.b) remplacées par les lignes
  // « resource ». Rend une copie de la carte avec les ports réels (p) et les broches d'un port série données aussi à
  // autre chose (conflits) ; une broche déjà partagée en usine n'est pas signalée. Sans ligne « resource », la carte
  // est rendue telle quelle.
  function carteLue(carte, texteConfig) {
    var lu = lireResources(texteConfig);
    if (!carte || !Object.keys(lu).length) return carte;
    var copie = {}, usine = {}, actuel = {};
    Object.keys(carte).forEach(function (k) { copie[k] = carte[k]; });
    Object.keys(carte.b || {}).forEach(function (b) {
      carte.b[b].split('|').forEach(function (nom) { usine[nom] = b; actuel[nom] = b; });
    });
    var p = {};
    Object.keys(carte.p || {}).forEach(function (port) { p[port] = carte.p[port]; });
    Object.keys(lu).forEach(function (nom) {
      if (lu[nom]) actuel[nom] = lu[nom]; else delete actuel[nom];
      var pl = portDeRessource(nom);
      if (!pl) return;
      var lettres = (p[pl[0]] || '').replace(pl[1], '') + (lu[nom] ? pl[1] : '');
      p[pl[0]] = lettres.indexOf('T') >= 0 ? (lettres.indexOf('R') >= 0 ? 'TR' : 'T') : (lettres.indexOf('R') >= 0 ? 'R' : '');
    });
    // un port qui n'avait pas de broche et n'en a toujours pas n'est pas montré
    Object.keys(p).forEach(function (port) { if (!p[port] && !(carte.p || {})[port]) delete p[port]; });
    copie.p = p;
    var parBroche = {};
    Object.keys(actuel).forEach(function (nom) { (parBroche[actuel[nom]] = parBroche[actuel[nom]] || []).push(nom); });
    copie.conflits = [];
    Object.keys(parBroche).forEach(function (b) {
      var noms = parBroche[b];
      if (noms.length < 2) return;
      noms.forEach(function (nom) {
        var pl = portDeRessource(nom);
        if (!pl || !p[pl[0]]) return;
        // partage nouveau : l'une des deux fonctions n'était pas sur cette broche en usine
        var autres = noms.filter(function (n) { return n !== nom && (usine[n] !== b || usine[nom] !== b); });
        if (autres.length) copie.conflits.push({ port: pl[0], lettre: pl[1], broche: b, autres: autres });
      });
    });
    copie.ressourcesLues = true;
    return copie;
  }

  // État de départ des ports d'une carte : fonctions par défaut de la carte, puis celles de la configuration lue.
  function etatInitial(carte, texteConfig) {
    var lu = lireSerial(texteConfig), etat = {};
    // sans serialrx_provider dans le diff, la carte garde son fournisseur par défaut : CRSF (src/main/pg/rx.c), sauf
    // carte qui en déclare un autre
    var fournisseur = lu.fournisseurRx || (carte && carte.rx) || 'CRSF';
    Object.keys((carte && carte.p) || {}).forEach(function (port) {
      var masque = lu.ports[port] ? lu.ports[port].masque : ((carte.d || {})[port] || 0);
      etat[port] = { id: depuisMasque(masque, fournisseur), masque: masque, bauds: lu.ports[port] ? lu.ports[port].bauds : BAUDS_DEFAUT.slice() };
    });
    return etat;
  }

  // choix : { UART1: 'vtx_hd', ... } ; initial : etatInitial(...) ; e : { modele: 'STANDARD' | 'TRUENAV' | 'TRUENAV_LIGHT' }
  function generer(carte, choix, initial, e) {
    e = e || {};
    var modele = e.modele || 'STANDARD';
    var alertes = [], conseils = [], notes = [], commandes = [], suite = [];
    if (!carte || !carte.p) return { commandes: [], alertes: [tr('Carte inconnue ou sans port série décrit : choisir la carte dans la liste.', 'Unknown board or no serial port described: pick the board from the list.')], conseils: [], notes: [] };
    // nouveaux : composants qui changent de port ; seules leurs commandes « feature » et « set » sont produites
    var ports = Object.keys(carte.p), par = {}, nouveaux = {};
    ports.forEach(function (port) {
      var id = choix[port] || (initial[port] && initial[port].id) || 'aucun';
      (par[id] = par[id] || []).push(port);
      if (!initial[port] || initial[port].id !== id) nouveaux[id] = true;
      var c = composant(id), broches = carte.p[port];
      if (c && c.broches) {
        c.broches.split('').forEach(function (b) {
          if (broches.indexOf(b) < 0) alertes.push(port + tr(' n\'a pas de broche ' + (b === 'T' ? 'TX' : 'RX') + (carte.ressourcesLues ? ' dans la configuration lue' : ' sur cette carte') + ' : « ' + c.nom + ' » en a besoin.',
            ' has no ' + (b === 'T' ? 'TX' : 'RX') + ' pin ' + (carte.ressourcesLues ? 'in the loaded configuration' : 'on this board') + ': "' + c.nom + '" needs it.'));
        });
        // broche du port donnée aussi à autre chose dans la configuration lue (carteLue) : une seule fonction la prend
        (carte.conflits || []).forEach(function (k) {
          if (k.port !== port || c.broches.indexOf(k.lettre) < 0) return;
          var fil = k.lettre === 'T' ? 'TX' : 'RX';
          alertes.push(tr(port + ' : la broche ' + fil + ' (' + k.broche + ') sert aussi à ' + k.autres.join(', ') + ' dans la configuration lue. « ' + c.nom +
            ' » ne marchera pas de façon sûre : rendre la broche au port (commande resource) ou choisir un autre port.',
            port + ': the ' + fil + ' pin (' + k.broche + ') is also used by ' + k.autres.join(', ') + ' in the loaded configuration. "' + c.nom +
            '" will not work reliably: give the pin back to the port (resource command) or choose another port.'));
        });
      }
      var masque = masqueDe(id), avant = initial[port] ? initial[port].masque : 0;
      if (masque !== avant) {
        var bauds = initial[port] ? initial[port].bauds : BAUDS_DEFAUT;
        commandes.push('serial ' + port + ' ' + masque + ' ' + bauds.join(' '));
      }
    });
    function ports_(id) { return par[id] || []; }
    var rx = COMPOSANTS.filter(function (c) { return c.rx && ports_(c.id).length; });
    var nbRx = rx.reduce(function (n, c) { return n + ports_(c.id).length; }, 0);
    if (nbRx > 1) alertes.push(tr('Plusieurs ports ont un récepteur : le firmware n\'en utilise qu\'un.', 'Several ports have a receiver: the firmware uses only one.'));
    if (rx.length && nouveaux[rx[0].id]) {
      suite.push('feature RX_SERIAL', 'set serialrx_provider = ' + rx[0].rx);
      if (rx[0].telemetrie) suite.push('feature TELEMETRY');
      if (carte.rxspi) {
        suite.push('feature -RX_SPI');
        notes.push(tr('Cette carte a un récepteur intégré (' + carte.rxspi + ') : choisir un récepteur sur un port le désactive (feature -RX_SPI).',
          'This board has a built-in receiver (' + carte.rxspi + '): choosing a receiver on a port disables it (feature -RX_SPI).'));
      }
      if (rx[0].id === 'rx_sbus' && /F4|F411|F405|G474/.test(carte.mcu || '') && !/F7|H7/.test(carte.mcu || ''))
        conseils.push(tr('SBUS sur processeur F4 : le signal SBUS est inversé et l\'UART du F4 ne sait pas l\'inverser. Brancher sur le plot « SBUS » de la carte (avec inverseur) ou utiliser un récepteur CRSF.',
          'SBUS on an F4 processor: the SBUS signal is inverted and the F4 UART cannot invert it. Use the board\'s "SBUS" pad (with inverter) or a CRSF receiver.'));
    } else if (rx.length) {
      // récepteur déjà en place : rien à changer
    } else if (carte.rxspi) {
      notes.push(tr('Aucun récepteur sur un port : la carte garde son récepteur intégré (' + carte.rxspi + ').', 'No receiver on a port: the board keeps its built-in receiver (' + carte.rxspi + ').'));
    } else {
      conseils.push(tr('Aucun récepteur choisi : sans récepteur, le drone ne pourra pas être piloté.', 'No receiver chosen: without a receiver the quad cannot be flown.'));
    }
    if (ports_('gps').length > 1) alertes.push(tr('Un seul GPS est géré : le mettre sur un seul port.', 'Only one GPS is supported: put it on a single port.'));
    if (ports_('gps').length) {
      if (modele === 'STANDARD' && carte.gps === false)
        alertes.push(tr('Le firmware TRUEGLIDE de cette carte (' + carte.mcu + ') n\'a pas le GPS (mémoire trop petite) : prendre TRUENAV ou TRUENAV_LIGHT.',
          'The TRUEGLIDE firmware for this board (' + carte.mcu + ') has no GPS (memory too small): use TRUENAV or TRUENAV_LIGHT.'));
      if (nouveaux.gps) suite.push('feature GPS', 'set gps_provider = UBLOX');
    }
    if (ports_('vtx_hd').length > 1) alertes.push(tr('Une seule vidéo numérique peut afficher l\'OSD : la mettre sur un seul port.', 'Only one digital video system can show the OSD: put it on a single port.'));
    if (ports_('vtx_hd').length && nouveaux.vtx_hd) {
      suite.push('feature OSD', 'set osd_displayport_device = MSP', 'set vcd_video_system = HD');
      notes.push(tr('Vidéo numérique : l\'OSD passe par le même fil (MSP DisplayPort). Placer ensuite les éléments dans l\'onglet OSD.',
        'Digital video: the OSD goes over the same wire (MSP DisplayPort). Then place the elements in the OSD tab.'));
    }
    if (ports_('vtx_sa').length || ports_('vtx_tramp').length) {
      if (ports_('vtx_sa').length + ports_('vtx_tramp').length > 1) alertes.push(tr('Un seul VTX analogique peut être commandé.', 'Only one analog VTX can be controlled.'));
      notes.push(tr('VTX analogique : charger la table du VTX (fichier du fabricant) dans l\'onglet Émetteur vidéo pour avoir les canaux et puissances.',
        'Analog VTX: load the VTX table (manufacturer file) in the Video Transmitter tab to get channels and power levels.'));
    }
    if (ports_('esc_tlm').length) {
      if (nouveaux.esc_tlm) suite.push('feature ESC_SENSOR');
      if (ports_('esc_tlm').length > 1) alertes.push(tr('La télémétrie série des ESC ne se lit que sur un port.', 'ESC serial telemetry is read on one port only.'));
      notes.push(tr('Télémétrie série des ESC : relier le fil TLM de l\'ESC au RX du port. Elle donne la température et, si la carte n\'a pas de capteur, le courant (set current_meter = ESC).',
        'ESC serial telemetry: connect the ESC TLM wire to the port RX. It gives temperature and, if the board has no sensor, current (set current_meter = ESC).'));
    }
    if (ports_('gimbal').length) {
      if (/F411/.test(carte.mcu || '') || modele === 'TRUENAV_LIGHT')
        alertes.push(tr('La nacelle Caddx GM3 n\'est pas dans le firmware ' + (modele === 'TRUENAV_LIGHT' ? 'TRUENAV_LIGHT' : 'des cartes F411') + ' (place en mémoire).',
          'The Caddx GM3 gimbal is not in the ' + (modele === 'TRUENAV_LIGHT' ? 'TRUENAV_LIGHT' : 'F411') + ' firmware (memory space).'));
      notes.push(tr('Nacelle Caddx GM3 : 115 200 bauds ; réglages gimbal_* pour les gains et limites.', 'Caddx GM3 gimbal: 115200 baud; gimbal_* settings for gains and limits.'));
    }
    var vus = {};
    suite = suite.filter(function (l) { return vus[l] ? false : (vus[l] = true); });
    return { commandes: commandes.concat(suite), alertes: alertes, conseils: conseils, notes: notes };
  }

  function versCli(r, titre) {
    return ['# ' + (titre || 'TrueGlide Studio : ports')].concat(r.commandes, ['save']).join('\n');
  }

  // Fichier drone : formulaire « Mon drone », choix des ports et configuration lue sur la carte (diff all), dans un
  // seul fichier JSON que Studio rouvre sans la carte.
  var FORMAT = 'trueglide-drone';
  function fichierDrone(o) {
    return JSON.stringify({ format: FORMAT, version: 1, date: o.date || new Date().toISOString(), carte: o.carte || '',
      drone: o.drone || {}, ports: o.ports || {}, configuration: o.configuration || '' }, null, 2);
  }
  // Format du calculateur TALKTRUE FPV XRIG pour Studio (format propre à TrueGlide, séparé de celui de XPro).
  // Une donnée inconnue vaut null : le champ de Studio est alors laissé tel quel.
  var FORMAT_CALCULATEUR = 'talktrue-trueglide-studio';
  var CHAMPS_CALCULATEUR = [
    // [nom dans le fichier, champ de Studio, contrôle]
    ['helice_pouces', 'pouces', function (v) { return typeof v === 'number' && v >= 1.2 && v <= 15; }],
    ['kv', 'kv', function (v) { return typeof v === 'number' && v >= 100 && v <= 30000; }],
    ['cellules', 'cellules', function (v) { return Number.isInteger(v) && v >= 1 && v <= 14; }],
    ['masse_g', 'masse', function (v) { return typeof v === 'number' && v >= 15 && v <= 20000; }],
    ['poles', 'poles', function (v) { return Number.isInteger(v) && v >= 4 && v <= 64 && v % 2 === 0; }],
    ['disposition', 'chassis', function (v) { return ['quadx', 'hexa', 'x8', 'quadx_pusher'].indexOf(v) >= 0; }],
    ['esc_firmware', 'esc', function (v) { return ['bluejay', 'blheli_s', 'am32', 'blheli_32', 'kiss', 'blheli', 'pwm'].indexOf(v) >= 0; }],
    ['esc_calibre_a_par_voie', 'courantEsc', function (v) { return typeof v === 'number' && v > 0 && v <= 300; }],
    ['esc_pwm_khz', 'pwmEsc', function (v) { return v === 24 || v === 48; }],
    ['carte', 'carte', function (v) { return typeof v === 'string' && /^[A-Z0-9_-]+$/.test(v); }],
    ['capteur_courant', 'capteurCourant', function (v) { return typeof v === 'boolean'; }],
    ['telemetrie_serie_esc', 'serieBranchee', function (v) { return typeof v === 'boolean'; }]
  ];
  function depuisCalculateur(o) {
    if (o.version !== 1) throw new Error(tr('Version du fichier du calculateur non prise en charge : ' + o.version + '.', 'Unsupported calculator file version: ' + o.version + '.'));
    var d = o.drone || {}, drone = {}, inconnus = [], refuses = [], messages = [];
    CHAMPS_CALCULATEUR.forEach(function (c) {
      var v = d[c[0]];
      if (v === null || v === undefined) { inconnus.push(c[0]); return; }
      if (!c[2](v)) { refuses.push(c[0] + ' = ' + JSON.stringify(v)); return; }
      drone[c[1]] = c[1] === 'pwmEsc' ? String(v) : v;
    });
    var supposees = (o.valeurs_supposees || []).filter(function (n) { return n in d && d[n] !== null; });
    if (refuses.length) messages.push({ niveau: 'alerte', texte: tr('Valeurs hors limites, non reprises : ', 'Out-of-range values, not used: ') + refuses.join(', ') + '.' });
    if (inconnus.length) messages.push({ niveau: 'conseil', texte: tr('Inconnues dans le fichier (champ laissé tel quel, à remplir) : ', 'Unknown in the file (field left as is, fill it in): ') + inconnus.join(', ') + '.' });
    if (supposees.length) messages.push({ niveau: 'conseil', texte: tr('Valeurs supposées par le calculateur, à vérifier : ', 'Values assumed by the calculator, to check: ') + supposees.join(', ') + '.' });
    var e = o.etude || {};
    if (typeof e.poussee_max_g_par_moteur === 'number' && e.poussee_max_g_par_moteur > 0) drone.pousseeCalc = e.poussee_max_g_par_moteur;
    if (typeof e.courant_stationnaire_a === 'number' && e.courant_stationnaire_a > 0) drone.courantCalc = e.courant_stationnaire_a;
    if (typeof e.poussee_max_g_par_moteur === 'number' || typeof e.courant_stationnaire_a === 'number')
      messages.push({ niveau: 'note', texte: tr('Étude du calculateur reprise (utilisée si « Base du réglage » = données du calculateur) : ', 'Calculator study loaded (used when "Tuning basis" = calculator data): ') +
        [typeof e.poussee_max_g_par_moteur === 'number' ? tr('poussée max ', 'max thrust ') + e.poussee_max_g_par_moteur + ' g/moteur' : '',
          typeof e.courant_stationnaire_a === 'number' ? tr('courant au stationnaire ', 'hover current ') + e.courant_stationnaire_a + ' A' : ''].filter(Boolean).join(', ') + '.' });
    return { carte: drone.carte || '', drone: drone, ports: {}, configuration: '', nom: o.nom || '', messages: messages };
  }

  // Ouvre un fichier drone (JSON), un fichier du calculateur ou un texte de CLI (diff all / dump all).
  function ouvrir(texte) {
    var t = String(texte || '');
    if (/^\s*\{/.test(t)) {
      var o;
      try { o = JSON.parse(t); } catch (err) { throw new Error(tr('Fichier drone illisible (JSON abîmé).', 'Unreadable drone file (damaged JSON).')); }
      if (o.format === FORMAT_CALCULATEUR) return depuisCalculateur(o);
      if (o.format !== FORMAT) throw new Error(tr('Ce fichier JSON n\'est pas un fichier drone TrueGlide.', 'This JSON file is not a TrueGlide drone file.'));
      return { carte: o.carte || '', drone: o.drone || {}, ports: o.ports || {}, configuration: o.configuration || '', messages: [] };
    }
    var carte = (t.match(/^\s*board_name\s+(\S+)/m) || [])[1] || (t.match(/^#\s*\S+\s*\/\s*\S+\s*\((\S+)\)/m) || [])[1] || '';
    var poles = (t.match(/^\s*set\s+motor_poles\s*=\s*(\d+)/m) || [])[1];
    var drone = {}, messages = [];
    if (poles) drone.poles = poles;
    else if (/^\s*(board_name\s|#\s*version|# Betaflight)/mi.test(t)) {
      // un diff all n'écrit que ce qui change : sans ligne motor_poles, la carte garde la valeur d'usine du firmware
      // (src/main/pg/motor.c : motorPoleCount = 14)
      drone.poles = '14';
      messages.push({ niveau: 'conseil', texte: tr('Pôles des moteurs : 14, la valeur d\'usine du firmware (la carte ne la change pas). À corriger si vos moteurs en ont un autre nombre (« 12N14P » : 14).',
        'Motor poles: 14, the firmware default (the board does not change it). Correct it if your motors have another count ("12N14P": 14).') });
    }
    return { carte: carte.toUpperCase(), drone: drone, ports: {}, configuration: t, messages: messages };
  }

  var API = { COMPOSANTS: COMPOSANTS, BAUDS_DEFAUT: BAUDS_DEFAUT, FORMAT_CALCULATEUR: FORMAT_CALCULATEUR, composant: composant, depuisMasque: depuisMasque, lireSerial: lireSerial,
    lireResources: lireResources, carteLue: carteLue,
    etatInitial: etatInitial, generer: generer, versCli: versCli, fichierDrone: fichierDrone, ouvrir: ouvrir,
    langue: function (l) { LANGUE = (l === 'en') ? 'en' : 'fr'; } };
  if (typeof module !== 'undefined') module.exports = API; else root.TFPorts = API;
})(this);
