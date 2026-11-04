/**
 * The S09 §C arithmetic of a purchase order, as the database does it (private.purchase_order_figures
 * in 030_purchase_order_rules.sql): subtotal = round(Σ quantity × unit price, 2); total = subtotal
 * + extra − discount; deposit = round(total × deposit rate / 100, 2); balance = total − deposit.
 *
 * Every figure is counted in integer units (BigInt): unit prices at scale 4, money at scale 2, the
 * rate at scale 2. A decimal is parsed from its string, never multiplied as a float, and rounded
 * half away from zero like PostgreSQL's round(numeric).
 */

const PRICE_SCALE = 4;
const MONEY_SCALE = 2;
const RATE_SCALE = 2;

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

/** `value` as an integer count of 10^-scale, the digits beyond the scale rounded half away from zero. */
function unitsOf(value: number | string, scale: number): bigint {
   const text = String(value).trim();
   const match = DECIMAL.exec(text);
   if (!match || !(match[2] || match[3])) throw new RangeError(`Not a decimal: "${text}"`);

   const [, sign, whole = '', fraction = '', exponent = '0'] = match;
   const digits = whole + fraction;
   // value × 10^scale = digits × 10^shift
   const shift = Number(exponent) - fraction.length + scale;

   let units: bigint;
   if (shift >= 0) units = BigInt(digits || '0') * 10n ** BigInt(shift);
   else {
      const kept = digits.length + shift;
      // The first digit dropped decides; before the kept ones it is a leading zero.
      const dropped = kept >= 0 ? (digits[kept] ?? '0') : '0';
      units = BigInt(digits.slice(0, Math.max(kept, 0)) || '0') + (dropped >= '5' ? 1n : 0n);
   }
   return sign === '-' ? -units : units;
}

/** A decimal as an integer count of 10^-scale (e.g. '1.9000' at scale 4 → 19000). */
export const toUnits = (value: number | string, scale: number): number =>
   Number(unitsOf(value, scale));

/** `dividend / divisor`, rounded half away from zero. */
function divideRounded(dividend: bigint, divisor: bigint): bigint {
   const quotient = dividend / divisor;
   const remainder = dividend % divisor;
   const twice = (remainder < 0n ? -remainder : remainder) * 2n;
   if (twice < divisor) return quotient;
   return dividend < 0n ? quotient - 1n : quotient + 1n;
}

/** Cents as an amount: the division is the closest double to the exact decimal. */
const toAmount = (cents: bigint) => Number(cents) / 100;

export type FigureLine = {
   quantity: number;
   unit_price: number | string;
   pi_line_total?: number | string | null;
   /** What the PI comparison shows for the line, e.g. its SKU. */
   label?: string;
};

export type FigureTerms = {
   deposit_rate: number | string;
   pi_extra_amount: number | string;
   pi_discount_amount: number | string;
};

export type Figures = { subtotal: number; total: number; deposit: number; balance: number };

type FigureCents = { [K in keyof Figures]: bigint };

/** A line's total in cents: round(quantity × unit price, 2). */
const lineCents = ({ quantity, unit_price }: FigureLine) =>
   divideRounded(BigInt(quantity) * unitsOf(unit_price, PRICE_SCALE), 100n);

function figureCents(lines: readonly FigureLine[], terms: FigureTerms): FigureCents {
   // The subtotal rounds the sum, as the database does, not the sum of rounded lines.
   const exact = lines.reduce(
      (sum, { quantity, unit_price }) => sum + BigInt(quantity) * unitsOf(unit_price, PRICE_SCALE),
      0n
   );
   const subtotal = divideRounded(exact, 10n ** BigInt(PRICE_SCALE - MONEY_SCALE));
   const total =
      subtotal +
      unitsOf(terms.pi_extra_amount, MONEY_SCALE) -
      unitsOf(terms.pi_discount_amount, MONEY_SCALE);
   // total (cents) × rate (hundredths of a percent) / 100 (percent) / 100 (rate scale).
   const deposit = divideRounded(
      total * unitsOf(terms.deposit_rate, RATE_SCALE),
      100n * 10n ** BigInt(RATE_SCALE)
   );
   return { subtotal, total, deposit, balance: total - deposit };
}

/** The order's figures by S09 §C (see the top of this file). */
export function purchaseOrderFigures(lines: readonly FigureLine[], terms: FigureTerms): Figures {
   const { subtotal, total, deposit, balance } = figureCents(lines, terms);
   return {
      subtotal: toAmount(subtotal),
      total: toAmount(total),
      deposit: toAmount(deposit),
      balance: toAmount(balance)
   };
}

/** The figures typed in from the PI (the order's pi_* columns). */
export type PiEntered = {
   pi_subtotal: number | null;
   pi_total: number | null;
   pi_deposit_amount: number | null;
   pi_balance_amount: number | null;
   pi_extra_amount: number;
   pi_discount_amount: number;
};

export type PiRow = {
   key: 'line' | 'subtotal' | 'extra' | 'discount' | 'total' | 'deposit' | 'balance';
   label?: string;
   system: number | null;
   pi: number | null;
   diff: number | null;
};

/**
 * The PI check (S09 §C): one row per line (its rounded total against its PI line total), then the
 * subtotal, extra, discount, total, deposit and balance. The extra and discount are what the PI
 * says, on both sides; the system figures use them. `diff` is PI − system, null without a PI
 * figure. `matches` is the arithmetic half of rule 6 of purchase_order_guard: the four totals are
 * filled in and equal, and so is every line total that is filled in.
 */
export function piDifferences(
   lines: readonly FigureLine[],
   terms: FigureTerms,
   entered: PiEntered
): { rows: PiRow[]; matches: boolean } {
   const figures = figureCents(lines, {
      ...terms,
      pi_extra_amount: entered.pi_extra_amount,
      pi_discount_amount: entered.pi_discount_amount
   });

   let matches = true;
   const row = (
      key: PiRow['key'],
      system: bigint,
      pi: number | string | null | undefined,
      required: boolean,
      label?: string
   ): PiRow => {
      const piCents = pi === null || pi === undefined ? null : unitsOf(pi, MONEY_SCALE);
      if (piCents === null ? required : piCents !== system) matches = false;
      return {
         key,
         ...(label === undefined ? {} : { label }),
         system: toAmount(system),
         pi: piCents === null ? null : toAmount(piCents),
         diff: piCents === null ? null : toAmount(piCents - system)
      };
   };

   const extra = unitsOf(entered.pi_extra_amount, MONEY_SCALE);
   const discount = unitsOf(entered.pi_discount_amount, MONEY_SCALE);
   const rows = [
      ...lines.map((line) => row('line', lineCents(line), line.pi_line_total, false, line.label)),
      row('subtotal', figures.subtotal, entered.pi_subtotal, true),
      row('extra', extra, entered.pi_extra_amount, true),
      row('discount', discount, entered.pi_discount_amount, true),
      row('total', figures.total, entered.pi_total, true),
      row('deposit', figures.deposit, entered.pi_deposit_amount, true),
      row('balance', figures.balance, entered.pi_balance_amount, true)
   ];
   return { rows, matches };
}
