import { visible } from '../../../src/model/design.js';
import { t } from '../../../src/i18n.js';
import { CurvePreview, SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

export function MotionTab({ design }) {
  const motion = design.motion ?? {
    durations: [],
    easings: [],
    properties: [],
    reducedMotion: false,
  };
  const durations = visible(motion.durations);
  const easings = visible(motion.easings);
  const maxMs = Math.max(1, ...durations.map((d) => d.ms));
  const durationRow = (d) => (
    <TokenRow
      key={d.id}
      token={d}
      category="duration"
      siblings={motion.durations}
      detail={`${d.ms}ms`}
    >
      <span className="h-2 min-w-0 flex-1" aria-hidden>
        <span
          className="block h-2 rounded-swatch bg-accent/60"
          style={{ width: `${Math.max(2, (d.ms / maxMs) * 100)}%` }}
        />
      </span>
    </TokenRow>
  );
  const easingRow = (e) => (
    <TokenRow
      key={e.id}
      token={e}
      category="easing"
      siblings={motion.easings}
      detail={e.css}
      leading={<CurvePreview bezier={e.bezier} />}
    />
  );

  if (durations.length === 0 && easings.length === 0)
    return <p className="mt-6 text-muted">{t('nothing_found')}</p>;

  return (
    <>
      <SectionLabel count={durations.length}>{t('durations')}</SectionLabel>
      <ul className="flex flex-col">{durations.map(durationRow)}</ul>
      <ExcludedGroup tokens={motion.durations.filter((d) => d.excluded)} render={durationRow} />

      <SectionLabel count={easings.length}>{t('easings')}</SectionLabel>
      <ul className="flex flex-col gap-1">{easings.map(easingRow)}</ul>
      <ExcludedGroup tokens={motion.easings.filter((d) => d.excluded)} render={easingRow} />

      {(motion.properties ?? []).length > 0 && (
        <>
          <SectionLabel as="h3">{t('transitioned')}</SectionLabel>
          <p className="px-1 font-mono text-sm text-muted">
            {motion.properties.map((p) => p.name ?? p).join(', ')}
          </p>
        </>
      )}
      <p className="mt-4 px-1 text-sm text-faint">
        {motion.reducedMotion ? t('reduced_motion_yes') : t('reduced_motion_no')}
      </p>
    </>
  );
}
