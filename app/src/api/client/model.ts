import { AddressModel, type AddressDto } from '@/api/address/model';
import { Model, toModel } from '@/lib/model/Model';
import dayjs from 'dayjs';

/** A client as the API returns it; `address` is present when the query embeds it. */
export type ClientDto = Tables['client']['Row'] & { address?: AddressDto[] | null };

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface ClientModel extends Omit<ClientDto, 'address'> {}
export class ClientModel extends Model<ClientDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   declare address?: AddressModel[] | null;

   constructor(dto: ClientDto) {
      super(dto);
      if (dto.address !== undefined) this.address = toModel(AddressModel, dto.address);
   }

   /** Age in whole years, or null without a birth date. */
   get age(): number | null {
      return this.birth_date ? dayjs().diff(this.birth_date, 'year') : null;
   }

   /** The first linked address; clients usually have one. */
   get primaryAddress(): AddressModel | null {
      return this.address?.[0] ?? null;
   }
}
