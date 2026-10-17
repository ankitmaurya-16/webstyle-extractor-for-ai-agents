import { cssValue, resolveValue } from '../../../src/model/design.js';
import { describeColor, describePadding, recipeTitle } from '../../../src/export/design-md.js';
import { S } from '../strings.js';
import { SectionLabel } from '../components/Basics.jsx';

/** Live preview built from the recipe's tokens, with generic labels (never page text). */
function Preview({ design, recipe }) {
  const s = recipe.styles;
  const style = {
    background: cssValue(design, s['background-color']),
    color: cssValue(design, s.color),
    border: s.border,
    borderRadius: cssValue(design, s['border-radius']),
    padding: s.padding,
    fontFamily: resolveValue(design, s['font-family']).raw,
    fontSize: cssValue(design, s['font-size']),
    fontWeight: s['font-weight'],
    lineHeight: s['line-height'],
    boxShadow: cssValue(design, s['box-shadow']),
  };
  if (recipe.kind === 'button') return <span style={style}>{S.previewButton}</span>;
  if (recipe.kind === 'input') {
    return (
      <span style={{ ...style, display: 'block', width: '100%', opacity: 1 }}>
        <span style={{ opacity: 0.6 }}>{S.previewPlaceholder}</span>
      </span>
    );
  }
  if (recipe.kind === 'link')
    return <span style={{ ...style, textDecoration: 'underline' }}>{S.previewLink}</span>;
  return (
    <span style={{ ...style, display: 'block' }}>{S.previewHeading(recipe.variant.slice(1))}</span>
  );
}

export function ComponentsTab({ design }) {
  const recipes = design.components.filter((r) => !r.excluded);
  if (recipes.length === 0) return <p className="mt-6 text-muted">{S.noComponents}</p>;
  const pageBackground = design.colors.find(
    (c) => !c.excluded && c.roles.includes('background'),
  )?.hex;

  return recipes.map((recipe) => {
    const s = recipe.styles;
    const name = (value) => {
      const { token, raw } = resolveValue(design, value);
      return token ? token.name : raw;
    };
    const rows = [
      [S.recipeKeys.background, describeColor(design, s['background-color'], 'background')],
      [S.recipeKeys.text, describeColor(design, s.color, 'text')],
      [S.recipeKeys.border, s.border],
      [S.recipeKeys.padding, describePadding(design, s.padding)],
      [S.recipeKeys.radius, name(s['border-radius'])],
      [
        S.recipeKeys.font,
        `${name(s['font-family'])} ${resolveValue(design, s['font-size']).raw}/${s['line-height']} ${s['font-weight']}`,
      ],
    ];
    if (s['box-shadow'] && s['box-shadow'] !== 'none')
      rows.push([S.recipeKeys.shadow, name(s['box-shadow'])]);
    return (
      <section key={recipe.id} aria-label={recipeTitle(recipe)}>
        <SectionLabel>{recipeTitle(recipe)}</SectionLabel>
        <div
          className="flex min-h-16 items-center justify-center overflow-hidden rounded-card border border-border p-4"
          style={{ background: pageBackground }}
        >
          <Preview design={design} recipe={recipe} />
        </div>
        <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 font-mono text-sm">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-faint">{key}</dt>
              <dd className="m-0 truncate text-text" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  });
}
