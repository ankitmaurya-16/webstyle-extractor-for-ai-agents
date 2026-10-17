# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/utility.html · light theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`.
5. Match the component recipes below for buttons and links.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

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

| Token      | Hex     | Usage |
| ---------- | ------- | ----- |
| white      | #ffffff | 33%   |
| gray-200   | #e2e8f0 | 33%   |
| gray-400   | #94a3b8 | 2%    |
| gray-800   | #475569 | 15%   |
| gray-900   | #0f172a | 7%    |
| red-500    | #de3b3d | 1%    |
| red-600    | #e11d48 | 2%    |
| orange-400 | #f59e0b | 3%    |
| green-600  | #059669 | <1%   |
| teal-100   | #ecfdf5 | 1%    |
| teal-700   | #047857 | 4%    |

## Typography

| Family | Stack                                |
| ------ | ------------------------------------ |
| sans   | ui-sans-serif, system-ui, sans-serif |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| base  | 14px | 20px        | 400    | body     |
| lg    | 16px | 24px        | 400    |          |
| xl    | 20px | 28px        | 600    | h2       |
| 2xl   | 36px | 40px        | 700    | h1       |

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-3 12px, space-4 16px, space-6 24px, space-8 32px

## Radius

radius-sm 4px, radius-md 8px, radius-lg 12px, radius-full 9999px

## Shadows

| Token     | Value                                                                      |
| --------- | -------------------------------------------------------------------------- |
| shadow-sm | rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px    |
| shadow-md | rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px |

## Breakpoints

sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px

## Components

### Button, primary

background primary (green-600), text white, border none, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Button, secondary

background background (white), text gray-900, border 1px solid #e2e8f0, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Link

background transparent, text teal-700, border none, radius 0px, padding 0, font sans 16px/24px weight 400

### Heading 1

background transparent, text gray-900, border none, radius 0px, padding 0, font sans 36px/40px weight 700

### Heading 2

background transparent, text gray-900, border none, radius 0px, padding 0, font sans 20px/28px weight 600

## Notes

- Extracted from one page in its light theme. Hover and focus states are not included.
