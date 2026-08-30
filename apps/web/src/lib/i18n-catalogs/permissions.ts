export const permissionsEnglishMessages = {
  'permissions.location.title': 'Use your location?',
  'permissions.location.explanation':
    'MedSphere uses your current location only to find nearby healthcare providers and medicine availability.',
  'permissions.location.precision':
    'If you continue, your browser may share precise location for this search. MedSphere does not continuously track or store it in your browser.',
  'permissions.notifications.title': 'Enable browser notifications?',
  'permissions.notifications.explanation':
    'Browser notifications can alert you about supported MedSphere updates after you choose to enable them.',
  'permissions.notifications.precision':
    'Your MedSphere notification preference and your browser permission are separate controls.',
  'permissions.action.continueLocation': 'Use my location',
  'permissions.action.continueNotifications': 'Continue to browser settings',
  'permissions.action.manualLocation': 'Search without location',
  'permissions.action.cancel': 'Not now',
} as const;

export type PermissionsTranslationKey = keyof typeof permissionsEnglishMessages;

export const permissionsTamilMessages: Record<PermissionsTranslationKey, string> = {
  'permissions.location.title': 'உங்கள் இருப்பிடத்தைப் பயன்படுத்தலாமா?',
  'permissions.location.explanation':
    'அருகிலுள்ள சுகாதார சேவை வழங்குநர்களையும் மருந்து கிடைப்பையும் கண்டறிய மட்டுமே MedSphere உங்கள் தற்போதைய இருப்பிடத்தைப் பயன்படுத்துகிறது.',
  'permissions.location.precision':
    'நீங்கள் தொடர்ந்தால், இந்தத் தேடலுக்காக உங்கள் உலாவி துல்லியமான இருப்பிடத்தைப் பகிரலாம். MedSphere அதைத் தொடர்ந்து கண்காணிக்கவோ உங்கள் உலாவியில் சேமிக்கவோ செய்யாது.',
  'permissions.notifications.title': 'உலாவி அறிவிப்புகளை இயக்கலாமா?',
  'permissions.notifications.explanation':
    'நீங்கள் இயக்கத் தேர்ந்தெடுத்த பிறகு, ஆதரிக்கப்படும் MedSphere புதுப்பிப்புகளை உலாவி அறிவிப்புகள் தெரிவிக்கலாம்.',
  'permissions.notifications.precision':
    'உங்கள் MedSphere அறிவிப்பு விருப்பமும் உலாவி அனுமதியும் தனித்தனி கட்டுப்பாடுகள்.',
  'permissions.action.continueLocation': 'என் இருப்பிடத்தைப் பயன்படுத்து',
  'permissions.action.continueNotifications': 'உலாவி அமைப்புகளுக்குத் தொடரவும்',
  'permissions.action.manualLocation': 'இருப்பிடம் இல்லாமல் தேடு',
  'permissions.action.cancel': 'இப்போது வேண்டாம்',
};

export const permissionsUrduMessages: Record<PermissionsTranslationKey, string> = {
  'permissions.location.title': 'کیا آپ کا مقام استعمال کیا جائے؟',
  'permissions.location.explanation':
    'MedSphere آپ کا موجودہ مقام صرف قریبی صحت فراہم کنندگان اور دوا کی دستیابی تلاش کرنے کے لیے استعمال کرتا ہے۔',
  'permissions.location.precision':
    'اگر آپ جاری رکھیں تو آپ کا براؤزر اس تلاش کے لیے درست مقام شیئر کر سکتا ہے۔ MedSphere مسلسل نگرانی نہیں کرتا اور اسے آپ کے براؤزر میں محفوظ نہیں کرتا۔',
  'permissions.notifications.title': 'براؤزر اطلاعات فعال کریں؟',
  'permissions.notifications.explanation':
    'آپ کے فعال کرنے کے بعد براؤزر اطلاعات معاون MedSphere اپ ڈیٹس کے بارے میں آگاہ کر سکتی ہیں۔',
  'permissions.notifications.precision':
    'آپ کی MedSphere اطلاع ترجیح اور براؤزر اجازت الگ کنٹرول ہیں۔',
  'permissions.action.continueLocation': 'میرا مقام استعمال کریں',
  'permissions.action.continueNotifications': 'براؤزر ترتیبات پر جاری رکھیں',
  'permissions.action.manualLocation': 'مقام کے بغیر تلاش کریں',
  'permissions.action.cancel': 'ابھی نہیں',
};
