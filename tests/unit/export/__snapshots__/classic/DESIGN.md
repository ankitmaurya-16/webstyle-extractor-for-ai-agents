# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/classic.html · light theme · WebStyle Extractor v2.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`; secondary text is `text-muted`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token             | Hex     | Site variable |
| ---------- | ----------------- | ------- | ------------- |
| background | white             | #ffffff |               |
| text       | ink               | #111827 | --ink         |
| text-muted | gray-600          | #6b7280 |               |
| border     | gray-200 (verify) | #e5e7eb |               |
| primary    | brand             | #2563eb | --brand       |
| success    | green-800         | #166534 |               |
| danger     | red-800           | #991b1b |               |

### Scales

| Token     | Hex     | Usage | Site variable |
| --------- | ------- | ----- | ------------- |
| white     | #ffffff | 32%   |               |
| gray-200  | #e5e7eb | 17%   |               |
| gray-300  | #d1d5db | 16%   |               |
| gray-600  | #6b7280 | 6%    |               |
| gray-800  | #4b5563 | <1%   |               |
| ink       | #111827 | 20%   | --ink         |
| red-100   | #fee2e2 | 1%    |               |
| red-800   | #991b1b | 2%    |               |
| green-100 | #dcfce7 | 1%    |               |
| green-800 | #166534 | 2%    |               |
| brand     | #2563eb | <1%   | --brand       |

## Typography

| Family  | Stack                                 | Source      |
| ------- | ------------------------------------- | ----------- |
| sans    | "Helvetica Neue", "Arial", sans-serif | system font |
| display | "Georgia", "Times New Roman", serif   | system font |
| mono    | "JetBrains Mono", "Menlo", monospace  | system font |

### Text styles

| Text style | Font    | Size/line | Weight | Tracking | Transform | Used for       |
| ---------- | ------- | --------- | ------ | -------- | --------- | -------------- |
| h1         | display | 36/40     | 700    | normal   | none      | h1             |
| h2         | display | 24/32     | 600    | normal   | none      | h2             |
| h3         | sans    | 20/28     | 600    | normal   | none      | h3             |
| button     | sans    | 14/20     | 600    | normal   | none      | button         |
| code       | mono    | 14/24     | 400    | normal   | none      | code           |
| body       | sans    | 16/24     | 400    | normal   | none      | a, div, p      |
| body-sm    | sans    | 14/20     | 400    | normal   | none      | a, nav-link, p |
| caption    | sans    | 12/16     | 400    | normal   | none      | badge, span    |

### Scale

| Token        | Size | Line height | Weight | Used for |
| ------------ | ---- | ----------- | ------ | -------- |
| xs           | 12px | 16px        | 400    |          |
| sm           | 14px | 20px        | 400    |          |
| base         | 16px | 24px        | 400    | body     |
| lg (verify)  | 20px | 28px        | 600    | h3       |
| xl           | 24px | 32px        | 600    | h2       |
| 2xl (verify) | 36px | 40px        | 700    | h1       |

Letter spacing: tracking-normal 0em

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-3 12px, gap 16px, space-6 24px, space-8 32px, space-12 48px

## Layout

- Containers: container-sm 1024px

## Radius

radius-sm 4px, radius-md 6px, radius-lg 8px, radius-full 9999px

## Borders

border-1 1px · usually solid

## Shadows

| Token              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| shadow-sm (verify) | rgba(0, 0, 0, 0.05) 0px 1px 2px 0px                                        |
| shadow-md (verify) | rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px |

## Breakpoints

sm 640px, md 768px, lg 1024px

## Components

### Focus ring

No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.

### Button, primary

background primary (brand), text white, border none, radius radius-md, padding space-2 gap (8px 16px), font sans 14px/20px weight 600

### Button, secondary

background background (white), text text (ink), border 1px solid gray-300, radius radius-md, padding space-2 gap (8px 16px), font sans 14px/20px weight 600

### Input

background background (white), text text (ink), border 1px solid gray-300, radius radius-md, padding space-2 space-3 (8px 12px), height 38px, font sans 14px/20px weight 400

### Link

text primary (brand), font sans 16px/24px weight 400

### Card

background background (white), border 1px solid border (gray-200), radius radius-lg, padding space-6 (24px), shadow shadow-sm

### Badge, info

background #dbeafe, text #1e40af, border none, radius radius-full, padding space-1 space-3 (4px 12px), font 12px weight 400

### Alert, success

background green-100, text success (green-800), border none, radius radius-md, padding space-3 gap (12px 16px), font sans 16px

### Alert, danger

background red-100, text danger (red-800), border none, radius radius-md, padding space-3 gap (12px 16px), font sans 16px

### Nav bar

background transparent, border none, padding 0, height 24px, links: text gray-800, font 14px weight 400

### Heading 1

text text (ink), font display 36px/40px weight 700

### Heading 2

text text (ink), font display 24px/32px weight 600

### Heading 3

text text (ink), font sans 20px/28px weight 600

## Accessibility

Safe text pairs: ink on white (17.74:1, AAA) · gray-800 on white (7.56:1, AAA) · gray-600 on white (4.83:1, AA) · white on brand (5.17:1, AA) · brand on white (5.17:1, AA) · ink on white (17.74:1, AAA) · green-800 on green-100 (6.49:1, AA) · red-800 on red-100 (6.8:1, AA)
Input border vs input: 1.47:1, fails 3:1

## Notes

- No focus style was found on buttons, links or inputs.
- Extracted from one page in its light theme. Hover and focus states are not included.
- Check these first (low confidence): mono, lg, 2xl, container-sm, radius-sm, shadow-sm, shadow-md, sm, md, lg, h1, h3
