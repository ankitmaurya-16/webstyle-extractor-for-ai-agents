# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/classic.html · light theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`. Secondary text is `text-muted`.
5. Match the component recipes below for buttons, inputs and links.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token     | Hex     |
| ---------- | --------- | ------- |
| background | white     | #ffffff |
| text       | gray-900  | #111827 |
| text-muted | gray-600  | #6b7280 |
| border     | gray-200  | #e5e7eb |
| primary    | blue-600  | #2563eb |
| success    | green-800 | #166534 |
| danger     | red-800   | #991b1b |

### Scales

| Token     | Hex     | Usage |
| --------- | ------- | ----- |
| white     | #ffffff | 32%   |
| gray-200  | #e5e7eb | 17%   |
| gray-300  | #d1d5db | 16%   |
| gray-600  | #6b7280 | 6%    |
| gray-800  | #4b5563 | <1%   |
| gray-900  | #111827 | 20%   |
| red-100   | #fee2e2 | 1%    |
| red-800   | #991b1b | 3%    |
| green-100 | #dcfce7 | 1%    |
| green-800 | #166534 | 2%    |
| blue-600  | #2563eb | <1%   |

## Typography

| Family  | Stack                                 |
| ------- | ------------------------------------- |
| sans    | "Helvetica Neue", "Arial", sans-serif |
| display | "Georgia", "Times New Roman", serif   |
| mono    | "JetBrains Mono", "Menlo", monospace  |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| xs    | 12px | 16px        | 400    |          |
| sm    | 14px | 20px        | 400    |          |
| base  | 16px | 24px        | 400    | body     |
| lg    | 20px | 28px        | 600    | h3       |
| xl    | 24px | 32px        | 600    | h2       |
| 2xl   | 36px | 40px        | 700    | h1       |

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-3 12px, space-4 16px, space-6 24px, space-8 32px, space-12 48px

## Radius

radius-sm 4px, radius-md 6px, radius-lg 8px, radius-full 9999px

## Shadows

| Token     | Value                                                                      |
| --------- | -------------------------------------------------------------------------- |
| shadow-sm | rgba(0, 0, 0, 0.05) 0px 1px 2px 0px                                        |
| shadow-md | rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px |

## Breakpoints

sm 640px, md 768px, lg 1024px

## Components

### Button, primary

background primary (blue-600), text white, border none, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Button, secondary

background background (white), text text (gray-900), border 1px solid #d1d5db, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Input

background background (white), text text (gray-900), border 1px solid #d1d5db, radius radius-md, padding space-2 space-3 (8px 12px), font sans 14px/20px weight 400

### Link

background transparent, text primary (blue-600), border none, radius 0px, padding 0, font sans 16px/24px weight 400

### Heading 1

background transparent, text text (gray-900), border none, radius 0px, padding 0, font display 36px/40px weight 700

### Heading 2

background transparent, text text (gray-900), border none, radius 0px, padding 0, font display 24px/32px weight 600

### Heading 3

background transparent, text text (gray-900), border none, radius 0px, padding 0, font sans 20px/28px weight 600

## Notes

- Extracted from one page in its light theme. Hover and focus states are not included.
