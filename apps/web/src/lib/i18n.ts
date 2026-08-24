export const supportedLocales = ['en', 'ta'] as const;

export type Locale = (typeof supportedLocales)[number];

const messages = {
  en: {
    'language.label': 'Language',
    'language.english': 'English',
    'language.tamil': 'தமிழ்',
    'registration.trustedOnboarding': 'Trusted onboarding',
    'registration.heroPrefix': 'Access begins with',
    'registration.heroAccent': 'verified context.',
    'registration.heroDescription':
      'Request a pending membership for an organization that has explicitly enabled public onboarding. Approval and activation remain under organization policy.',
    'registration.safeguardPolicyTitle': 'Policy controlled',
    'registration.safeguardPolicyDescription':
      'The organization must explicitly permit self-registration.',
    'registration.safeguardPendingTitle': 'Pending by default',
    'registration.safeguardPendingDescription':
      'A request does not create an active tenant membership.',
    'registration.safeguardPrivacyTitle': 'Privacy preserving',
    'registration.safeguardPrivacyDescription':
      'The response never reveals existing accounts or organizations.',
    'registration.identityMembershipTenant': 'Identity · Membership · Tenant',
    'registration.signInInstead': 'Sign in instead ↗',
    'registration.sectionLabel': 'Organization access',
    'registration.title': 'Request onboarding.',
    'registration.description':
      'This form submits a pending request. It does not guarantee account creation, organization membership, or immediate access.',
    'registration.firstName': 'First name',
    'registration.lastName': 'Last name',
    'registration.organizationSlug': 'Organization slug',
    'registration.organizationSlugDescription':
      'Use the exact slug supplied by the organization administrator.',
    'registration.workEmail': 'Work email',
    'registration.createPassword': 'Create password',
    'registration.passwordDescription':
      'Use 15–128 characters. Do not reuse a password from another service.',
    'registration.confirmPassword': 'Confirm password',
    'registration.showPassword': 'Show password',
    'registration.submitting': 'Submitting securely…',
    'registration.requestAccess': 'Request organization access',
    'registration.alreadyMember': 'Already have an active membership?',
    'registration.signIn': 'Sign in',
    'registration.requestReceived': 'Request received',
    'registration.queuedTitle': 'Your request is safely queued.',
    'registration.confirmationMessage':
      'If registration is available, onboarding instructions will be sent.',
    'registration.privacyConfirmation':
      "For privacy, this confirmation does not reveal whether the organization or email already exists. Access becomes available only after the organization's onboarding policy is satisfied.",
    'registration.returnSignIn': 'Return to sign in',
    'registration.submitAnother': 'Submit another request',
    'registration.testDataNotice':
      'Use test identities only. This stabilization environment is not approved for real patient, employee, or clinical data.',
    'registration.errorTenant': 'Use the organization slug provided by your administrator.',
    'registration.errorEmail': 'Enter a valid email address.',
    'registration.errorPassword': 'Password must be between 15 and 128 characters.',
    'registration.errorFirstName': 'Enter a first name between 1 and 100 characters.',
    'registration.errorLastName': 'Enter a last name between 1 and 100 characters.',
    'registration.errorConfirmPassword': 'Passwords do not match.',
    'registration.errorGeneric': 'Unable to process the onboarding request.',
  },
  ta: {
    'language.label': 'மொழி',
    'language.english': 'English',
    'language.tamil': 'தமிழ்',
    'registration.trustedOnboarding': 'நம்பகமான பதிவு செயல்முறை',
    'registration.heroPrefix': 'அணுகல் தொடங்குவது',
    'registration.heroAccent': 'சரிபார்க்கப்பட்ட தகவலுடன்.',
    'registration.heroDescription':
      'பொது பதிவை வெளிப்படையாக அனுமதித்துள்ள நிறுவனத்திற்கான நிலுவை உறுப்பினர் அணுகலை கோருங்கள். ஒப்புதல் மற்றும் செயல்படுத்தல் நிறுவனக் கொள்கையின் கீழ் இருக்கும்.',
    'registration.safeguardPolicyTitle': 'கொள்கையால் கட்டுப்படுத்தப்படுகிறது',
    'registration.safeguardPolicyDescription':
      'சுயபதிவை நிறுவனம் வெளிப்படையாக அனுமதித்திருக்க வேண்டும்.',
    'registration.safeguardPendingTitle': 'இயல்பாக நிலுவையில் இருக்கும்',
    'registration.safeguardPendingDescription':
      'ஒரு கோரிக்கை உடனடியாக செயலில் உள்ள நிறுவன உறுப்பினர் அணுகலை உருவாக்காது.',
    'registration.safeguardPrivacyTitle': 'தனியுரிமை பாதுகாப்பு',
    'registration.safeguardPrivacyDescription':
      'ஏற்கனவே உள்ள கணக்குகள் அல்லது நிறுவனங்களை பதில் வெளிப்படுத்தாது.',
    'registration.identityMembershipTenant': 'அடையாளம் · உறுப்பினர் · நிறுவனம்',
    'registration.signInInstead': 'அதற்கு பதில் உள்நுழைக ↗',
    'registration.sectionLabel': 'நிறுவன அணுகல்',
    'registration.title': 'பதிவு அணுகலை கோருங்கள்.',
    'registration.description':
      'இந்த படிவம் ஒரு நிலுவை கோரிக்கையை சமர்ப்பிக்கும். இது கணக்கு உருவாக்கம், நிறுவன உறுப்பினர் அணுகல் அல்லது உடனடி அணுகலை உறுதி செய்யாது.',
    'registration.firstName': 'முதல் பெயர்',
    'registration.lastName': 'கடைசி பெயர்',
    'registration.organizationSlug': 'நிறுவன ஸ்லக்',
    'registration.organizationSlugDescription':
      'நிறுவன நிர்வாகி வழங்கிய சரியான ஸ்லக் மதிப்பைப் பயன்படுத்தவும்.',
    'registration.workEmail': 'பணி மின்னஞ்சல்',
    'registration.createPassword': 'கடவுச்சொல்லை உருவாக்கவும்',
    'registration.passwordDescription':
      '15–128 எழுத்துகளைப் பயன்படுத்தவும். வேறு சேவையில் பயன்படுத்திய கடவுச்சொல்லை மீண்டும் பயன்படுத்த வேண்டாம்.',
    'registration.confirmPassword': 'கடவுச்சொல்லை உறுதிப்படுத்தவும்',
    'registration.showPassword': 'கடவுச்சொல்லைக் காட்டு',
    'registration.submitting': 'பாதுகாப்பாக சமர்ப்பிக்கப்படுகிறது…',
    'registration.requestAccess': 'நிறுவன அணுகலை கோருங்கள்',
    'registration.alreadyMember': 'ஏற்கனவே செயலில் உள்ள உறுப்பினர் அணுகல் உள்ளதா?',
    'registration.signIn': 'உள்நுழைக',
    'registration.requestReceived': 'கோரிக்கை பெறப்பட்டது',
    'registration.queuedTitle': 'உங்கள் கோரிக்கை பாதுகாப்பாக வரிசையில் சேர்க்கப்பட்டது.',
    'registration.confirmationMessage':
      'பதிவு கிடைக்குமானால், அடுத்த கட்ட வழிமுறைகள் அனுப்பப்படும்.',
    'registration.privacyConfirmation':
      'தனியுரிமைக்காக, நிறுவனம் அல்லது மின்னஞ்சல் ஏற்கனவே உள்ளதா என்பதை இந்த உறுதிப்படுத்தல் வெளிப்படுத்தாது. நிறுவனத்தின் பதிவு கொள்கை பூர்த்தி செய்யப்பட்ட பின்னரே அணுகல் கிடைக்கும்.',
    'registration.returnSignIn': 'உள்நுழைவிற்கு திரும்பவும்',
    'registration.submitAnother': 'மற்றொரு கோரிக்கையை சமர்ப்பிக்கவும்',
    'registration.testDataNotice':
      'சோதனை அடையாளங்களை மட்டும் பயன்படுத்தவும். இந்த நிலைப்படுத்தல் சூழல் உண்மையான நோயாளர், பணியாளர் அல்லது மருத்துவத் தரவுகளுக்காக அனுமதிக்கப்படவில்லை.',
    'registration.errorTenant': 'உங்கள் நிர்வாகி வழங்கிய நிறுவன ஸ்லக் மதிப்பைப் பயன்படுத்தவும்.',
    'registration.errorEmail': 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
    'registration.errorPassword': 'கடவுச்சொல் 15 முதல் 128 எழுத்துகளுக்குள் இருக்க வேண்டும்.',
    'registration.errorFirstName': '1 முதல் 100 எழுத்துகளுக்குள் முதல் பெயரை உள்ளிடவும்.',
    'registration.errorLastName': '1 முதல் 100 எழுத்துகளுக்குள் கடைசி பெயரை உள்ளிடவும்.',
    'registration.errorConfirmPassword': 'கடவுச்சொற்கள் பொருந்தவில்லை.',
    'registration.errorGeneric': 'பதிவு கோரிக்கையை செயல்படுத்த முடியவில்லை.',
  },
} as const;

export type TranslationKey = keyof (typeof messages)['en'];

export function isLocale(value: string | null): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function translate(locale: Locale, key: TranslationKey): string {
  return messages[locale][key];
}
