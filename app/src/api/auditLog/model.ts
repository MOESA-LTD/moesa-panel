import { UserModel, type UserDto } from '@/api/user/model';
import { Model, toModel } from '@/lib/model/Model';

/**
 * An `audit_log_group` row whose user columns are replaced by the users themselves, as the list
 * selects them: `user_id:user!user_id(*), reverted_by:user!reverted_by(*)`.
 */
export type AuditLogDto = Omit<Views['audit_log_group']['Row'], 'user_id' | 'reverted_by'> & {
   user_id: UserDto | null;
   reverted_by: UserDto | null;
};

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface AuditLogModel extends Omit<AuditLogDto, 'user_id' | 'reverted_by'> {}
export class AuditLogModel extends Model<AuditLogDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** Who made the change. */
   declare user_id: UserModel | null;
   /** Who reverted it, if anyone. */
   declare reverted_by: UserModel | null;

   constructor(dto: AuditLogDto) {
      super(dto);
      this.user_id = toModel(UserModel, dto.user_id);
      this.reverted_by = toModel(UserModel, dto.reverted_by);
   }

   /** The id that groups the changes made together; a single change is its own group. */
   get groupId() {
      return this.correlation_id || this.id;
   }
}
