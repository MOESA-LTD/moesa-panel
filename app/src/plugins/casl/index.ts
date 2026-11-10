import { createAliasResolver, createMongoAbility, type MongoAbility } from '@casl/ability';

/**
 * UI action names mapped to database commands: `can('read', 'role')` checks the `select`
 * permission. "modify" stands for update or delete, whichever the role has.
 */
export const resolveAction = createAliasResolver({
   select: ['read', 'access', 'get', 'fetch', 'view'],
   insert: ['create', 'add', 'make'],
   update: ['modify', 'change', 'edit'],
   delete: ['modify', 'destroy', 'remove']
});

export type AppAbility = MongoAbility<[string, string]>;

/** The application's ability: the active tenant's permissions (see the auth store). */
export const ability: AppAbility = createMongoAbility<[string, string]>([], { resolveAction });

/** An ability for other permissions, e.g. those of another tenant shown alongside. */
export const createAbility = (permissions?: PermissionClaim[], fields?: FieldRight[]): AppAbility =>
   createMongoAbility<[string, string]>(toAbilityRules(permissions, fields), { resolveAction });

/** A permission claim added to the access token by private.custom_access_token_hook. */
export type PermissionClaim = { command: string; resource_name: string | null };

/** The user's right on one field of a table in the active tenant (my_access.fields). */
export type FieldRight = {
   resource_name: string;
   field: string;
   can_read: boolean;
   can_write: boolean;
};

const subjectOf = (resourceName: string | null) => resourceName?.replace(/^public\./, '') ?? '';

/**
 * The table permissions, then the fields they leave out: a field the user may not read is denied
 * for select, one they may not write for insert and update. Asked without a field, the table
 * permission answers. UI only: the `api` views mask and refuse those fields anyway.
 */
export const toAbilityRules = (permissions: PermissionClaim[] = [], fields: FieldRight[] = []) => [
   ...permissions.map(({ command, resource_name }) => ({
      action: command,
      subject: subjectOf(resource_name)
   })),
   ...fields.flatMap(({ resource_name, field, can_read, can_write }) => {
      const subject = subjectOf(resource_name);
      const deny = (action: string) => ({ action, subject, fields: [field], inverted: true });
      return [
         ...(can_read ? [] : [deny('select')]),
         ...(can_write ? [] : [deny('update'), deny('insert')])
      ];
   })
];

/**
 * Whether a field right takes `field` of `table` from the user, who may otherwise write the table:
 * forms then neither require nor send it. Without the table permission the field rules say nothing.
 */
export const isFieldWriteForbidden = (table: string, field: string, on: AppAbility = ability) =>
   (['insert', 'update'] as const).some(
      (action) => on.can(action, table) && on.cannot(action, table, field)
   );
