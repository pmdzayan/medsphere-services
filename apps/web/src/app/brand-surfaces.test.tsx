import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@medsphere/brand';
import { LanguageProvider } from '@/components/language-provider';
import HomePage from './page';
import { LoginPageContent } from './login/login-page-content';
import { RegisterPageContent } from './register/register-page-content';

vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({}) })),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => cleanup());

function renderLocalized(node: React.ReactNode) {
  return render(<LanguageProvider initialLocale="en">{node}</LanguageProvider>);
}

describe('first-contact AIM branding', () => {
  it.each([
    ['landing', () => <HomePage />],
    ['login', () => <LoginPageContent />],
    ['registration', () => <RegisterPageContent />],
  ])('renders the approved accessible identity on %s', (_surface, createSurface) => {
    renderLocalized(createSurface());
    expect(screen.getAllByRole('link', { name: BRAND.accessibleName }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/MedSphere/i)).not.toBeInTheDocument();
  });
});
