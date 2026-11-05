import type { SVGProps } from 'react';
import { GLYPHS, type GlyphName, type Shape } from './digit-glyphs';

/** Accent tone: the surrounding element sets `--di-accent` (light tiles keep the brand green, dark tiles use mint). */
const ACCENT = 'var(--di-accent, var(--primary))';

function shape(s: Shape, key: number) {
  const accent = s[s.length - 1] === 1;
  const fill = accent ? { fill: ACCENT } : undefined;
  switch (s[0]) {
    case 'r':
      return <rect key={key} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} style={fill} />;
    case 'c':
      return <circle key={key} cx={s[1]} cy={s[2]} r={s[3]} style={fill} />;
    case 'g':
      return <polygon key={key} points={s[1]} style={fill} />;
    case 'p':
      return <path key={key} d={s[1]} fillRule="evenodd" style={fill} />;
    case 'o':
      return <circle key={key} cx={s[1]} cy={s[2]} r={s[3]} fill="none" stroke={accent ? undefined : 'currentColor'} strokeWidth={s[4]} style={accent ? { stroke: ACCENT } : undefined} />;
    case 's':
      return (
        <path key={key} d={s[1]} fill="none" stroke={accent ? undefined : 'currentColor'} strokeWidth={s[2]} strokeLinecap="round" strokeLinejoin="round" style={accent ? { stroke: ACCENT } : undefined} />
      );
  }
}

/** One glyph from the DIGIT icon set; decorative by default (the link or heading beside it carries the name). */
export function DigitIcon({ name, className, ...rest }: { name: GlyphName } & Omit<SVGProps<SVGSVGElement>, 'name' | 'viewBox'>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-glyph={name}
      className={className ? `digit-icon ${className}` : 'digit-icon'}
      {...rest}
    >
      {GLYPHS[name].shapes.map(shape)}
    </svg>
  );
}
