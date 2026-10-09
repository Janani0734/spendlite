export interface Period {
  year: number;
  month: number;
}

// Missing year or month fall back to the current month, computed in UTC to match
// how expense dates are stored.
export function resolvePeriod(
  query: { year?: number | undefined; month?: number | undefined },
  now: Date = new Date(),
): Period {
  return {
    year: query.year ?? now.getUTCFullYear(),
    month: query.month ?? now.getUTCMonth() + 1,
  };
}

// Half-open date range [start, end) for one month, as YYYY-MM-DD strings.
export function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` };
}

export function previousMonth(period: Period): Period {
  return period.month === 1
    ? { year: period.year - 1, month: 12 }
    : { year: period.year, month: period.month - 1 };
}