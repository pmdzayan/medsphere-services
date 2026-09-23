export interface PosLineMoneyInput {
  readonly unitPrice: string;
  readonly quantity: number;
  readonly discountPercentage: string;
  readonly gstPercentage: string;
  readonly cessPercentage: string;
  readonly pricesIncludeTax: boolean;
  readonly collectGst: boolean;
  readonly intraState: boolean;
}

export interface PosLineMoneyResult {
  readonly unitPrice: string;
  readonly grossValue: string;
  readonly discountAmount: string;
  readonly taxableValue: string;
  readonly cgstAmount: string;
  readonly sgstAmount: string;
  readonly igstAmount: string;
  readonly cessAmount: string;
  readonly lineTotal: string;
}

export function calculatePosLineMoney(input: PosLineMoneyInput): PosLineMoneyResult {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new Error('POS quantity must be a positive safe integer');
  }

  const unitPrice = parseMoneyToPaise(input.unitPrice);
  const discountBp = parsePercentageToBasisPoints(input.discountPercentage);
  const gstBp = parsePercentageToBasisPoints(input.gstPercentage);
  const cessBp = parsePercentageToBasisPoints(input.cessPercentage);

  const gross = unitPrice * BigInt(input.quantity);
  const discount = divideRoundHalfUp(gross * discountBp, 10000n);
  const net = gross - discount;
  if (net < 0n) throw new Error('POS discount exceeds gross value');

  let taxable = net;
  let gst = 0n;
  let cess = 0n;
  let lineTotal = net;

  if (input.collectGst) {
    if (input.pricesIncludeTax) {
      const divisor = 10000n + gstBp + cessBp;
      taxable = divideRoundHalfUp(net * 10000n, divisor);
      cess = divideRoundHalfUp(taxable * cessBp, 10000n);
      gst = net - taxable - cess;
      if (gst < 0n) throw new Error('POS inclusive-tax rounding is invalid');
      lineTotal = net;
    } else {
      taxable = net;
      gst = divideRoundHalfUp(taxable * gstBp, 10000n);
      cess = divideRoundHalfUp(taxable * cessBp, 10000n);
      lineTotal = taxable + gst + cess;
    }
  }

  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  if (input.collectGst) {
    if (input.intraState) {
      cgst = gst / 2n;
      sgst = gst - cgst;
    } else {
      igst = gst;
    }
  }

  return {
    unitPrice: formatPaise(unitPrice),
    grossValue: formatPaise(gross),
    discountAmount: formatPaise(discount),
    taxableValue: formatPaise(taxable),
    cgstAmount: formatPaise(cgst),
    sgstAmount: formatPaise(sgst),
    igstAmount: formatPaise(igst),
    cessAmount: formatPaise(cess),
    lineTotal: formatPaise(lineTotal),
  };
}

export function sumMoney(values: readonly string[]): string {
  return formatPaise(values.reduce((total, value) => total + parseMoneyToPaise(value), 0n));
}

export function compareMoney(left: string, right: string): number {
  const a = parseMoneyToPaise(left);
  const b = parseMoneyToPaise(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function subtractMoney(left: string, right: string): string {
  const result = parseMoneyToPaise(left) - parseMoneyToPaise(right);
  if (result < 0n) throw new Error('POS money subtraction cannot be negative');
  return formatPaise(result);
}

export function parseMoneyToPaise(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Invalid POS money value');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function parsePercentageToBasisPoints(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Invalid POS percentage');
  }
  const [whole, fraction = ''] = normalized.split('.');
  const bp = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (bp > 10000n) throw new Error('POS percentage exceeds 100%');
  return bp;
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Invalid POS rounding denominator');
  return (numerator + denominator / 2n) / denominator;
}

function formatPaise(value: bigint): string {
  if (value < 0n) throw new Error('POS money cannot be negative');
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}
