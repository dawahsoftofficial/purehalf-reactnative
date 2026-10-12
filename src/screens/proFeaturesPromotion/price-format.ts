import type { PurchasesStoreProduct } from 'react-native-purchases';

type PriceProduct = Pick<
  PurchasesStoreProduct,
  'priceString' | 'pricePerMonthString' | 'currencyCode' | 'price'
> & { pricePerMonth?: number | null };

const storePriceString = (product: PriceProduct) =>
  product.pricePerMonthString || product.priceString || '';

/** Numeric value of a store price string like "PKR4,900.00" or "$19.99". */
export function parseStorePrice(priceString: string): number {
  const parsed = parseFloat(priceString.replace(/[^\d.]/g, ''));
  return !isNaN(parsed) && parsed > 0 ? parsed : 0;
}

/** 7350 -> "7,350.00": two decimals with thousands separators. */
export function formatPriceAmount(amount: number): string {
  const [whole, fraction] = amount.toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/** Currency prefix from the store string, else derived from the code. */
function currencySymbolFor(product: PriceProduct): string {
  const currencyMatch = storePriceString(product).match(/^([^\d\s.,]+)/);
  const fromString = currencyMatch ? currencyMatch[1].trim() : '';
  if (fromString) return fromString;

  const currency = product.currencyCode || 'USD';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  return currency;
}

export function formatPerDayPrice(
  product: PriceProduct,
  pricePerMonth: number | null | undefined
) {
  if (!pricePerMonth || pricePerMonth <= 0) return '';

  // The store string is more reliable than the raw number across platforms.
  const numericPrice =
    parseStorePrice(storePriceString(product)) || pricePerMonth;
  const perDay = numericPrice / 30;

  return `${currencySymbolFor(product)}${formatPriceAmount(perDay)}/day`;
}

export function calcCompareAt(product: PriceProduct, multiplier: number) {
  if (!multiplier) return { compareAtString: '', savePct: 0 };

  // Extract the numeric value from the store string (more reliable than raw
  // price values, which can be in different units on different platforms).
  let base = parseStorePrice(storePriceString(product));

  // Fallback to raw price values if priceString parsing fails
  if (!base) {
    base = product.pricePerMonth ?? product.price ?? 0;
    // If the value seems too large (might be in cents/paise), divide by 100
    if (
      base > 10000 &&
      (product.currencyCode === 'PKR' || product.currencyCode === 'USD')
    ) {
      base = base / 100;
    }
  }

  if (!base) return { compareAtString: '', savePct: 0 };

  // Presentation-only compare-at
  const compareAt = Math.round(base * multiplier * 100) / 100;
  const savePct = Math.max(
    0,
    Math.round(((compareAt - base) / compareAt) * 100)
  );

  // Same shape as the store's sale price ("PKR4,900.00"), so the struck-
  // through price reads "PKR7,350.00" rather than "PKR7350.00".
  const compareAtString = `${currencySymbolFor(product)}${formatPriceAmount(compareAt)}`;

  return { compareAtString, savePct };
}
