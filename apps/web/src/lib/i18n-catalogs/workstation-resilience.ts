export const workstationResilienceEnglishMessages = {
  'workstation.appearance.label': 'Appearance',
  'workstation.appearance.system': 'System',
  'workstation.appearance.light': 'Light',
  'workstation.appearance.dark': 'Dark',
  'workstation.pwa.install': 'Install AIM',
  'workstation.pwa.installHint': 'Install AIM on this device for faster workstation access.',
  'workstation.pwa.updateReady': 'A new AIM version is ready.',
  'workstation.pwa.updateDescription':
    'Save any in-progress work, then update when you are ready. AIM will reload only after you choose Update now.',
  'workstation.pwa.updatePolicyChecking': 'Checking update requirements…',
  'workstation.pwa.updatePolicyCheckingDescription':
    'AIM is verifying whether this release can be postponed. You may update now while the check completes.',
  'workstation.pwa.requiredUpdate': 'AIM update required.',
  'workstation.pwa.requiredUpdateDescription':
    'This release is marked as required. Update AIM before continuing with normal work.',
  'workstation.pwa.requiredSecurityUpdate': 'Security update required.',
  'workstation.pwa.requiredSecurityDescription':
    'AIM requires this security update to keep the application on the approved release path. Sensitive vulnerability details are not shown here.',
  'workstation.pwa.requiredCompatibilityUpdate': 'Compatibility update required.',
  'workstation.pwa.requiredCompatibilityDescription':
    'This AIM version is not intended to remain active with the new release. Update before continuing with normal work.',
  'workstation.pwa.updateNow': 'Update now',
  'workstation.pwa.updating': 'Updating…',
  'workstation.pwa.later': 'Later',
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
  'workstation.pwa.updateDescription':
    'நடப்பிலுள்ள பணியை சேமித்துவிட்டு தயாரானபோது புதுப்பிக்கவும். “இப்போது புதுப்பிக்கவும்” என்பதைத் தேர்ந்தெடுத்த பிறகே AIM மீளேற்றப்படும்.',
  'workstation.pwa.updatePolicyChecking': 'புதுப்பிப்பு தேவைகள் சரிபார்க்கப்படுகின்றன…',
  'workstation.pwa.updatePolicyCheckingDescription':
    'இந்த வெளியீட்டை பின்னுக்கு தள்ள முடியுமா என்பதை AIM சரிபார்க்கிறது. சரிபார்ப்பு முடியும் வரை நீங்கள் இப்போது புதுப்பிக்கலாம்.',
  'workstation.pwa.requiredUpdate': 'AIM புதுப்பிப்பு அவசியம்.',
  'workstation.pwa.requiredUpdateDescription':
    'இந்த வெளியீடு கட்டாய புதுப்பிப்பாக குறிக்கப்பட்டுள்ளது. வழக்கமான பணியைத் தொடரும் முன் AIM-ஐ புதுப்பிக்கவும்.',
  'workstation.pwa.requiredSecurityUpdate': 'பாதுகாப்பு புதுப்பிப்பு அவசியம்.',
  'workstation.pwa.requiredSecurityDescription':
    'அங்கீகரிக்கப்பட்ட வெளியீட்டு பாதையில் பயன்பாட்டை வைத்திருக்க இந்த பாதுகாப்பு புதுப்பிப்பு AIM-க்கு அவசியம். நுணுக்கமான பாதிப்பு விவரங்கள் இங்கே காட்டப்படமாட்டாது.',
  'workstation.pwa.requiredCompatibilityUpdate': 'இணக்கத்தன்மை புதுப்பிப்பு அவசியம்.',
  'workstation.pwa.requiredCompatibilityDescription':
    'புதிய வெளியீட்டுடன் இந்த AIM பதிப்பு தொடர்ந்து செயல்படுவதற்காக வடிவமைக்கப்படவில்லை. வழக்கமான பணியைத் தொடரும் முன் புதுப்பிக்கவும்.',
  'workstation.pwa.updateNow': 'இப்போது புதுப்பிக்கவும்',
  'workstation.pwa.updating': 'புதுப்பிக்கிறது…',
  'workstation.pwa.later': 'பின்னர்',
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
  'workstation.pwa.updateDescription':
    'اپنا جاری کام محفوظ کریں، پھر جب تیار ہوں اپ ڈیٹ کریں۔ AIM صرف Update now منتخب کرنے کے بعد دوبارہ لوڈ ہوگا۔',
  'workstation.pwa.updatePolicyChecking': 'اپ ڈیٹ کی ضرورت جانچی جا رہی ہے…',
  'workstation.pwa.updatePolicyCheckingDescription':
    'AIM یہ تصدیق کر رہا ہے کہ آیا اس ریلیز کو مؤخر کیا جا سکتا ہے۔ جانچ مکمل ہونے کے دوران آپ ابھی اپ ڈیٹ کر سکتے ہیں۔',
  'workstation.pwa.requiredUpdate': 'AIM اپ ڈیٹ ضروری ہے۔',
  'workstation.pwa.requiredUpdateDescription':
    'اس ریلیز کو لازمی اپ ڈیٹ کے طور پر نشان زد کیا گیا ہے۔ معمول کا کام جاری رکھنے سے پہلے AIM اپ ڈیٹ کریں۔',
  'workstation.pwa.requiredSecurityUpdate': 'سیکیورٹی اپ ڈیٹ ضروری ہے۔',
  'workstation.pwa.requiredSecurityDescription':
    'AIM کو منظور شدہ ریلیز راستے پر رکھنے کے لیے یہ سیکیورٹی اپ ڈیٹ ضروری ہے۔ حساس کمزوری کی تفصیلات یہاں ظاہر نہیں کی جاتیں۔',
  'workstation.pwa.requiredCompatibilityUpdate': 'مطابقت کی اپ ڈیٹ ضروری ہے۔',
  'workstation.pwa.requiredCompatibilityDescription':
    'AIM کا یہ ورژن نئی ریلیز کے ساتھ فعال رہنے کے لیے نہیں بنایا گیا۔ معمول کا کام جاری رکھنے سے پہلے اپ ڈیٹ کریں۔',
  'workstation.pwa.updateNow': 'ابھی اپ ڈیٹ کریں',
  'workstation.pwa.updating': 'اپ ڈیٹ ہو رہا ہے…',
  'workstation.pwa.later': 'بعد میں',
  'workstation.pwa.reload': 'محفوظ طریقے سے دوبارہ لوڈ کریں',
  'workstation.pwa.offline': 'آپ آف لائن ہیں۔ محفوظ ڈیٹا پر سرور ہی حتمی اختیار رکھتا ہے۔',
  'workstation.pwa.online': 'کنکشن بحال ہو گیا۔',
};
