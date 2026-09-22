import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from './language-provider';
import { PermissionExplanationDialog } from './permission-explanation-dialog';
import { requestBrowserNotifications, startCameraScan } from '@/lib/browser-permissions';

const originalNotification = globalThis.Notification;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: originalNotification,
  });
});

describe('PermissionExplanationDialog', () => {
  it('does not request notifications until the contextual continue action', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission },
    });

    render(
      <LanguageProvider initialLocale="en">
        <PermissionExplanationDialog
          kind="notifications"
          open
          onAlternative={vi.fn()}
          onContinue={() => void requestBrowserNotifications()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Enable browser notifications?')).toBeVisible();
    expect(screen.getByText(/separate controls/)).toBeVisible();
    expect(requestPermission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to browser settings' }));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
  });

  it('does not request camera access before contextual approval and always requests audio off', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    try {
      render(
        <LanguageProvider initialLocale="en">
          <PermissionExplanationDialog
            kind="camera"
            open
            onAlternative={vi.fn()}
            onContinue={() => void startCameraScan()}
          />
        </LanguageProvider>,
      );

      expect(screen.getByText('Use the camera to scan a barcode?')).toBeVisible();
      expect(screen.getByText(/Audio is never requested/)).toBeVisible();
      expect(getUserMedia).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Open camera scanner' }));
      await waitFor(() =>
        expect(getUserMedia).toHaveBeenCalledWith({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        }),
      );
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });

  it('provides keyboard dismissal, initial focus, and responsive dialog layout', async () => {
    const onAlternative = vi.fn();
    render(
      <LanguageProvider initialLocale="en">
        <PermissionExplanationDialog
          kind="location"
          open
          onAlternative={onAlternative}
          onContinue={vi.fn()}
        />
      </LanguageProvider>,
    );

    const alternative = screen.getByRole('button', { name: 'Search without location' });
    await waitFor(() => expect(alternative).toHaveFocus());
    const dialog = screen.getByRole('dialog', { name: 'Use your location?' });
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(dialog).toHaveClass('w-full', 'max-w-lg');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onAlternative).toHaveBeenCalledTimes(1);
  });
});
