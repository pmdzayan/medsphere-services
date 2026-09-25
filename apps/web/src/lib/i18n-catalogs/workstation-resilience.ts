export const workstationResilienceEnglishMessages = {
  'workstation.appearance.label': 'Appearance',
  'workstation.appearance.system': 'System',
  'workstation.appearance.light': 'Light',
  'workstation.appearance.dark': 'Dark',
  'workstation.pwa.install': 'Install AIM',
  'workstation.pwa.installHint': 'Install AIM on this device for faster workstation access.',
  'workstation.pwa.updateReady': 'A new AIM version is ready.',
  'workstation.pwa.reload': 'Reload safely',
  'workstation.pwa.offline': 'You are offline. Protected data remains server-authoritative.',
  'workstation.pwa.online': 'Connection restored.',
} as const;

export const workstationResilienceTamilMessages: Record<
  keyof typeof workstationResilienceEnglishMessages,
  string
> = {
  'workstation.appearance.label': 'தோற்றம்',
  'workstation.appearance.system': 'சாதன அமைப்பு',
  'workstation.appearance.light': 'ஒளி',
  'workstation.appearance.dark': 'இருள்',
  'workstation.pwa.install': 'AIM-ஐ நிறுவவும்',
  'workstation.pwa.installHint': 'வேகமான பணியிட அணுகலுக்காக இந்த சாதனத்தில் AIM-ஐ நிறுவவும்.',
  'workstation.pwa.updateReady': 'AIM-ன் புதிய பதிப்பு தயாராக உள்ளது.',
  'workstation.pwa.reload': 'பாதுகாப்பாக மீளேற்று',
  'workstation.pwa.offline':
    'இணைய இணைப்பு இல்லை. பாதுகாக்கப்பட்ட தரவின் அதிகாரம் சேவையகத்திலேயே இருக்கும்.',
  'workstation.pwa.online': 'இணைப்பு மீண்டும் கிடைத்தது.',
};

export const workstationResilienceUrduMessages: Record<
  keyof typeof workstationResilienceEnglishMessages,
  string
> = {
  'workstation.appearance.label': 'ظاہری انداز',
  'workstation.appearance.system': 'سسٹم',
  'workstation.appearance.light': 'روشن',
  'workstation.appearance.dark': 'تاریک',
  'workstation.pwa.install': 'AIM انسٹال کریں',
  'workstation.pwa.installHint': 'تیز ورک اسٹیشن رسائی کے لیے اس آلے پر AIM انسٹال کریں۔',
  'workstation.pwa.updateReady': 'AIM کا نیا ورژن تیار ہے۔',
  'workstation.pwa.reload': 'محفوظ طریقے سے دوبارہ لوڈ کریں',
  'workstation.pwa.offline': 'آپ آف لائن ہیں۔ محفوظ ڈیٹا پر سرور ہی حتمی اختیار رکھتا ہے۔',
  'workstation.pwa.online': 'کنکشن بحال ہو گیا۔',
};
