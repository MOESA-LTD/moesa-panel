/**
 * Wraps a list of every value of a database enum: `allValues<Enums['x']>()(['a', 'b'] as const)`.
 * A value added to the enum later fails the typecheck at the array that forgot it.
 */
export const allValues =
   <U extends string>() =>
   <const A extends readonly U[]>(
      values: A &
         ([Exclude<U, A[number]>] extends [never] ? unknown : { missing: Exclude<U, A[number]> })
   ): A =>
      values;
