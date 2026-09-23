import { indianFinancialYear } from './pos-financial-year';

describe('Task 0043 India financial-year boundary', () => {
  it('uses India Standard Time rather than UTC at the April boundary', () => {
    expect(indianFinancialYear(new Date('2027-03-31T18:29:59.999Z'))).toBe('2026-27');
    expect(indianFinancialYear(new Date('2027-03-31T18:30:00.000Z'))).toBe('2027-28');
  });

  it('keeps January through March in the preceding India financial year', () => {
    expect(indianFinancialYear(new Date('2027-01-15T12:00:00.000Z'))).toBe('2026-27');
  });
});
