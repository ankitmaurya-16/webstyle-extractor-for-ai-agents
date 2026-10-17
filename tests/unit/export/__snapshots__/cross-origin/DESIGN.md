# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/cross-origin.html · light theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary) over scale tokens.
3. Spacing uses a 8px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`.
5. Match the component recipes below for buttons.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token      | Hex     |
| ---------- | ---------- | ------- |
| background | yellow-100 | #fffbeb |
| text       | gray-900   | #292524 |
| primary    | orange-500 | #ea580c |

### Scales

| Token      | Hex     | Usage |
| ---------- | ------- | ----- |
| white      | #ffffff | 2%    |
| gray-900   | #292524 | 48%   |
| orange-500 | #ea580c | <1%   |
| yellow-100 | #fffbeb | 50%   |

## Typography

| Family | Stack            |
| ------ | ---------------- |
| serif  | "Georgia", serif |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| base  | 17px | 28px        | 400    | body     |
| lg    | 32px | 40px        | 700    | h1       |

## Spacing

Base unit 8px: space-1 8px, space-2 16px, space-5 40px, space-6 48px

## Radius

radius-sm 4px

## Breakpoints

sm 900px

## Components

### Button, primary

background primary (orange-500), text white, border none, radius radius-sm, padding space-1 space-2 (8px 16px), font serif 17px/28px weight 400

### Heading 1

background transparent, text text (gray-900), border none, radius 0px, padding 0, font serif 32px/40px weight 700

## Notes

- Breakpoints are partial: 1 of 2 stylesheets could not be read.
- Extracted from one page in its light theme. Hover and focus states are not included.
