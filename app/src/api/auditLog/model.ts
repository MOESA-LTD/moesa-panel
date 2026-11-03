import { UserModel, type UserDto } from '@/api/user/model';
import { Model, toModel } from '@/lib/model/Model';

/**
 * An `audit_transaction` row with who made and who reverted it, as the list selects them:
 * `*, actor(*), reverter(*)` (computed relationships, see 010_init_audit.sql).
 */
export type AuditTransactionDto = Omit<Tables['audit_transaction']['Row'], 'actor' | 'reverter'> & {
   actor?: UserDto | null;
   reverter?: UserDto | null;
};

// Columns come from the DTO through declaration merging (see Model).
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface AuditTransactionModel extends Omit<AuditTransactionDto, 'actor' | 'reverter'> {}
export class AuditTransactionModel extends Model<AuditTransactionDto> {
   /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
   /** Who made the change; null for system writes and users no longer in the tenant. */
   declare actor: UserModel | null;
   /** Who reverted it, if anyone. */
   declare reverter: UserModel | null;

   constructor(dto: AuditTransactionDto) {
      super(dto);
      this.actor = toModel(UserModel, dto.actor ?? null);
      this.reverter = toModel(UserModel, dto.reverter ?? null);
   }

   get reverted() {
      return !!this.reverted_at;
   }
}
