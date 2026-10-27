/**
 * Models wrap the rows the API returns (DTOs) and add what the rows do not carry: derived values
 * (getters) and behaviour (methods).
 *
 * - Columns are copied onto the instance as own properties.
 * - Derived values are getters on the prototype. Read through a reactive proxy (a form, query
 *   data) they track the columns they use, so they behave like computed properties. Being on the
 *   prototype, they are never part of `{ ...model }`, `toDto()` or a payload.
 * - Relations embedded in the DTO (`select('*, address(*)')`) are mapped to their own models in
 *   the subclass constructor.
 *
 * Declare the columns with interface merging instead of class fields: a class field would be
 * re-initialised after the constructor and wipe the copied value.
 *
 * @example
 * export interface ClientModel extends Omit<ClientDto, 'address'> {}
 * export class ClientModel extends Model<ClientDto> {
 *    declare address?: AddressModel[];
 *    constructor(dto: ClientDto) {
 *       super(dto);
 *       this.address = toModel(AddressModel, dto.address);
 *    }
 *    get age() { ... }
 * }
 */
export abstract class Model<Dto extends object> {
   constructor(dto: Dto) {
      Object.assign(this, dto);
   }

   /** The plain DTO again: own properties only, nested models included. */
   toDto(): Dto {
      return Object.fromEntries(
         Object.entries(this).map(([key, value]) => [key, toDtoValue(value)])
      ) as Dto;
   }
}

const toDtoValue = (value: unknown): unknown => {
   if (value instanceof Model) return value.toDto();
   if (Array.isArray(value)) return value.map(toDtoValue);
   return value;
};

export type ModelClass<Dto extends object, M> = new (dto: Dto) => M;

/** The model shape of `data`: one model, a list of models, or null. */
export type Mapped<Data, M> = Data extends readonly unknown[]
   ? M[]
   : Data extends null | undefined
     ? null
     : M;

/**
 * Maps API data to models. A single row (`.single()`, `.maybeSingle()`) becomes a model, a list
 * becomes a list of models, and no row stays null. Data that is already a model is kept.
 */
export function toModel<
   Dto extends object,
   M,
   Data extends Dto | readonly Dto[] | null | undefined
>(ModelClass: ModelClass<Dto, M>, data: Data): Mapped<Data, M> {
   const map = (dto: Dto) => (dto instanceof ModelClass ? (dto as M) : new ModelClass(dto));

   if (data == null) return null as Mapped<Data, M>;
   if (Array.isArray(data)) return data.map(map) as Mapped<Data, M>;
   return map(data as Dto) as Mapped<Data, M>;
}
