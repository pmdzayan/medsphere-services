import {
  calculatePosLineMoney,
  compareMoney,
  parseMoneyToPaise,
  parsePercentageToBasisPoints,
  subtractMoney,
  sumMoney,
} from './pos-money';

describe('Task 0043 POS money and GST calculations', () => {
  it('extracts intra-state GST from a tax-inclusive retail price without losing paise', () => {
    expect(
      calculatePosLineMoney({
        unitPrice: '100.00',
        quantity: 2,
        discountPercentage: '0',
        gstPercentage: '5',
        cessPercentage: '0',
        pricesIncludeTax: true,
        collectGst: true,
        intraState: true,
      }),
    ).toEqual({
      unitPrice: '100.00',
      grossValue: '200.00',
      discountAmount: '0.00',
      taxableValue: '190.48',
      cgstAmount: '4.76',
      sgstAmount: '4.76',
      igstAmount: '0.00',
      cessAmount: '0.00',
      lineTotal: '200.00',
    });
  });

  it('adds inter-state GST to a tax-exclusive price', () => {
    expect(
      calculatePosLineMoney({
        unitPrice: '80.00',
        quantity: 1,
        discountPercentage: '0',
        gstPercentage: '5',
        cessPercentage: '0',
        pricesIncludeTax: false,
        collectGst: true,
        intraState: false,
      }),
    ).toMatchObject({
      taxableValue: '80.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      igstAmount: '4.00',
      lineTotal: '84.00',
    });
  });

  it('applies discount before extracting GST and conserves the inclusive total', () => {
    const result = calculatePosLineMoney({
      unitPrice: '112.00',
      quantity: 2,
      discountPercentage: '10',
      gstPercentage: '12',
      cessPercentage: '0',
      pricesIncludeTax: true,
      collectGst: true,
      intraState: true,
    });

    expect(result.grossValue).toBe('224.00');
    expect(result.discountAmount).toBe('22.40');
    expect(result.lineTotal).toBe('201.60');
    expect(sumMoney([result.taxableValue, result.cgstAmount, result.sgstAmount])).toBe(
      result.lineTotal,
    );
  });

  it('does not charge GST for composition or unregistered sale modes', () => {
    expect(
      calculatePosLineMoney({
        unitPrice: '100.00',
        quantity: 1,
        discountPercentage: '0',
        gstPercentage: '18',
        cessPercentage: '5',
        pricesIncludeTax: true,
        collectGst: false,
        intraState: true,
      }),
    ).toMatchObject({
      taxableValue: '100.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      igstAmount: '0.00',
      cessAmount: '0.00',
      lineTotal: '100.00',
    });
  });

  it('uses strict decimal parsing and exact paise arithmetic', () => {
    expect(parseMoneyToPaise('10.05')).toBe(1005n);
    expect(parsePercentageToBasisPoints('12.50')).toBe(1250n);
    expect(sumMoney(['1.10', '2.20', '3.30'])).toBe('6.60');
    expect(subtractMoney('10.00', '3.45')).toBe('6.55');
    expect(compareMoney('1.00', '1.00')).toBe(0);
    expect(compareMoney('1.00', '1.01')).toBe(-1);
  });

  it.each(['-1', '1.234', '01.00', 'NaN', 'Infinity', '10000000000.00'])(
    'rejects malformed money value %p',
    (value) => expect(() => parseMoneyToPaise(value)).toThrow(),
  );

  it.each(['-1', '100.01', '1.234', 'NaN'])('rejects malformed percentage %p', (value) =>
    expect(() => parsePercentageToBasisPoints(value)).toThrow(),
  );
});
