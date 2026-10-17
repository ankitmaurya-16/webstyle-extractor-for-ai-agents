# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/dark.html · dark theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`. Secondary text is `text-muted`.
5. Match the component recipes below for buttons and links.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token        | Hex     |
| ---------- | ------------ | ------- |
| background | gray-extra-1 | #0b0f19 |
| surface    | gray-extra-2 | #111827 |
| text       | gray-200     | #e5e7eb |
| text-muted | gray-400     | #9ca3af |
| border     | gray-900     | #1f2937 |
| primary    | purple-600   | #8b5cf6 |
| warning    | yellow-300   | #fbbf24 |

### Scales

| Token          | Hex       | Usage |
| -------------- | --------- | ----- |
| white          | #ffffff   | 2%    |
| black-alpha-50 | #00000080 | <1%   |
| gray-200       | #e5e7eb   | 25%   |
| gray-400       | #9ca3af   | 3%    |
| gray-900       | #1f2937   | 33%   |
| gray-extra-1   | #0b0f19   | 26%   |
| gray-extra-2   | #111827   | 6%    |
| orange-900     | #422006   | 1%    |
| yellow-300     | #fbbf24   | 3%    |
| purple-600     | #8b5cf6   | <1%   |

## Typography

| Family | Stack                          |
| ------ | ------------------------------ |
| sans   | "Inter", system-ui, sans-serif |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| sm    | 12px | 24px        | 400    |          |
| base  | 15px | 24px        | 400    | body     |
| lg    | 24px | 32px        | 700    | h2       |
| xl    | 40px | 48px        | 800    | h1       |

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-4 16px, space-5 20px, space-6 24px, space-8 32px, space-16 64px

## Radius

radius-sm 4px, radius-md 8px, radius-lg 12px

## Breakpoints

sm 768px

## Components

### Button, primary

background primary (purple-600), text white, border none, radius radius-md, padding 10px 20px, font sans 15px/20px weight 600

### Button, secondary

background gray-900, text text (gray-200), border none, radius radius-md, padding 10px 20px, font sans 15px/20px weight 600

### Link

background transparent, text #a78bfa, border none, radius 0px, padding 0, font sans 15px/24px weight 400

### Heading 1

background transparent, text white, border none, radius 0px, padding 0, font sans 40px/48px weight 800

### Heading 2

background transparent, text white, border none, radius 0px, padding 0, font sans 24px/32px weight 700

## Notes

- Extracted from one page in its dark theme. Hover and focus states are not included.
