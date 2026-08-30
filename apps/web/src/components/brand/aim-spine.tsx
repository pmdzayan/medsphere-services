import { BRAND } from '@medsphere/brand';

type AimSpineProps = Readonly<{
  expanded?: boolean;
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  decorative?: boolean;
}>;

const sizeClasses = {
  sm: 'text-[9px] leading-[1.05]',
  md: 'text-xs leading-[1.05]',
  lg: 'text-base leading-[1.05] sm:text-lg',
} as const;

/**
 * Reusable typographic AIM Spine. The visual letters are decorative; one
 * stable accessible name prevents screen readers from announcing fragments.
 */
export function AimSpine({
  expanded = true,
  tone = 'dark',
  size = 'md',
  className = '',
  decorative = false,
}: AimSpineProps) {
  const rows = [
    ['A', 'll'],
    ['I', 'n'],
    ['M', 'edico'],
  ] as const;
  const foreground = tone === 'dark' ? 'text-white' : 'text-[#10201c]';
  const subordinate = tone === 'dark' ? 'text-white/55' : 'text-[#52665f]';

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : BRAND.accessibleName}
      aria-hidden={decorative ? true : undefined}
      className={`aim-spine relative inline-grid shrink-0 gap-[.12em] font-[var(--font-display)] ${sizeClasses[size]} ${foreground} ${className}`}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-[.32em] left-[.5em] top-[.32em] w-px -translate-x-1/2 bg-current opacity-35"
      />
      {rows.map(([initial, remainder]) => (
        <span
          key={initial}
          aria-hidden="true"
          className={`relative grid items-baseline ${expanded ? 'grid-cols-[1em_auto]' : 'grid-cols-[1em]'}`}
        >
          <span className="relative z-[1] text-center font-black tracking-[-.08em]">{initial}</span>
          {expanded ? (
            <span className={`pl-[.18em] font-medium tracking-[.01em] ${subordinate}`}>
              {remainder}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
