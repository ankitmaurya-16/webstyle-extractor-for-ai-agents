# Design system: 127.0.0.1

Extracted 2026-10-18 from http://127.0.0.1:4173/classic.html · light and dark themes · WebStyle Extractor v2.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`; secondary text is `text-muted`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below, including their hover, focus and active states.
6. Every interactive element shows the focus ring on `:focus-visible`: outline 2px solid focus-ring (blue-600), offset 2px.
7. Support light and dark themes with the paired semantic tokens. The site switches themes with the `.dark` class on `<html>`.
8. Load Helvetica Neue rather than substituting.
9. Animate with the motion tokens below and honor `prefers-reduced-motion`.
10. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Stack

- Web font: Helvetica Neue 400, 600 from self-hosted

## Colors

### Semantic

| Role       | Light token       | Light   | Dark token            | Dark    | Site variable |
| ---------- | ----------------- | ------- | --------------------- | ------- | ------------- |
| background | white             | #ffffff | gray-extra-1 (verify) | #0b0f19 |               |
| text       | gray-900          | #111827 | white                 | #ffffff | --ink         |
| text-muted | gray-600          | #6b7280 |                       |         |               |
| border     | gray-200 (verify) | #e5e7eb |                       |         |               |
| primary    | blue-600          | #2563eb | blue-400              | #60a5fa | --brand       |
| success    | green-800         | #166534 |                       |         |               |
| danger     | red-800           | #991b1b |                       |         |               |
| focus-ring | blue-600          | #2563eb |                       |         | --brand       |

Theme switching: the `.dark` class on `<html>` (`.dark`).

### Scales

| Token                 | Hex     | Usage | Site variable |
| --------------------- | ------- | ----- | ------------- |
| white                 | #ffffff | 33%   |               |
| gray-200              | #e5e7eb | 17%   |               |
| gray-300              | #d1d5db | 16%   |               |
| gray-600              | #6b7280 | 4%    |               |
| gray-900              | #111827 | 12%   | --ink         |
| gray-extra-1 (verify) | #0b0f19 | 11%   |               |
| red-100               | #fee2e2 | <1%   |               |
| red-800               | #991b1b | 1%    |               |
| green-100             | #dcfce7 | <1%   |               |
| green-800             | #166534 | 1%    |               |
| blue-400 (verify)     | #60a5fa | <1%   |               |
| blue-600              | #2563eb | <1%   | --brand       |

### Gradients

| Token      | Value                                       |
| ---------- | ------------------------------------------- |
| gradient-1 | linear-gradient(135deg, blue-600, blue-400) |

## Typography

| Family  | Stack                                 | Source                    |
| ------- | ------------------------------------- | ------------------------- |
| sans    | "Helvetica Neue", "Arial", sans-serif | web font from self-hosted |
| display | "Georgia", "Times New Roman", serif   | system font               |
| mono    | "JetBrains Mono", "Menlo", monospace  | system font               |

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

Base unit 4px: space-1 4px, space-2 8px, space-3 12px, space-4 16px, space-6 24px, space-8 32px, space-12 48px

## Layout

- Containers: container-sm 1024px
- Grid columns: 3 (100%)
- Gaps: gap-20 20px

## Radius

radius-sm 4px, radius-md 6px, radius-lg 8px, radius-full 9999px

## Borders

border-1 1px · usually solid

## Shadows

| Token              | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| shadow-sm (verify) | rgba(0, 0, 0, 0.05) 0px 1px 2px 0px                                        |
| shadow-md (verify) | rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px |

## Opacity

opacity-disabled 0.5

## Z-index

z-dialog 50

## Motion

duration-150, duration-300 · ease-out cubic-bezier(0, 0, 0.2, 1) · usually animates background-color

The site honors `prefers-reduced-motion`.

## Breakpoints

sm 640px, md 768px, lg 1024px

## Components

### Focus ring

outline 2px solid focus-ring (blue-600), offset 2px (from forced states)

### Button, primary

| State         | Changes                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | background primary (blue-600), text text (white), border none, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600 |
| hover         | background gray-900                                                                                                                                 |
| focus-visible | outline 2px solid focus-ring (blue-600), offset 2px                                                                                                 |

### Button, secondary

background background (white), text text (gray-900), border 1px solid gray-300, radius radius-md, padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

### Input

background background (white), text text (gray-900), border 1px solid gray-300, radius radius-md, padding space-2 space-3 (8px 12px), height 38px, font sans 14px/20px weight 400

### Link

text primary (blue-600), font sans 16px/24px weight 400

### Card

background background (white), border 1px solid border (gray-200), radius radius-lg, padding space-6 (24px), shadow shadow-sm

### Badge, info

background #dbeafe, text #1e40af, border none, radius radius-full, padding space-1 space-3 (4px 12px), font 12px weight 400

### Alert, success

background green-100, text success (green-800), border none, radius radius-md, padding space-3 space-4 (12px 16px), font sans 16px

### Alert, danger

background red-100, text danger (red-800), border none, radius radius-md, padding space-3 space-4 (12px 16px), font sans 16px

### Nav bar

background transparent, border none, padding 0, height 24px, links: text #4b5563, font 14px weight 400

### Heading 1

text text (gray-900), font display 36px/40px weight 700

### Heading 2

text text (gray-900), font display 24px/32px weight 600

### Heading 3

text text (gray-900), font sans 20px/28px weight 600

## Accessibility

Safe text pairs: gray-900 on white (light) (17.74:1, AAA) · gray-600 on white (light) (4.83:1, AA) · white on blue-600 (light) (5.17:1, AA) · blue-600 on white (light) (5.17:1, AA) · gray-900 on white (light) (17.74:1, AAA) · green-800 on green-100 (light) (6.49:1, AA) · red-800 on red-100 (light) (6.8:1, AA)
Focus ring vs background: 5.17:1, passes 3:1
Input border vs input: 1.47:1, fails 3:1

## Notes

- The other theme came from stylesheet overrides; component colors in it are not known (verify).
- Check these first (low confidence): gray-extra-1, blue-400, mono, lg, 2xl, container-sm, radius-sm, shadow-sm, shadow-md, sm, md, lg
