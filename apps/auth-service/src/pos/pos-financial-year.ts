const INDIA_TIME_ZONE = 'Asia/Kolkata';

export function indianFinancialYear(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid POS financial-year timestamp');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Unable to resolve India financial year');
  }

  const startYear = month >= 4 ? year : year - 1;
  return String(startYear) + '-' + String((startYear + 1) % 100).padStart(2, '0');
}
