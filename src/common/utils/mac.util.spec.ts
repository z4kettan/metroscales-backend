import { normalizeMac } from './mac.util';

describe('normalizeMac', () => {
  it('accepts the common MAC spellings', () => {
    expect(normalizeMac('00:23:f0:1a:97:40')).toBe('0023F01A9740');
    expect(normalizeMac('00-23-F0-1A-97-40')).toBe('0023F01A9740');
    expect(normalizeMac('0023F01A9740')).toBe('0023F01A9740');
  });

  it('rejects anything that is not 12 hex digits', () => {
    expect(normalizeMac('0023F01A97')).toBeNull();
    expect(normalizeMac('')).toBeNull();
    expect(normalizeMac('zz23F01A9740')).toBeNull();
  });
});
