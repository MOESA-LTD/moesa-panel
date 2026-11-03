/**
 * Whether `gtin` is a GTIN-8, -12, -13 or -14 with a valid GS1 mod-10 check digit: the other
 * digits are weighted 3, 1, 3, … from the right. The same check as private.gtin_valid.
 */
export function gtinValid(gtin: string): boolean {
   if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return false;

   const digits = [...gtin].map(Number);
   const check = digits.pop()!;
   const sum = digits
      .reverse()
      .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
   return (10 - (sum % 10)) % 10 === check;
}
