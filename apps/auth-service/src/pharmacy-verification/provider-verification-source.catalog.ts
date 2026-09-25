export type VerificationSourceRequirement = 'PRIMARY' | 'SUPPORTING' | 'CONDITIONAL';
export type VerificationSourceMode = 'PORTAL_LOOKUP' | 'OFFICIAL_DIRECTORY';

export interface ProviderVerificationSource {
  readonly id: string;
  readonly authority: string;
  readonly label: string;
  readonly officialUrl: string;
  readonly requirement: VerificationSourceRequirement;
  readonly mode: VerificationSourceMode;
  readonly purpose:
    | 'FACILITY_REGISTRY'
    | 'PREMISES_LICENCE'
    | 'PROFESSIONAL_REGISTRATION'
    | 'CLINICAL_ESTABLISHMENT_REGISTRATION'
    | 'ACCREDITATION'
    | 'TAX_IDENTITY'
    | 'LEGAL_ENTITY_IDENTITY';
  readonly limitation: string;
}

export interface ProviderVerificationSourceResolution {
  readonly sources: readonly ProviderVerificationSource[];
  readonly jurisdictionReviewRequired: boolean;
  readonly jurisdictionNote: string | null;
}

const INDIA_ALIASES = new Set(['india', 'in', 'ind', 'bharat']);
const TAMIL_NADU_ALIASES = new Set(['tamil nadu', 'tamilnadu', 'tn']);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function isIndia(country: string): boolean {
  return INDIA_ALIASES.has(normalize(country));
}

function isTamilNadu(state: string): boolean {
  return TAMIL_NADU_ALIASES.has(normalize(state));
}

const HFR: ProviderVerificationSource = {
  id: 'INDIA_ABDM_HFR',
  authority: 'National Health Authority — Ayushman Bharat Digital Mission',
  label: 'ABDM Health Facility Registry (HFR)',
  officialUrl: 'https://facility.abdm.gov.in/',
  requirement: 'SUPPORTING',
  mode: 'PORTAL_LOOKUP',
  purpose: 'FACILITY_REGISTRY',
  limitation:
    'Supporting facility-identity evidence only. HFR enrolment does not replace the statutory licence or registration required to provide healthcare services.',
};

const HPR: ProviderVerificationSource = {
  id: 'INDIA_ABDM_HPR',
  authority: 'National Health Authority — Ayushman Bharat Digital Mission',
  label: 'ABDM Healthcare Professionals Registry (HPR)',
  officialUrl: 'https://hpr.abdm.gov.in/',
  requirement: 'SUPPORTING',
  mode: 'PORTAL_LOOKUP',
  purpose: 'PROFESSIONAL_REGISTRATION',
  limitation:
    'Supporting digital-health identity evidence only. Use the applicable statutory professional council/register as the primary registration authority.',
};

const NMC_IMR: ProviderVerificationSource = {
  id: 'INDIA_NMC_IMR',
  authority: 'National Medical Commission',
  label: 'Indian Medical Register (IMR)',
  officialUrl: 'https://www.nmc.org.in/information-desk/indian-medical-register/',
  requirement: 'PRIMARY',
  mode: 'PORTAL_LOOKUP',
  purpose: 'PROFESSIONAL_REGISTRATION',
  limitation:
    'Primary doctor-registration lookup. Where the record points to a State Medical Council, the reviewer may also need to confirm current state-council status.',
};

const PCI_STATE_COUNCILS: ProviderVerificationSource = {
  id: 'INDIA_PCI_STATE_PHARMACY_COUNCILS',
  authority: 'Pharmacy Council of India',
  label: 'State Pharmacy Council directory',
  officialUrl: 'https://www.pci.gov.in/en/state-pharmacy-council-list/',
  requirement: 'PRIMARY',
  mode: 'OFFICIAL_DIRECTORY',
  purpose: 'PROFESSIONAL_REGISTRATION',
  limitation:
    'PCI provides the official State Pharmacy Council directory. Pharmacist registration is maintained by the applicable State Pharmacy Council, not by AIM.',
};

const TAMIL_NADU_PHARMACY_COUNCIL: ProviderVerificationSource = {
  id: 'INDIA_TN_PHARMACY_COUNCIL',
  authority: 'Tamil Nadu Pharmacy Council',
  label: 'Tamil Nadu Pharmacy Council',
  officialUrl: 'https://tnpc.ac.in/',
  requirement: 'PRIMARY',
  mode: 'PORTAL_LOOKUP',
  purpose: 'PROFESSIONAL_REGISTRATION',
  limitation:
    'Use for Tamil Nadu pharmacist registration evidence. This does not replace the pharmacy premises/drug-sale licence.',
};

const CDSCO_STATE_DRUG_CONTROL: ProviderVerificationSource = {
  id: 'INDIA_CDSCO_STATE_DRUG_CONTROL',
  authority: 'Central Drugs Standard Control Organisation',
  label: 'State Drugs Control authority directory',
  officialUrl: 'https://cdsco.gov.in/opencms/opencms/en/State-Drugs-Control/',
  requirement: 'PRIMARY',
  mode: 'OFFICIAL_DIRECTORY',
  purpose: 'PREMISES_LICENCE',
  limitation:
    'Use the directory to reach the competent State/UT licensing authority for the pharmacy premises/drug-sale licence.',
};

const TAMIL_NADU_DRUGS_CONTROL: ProviderVerificationSource = {
  id: 'INDIA_TN_DRUGS_CONTROL',
  authority: 'Tamil Nadu Food Safety & Drugs Administration — Drugs Control',
  label: 'Tamil Nadu Drugs Control — drug sales licensing',
  officialUrl: 'https://drugscontrol.tn.gov.in/sales_services.html',
  requirement: 'PRIMARY',
  mode: 'PORTAL_LOOKUP',
  purpose: 'PREMISES_LICENCE',
  limitation:
    'Primary Tamil Nadu source for retail/wholesale drug-sale licensing. Verify the licence against the competent Drugs Control authority; do not infer validity from HFR or GST.',
};

const CENTRAL_CLINICAL_ESTABLISHMENTS: ProviderVerificationSource = {
  id: 'INDIA_CEA_NATIONAL_REGISTER',
  authority: 'Ministry of Health & Family Welfare — Clinical Establishments Division',
  label: 'Clinical Establishments National Register',
  officialUrl: 'https://clinicalestablishments.mohfw.gov.in/portal/cerrs/national-register',
  requirement: 'CONDITIONAL',
  mode: 'PORTAL_LOOKUP',
  purpose: 'CLINICAL_ESTABLISHMENT_REGISTRATION',
  limitation:
    'Use only where the Clinical Establishments (Registration and Regulation) Act applies in the provider jurisdiction. State-specific law/registration may apply instead.',
};

const TAMIL_NADU_CLINICAL_ESTABLISHMENTS: ProviderVerificationSource = {
  id: 'INDIA_TN_CLINICAL_ESTABLISHMENTS',
  authority: 'Directorate of Medical and Rural Health Services, Tamil Nadu',
  label: 'Tamil Nadu Clinical Establishments',
  officialUrl: 'https://www.tnhealth.org/dms/tncea/Others_upload.php',
  requirement: 'PRIMARY',
  mode: 'PORTAL_LOOKUP',
  purpose: 'CLINICAL_ESTABLISHMENT_REGISTRATION',
  limitation:
    'Primary Tamil Nadu clinical-establishment registration source. Tamil Nadu uses its State clinical-establishment framework rather than relying on the Central Act register.',
};

const NABL: ProviderVerificationSource = {
  id: 'INDIA_NABL',
  authority: 'National Accreditation Board for Testing and Calibration Laboratories',
  label: 'NABL Accredited Laboratory Search',
  officialUrl: 'https://nabl-india.org/',
  requirement: 'SUPPORTING',
  mode: 'PORTAL_LOOKUP',
  purpose: 'ACCREDITATION',
  limitation:
    'Accreditation/quality evidence only. NABL accreditation does not by itself replace statutory facility registration or other required licences.',
};

const GST: ProviderVerificationSource = {
  id: 'INDIA_GST_SEARCH_TAXPAYER',
  authority: 'Goods and Services Tax Network',
  label: 'GST Search Taxpayer',
  officialUrl: 'https://services.gst.gov.in/services/quicklinks/searchtxp',
  requirement: 'CONDITIONAL',
  mode: 'PORTAL_LOOKUP',
  purpose: 'TAX_IDENTITY',
  limitation:
    'Use only when a GSTIN is supplied or legally relevant. GST registration proves tax/business identity, not healthcare licensure.',
};

const MCA: ProviderVerificationSource = {
  id: 'INDIA_MCA_MASTER_DATA',
  authority: 'Ministry of Corporate Affairs',
  label: 'MCA Company / LLP Master Data',
  officialUrl: 'https://www.mca.gov.in/',
  requirement: 'CONDITIONAL',
  mode: 'PORTAL_LOOKUP',
  purpose: 'LEGAL_ENTITY_IDENTITY',
  limitation:
    'Use when the provider is a company or LLP. MCA master data proves legal-entity identity, not healthcare licensure.',
};

function businessIdentitySources(): readonly ProviderVerificationSource[] {
  return [GST, MCA];
}

function facilityIdentitySources(): readonly ProviderVerificationSource[] {
  return [HFR];
}

function clinicalEstablishmentSources(state: string): readonly ProviderVerificationSource[] {
  if (isTamilNadu(state)) return [TAMIL_NADU_CLINICAL_ESTABLISHMENTS];
  return [CENTRAL_CLINICAL_ESTABLISHMENTS];
}

function pharmacySources(state: string): readonly ProviderVerificationSource[] {
  const statutory = isTamilNadu(state)
    ? [TAMIL_NADU_DRUGS_CONTROL, TAMIL_NADU_PHARMACY_COUNCIL]
    : [CDSCO_STATE_DRUG_CONTROL, PCI_STATE_COUNCILS];
  return [...statutory, ...facilityIdentitySources(), ...businessIdentitySources()];
}

function clinicalFacilitySources(
  providerType: 'HOSPITAL' | 'CLINIC' | 'LABORATORY',
  state: string,
): readonly ProviderVerificationSource[] {
  return [
    ...clinicalEstablishmentSources(state),
    ...facilityIdentitySources(),
    ...(providerType === 'LABORATORY' ? [NABL] : []),
    ...businessIdentitySources(),
  ];
}

export function resolveProviderVerificationSources(input: {
  readonly providerType: string;
  readonly country: string;
  readonly state: string;
}): ProviderVerificationSourceResolution {
  if (!isIndia(input.country)) {
    return {
      sources: [],
      jurisdictionReviewRequired: true,
      jurisdictionNote:
        'No official source catalogue is configured for this country. A platform reviewer must select and document the applicable statutory authority before approval.',
    };
  }

  if (input.providerType === 'DOCTOR') {
    return {
      sources: [NMC_IMR, HPR],
      jurisdictionReviewRequired: false,
      jurisdictionNote: null,
    };
  }

  if (input.providerType === 'PHARMACY') {
    return {
      sources: pharmacySources(input.state),
      jurisdictionReviewRequired: false,
      jurisdictionNote: null,
    };
  }

  if (
    input.providerType === 'HOSPITAL' ||
    input.providerType === 'CLINIC' ||
    input.providerType === 'LABORATORY'
  ) {
    const tamilNadu = isTamilNadu(input.state);
    return {
      sources: clinicalFacilitySources(input.providerType, input.state),
      jurisdictionReviewRequired: !tamilNadu,
      jurisdictionNote: tamilNadu
        ? null
        : 'Confirm whether the Central Clinical Establishments Act applies in this State/UT. If not, use the competent State/UT clinical-establishment authority before approval.',
    };
  }

  return {
    sources: [],
    jurisdictionReviewRequired: true,
    jurisdictionNote:
      'This provider type does not yet have an accepted official-source catalogue. Manual jurisdiction review is required before approval.',
  };
}
