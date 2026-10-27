import { Model } from '@/lib/model/Model';

export type AddressDto = Tables['address']['Row'];

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface AddressModel extends AddressDto {}
export class AddressModel extends Model<AddressDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** One line, most specific part first: "Details, District, City, Country". */
   get fullAddress() {
      return [this.details, this.district, this.city, this.country].filter(Boolean).join(', ');
   }
}
