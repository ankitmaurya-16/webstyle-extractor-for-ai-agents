# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/large.html · light theme · WebStyle Extractor v2.0.0

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

| Role       | Token    | Hex     |
| ---------- | -------- | ------- |
| background | white    | #ffffff |
| text       | gray-900 | #111827 |
| border     | gray-200 | #e5e7eb |
| primary    | blue-700 | #1d4ed8 |
| danger     | red-700  | #b91c1c |

### Scales

| Token          | Hex     | Usage |
| -------------- | ------- | ----- |
| white (verify) | #ffffff | 32%   |
| gray-200       | #e5e7eb | 33%   |
| gray-900       | #111827 | 33%   |
| red-700        | #b91c1c | <1%   |
| blue-700       | #1d4ed8 | <1%   |

## Typography

| Family | Stack                 | Source      |
| ------ | --------------------- | ----------- |
| sans   | system-ui, sans-serif | system font |

### Text styles

| Text style | Font | Size/line | Weight | Tracking | Transform | Used for     |
| ---------- | ---- | --------- | ------ | -------- | --------- | ------------ |
| h1         | sans | 24/32     | 700    | normal   | none      | h1           |
| button     | sans | 14/20     | 400    | normal   | none      | a, button, p |
| body       | sans | 12/16     | 500    | normal   | none      | b            |

### Scale

| Token       | Size | Line height | Weight | Used for |
| ----------- | ---- | ----------- | ------ | -------- |
| base        | 12px | 16px        | 500    | body     |
| lg (verify) | 14px | 20px        | 400    |          |
| xl (verify) | 24px | 32px        | 700    | h1       |

Letter spacing: tracking-normal 0em

## Spacing

Base unit 4px: space-1 4px

## Layout

- Grid columns: 2 (91%), 40 (9%)
- Gaps: space-1 4px

## Radius

radius-sm 4px, radius-full 9999px

## Borders

border-1 1px · usually solid

## Components

### Focus ring

No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.

### Button, primary

background primary (blue-700), text white, border none, radius 6px, padding 8px 16px, font sans 14px/20px weight 400

### Link

text primary (blue-700), font sans 14px/20px weight 400

### Heading 1

text text (gray-900), font sans 24px/32px weight 700

## Accessibility

Safe text pairs: gray-900 on white (17.74:1, AAA) · white on blue-700 (6.7:1, AA) · blue-700 on white (6.7:1, AA) · gray-900 on white (17.74:1, AAA)

## Notes

- The page was large, so extraction stopped at the element limit. Rare values may be missing.
- No focus style was found on buttons, links or inputs.
- Extracted from one page in its light theme. Hover and focus states are not included.
- Check these first (low confidence): white, lg, xl, h1, button, grid-40
