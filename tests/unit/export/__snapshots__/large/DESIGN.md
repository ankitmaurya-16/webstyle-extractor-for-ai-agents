# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/large.html · light theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`.
5. Match the component recipes below for buttons and links.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

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

| Token    | Hex     | Usage |
| -------- | ------- | ----- |
| white    | #ffffff | 32%   |
| gray-200 | #e5e7eb | 33%   |
| gray-900 | #111827 | 33%   |
| red-700  | #b91c1c | <1%   |
| blue-700 | #1d4ed8 | <1%   |

## Typography

| Family | Stack                 |
| ------ | --------------------- |
| sans   | system-ui, sans-serif |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| base  | 12px | 16px        | 500    | body     |
| lg    | 14px | 20px        | 400    |          |
| xl    | 24px | 32px        | 700    | h1       |

## Spacing

Base unit 4px: space-1 4px

## Radius

radius-sm 4px, radius-full 9999px

## Components

### Button, primary

background primary (blue-700), text white, border none, radius 6px, padding 8px 16px, font sans 14px/20px weight 400

### Link

background transparent, text primary (blue-700), border none, radius 0px, padding 0, font sans 14px/20px weight 400

### Heading 1

background transparent, text text (gray-900), border none, radius 0px, padding 0, font sans 24px/32px weight 700

## Notes

- The page was large, so extraction stopped at the element limit. Rare values may be missing.
- Extracted from one page in its light theme. Hover and focus states are not included.
