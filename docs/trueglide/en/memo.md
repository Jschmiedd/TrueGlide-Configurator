# TrueGlide memo

One-page cheat sheet. Details: [Wiki](wiki/index.md).

## Getting started

1. **Back up** the old configuration: CLI tab, `diff all`, save the text.
2. **Flash** the TrueGlide `.hex` (Firmware Flasher tab, Load TrueGlide firmware (.hex), Full chip erase). Pick the model:
   `trueglide_…` (TRUEGLIDE), `truenav_…` (GPS navigation), `truenav_light_…` (navigation without the racing features). See [Installation](wiki/installation.md).
3. **Connect**: the **Dashboard** opens; **Back up the configuration**, then **Continue**: the guided setup goes
   through the 9 steps of *Setup* and *TrueGlide*, before *Flight tuning*.
4. **Props off**: Motors tab, check motor order and spin direction.
5. **Protections** tab (TrueGlide features): turn on the protections, **Save and reboot**.
6. **OSD** tab: tick the "Throttle limited" and "Motor restarted" warnings.
7. First flight: 30 s hover, land, **touch the motors**.

Everything specific to TrueGlide is **off by default**: without settings, nothing changes in flight.

## Key settings (CLI: `set name = value`, then `save`)

| Setting | Role | Default | Range |
|---|---|---|---|
| `power_guard_esc_temp` | hottest ESC °C above which the throttle is limited (0 = off) | 0 | 0 to 150 |
| `power_guard_current` | battery amps above which the throttle is limited (0 = off) | 0 | 0 to 1000 |
| `power_guard_min_throttle` | throttle % always left while limiting | 50 | 20 to 100 |
| `motor_desync_recovery` | restart of a stalled or desynced motor | OFF | OFF / ON |
| `motor_desync_threshold` | % of the expected speed below which a motor is judged stalled | 40 | 10 to 80 |
| `dshot_telemetry_fallback` | estimated speed (RPM filter) when a motor's telemetry is lost | OFF | OFF / ON |
| `crsf_tlm_esc_temp` | each ESC temperature sent to the radio (ELRS / Crossfire), every 2 s | OFF | OFF / ON |
| `speeder_cruise_angle` | SPEEDER mode cruise tilt (°) | 60 | 10 to 80 |
| `speeder_transition_rate` | SPEEDER transition speed (°/s) | 30 | 5 to 180 |
| `speeder_fpv_mix` | roll / yaw rotated with the transition | OFF | OFF / ON |
| `mav_mission_home_item` | item 0 of Mission Planner missions = home (TRUENAV) | ON (TRUENAV), OFF elsewhere | OFF / ON |

Quad X pusher (motors upside down): Quad X mixer, spin direction read **from above**. See [Quad X pusher](wiki/pusher.md).

## OSD warnings

| Shown | Meaning |
|---|---|
| `ESC HOT 65%` | an ESC is above `power_guard_esc_temp`: throttle limited to 65 % |
| `AMP LIM 80%` | the current is above `power_guard_current`: throttle limited to 80 % |
| `M2 RESTART` (blinking) | motor 2 has just been restarted (shown 3 s); M1 to M8 |

## Debug modes (Blackbox tab, or CLI `set debug_mode = …`)

- `POWER_GUARD`: [0] throttle cap (‰), [1] temperature cap (‰), [2] current cap (‰), [3] hottest ESC (°C), [4] current (A × 10).
- `MOTOR_HEALTH`: number of restarts per motor since power-on, one channel per motor.

## What to do if…

- **`Mx RESTART` shows up**: land. Check motor x, its prop, solder joints and ESC channel. Analyse the log
  ([Log analysis](wiki/journaux.md)). The restart limits the damage, it does not repair a failing ESC.
- **`ESC HOT` / `AMP LIM`**: reduce throttle and land. Check props (too big?), filters, ESC cooling.
  Do not raise the limit just to "make the warning go away".
- **Frozen telemetry** (rpm or temperature that stop moving): DShot300 rather than DShot600, motor wires away from the
  signal wire, up-to-date ESC firmware; `dshot_telemetry_fallback = ON` keeps the RPM filter right meanwhile.
- **The quad won't arm after flashing**: redo ports, receiver and modes; do not paste an old `diff all` as is
  ([FAQ](wiki/faq.md)).
