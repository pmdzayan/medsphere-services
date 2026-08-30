export const commonAuthEnglishMessages = {
  'common.or': 'or',
  'common.loading': 'Loading',
  'common.working': 'Working…',
  'common.brandHome': 'MedSphere home',
  'common.healthcareOs': 'Healthcare OS',
  'common.applicationLanguage': 'Application language',
  'auth.chooseOrganization': 'Choose an organization',
  'auth.back': 'Back',
  'auth.googleLoading': 'Loading Google sign-in…',
  'auth.googleMissingOrganization': 'Choose an organization before continuing with Google.',
  'auth.googleCredentialInvalid': 'Google sign-in did not return a valid credential.',
  'auth.googleFailed': 'Google sign-in failed. Try again.',
} as const;

export type CommonAuthTranslationKey = keyof typeof commonAuthEnglishMessages;

export const commonAuthTamilMessages: Record<CommonAuthTranslationKey, string> = {
  'common.or': 'அல்லது',
  'common.loading': 'ஏற்றப்படுகிறது',
  'common.working': 'செயல்படுகிறது…',
  'common.brandHome': 'MedSphere முகப்பு',
  'common.healthcareOs': 'சுகாதார இயக்க முறைமை',
  'common.applicationLanguage': 'பயன்பாட்டு மொழி',
  'auth.chooseOrganization': 'ஒரு நிறுவனத்தைத் தேர்ந்தெடுக்கவும்',
  'auth.back': 'பின்செல்',
  'auth.googleLoading': 'Google உள்நுழைவு ஏற்றப்படுகிறது…',
  'auth.googleMissingOrganization':
    'Google மூலம் தொடர்வதற்கு முன் ஒரு நிறுவனத்தைத் தேர்ந்தெடுக்கவும்.',
  'auth.googleCredentialInvalid': 'Google உள்நுழைவு செல்லுபடியாகும் சான்றை வழங்கவில்லை.',
  'auth.googleFailed': 'Google உள்நுழைவு தோல்வியடைந்தது. மீண்டும் முயலவும்.',
};

export const commonAuthUrduMessages: Record<CommonAuthTranslationKey, string> = {
  'common.or': 'یا',
  'common.loading': 'لوڈ ہو رہا ہے',
  'common.working': 'کارروائی جاری ہے…',
  'common.brandHome': 'MedSphere ہوم',
  'common.healthcareOs': 'صحت نگہداشت آپریٹنگ نظام',
  'common.applicationLanguage': 'ایپ کی زبان',
  'auth.chooseOrganization': 'ایک ادارہ منتخب کریں',
  'auth.back': 'واپس',
  'auth.googleLoading': 'Google سائن ان لوڈ ہو رہا ہے…',
  'auth.googleMissingOrganization': 'Google کے ساتھ جاری رکھنے سے پہلے ایک ادارہ منتخب کریں۔',
  'auth.googleCredentialInvalid': 'Google سائن ان سے درست سند موصول نہیں ہوئی۔',
  'auth.googleFailed': 'Google سائن ان ناکام ہوا۔ دوبارہ کوشش کریں۔',
};
