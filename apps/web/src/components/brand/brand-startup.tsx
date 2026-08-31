import { BRAND } from '@medsphere/brand';
import { AimSpine } from './aim-spine';

/**
 * A non-interactive, CSS-only opening identity. It never delays rendering,
 * session restoration, focus, pointer input, or route access.
 */
export function BrandStartup() {
  return (
    <div
      className="brand-startup pointer-events-none fixed inset-0 z-[200] grid place-items-center bg-[#07110f]"
      data-brand={BRAND.shortName}
    >
      <AimSpine expanded tone="dark" size="lg" className="scale-125 sm:scale-150" />
    </div>
  );
}
