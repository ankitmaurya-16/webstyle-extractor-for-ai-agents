# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/utility.html · light theme · WebStyle Extractor v2.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below.
6. Use Tailwind CSS v3.
7. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Stack

- Framework: Tailwind CSS v3 (medium confidence)

## Colors

### Semantic

| Role       | Token      | Hex     |
| ---------- | ---------- | ------- |
| background | white      | #ffffff |
| text       | gray-800   | #475569 |
| border     | gray-200   | #e2e8f0 |
| primary    | green-600  | #059669 |
| warning    | orange-400 | #f59e0b |
| danger     | red-600    | #e11d48 |

### Scales

| Token              | Hex     | Usage |
| ------------------ | ------- | ----- |
| white              | #ffffff | 33%   |
| gray-200           | #e2e8f0 | 33%   |
| gray-400 (verify)  | #94a3b8 | 1%    |
| gray-800           | #475569 | 15%   |
| gray-900           | #0f172a | 7%    |
| red-500 (verify)   | #de3b3d | 1%    |
| red-600            | #e11d48 | 2%    |
| orange-400         | #f59e0b | 3%    |
| green-600 (verify) | #059669 | <1%   |
| teal-100           | #ecfdf5 | 1%    |
| teal-700           | #047857 | 4%    |

## Typography

| Family | Stack                                | Source      |
| ------ | ------------------------------------ | ----------- |
| sans   | ui-sans-serif, system-ui, sans-serif | system font |

### Text styles

| Text style  | Font | Size/line | Weight | Tracking | Transform | Used for         |
| ----------- | ---- | --------- | ------ | -------- | --------- | ---------------- |
| h1 (verify) | sans | 36/40     | 700    | normal   | none      | h1               |
| h2          | sans | 20/28     | 600    | normal   | none      | h2               |
| button      | sans | 14/20     | 600    | normal   | none      | button           |
| body        | sans | 14/20     | 400    | normal   | none      | div, li, p, span |

### Scale

| Token        | Size | Line height | Weight | Used for |
| ------------ | ---- | ----------- | ------ | -------- |
| base         | 14px | 20px        | 400    | body     |
| lg           | 16px | 24px        | 400    |          |
| xl           | 20px | 28px        | 600    | h2       |
| 2xl (verify) | 36px | 40px        | 700    | h1       |

Letter spacing: tracking-normal 0em

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-3 12px, space-4 16px, space-6 24px, space-8 32px

## Layout

- Grid columns: 3 (100%) (verify)
- Gaps: space-4 16px

## Radius

radius-sm 4px, radius-md 8px, radius-lg 12px, radius-full (verify) 9999px

## Borders

border-1 1px · usually solid

## Shadows

| Token              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| shadow-sm          | rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px    |
| shadow-md (verify) | rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px |

## Breakpoints

sm (verify) 640px, md (verify) 768px, lg (verify) 1024px, xl (verify) 1280px, 2xl (verify) 1536px

## Components

### Focus ring

No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.

### Button, primary

background primary (green-600), text white, border none, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Button, secondary

background background (white), text gray-900, border 1px solid border (gray-200), radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Link

text teal-700, font sans 16px/24px weight 400

### Heading 1

text gray-900, font sans 36px/40px weight 700

### Heading 2

text gray-900, font sans 20px/28px weight 600

## Accessibility

Safe text pairs: gray-800 on white (7.58:1, AAA) · gray-900 on white (17.85:1, AAA) · red-600 on white (4.7:1, AA) · teal-700 on teal-100 (5.21:1, AA) · teal-700 on white (5.48:1, AA)
Avoid: white on green-600 (3.77:1, fails) · orange-400 on white (2.15:1, fails) · gray-400 on white (2.56:1, fails) · red-500 on white (4.38:1, fails)

## Notes

- No focus style was found on buttons, links or inputs.
- Extracted from one page in its light theme. Hover and focus states are not included.
- Check these first (low confidence): gray-400, red-500, green-600, 2xl, radius-full, shadow-md, sm, md, lg, xl, 2xl, h1
