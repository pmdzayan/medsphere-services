import { resolveProviderVerificationSources } from './provider-verification-source.catalog';

describe('provider verification official-source catalogue', () => {
  it('requires both Tamil Nadu pharmacy statutory sources and keeps supporting identity sources separate', () => {
    const result = resolveProviderVerificationSources({
      providerType: 'PHARMACY',
      country: 'India',
      state: 'Tamil Nadu',
    });

    expect(result.jurisdictionReviewRequired).toBe(false);
    expect(result.sources.map((source) => source.id)).toEqual([
      'INDIA_TN_DRUGS_CONTROL',
      'INDIA_TN_PHARMACY_COUNCIL',
      'INDIA_ABDM_HFR',
      'INDIA_GST_SEARCH_TAXPAYER',
      'INDIA_MCA_MASTER_DATA',
    ]);
    expect(
      result.sources
        .filter((source) => source.requirement === 'PRIMARY')
        .map((source) => source.id),
    ).toEqual(['INDIA_TN_DRUGS_CONTROL', 'INDIA_TN_PHARMACY_COUNCIL']);
  });

  it('uses NMC as the primary doctor register and HPR only as supporting evidence', () => {
    const result = resolveProviderVerificationSources({
      providerType: 'DOCTOR',
      country: 'IN',
      state: 'Tamil Nadu',
    });

    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'INDIA_NMC_IMR', requirement: 'PRIMARY' }),
        expect.objectContaining({ id: 'INDIA_ABDM_HPR', requirement: 'SUPPORTING' }),
      ]),
    );
    expect(result.sources.some((source) => source.id === 'INDIA_ABDM_HFR')).toBe(false);
  });

  it('uses the Tamil Nadu clinical-establishment authority for hospitals instead of the Central register', () => {
    const result = resolveProviderVerificationSources({
      providerType: 'HOSPITAL',
      country: 'India',
      state: 'TN',
    });

    expect(result.jurisdictionReviewRequired).toBe(false);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'INDIA_TN_CLINICAL_ESTABLISHMENTS',
          requirement: 'PRIMARY',
        }),
        expect.objectContaining({ id: 'INDIA_ABDM_HFR', requirement: 'SUPPORTING' }),
      ]),
    );
    expect(result.sources.some((source) => source.id === 'INDIA_CEA_NATIONAL_REGISTER')).toBe(
      false,
    );
  });

  it('adds NABL as supporting accreditation evidence for laboratories, never as the statutory licence', () => {
    const result = resolveProviderVerificationSources({
      providerType: 'LABORATORY',
      country: 'India',
      state: 'Tamil Nadu',
    });

    const nabl = result.sources.find((source) => source.id === 'INDIA_NABL');
    expect(nabl).toMatchObject({
      requirement: 'SUPPORTING',
      purpose: 'ACCREDITATION',
    });
    expect(
      result.sources.some(
        (source) =>
          source.id === 'INDIA_TN_CLINICAL_ESTABLISHMENTS' && source.requirement === 'PRIMARY',
      ),
    ).toBe(true);
  });

  it('fails closed to jurisdiction review for non-India providers instead of inventing an authority', () => {
    const result = resolveProviderVerificationSources({
      providerType: 'PHARMACY',
      country: 'United Arab Emirates',
      state: 'Dubai',
    });

    expect(result.sources).toEqual([]);
    expect(result.jurisdictionReviewRequired).toBe(true);
    expect(result.jurisdictionNote).toMatch(/No official source catalogue/);
  });

  it('only emits HTTPS official-source URLs from the controlled catalogue', () => {
    const providerTypes = ['PHARMACY', 'HOSPITAL', 'CLINIC', 'LABORATORY', 'DOCTOR'];

    for (const providerType of providerTypes) {
      const result = resolveProviderVerificationSources({
        providerType,
        country: 'India',
        state: 'Tamil Nadu',
      });
      for (const source of result.sources) {
        expect(source.officialUrl).toMatch(/^https:\/\//);
        expect(source.officialUrl).not.toContain('javascript:');
        expect(source.officialUrl).not.toContain('data:');
      }
    }
  });
});
