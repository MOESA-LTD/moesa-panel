import { Model } from '@/lib/model/Model';

/**
 * A user as the api returns it. `display_name` is the api's computed field (select it as
 * `*, display_name`): it stays readable when the email and metadata are masked.
 */
export type UserDto = Tables['user']['Row'] & { display_name?: string | null };

/** What the app keeps in a user's `user_metadata`. */
type UserMetadata = { display_name?: string | null } | null;

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface UserModel extends UserDto {}
export class UserModel extends Model<UserDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** The name the user chose, or their email until they do (empty when both are masked). */
   get displayName(): string {
      return (
         this.display_name || (this.user_metadata as UserMetadata)?.display_name || this.email || ''
      );
   }
}
