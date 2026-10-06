// Shops are in India; day boundaries for reports use IST unless a client
// passes another offset.
export const DEFAULT_TZ_OFFSET_MINUTES = 330;

/// Start of the local day for a YYYY-MM-DD string, as a UTC Date.
export function dayStart(date: string, offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60_000);
}

/// YYYY-MM-DD of a UTC instant in the shop's local time.
export function localDay(at: Date, offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): string {
  return new Date(at.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function todayLocal(offsetMinutes = DEFAULT_TZ_OFFSET_MINUTES): string {
  return localDay(new Date(), offsetMinutes);
}
