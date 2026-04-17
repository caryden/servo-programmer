# UI Mode Audit

Current browser/desktop UI coverage versus the CLI parameter surface.

## Servo Mode

Implemented in UI:
- `servo_angle` as `Range`
- `servo_neutral` as `Center`
- `inversion` as `Direction`
- `soft_start` as `Ramp`
- `sensitivity` as `Sensitivity`
- `dampening_factor` as `Dampening`
- `loose_pwm_protection` as `On signal loss`
- `overload_protection` as `Overload protection`
- `overload_level1`
- `overload_level2`
- `overload_level3`
- `pwm_power` as `Power limit`

Still missing from UI:
- none from the current mapped Servo CLI parameter surface

## Continuous Rotation Mode

Implemented in UI:
- `servo_neutral` as `Stop trim`
- `inversion` as `Direction`
- `proptl` as `ProPTL`
- `pwm_power` as `Power limit`

Still missing from UI:
- none from the current mapped CR CLI parameter surface

## Notes

- Sim-pane controls are ephemeral. They are not part of saved config.
- `Load` / `Save` now use config-only `.axon` files by default and also support `.svo`.
- `Apply` is still pending; this audit is about UI surface coverage, not write/flash wiring.
