import { toCategoryPath, type ProductCategoryDto } from '@/api/product/model';
import { Model } from '@/lib/model/Model';

/** A stock row from `stock_view`, with the product's categories when `select` embeds them. */
export type StockDto = Partial<Views['stock_view']['Row']> & {
   product?: { category?: ProductCategoryDto[] | null } | null;
};

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface StockModel extends StockDto {}
export class StockModel extends Model<StockDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** The product's categories as the stock routes' `:category` param. */
   get categoryPath() {
      return toCategoryPath(this.product?.category);
   }
}
