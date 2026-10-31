# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/dark.html · dark theme · WebStyle Extractor v2.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`; secondary text is `text-muted`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token               | Hex     |
| ---------- | ------------------- | ------- |
| background | gray-extra-1        | #0b0f19 |
| surface    | gray-extra-2        | #111827 |
| text       | gray-200            | #e5e7eb |
| text-muted | gray-400 (verify)   | #9ca3af |
| border     | gray-900            | #1f2937 |
| primary    | purple-600 (verify) | #8b5cf6 |
| warning    | yellow-300          | #fbbf24 |

### Scales

| Token                 | Hex     | Usage |
| --------------------- | ------- | ----- |
| white                 | #ffffff | 2%    |
| gray-200              | #e5e7eb | 25%   |
| gray-400 (verify)     | #9ca3af | 3%    |
| gray-900              | #1f2937 | 33%   |
| gray-extra-1 (verify) | #0b0f19 | 26%   |
| gray-extra-2          | #111827 | 6%    |
| orange-900            | #422006 | 1%    |
| yellow-300            | #fbbf24 | 3%    |
| purple-600            | #8b5cf6 | <1%   |

### Translucent

| Token             | Value     | Alpha | Looks like on background |
| ----------------- | --------- | ----- | ------------------------ |
| black/50 (verify) | #00000080 | 50%   | #090c14                  |

Use opacity modifiers in Tailwind, for example `border-black/10`.

## Typography

| Family | Stack                          | Source      |
| ------ | ------------------------------ | ----------- |
| sans   | "Inter", system-ui, sans-serif | system font |

### Text styles

| Text style  | Font | Size/line | Weight | Tracking | Transform | Used for      |
| ----------- | ---- | --------- | ------ | -------- | --------- | ------------- |
| h1 (verify) | sans | 40/48     | 800    | normal   | none      | h1            |
| h2          | sans | 24/32     | 700    | normal   | none      | h2            |
| button      | sans | 15/20     | 600    | normal   | none      | button        |
| body        | sans | 15/24     | 400    | normal   | none      | a, div, li, p |
| body-sm     | sans | 12/24     | 400    | normal   | none      | badge, span   |

### Scale

| Token       | Size | Line height | Weight | Used for |
| ----------- | ---- | ----------- | ------ | -------- |
| sm          | 12px | 24px        | 400    |          |
| base        | 15px | 24px        | 400    | body     |
| lg          | 24px | 32px        | 700    | h2       |
| xl (verify) | 40px | 48px        | 800    | h1       |

Letter spacing: tracking-normal 0em

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-4 16px, space-5 20px, space-6 24px, space-8 32px, space-16 64px

## Layout

- Containers: container-sm (verify) 880px

## Radius

radius-sm 4px, radius-md 8px, radius-lg 12px

## Borders

border-1 1px · usually solid

## Breakpoints

sm (verify) 768px

## Components

### Focus ring

No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.

### Button, primary

background primary (purple-600), text white, border none, radius radius-md, padding 10px 20px, font sans 15px/20px weight 600

### Button, secondary

background gray-900, text text (gray-200), border none, radius radius-md, padding 10px 20px, font sans 15px/20px weight 600

### Link

text #a78bfa, font sans 15px/24px weight 400

### Badge, success

background #14b8a6, text #042f2e, border none, radius radius-sm, padding 0 space-2 (0px 8px), font 12px weight 400

### Heading 1

text white, font sans 40px/48px weight 800

### Heading 2

text white, font sans 24px/32px weight 700

## Accessibility

Safe text pairs: gray-200 on gray-extra-1 (15.47:1, AAA) · yellow-300 on orange-900 (8.73:1, AAA) · gray-200 on gray-extra-2 (14.33:1, AAA) · white on gray-extra-2 (17.74:1, AAA) · gray-400 on gray-extra-1 (7.54:1, AAA) · gray-200 on gray-900 (11.86:1, AAA) · gray-200 on black/50 (15.79:1, AAA) · white on gray-extra-1 (19.15:1, AAA)
Avoid: white on purple-600 (4.23:1, fails)

## Notes

- No focus style was found on buttons, links or inputs.
- Extracted from one page in its dark theme. Hover and focus states are not included.
- Check these first (low confidence): gray-400, gray-extra-1, black/50, xl, container-sm, sm, h1, text-muted (dark), primary (dark)
