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
export const createAbility = (permissions?: PermissionClaim[]): AppAbility =>
   createMongoAbility<[string, string]>(toAbilityRules(permissions), { resolveAction });

/** A permission claim added to the access token by private.custom_access_token_hook. */
export type PermissionClaim = { command: string; resource_name: string | null };

export const toAbilityRules = (permissions: PermissionClaim[] = []) =>
   permissions.map(({ command, resource_name }) => ({
      action: command,
      subject: resource_name?.replace(/^public\./, '') ?? ''
   }));
