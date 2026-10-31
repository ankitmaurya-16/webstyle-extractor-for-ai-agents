# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/cross-origin.html · light theme · WebStyle Extractor v2.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary) over scale tokens.
3. Spacing uses a 8px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token               | Hex     |
| ---------- | ------------------- | ------- |
| background | yellow-100          | #fffbeb |
| text       | gray-900            | #292524 |
| primary    | orange-500 (verify) | #ea580c |

### Scales

| Token               | Hex     | Usage |
| ------------------- | ------- | ----- |
| white               | #ffffff | 2%    |
| gray-900            | #292524 | 48%   |
| orange-500          | #ea580c | <1%   |
| yellow-100 (verify) | #fffbeb | 50%   |

## Typography

| Family | Stack            | Source      |
| ------ | ---------------- | ----------- |
| serif  | "Georgia", serif | system font |

### Text styles

| Text style  | Font  | Size/line | Weight | Tracking | Transform | Used for      |
| ----------- | ----- | --------- | ------ | -------- | --------- | ------------- |
| h1 (verify) | serif | 32/40     | 700    | normal   | none      | h1            |
| button      | serif | 17/28     | 400    | normal   | none      | button, li, p |

### Scale

| Token       | Size | Line height | Weight | Used for |
| ----------- | ---- | ----------- | ------ | -------- |
| base        | 17px | 28px        | 400    | body     |
| lg (verify) | 32px | 40px        | 700    | h1       |

Letter spacing: tracking-normal 0em

## Spacing

Base unit 8px: space-1 8px, space-2 16px, space-5 (verify) 40px, space-6 48px

## Radius

radius-sm 4px

## Breakpoints

sm (verify) 900px

## Components

### Focus ring

No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.

### Button, primary

background primary (orange-500), text white, border none, radius radius-sm, padding space-1 space-2 (8px 16px), font serif 17px/28px weight 400

### Heading 1

text text (gray-900), font serif 32px/40px weight 700

## Accessibility

Safe text pairs: gray-900 on yellow-100 (14.63:1, AAA)
Avoid: white on orange-500 (3.56:1, fails)

## Notes

- Breakpoints are partial: 1 of 2 stylesheets could not be read.
- Hover and focus states come from readable stylesheet rules only (approximate).
- No focus style was found on buttons, links or inputs.
- Extracted from one page in its light theme. Hover and focus states are not included.
- Check these first (low confidence): yellow-100, lg, space-5, sm, h1, primary (light)
