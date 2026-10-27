import { Model } from '@/lib/model/Model';

export type ProductCategoryDto = Pick<Tables['product_category']['Row'], 'id' | 'display_name'>;

/** A product as the list loads it: `categories` is embedded by `select`. */
export type ProductDto = Tables['product']['Row'] & { categories?: ProductCategoryDto[] | null };

/** Category names joined the way the `:categories` / `:category` route params expect them. */
export const toCategoryPath = (categories?: ProductCategoryDto[] | null) =>
   categories?.map(({ display_name }) => display_name).join('|') || undefined;

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface ProductModel extends ProductDto {}
export class ProductModel extends Model<ProductDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   get categoryPath() {
      return toCategoryPath(this.categories);
   }
}
