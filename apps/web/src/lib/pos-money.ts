export interface PosPreviewMoneyInput {
  unitPrice: string;
  quantity: number;
  discountPercentage: string;
  gstPercentage: string;
  cessPercentage: string;
  pricesIncludeTax: boolean;
  collectGst: boolean;
  intraState: boolean;
}

export interface PosPreviewMoney {
  grossValue: string;
  discountAmount: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  cessAmount: string;
  lineTotal: string;
}

/**
 * Counter-only preview using the same integer-paise rules as the auth-service.
 * The server recomputes every amount during checkout and is the authority.
 */
export function calculatePosPreviewMoney(input: PosPreviewMoneyInput): PosPreviewMoney {
  const unitPrice = parseMoneyToPaise(input.unitPrice);
  const discountBp = parsePercentageToBasisPoints(input.discountPercentage);
  const gstBp = parsePercentageToBasisPoints(input.gstPercentage);
  const cessBp = parsePercentageToBasisPoints(input.cessPercentage);
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new Error('Invalid POS preview quantity');
  }
  const gross = unitPrice * BigInt(input.quantity);
  const discount = round(gross * discountBp, 10000n);
  const net = gross - discount;
  let taxable = net;
  let gst = 0n;
  let cess = 0n;
  let total = net;
  if (input.collectGst) {
    if (input.pricesIncludeTax) {
      const divisor = 10000n + gstBp + cessBp;
      taxable = round(net * 10000n, divisor);
      cess = round(taxable * cessBp, 10000n);
      gst = net - taxable - cess;
    } else {
      gst = round(taxable * gstBp, 10000n);
      cess = round(taxable * cessBp, 10000n);
      total = taxable + gst + cess;
    }
  }
  const cgst = input.collectGst && input.intraState ? gst / 2n : 0n;
  const sgst = input.collectGst && input.intraState ? gst - cgst : 0n;
  const igst = input.collectGst && !input.intraState ? gst : 0n;
  return {
    grossValue: format(gross),
    discountAmount: format(discount),
    taxableValue: format(taxable),
    cgstAmount: format(cgst),
    sgstAmount: format(sgst),
    igstAmount: format(igst),
    cessAmount: format(cess),
    lineTotal: format(total),
  };
}

export function sumPosMoney(values: readonly string[]): string {
  return format(values.reduce((total, value) => total + parseMoneyToPaise(value), 0n));
}

function parseMoneyToPaise(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid money');
  const [whole, fraction=''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
}
function parsePercentageToBasisPoints(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid percentage');
  const [whole, fraction=''] = value.split('.');
  const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if (result>10000n) throw new Error('Percentage exceeds 100');
  return result;
}
function round(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}
function format(value: bigint): string {
  return String(value/100n)+'.'+String(value%100n).padStart(2,'0');
}
