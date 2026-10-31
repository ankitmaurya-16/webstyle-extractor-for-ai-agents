# 127.0.0.1 vs 127.0.0.1

A: http://127.0.0.1:4173/classic.html (2026-10-18)
B: http://127.0.0.1:4173/classic.html (2026-10-18)

10 added · 1 removed · 0 changed · 3 renamed · 43 unchanged

## Summary

- color: 2 added, 1 removed, 0 changed, 2 renamed, 8 unchanged
- gradient: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- font: 0 added, 0 removed, 0 changed, 0 renamed, 3 unchanged
- text: 0 added, 0 removed, 0 changed, 0 renamed, 6 unchanged
- textStyle: 0 added, 0 removed, 0 changed, 0 renamed, 8 unchanged
- tracking: 0 added, 0 removed, 0 changed, 0 renamed, 1 unchanged
- space: 0 added, 0 removed, 0 changed, 1 renamed, 6 unchanged
- container: 0 added, 0 removed, 0 changed, 0 renamed, 1 unchanged
- grid: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- gap: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- radius: 0 added, 0 removed, 0 changed, 0 renamed, 4 unchanged
- border: 0 added, 0 removed, 0 changed, 0 renamed, 1 unchanged
- shadow: 0 added, 0 removed, 0 changed, 0 renamed, 2 unchanged
- opacity: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- z: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- duration: 2 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- easing: 1 added, 0 removed, 0 changed, 0 renamed, 0 unchanged
- breakpoint: 0 added, 0 removed, 0 changed, 0 renamed, 3 unchanged

## Added

- color: gray-extra-1 #0b0f19
- color: blue-400 #60a5fa
- gradient: gradient-1 linear-gradient(135deg, rgb(37, 99, 235), rgb(96, 165, 250))
- grid: grid-3 3
- gap: gap-20 20px
- opacity: opacity-disabled 0.5
- z: z-dialog 50
- duration: duration-150 150ms
- duration: duration-300 300ms
- easing: ease-out cubic-bezier(0, 0, 0.2, 1)

## Removed

- color: gray-800 #4b5563

## Changed

None.

## Renamed

- color: ink → gray-900 (#111827)
- color: brand → blue-600 (#2563eb)
- space: gap → space-4 (16px)

## Role changes

- background (dark): none → gray-extra-1 #0b0f19
- text (dark): none → white #ffffff
- primary (dark): none → blue-400 #60a5fa
- focus-ring (light): none → blue-600 #2563eb

## Recipe changes

- Button, primary default (light) background-color: brand → blue-600
- Button, primary hover (light) background-color: none → gray-900
- Button, primary focus-visible (light) outline: none → 2px solid #2563eb
- Button, primary focus-visible (light) outline-offset: none → 2px
- Button, secondary default (light) color: ink → gray-900
- Input default (light) color: ink → gray-900
- Link default (light) color: brand → blue-600
- Nav bar default (light) link-color: gray-800 → #4b5563
- Heading 1 default (light) color: ink → gray-900
- Heading 2 default (light) color: ink → gray-900
- Heading 3 default (light) color: ink → gray-900

## Stack changes

- fonts: added Helvetica Neue
