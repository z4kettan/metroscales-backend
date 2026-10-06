/// Normalise a MAC typed in any common form ("00:23:f0:1a:97:40",
/// "00-23-F0-1A-97-40", "0023F01A9740") to 12 upper-case hex digits.
export function normalizeMac(input: string): string | null {
  const hex = (input ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return hex.length === 12 ? hex : null;
}
