import { describe, expect, it } from 'vitest';

import { supportedLocales, translate, type Locale, type TranslationKey } from './i18n';

const workstationSecurityKeys = [
  'shell.lockWorkstation',
  'shell.lockingWorkstation',
  'shell.workstationLocked',
  'shell.workstationLockedDescription',
  'shell.password',
  'shell.unlockWorkstation',
  'shell.unlockingWorkstation',
  'shell.switchUser',
  'shell.switchingUser',
  'shell.lockedSignOut',
  'shell.unlockFailed',
  'shell.lockFailed',
  'shell.switchUserFailed',
  'shell.lockedSignOutFailed',
] as const satisfies readonly TranslationKey[];

describe('Task 0014 workstation-security localization', () => {
  it.each(supportedLocales.filter((locale): locale is Exclude<Locale, 'en'> => locale !== 'en'))(
    '%s has real localized workstation-security copy',
    (locale) => {
      for (const key of workstationSecurityKeys) {
        expect(translate(locale, key)).not.toBe(translate('en', key));
      }
    },
  );
});
