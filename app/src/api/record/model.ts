import { Model } from '@/lib/model/Model';
import type { RecordWithRelations } from './index';

/** A record with the stock and client that the list and the form embed. */
export type RecordDto = RecordWithRelations;

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface RecordModel extends RecordDto {}
export class RecordModel extends Model<RecordDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** The client's name, or their email when the name is empty. */
   get clientName(): string | null {
      return this.client?.display_name || this.client?.email || null;
   }

   /** The bid in the record's currency, formatted for the current locale. */
   get bidText(): string {
      const bid = Number(this.bid ?? 0);
      return this.currency_code
         ? bid.toLocaleString(undefined, { style: 'currency', currency: this.currency_code })
         : bid.toLocaleString();
   }
}
