export const publicSearchEnglishMessages = {
  'publicSearch.locationUnavailable': 'Location services are not available in this browser.',
  'publicSearch.locationDenied':
    'Location permission was denied. Allow location access to search nearby pharmacies.',
  'publicSearch.locationFailed': 'Your location could not be determined. Try again.',
  'publicSearch.nearbyUnavailable': 'Nearby medicine search is unavailable right now.',
  'publicSearch.findingNearby': 'Finding nearby pharmacies…',
  'publicSearch.findNearMe': 'Find near me',
  'publicSearch.distanceAway': '{distance} away',
} as const;

export type PublicSearchTranslationKey = keyof typeof publicSearchEnglishMessages;

export const publicSearchTamilMessages: Record<PublicSearchTranslationKey, string> = {
  'publicSearch.locationUnavailable': 'இந்த உலாவியில் இருப்பிடச் சேவைகள் கிடைக்கவில்லை.',
  'publicSearch.locationDenied':
    'இருப்பிட அனுமதி மறுக்கப்பட்டது. அருகிலுள்ள மருந்தகங்களைத் தேட இருப்பிட அணுகலை அனுமதிக்கவும்.',
  'publicSearch.locationFailed': 'உங்கள் இருப்பிடத்தை கண்டறிய முடியவில்லை. மீண்டும் முயலவும்.',
  'publicSearch.nearbyUnavailable': 'அருகிலுள்ள மருந்துத் தேடல் தற்போது கிடைக்கவில்லை.',
  'publicSearch.findingNearby': 'அருகிலுள்ள மருந்தகங்கள் கண்டறியப்படுகின்றன…',
  'publicSearch.findNearMe': 'எனக்கு அருகில் தேடு',
  'publicSearch.distanceAway': '{distance} தொலைவில்',
};

export const publicSearchUrduMessages: Record<PublicSearchTranslationKey, string> = {
  'publicSearch.locationUnavailable': 'اس براؤزر میں مقام کی سہولت دستیاب نہیں ہے۔',
  'publicSearch.locationDenied':
    'مقام کی اجازت مسترد کر دی گئی۔ قریبی فارمیسی تلاش کرنے کے لیے مقام تک رسائی دیں۔',
  'publicSearch.locationFailed': 'آپ کے مقام کا تعین نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
  'publicSearch.nearbyUnavailable': 'قریبی دوا کی تلاش اس وقت دستیاب نہیں ہے۔',
  'publicSearch.findingNearby': 'قریبی فارمیسیاں تلاش ہو رہی ہیں…',
  'publicSearch.findNearMe': 'میرے قریب تلاش کریں',
  'publicSearch.distanceAway': '{distance} دور',
};
