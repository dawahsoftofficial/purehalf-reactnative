import {
  calcCompareAt,
  formatPerDayPrice,
  formatPriceAmount,
  parseStorePrice,
} from './price-format';

const pkr = {
  priceString: 'PKR4,900.00',
  pricePerMonthString: null,
  currencyCode: 'PKR',
  price: 4900,
  pricePerMonth: 4900,
};

describe('price-format', () => {
  it('parses store prices with thousands separators', () => {
    expect(parseStorePrice('PKR4,900.00')).toBe(4900);
    expect(parseStorePrice('PKR1,234,567.50')).toBe(1234567.5);
    expect(parseStorePrice('$19.99')).toBe(19.99);
    expect(parseStorePrice('')).toBe(0);
  });

  it('formats amounts with thousands separators and two decimals', () => {
    expect(formatPriceAmount(7350)).toBe('7,350.00');
    expect(formatPriceAmount(1234567.5)).toBe('1,234,567.50');
    expect(formatPriceAmount(19.99)).toBe('19.99');
    expect(formatPriceAmount(0.5)).toBe('0.50');
  });

  it('formats the compare-at price like the store sale price', () => {
    expect(calcCompareAt(pkr, 1.5)).toEqual({
      compareAtString: 'PKR7,350.00',
      savePct: 33,
    });
  });

  it('falls back to a currency symbol from the code', () => {
    expect(
      calcCompareAt(
        {
          ...pkr,
          priceString: '',
          currencyCode: 'USD',
          price: 10,
          pricePerMonth: 10,
        },
        1.5
      ).compareAtString
    ).toBe('$15.00');
  });

  it('returns nothing without a multiplier or price', () => {
    expect(calcCompareAt(pkr, 0)).toEqual({ compareAtString: '', savePct: 0 });
    expect(
      calcCompareAt(
        { ...pkr, priceString: '', price: 0, pricePerMonth: 0 },
        1.5
      )
    ).toEqual({ compareAtString: '', savePct: 0 });
  });

  it('formats the per-day price', () => {
    expect(formatPerDayPrice(pkr, 4900)).toBe('PKR163.33/day');
    expect(formatPerDayPrice(pkr, 0)).toBe('');
  });
});
