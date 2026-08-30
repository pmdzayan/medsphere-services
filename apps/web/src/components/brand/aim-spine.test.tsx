import fs from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BRAND } from '@medsphere/brand';
import { AimSpine } from './aim-spine';
import { BrandStartup } from './brand-startup';

afterEach(() => cleanup());

describe('AIM Spine', () => {
  it('exposes one approved accessible identity and a connected initial axis', () => {
    const { container } = render(<AimSpine expanded tone="light" size="lg" />);
    expect(screen.getByRole('img', { name: BRAND.accessibleName })).toBeInTheDocument();
    expect(container.querySelector('[data-expanded="true"]')).toBeInTheDocument();
    expect(container.textContent).toBe('AllInMedico');
    expect(container.querySelectorAll('.aim-spine > span[aria-hidden="true"]')).toHaveLength(4);
  });

  it('supports compact, dark, and small responsive navigation rendering', () => {
    const { container } = render(<AimSpine expanded={false} tone="dark" size="sm" />);
    expect(container.textContent).toBe('AIM');
    expect(container.querySelector('[data-expanded="false"]')).toHaveClass('text-[9px]');
    expect(container.querySelector('[data-expanded="false"]')).toHaveClass('text-white');
    expect(container.querySelector('[data-expanded="false"]')).toHaveClass('shrink-0');
  });

  it('scales at the existing mobile-to-desktop breakpoint without fixed dimensions', () => {
    const { container } = render(<AimSpine expanded size="lg" />);
    const spine = container.querySelector('.aim-spine');
    expect(spine).toHaveClass('text-base');
    expect(spine).toHaveClass('sm:text-lg');
    expect(spine?.className).not.toMatch(/\b(?:h|w)-\[/);
  });

  it('can be decorative when a parent control already owns the accessible name', () => {
    const { container } = render(<AimSpine decorative />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('opening identity', () => {
  it('renders without timers or interaction blocking and retains an accessible fallback', () => {
    const { container } = render(<BrandStartup />);
    expect(screen.getByRole('img', { name: BRAND.accessibleName })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('pointer-events-none');
    expect(container.firstChild).toHaveAttribute('data-brand', 'AIM');
  });

  it('has a bounded animation and an explicit reduced-motion override', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/\.brand-startup\s*\{[\s\S]*720ms/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.brand-startup[\s\S]*1ms/);
    expect(css).not.toMatch(/animation-iteration-count:\s*infinite[\s\S]*brand-startup/);
  });
});
