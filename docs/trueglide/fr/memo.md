# Mémo TrueGlide

Aide-mémoire d'une page. Détails : [Wiki](wiki/index.md).

## Mise en route

1. **Sauvegarder** l'ancienne configuration : onglet CLI, `diff all`, enregistrer le texte.
2. **Flasher** le `.hex` TrueGlide (onglet Flasher le Firmware, Charger un firmware TrueGlide (.hex), Effacement complet de la puce). Choisir le modèle :
   `trueglide_…` (TRUEGLIDE), `truenav_…` (navigation GPS), `truenav_light_…` (navigation sans les fonctions de course). Voir [Installation](wiki/installation.md).
3. **Connexion** : le **Tableau de bord** s'ouvre ; **Sauvegarder la configuration**, puis **Continuer** : la mise en
   route guidée passe les 9 étapes de l'*Installation du drone* et de *TrueGlide*, avant le *Réglage du vol*.
4. **Sans hélices** : onglet Moteurs, vérifier ordre et sens de rotation.
5. Onglet **Protections** (Fonctions TrueGlide) : activer les protections, **Enregistrer et redémarrer**.
6. Onglet **OSD** : cocher les alertes « Gaz limités » et « Moteur relancé ».
7. Premier vol : stationnaire de 30 s, atterrir, **toucher les moteurs**.

Tout ce qui est propre à TrueGlide est **désactivé par défaut** : sans réglage, rien ne change en vol.

## Réglages essentiels (CLI : `set nom = valeur`, puis `save`)

| Réglage | Rôle | Défaut | Plage |
|---|---|---|---|
| `power_guard_esc_temp` | °C de l'ESC le plus chaud au-delà desquels les gaz sont limités (0 = arrêt) | 0 | 0 à 150 |
| `power_guard_current` | ampères batterie au-delà desquels les gaz sont limités (0 = arrêt) | 0 | 0 à 1000 |
| `power_guard_min_throttle` | % de gaz toujours laissé pendant la limitation | 50 | 20 à 100 |
| `motor_desync_recovery` | relance d'un moteur calé ou désynchronisé | OFF | OFF / ON |
| `motor_desync_threshold` | % de la vitesse attendue sous lequel un moteur est jugé décroché | 40 | 10 à 80 |
| `dshot_telemetry_fallback` | vitesse estimée (filtre RPM) si la télémétrie d'un moteur se perd | OFF | OFF / ON |
| `crsf_tlm_esc_temp` | température de chaque ESC envoyée à la radio (ELRS / Crossfire), toutes les 2 s | OFF | OFF / ON |
| `speeder_cruise_angle` | inclinaison de croisière du mode SPEEDER (°) | 60 | 10 à 80 |
| `speeder_transition_rate` | vitesse de la transition SPEEDER (°/s) | 30 | 5 à 180 |
| `speeder_fpv_mix` | roulis / lacet tournés avec la transition | OFF | OFF / ON |
| `mav_mission_home_item` | point 0 des missions Mission Planner = maison (TRUENAV) | ON (TRUENAV), OFF ailleurs | OFF / ON |

Quad X pusher (moteurs à l'envers) : mixeur Quad X, sens de rotation lu **vu de dessus**. Voir [Quad X pusher](wiki/pusher.md).

## Alertes OSD

| Affiché | Signification |
|---|---|
| `ESC HOT 65%` | un ESC dépasse `power_guard_esc_temp` : gaz limités à 65 % |
| `AMP LIM 80%` | le courant dépasse `power_guard_current` : gaz limités à 80 % |
| `M2 RESTART` (clignote) | le moteur 2 vient d'être relancé (affiché 3 s) ; M1 à M8 |

## Modes debug (onglet Blackbox, ou CLI `set debug_mode = …`)

- `POWER_GUARD` : [0] limite des gaz (‰), [1] limite température (‰), [2] limite courant (‰), [3] ESC le plus chaud (°C), [4] courant (A × 10).
- `MOTOR_HEALTH` : nombre de relances par moteur depuis la mise sous tension, un canal par moteur.

## Que faire si…

- **`Mx RESTART` apparaît** : atterrir. Moteur, hélice, soudures et voie d'ESC du moteur x à contrôler. Analyser le journal
  ([Analyse des journaux](wiki/journaux.md)). La relance limite les dégâts, elle ne répare pas un ESC défaillant.
- **`ESC HOT` / `AMP LIM`** : réduire les gaz et atterrir. Vérifier hélices (trop grandes ?), filtres, refroidissement des ESC.
  Ne pas monter la limite pour « faire disparaître » l'alerte.
- **Télémétrie figée** (tr/min ou température qui ne bougent plus) : DShot300 plutôt que DShot600, fils moteur éloignés
  du signal, firmware d'ESC à jour ; `dshot_telemetry_fallback = ON` garde le filtre RPM juste en attendant.
- **Le drone ne s'arme pas après le flash** : refaire ports, récepteur et modes ; ne pas recoller un ancien `diff all`
  tel quel ([FAQ](wiki/faq.md)).
