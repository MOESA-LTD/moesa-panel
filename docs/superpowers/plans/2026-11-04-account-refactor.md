# My Account Refactor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale account area (profile + settings/update-profile + settings/update-password + a `logout` route) with one "My account" page. The page has four sections (Profile, Security, Preferences, Memberships) and an avatar the user can upload. Logout becomes an action in the account popover.

**Architecture:** `/account` keeps one page component (`views/pages/account/Index.vue`): a header card (avatar, name, email, verification, member since) above PrimeVue `Tabs` that follow four child routes, each rendering one section component. The route meta is still the source of the menu, so the popover and the tabs both read `useMenuSection('account')`. Avatars live in a new public bucket `avatar` under `<uid>/avatar.<ext>`, and the URL is written to `user_metadata.avatar_url`. Role names per tenant come from a new SECURITY DEFINER RPC `public.my_memberships()`, because `public.role` reads are permission-gated. Logout is `useLogout().confirmLogout()`; the existing `useAuthUi` watcher still moves the user to the login page.

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 (Aura) + Tailwind, TanStack Query 5, zod 4, CASL, vue-i18n, Pinia; Supabase (Postgres 15, Storage, Auth), pgTAP (`pnpm test:db`), vitest 3 (happy-dom).

**Spec:** There is no separate spec document. The decided design is the "Design" list below. Read it together with this plan.

### Design (decided)

1. Routes: `/account` (label `route.label.account`, icon `ID_CARD`, dashboard layout, `requiresAuth`) redirects to `account-profile`. Its children are `account-profile` (`profile`), `account-security` (`security`), `account-preferences` (`preferences`) and `account-memberships` (`memberships`). Removed: `account-settings`, `update-profile`, `update-password`, `logout`. Old paths redirect: `settings` and `settings/update-profile` go to profile, and `settings/update-password` goes to security.
2. Page: a header card, then section tabs (scrollable on narrow screens) and the section's route view. There is no `RouteMenuBar`.
3. Profile: the existing `profileSchema` form (display_name, email, phone) with `useUnsavedChangesGuard`, and a note that an email change sends a confirmation to the new address.
4. Avatar: public bucket `avatar`, 1 MiB, png/jpeg/webp, own-folder writes; `uploadAvatar` / `removeAvatar`.
5. Security: the existing password form, plus "Sign out other devices" (`signOut({ scope: 'others' })`) behind a confirm. No MFA.
6. Preferences: language and theme, reusing AppConfigurator's controls. They stay in localStorage, and nothing is stored server-side.
7. Memberships: a read-only list of the user's tenants in tree order, with an owner badge and role names.
8. Popover: a header, then the four sections from the menu, a separator, and Logout as an action.
9. i18n en + tr, stale keys removed, `pnpm i18n-sync`.
10. Tests: vitest and pgTAP as listed per task.
11. Non-goals: MFA, admin user management, server-side preferences, an email-change verification UI beyond the toast.

## Global Constraints

- The existing patterns stay: `useForm` + zod schema, `FormBox`, `FormField`, `AvatarPlaceholder`, `useUnsavedChangesGuard`, `CustomRouteView`, `CustomLink`, and route meta as the menu source (`buildMenu` / `useMenuSection`). There is no `router.replace` inside route dialogs.
- Migrations are numbered after 027. This plan adds exactly `028_account.sql`, with `supabase/tests/database/028_account.test.sql`, which opens with a design comment (024 style). Generated types are refreshed with `pnpm dev:supabase-reset` and committed in the DB task (`supabase/functions/_shared/database.types.ts`).
- `authenticated` has no USAGE on schema `private`. The new storage policies use only `storage.foldername(name)` and `auth.uid()`, with no private helper. The RPC lives in `public`, `SECURITY DEFINER SET search_path = ''`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`.
- Avatar limits are the tenant-logo limits: `LOGO_TYPES` = `['image/png','image/jpeg','image/webp']` and `LOGO_MAX_BYTES` = `1048576` (`app/src/api/branch/index.ts`). The bucket uses the same values (`file_size_limit 1048576`). No SVG.
- Avatar object path is exactly `<auth.uid()>/avatar.<ext>`, where `ext` ∈ `png | jpg | webp`.
- Preferences stay where they are stored today: the locale in the URL param plus `localStorage['app_lang']` (i18n plugin), and the theme in the theme store (localStorage). Nothing new is persisted server-side.
- i18n: `en` is the source and `tr` is hand-written. Other locales are filled by `pnpm i18n-sync` (run from `app/`). Every key a task uses is added in that task. The copy table below is authoritative.
- Commands run from `app/`: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:db`, `pnpm dev:supabase-reset`, `pnpm i18n-sync`, `pnpm build`.
- Commits use conventional commits and end with the `Co-Authored-By:` trailer that the implementing session's attribution reminder provides.

## Review Focus

1. **Avatar of a different type than the previous one (PNG, then JPEG):** the folder ends up with only `avatar.jpg`, and the URL changes (`?v=<ms>`), so neither the popover nor the header shows the cached old image. (Task 2 `uploadAvatar` removes the other two names; the test asserts the URL and the `remove` call.)
2. **An SVG, or a 1 048 577-byte PNG, as avatar:** refused in the browser with `errors.avatar_type` / `errors.avatar_size` before any upload, and the bucket refuses it anyway. (Task 2 `validateAvatarFile` boundary test; Task 1 asserts the bucket limits; Task 4 header test asserts no `uploadAvatar` call.)
3. **Old links and the invite/recovery flow:** `/account/settings`, `/account/settings/update-profile` and `/account/settings/update-password` still land somewhere sensible, and an invite or OTP sign-in opens Security, not a dead route name. (Task 4 router test on the redirect records; Task 4 grep step for `update-password`.)
4. **A signed-in user opens `/login` or `/register`:** a logout confirm appears. "No" keeps them where they were, or sends them to Profile on a fresh page load. "Yes" signs them out and they end on the login page. (Task 3 `logoutBeforeEnter` tests.)
5. **Memberships with gaps:** a branch the user reaches only as owner of the company shows the Owner badge and "No role". A branch whose parent the user cannot use is listed as a root. A role row for a tenant missing from the access payload is not shown. (Task 2 `toMemberships` tests, Task 6 rendering.)

## Copy (en / tr)

Keys added (the task that uses a key adds it):

| Key | en | tr | Task |
|---|---|---|---|
| `errors.avatar_type` | The photo must be a PNG, JPEG or WebP image. | Fotoğraf PNG, JPEG ya da WebP olmalı. | 2 |
| `errors.avatar_size` | The photo must be at most 1 MB. | Fotoğraf en fazla 1 MB olmalı. | 2 |
| `account.logout` | Log out | Çıkış yap | 3 |
| `route.label.account` (changed) | My account | Hesabım | 4 |
| `route.label.security` | Security | Güvenlik | 4 |
| `account.header.member_since` | Member since {date} | {date} tarihinden beri üye | 4 |
| `account.header.email_verified` | Verified | Doğrulandı | 4 |
| `account.header.email_not_verified` | Not verified | Doğrulanmadı | 4 |
| `account.avatar.upload` | Upload photo | Fotoğraf yükle | 4 |
| `account.avatar.change` | Change photo | Fotoğrafı değiştir | 4 |
| `account.avatar.remove` | Remove photo | Fotoğrafı kaldır | 4 |
| `account.avatar.hint` | PNG, JPEG or WebP, up to 1 MB. | PNG, JPEG ya da WebP, en fazla 1 MB. | 4 |
| `account.profile.legend` | Profile details | Profil bilgileri | 4 |
| `account.profile.email_change_hint` | Changing your email sends a confirmation link to the new address. The change applies once you open it. | E-posta adresinizi değiştirirseniz yeni adrese bir onay bağlantısı gönderilir. Değişiklik, bağlantıyı açtığınızda geçerli olur. | 4 |
| `account.profile.email_change_sent` | Check {email} to confirm the new address. | Yeni adresi onaylamak için {email} adresini kontrol edin. | 4 |
| `account.security.password_legend` | Change password | Şifreyi değiştir | 4 |
| `account.security.sessions_legend` | Sessions | Oturumlar | 4 |
| `account.security.sign_out_others` | Sign out other devices | Diğer cihazlardan çıkış yap | 4 |
| `account.security.sign_out_others_hint` | Ends every session except this one. | Bu oturum dışındaki tüm oturumları kapatır. | 4 |
| `account.security.confirm_sign_out_others.header` | Sign out other devices | Diğer cihazlardan çıkış | 4 |
| `account.security.confirm_sign_out_others.question` | Every other device signed in to your account will be signed out. Continue? | Hesabınıza giriş yapmış diğer tüm cihazlarda oturum kapatılacak. Devam edilsin mi? | 4 |
| `account.security.signed_out_others` | Other devices were signed out. | Diğer cihazlarda oturum kapatıldı. | 4 |
| `route.label.preferences` | Preferences | Tercihler | 5 |
| `account.preferences.language_legend` | Language | Dil | 5 |
| `account.preferences.appearance_legend` | Appearance | Görünüm | 5 |
| `account.preferences.stored_locally` | These settings are kept in this browser. | Bu ayarlar bu tarayıcıda saklanır. | 5 |
| `route.label.memberships` | Memberships | Üyelikler | 6 |
| `account.memberships.legend` | Companies and branches | Şirketler ve şubeler | 6 |
| `account.memberships.owner` | Owner | Sahip | 6 |
| `account.memberships.no_roles` | No role | Rol yok | 6 |
| `account.memberships.empty` | You are not a member of any company yet. | Henüz hiçbir şirketin üyesi değilsiniz. | 6 |

Keys removed in Task 7 (no users left after Tasks 3–4): `account.profile.user_info`, `account.profile.name`, `account.profile.email`, `account.profile.phone`, `account.profile.events`, `account.profile.logs` (whole object), `route.label.settings`, `route.label.update-profile`, `route.label.update-password`, `route.label.logout`, `auth.logout` (whole object). `auth.confirm.logout.*` stays because `useLogout` uses it. The `usedKeys` test only reports missing keys, so Task 7 proves unused ones by grep.

---

## File map

```
supabase/migrations/028_account.sql                 avatar bucket + 4 storage policies; public.my_memberships()
supabase/tests/database/028_account.test.sql
app/src/api/account/index.ts                        (+ signOutOtherSessions)
app/src/api/account/avatar.ts                       AVATAR_*, validateAvatarFile, AvatarFileError, avatarPath, uploadAvatar, removeAvatar
app/src/api/account/memberships.ts                  TenantRoles, Membership, fetchMyRoles, toMemberships, useMyMemberships
app/src/composables/useLogout.ts                    useLogout().confirmLogout
app/src/router/middlewares/before-enter/logout.ts   logoutBeforeEnter (moved out of routes/auth.ts)
app/src/router/routes/{account,auth}.ts
app/src/components/service-components/account/{AccountPopover.vue, accountMenu.ts}
app/src/components/layout/AppConfigurator.vue       composes the three pieces below, behaviour unchanged
app/src/components/layout/app-config/{LanguageField,ThemeModeToggles,ThemeFields}.vue
app/src/views/pages/account/Index.vue               header + tabs + CustomRouteView
app/src/views/pages/account/AccountHeader.vue
app/src/views/pages/account/sections/{Profile,Security,Preferences,Memberships}.vue
deleted: views/pages/account/profile/, views/pages/account/settings/, views/pages/auth/Logout.vue
app/tests/api/account.test.ts, app/tests/api/memberships.test.ts, app/tests/composables/useLogout.test.ts,
app/tests/router/logoutBeforeEnter.test.ts, app/tests/router/buildMenu.test.ts (+ account section),
app/tests/components/accountMenu.test.ts, app/tests/components/AppConfigurator.test.ts,
app/tests/views/account{Page,Profile,Security,Preferences,Memberships}.test.ts
```

---

### Task 1: Avatar bucket and `my_memberships` (DB)

**Files:**
- Create: `supabase/migrations/028_account.sql`, `supabase/tests/database/028_account.test.sql`
- Modify: `supabase/functions/_shared/database.types.ts` (regenerated)

**Interfaces:**
- Produces (SQL):
  - Bucket `avatar`: `public TRUE`, `file_size_limit 1048576`, `allowed_mime_types ARRAY['image/png','image/jpeg','image/webp']`, inserted with `ON CONFLICT (id) DO UPDATE` exactly like `tenant-logo` in 014.
  - Policies on `storage.objects`, all `TO authenticated`, each `DROP POLICY IF EXISTS` first. Let `own` be `bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT`.
    - `avatar_select FOR SELECT USING (own)`
    - `avatar_insert FOR INSERT WITH CHECK (own)`
    - `avatar_update FOR UPDATE USING (own) WITH CHECK (own)`
    - `avatar_delete FOR DELETE USING (own)`

    Public reading goes through the public bucket URL, as for tenant logos (014). The SELECT policy is only for the owner: Storage needs it for `upsert` and `remove`, and other users cannot list someone's folder. There is no `anon` policy.
  - `public.my_memberships() RETURNS TABLE (tenant_id UUID, roles TEXT[])`: `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`. It returns one row per tenant in which `auth.uid()` holds a tenant role (`public.user_role ur JOIN public.role r ON r.id = ur.role_id WHERE ur.user_id = auth.uid() AND r.tenant_id IS NOT NULL GROUP BY r.tenant_id`), and `roles` is `array_agg(r.display_name ORDER BY r.display_name)`. The built-in owner role (`tenant_id IS NULL`) is left out, because ownership comes from `my_access` (`owned`). Grants follow Global Constraints.
  - Why an RPC: the `my_access` payload (`app/src/api/access.ts` `Tenant`) has `owned` and `permissions` but no role names. `public.role` select is permission-gated (`008_init_reference_data.sql`: `('public.role','role','select','read', FALSE, …)`, a policy over `private.permitted_tenants`). A member whose role lacks `role` read could not read their own role names with a plain query. The design comment of 028 says this.

- [ ] **Step 1: Write `028_account.test.sql`**: `BEGIN; SELECT plan(14);`. Store ids with `set_config` as in 024: `test.moesa` (MOESA LTD), `test.koordinator`, `test.ayse`. Impersonate with `private.impersonate(user, tenant)`, and run `RESET ROLE` before each `postgres` check.

```sql
SELECT is((SELECT public FROM storage.buckets WHERE id = 'avatar'), TRUE, 'avatar bucket is public');
SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = 'avatar'), 1048576::BIGINT, 'avatar bucket takes up to 1 MiB');
SELECT is((SELECT allowed_mime_types FROM storage.buckets WHERE id = 'avatar'), ARRAY['image/png','image/jpeg','image/webp'], 'avatar bucket types, no SVG');
-- impersonate koordinator in MOESA
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/avatar.png') $$, 'a user uploads into their own folder');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.ayse') || '/avatar.png') $$, '42501', NULL, 'not into another user''s folder');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', 'avatar.png') $$, '42501', NULL, 'not outside a folder');
SELECT is((SELECT roles FROM public.my_memberships() WHERE tenant_id = current_setting('test.moesa')::UUID), ARRAY['coordinator'], 'my_memberships names the user''s roles in a tenant');
-- impersonate ayse in Atlas Danışmanlık
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'), 0, 'another user cannot list the folder');
SELECT is((WITH u AS (UPDATE storage.objects SET metadata = '{}' WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png' RETURNING 1) SELECT count(*)::INT FROM u), 0, 'another user cannot replace the file');
DELETE FROM storage.objects WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png';
SELECT is((SELECT count(*)::INT FROM public.my_memberships() WHERE tenant_id = current_setting('test.moesa')::UUID), 0, 'my_memberships shows only the caller''s roles');
-- RESET ROLE
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'), 1, 'another user cannot delete the file');
-- impersonate koordinator again
DELETE FROM storage.objects WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png';
-- RESET ROLE
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'), 0, 'the owner deletes their file');
SELECT ok(NOT has_function_privilege('anon', 'public.my_memberships()', 'EXECUTE'), 'anon cannot call my_memberships');
-- SET LOCAL ROLE anon
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/avatar.webp') $$, '42501', NULL, 'anon cannot upload');
SELECT * FROM finish(); ROLLBACK;
```

  The type and size limits are enforced by the Storage API, not by Postgres, so the bucket-column assertions are the database-side proof. `koordinator@` is a `coordinator` member of MOESA (`supabase/seed.sql`, `seed_member(moesa, koordinator, 'coordinator')`).

- [ ] **Step 2: Run and see it fail**: run `pnpm test:db`. Expected: FAIL in `028_account.test.sql` (`avatar bucket is public`: got NULL).
- [ ] **Step 3: Write `028_account.sql`** following the Interfaces, with a design comment at the top (what the bucket holds, who writes, why the RPC).
- [ ] **Step 4: Reset and run**: run `pnpm dev:supabase-reset && pnpm test:db`. Expected: every file `ok`, `Result: PASS`. `database.types.ts` now lists `my_memberships`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/028_account.sql supabase/tests/database/028_account.test.sql supabase/functions/_shared/database.types.ts
git commit -m "feat(account): avatar bucket with own-folder writes and my_memberships RPC"
```

---

### Task 2: Account API: avatar, memberships, other sessions

**Files:**
- Create: `app/src/api/account/avatar.ts`, `app/src/api/account/memberships.ts`, `app/tests/api/account.test.ts`, `app/tests/api/memberships.test.ts`
- Modify: `app/src/api/account/index.ts`, i18n `errors.avatar_type`, `errors.avatar_size` (en/tr, then `pnpm i18n-sync`)

**Interfaces:**
- Consumes: bucket `avatar` and `public.my_memberships` (Task 1); `Tenant` (`@/api/access`); `LOGO_TYPES`, `LOGO_MAX_BYTES` (`@/api/branch`); `useAuthStore` (`user`, `branches`).
- Produces, `api/account/avatar.ts`:
  - `AVATAR_BUCKET = 'avatar'`; `AVATAR_TYPES = LOGO_TYPES`; `AVATAR_MAX_BYTES = LOGO_MAX_BYTES`.
  - `type AvatarErrorCode = 'avatar_type' | 'avatar_size'`.
  - `validateAvatarFile(file: Pick<File, 'type' | 'size'>): AvatarErrorCode | null`.
  - `class AvatarFileError extends Error { code: AvatarErrorCode }`, whose message is `i18n.t('errors.<code>')`.
  - `avatarPath(userId: string, mimeType: string): string` → `${userId}/avatar.${ext}`, where `ext` is `jpg` for `image/jpeg` and otherwise the subtype.
  - `uploadAvatar(file: File, userId: string): Promise<string>`, in order:
    1. Validate (throws `AvatarFileError`).
    2. `storage.from('avatar').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })`, throwing its `error`.
    3. `url = getPublicUrl(path).data.publicUrl + '?v=' + Date.now()`.
    4. `auth.updateUser({ data: { avatar_url: url } })`, throwing its `error`.
    5. `storage.remove(<the other two avatar paths>)`, ignoring its result.
    6. Return `url`.
  - `removeAvatar(userId: string): Promise<void>`: first `auth.updateUser({ data: { avatar_url: null } })` (throws on error), then `storage.remove([png, jpg, webp paths])`. Clearing the metadata first means no screen ever points at a missing file.
- Produces, `api/account/index.ts`: `signOutOtherSessions(): Promise<void>` calls `supabase.auth.signOut({ scope: 'others' })` and throws its `error`.
- Produces, `api/account/memberships.ts`:
  - `type TenantRoles = { tenant_id: string; roles: string[] }`.
  - `type Membership = { id: string; display_name: string; depth: number; owned: boolean; roles: string[] }`.
  - `fetchMyRoles(): Promise<TenantRoles[]>` = `supabase.rpc('my_memberships').throwOnError()`, data or `[]`.
  - `toMemberships(tenants: Tenant[], roles: TenantRoles[]): Membership[]`. It returns tree order: roots are tenants whose `parent_id` is null or not in `tenants`; children follow their parent depth-first. Siblings sort by `display_name.localeCompare(b, i18n.locale)`. `owned` is `!!tenant.owned`. `roles` comes from the matching row, or `[]`. A role row whose tenant is not in `tenants` is dropped.
  - `useMyMemberships(): { memberships: ComputedRef<Membership[]>; isPending: Ref<boolean> }`. It is `useQuery({ queryKey: ['my_memberships', user.id], queryFn: fetchMyRoles, staleTime: 0 })` combined with `toMemberships(authStore.branches, data ?? [])`.

- [ ] **Step 1: Write the failing tests.** Mock `@/lib/supabase` with spies `upload`, `getPublicUrl` (returns `{ data: { publicUrl: 'https://s/avatar/' + path } }`), `remove`, `auth.updateUser`, `auth.signOut` and `rpc`.

  `app/tests/api/account.test.ts`:
  - `validateAvatarFile`: `{ type: 'image/svg+xml', size: 10 }` → `'avatar_type'`; `{ type: 'image/png', size: 1048577 }` → `'avatar_size'`; `{ type: 'image/png', size: 1048576 }` → `null`.
  - `uploadAvatar(new File(['x'], 'me.jpeg', { type: 'image/jpeg' }), 'u1')` with `vi.setSystemTime(1700000000000)`:
    - `upload` is called with `('u1/avatar.jpg', file, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })`.
    - `updateUser` is called with `{ data: { avatar_url: 'https://s/avatar/u1/avatar.jpg?v=1700000000000' } }`.
    - `remove` is called with `['u1/avatar.png', 'u1/avatar.webp']`, and the call resolves to that URL.
  - An SVG rejects with an `AvatarFileError` whose `code` is `'avatar_type'`, and `upload` is not called.
  - An `upload` error rejects with that error, and `updateUser` is not called.
  - `removeAvatar('u1')` calls `updateUser({ data: { avatar_url: null } })` before `remove(['u1/avatar.png','u1/avatar.jpg','u1/avatar.webp'])` (compare `mock.invocationCallOrder`).
  - `signOutOtherSessions()` calls `signOut({ scope: 'others' })`, and an `{ error }` result rejects.

  `app/tests/api/memberships.test.ts` (`toMemberships`):
  - Given `[Moda(parent Kadıköy), Atlas(root, owned), Kadıköy(parent Atlas), MOESA(root)]` and roles `[{MOESA, ['coordinator']}, {Kadıköy, ['accountant','staff']}]`, the result is `Atlas(0, owned, [])`, `Kadıköy(1, ['accountant','staff'])`, `Moda(2, [])`, `MOESA(0, ['coordinator'])` (assert `id`, `depth`, `owned`, `roles` in order).
  - A tenant whose parent is not in the list has depth 0.
  - A role row for an unknown tenant id does not appear.
  - Empty tenants give `[]`.

- [ ] **Step 2: Run and see them fail**: run `pnpm test tests/api/account.test.ts tests/api/memberships.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `avatar.ts`, `memberships.ts` and `signOutOtherSessions` as specified. Add the two `errors.*` keys and run `pnpm i18n-sync`.
- [ ] **Step 4: Run**: run `pnpm test tests/api tests/plugins/i18n && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/account app/tests/api/account.test.ts app/tests/api/memberships.test.ts app/src/plugins/i18n/locales
git commit -m "feat(account): avatar upload/remove, memberships mapping and sign-out of other sessions"
```

---

### Task 3: Logout as an action

**Files:**
- Create: `app/src/composables/useLogout.ts`, `app/src/router/middlewares/before-enter/logout.ts`, `app/src/components/service-components/account/accountMenu.ts`, `app/tests/composables/useLogout.test.ts`, `app/tests/router/logoutBeforeEnter.test.ts`, `app/tests/components/accountMenu.test.ts`
- Modify:
  - `app/src/router/routes/auth.ts`: drop the local `logoutBeforeEnter` and the `router` import; import the new guard.
  - `app/src/router/routes/account.ts`: delete the `logout` child, plus the `useConfirm` and `router` imports.
  - `app/src/composables/useAuthUi.ts:61-63`: the sign-out branch becomes `if (route.meta?.requiresAuth) await router.push({ name: 'auth-login' });` (the `route.name === 'logout'` case is gone).
  - `app/src/router/middlewares/before-each/dialog/index.ts:13`: delete `if (to.name == 'logout') return;`.
  - `app/src/components/service-components/account/AccountPopover.vue`: the model comes from `buildAccountMenu`; render a command item as a button; show `item.label` as is (it is already translated by `buildMenu`, so drop the `$t(item.label)`).
  - i18n `account.logout`.
- Delete: `app/src/views/pages/auth/Logout.vue`.

**Interfaces:**
- Consumes: `useAuthStore().logout(): Promise<{ error: AuthError | null }>`, `useAuthStore().isSignedIn`, `initialized`; `useConfirm` from `primevue/useconfirm`; `NavigationItem` (`@/router/menu`).
- Produces:
  - `useLogout(): { confirmLogout: () => Promise<boolean> }`. `useConfirm()` and `useAuthStore()` are called synchronously inside `useLogout()`, so it works in a guard before its first `await`. `confirmLogout` opens the confirm with `icon: PrimeIcons.EXCLAMATION_TRIANGLE`, `message: i18n.t('auth.confirm.logout.question')` and `header: i18n.t('auth.confirm.logout.header')`, with accept and reject props as in `useConfirmDelete`.
    - accept: `await logout()`; if `error`, throw it; otherwise resolve `true`.
    - reject and `onHide`: resolve `false`.
    - It does not navigate itself, because `useAuthUi` already moves a signed-out user off a protected page.
  - `logoutBeforeEnter: NavigationGuardWithThis<undefined>`:
    1. Call `useLogout()` first, then `await authStore.initialized`.
    2. Signed out: `true`.
    3. Signed in and confirmed: `true` when `to.name === 'auth-login'`, else `{ name: 'auth-login' }`. **[owner to confirm]** This keeps today's behaviour: the old `logout` route always ended on login, so a signed-in user who opens `/register` or `/otp` and confirms lands on login, not the page they asked for.
    4. Signed in and declined: `false` when `from.matched.length > 0`, else `{ name: 'account-profile' }`.
  - `buildAccountMenu(items: NavigationItem[] | undefined, logout: () => void): MenuItem[]` returns `[...(items ?? []), { separator: true }, { key: 'logout', label: i18n.t('account.logout'), icon: PrimeIcons.SIGN_OUT, command: logout }]`. When `items` is empty, there is no leading separator.

- [ ] **Step 1: Write the failing tests**
  - `useLogout.test.ts`. Mock `primevue/useconfirm` with `require = vi.fn()`, and mock `@/store/auth` with `logout = vi.fn().mockResolvedValue({ error: null })`.
    - Accepting resolves `true`, `logout` is called once, and `require` got `message: i18n.t('auth.confirm.logout.question')` and `header: i18n.t('auth.confirm.logout.header')`.
    - Rejecting resolves `false`, and `logout` is not called.
    - `onHide` resolves `false`.
    - `logout` resolving `{ error: new Error('x') }` rejects with that error.
  - `logoutBeforeEnter.test.ts`. Mock `@/composables/useLogout` (`confirmLogout` spy) and `@/store/auth` (`isSignedIn`, `initialized: Promise.resolve()`).
    - Signed out returns `true`, and `confirmLogout` is not called.
    - Signed in and confirmed returns `true` with `to = { name: 'auth-login' }` and `{ name: 'auth-login' }` with `to = { name: 'auth-register' }`.
    - Signed in and declined returns `false` with `from.matched = [{}]` and `{ name: 'account-profile' }` with `from.matched = []`.
  - `accountMenu.test.ts`:
    - Two menu items in, four entries out: the items, `{ separator: true }`, then logout with `icon: PrimeIcons.SIGN_OUT`.
    - Calling the logout entry's `command()` calls the passed function.
    - `buildAccountMenu(undefined, fn)` returns the logout entry only.
- [ ] **Step 2: Run and see them fail**: run `pnpm test tests/composables/useLogout.test.ts tests/router/logoutBeforeEnter.test.ts tests/components/accountMenu.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three modules and the modifications listed under Files. In the popover template, a `item.command` entry renders `<button v-bind="props.action">` (TieredMenu calls `command`), while a route entry keeps `CustomLink`. The active-item class still uses `item.route?.name`. Add `account.logout` and run `pnpm i18n-sync`.
- [ ] **Step 4: Verify no stale references**: run `git grep -n "'logout'\|Logout.vue" app/src`. Expected: no output.
- [ ] **Step 5: Run**: run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then run `pnpm dev:vue`, sign in, and use popover → Log out → Yes. Expected: the login page and the goodbye toast. Signed in, open `/login` and choose No. Expected: you stay on the previous page.
- [ ] **Step 6: Commit**

```bash
git add -A app/src/composables app/src/router app/src/components/service-components/account app/src/views/pages/auth/Logout.vue app/tests/composables/useLogout.test.ts app/tests/router/logoutBeforeEnter.test.ts app/tests/components/accountMenu.test.ts app/src/plugins/i18n/locales
git commit -m "feat(account): logout is a confirmed popover action instead of a route"
```

---

### Task 4: My account page: header, avatar, Profile and Security

**Files:**
- Create: `app/src/views/pages/account/AccountHeader.vue`, `app/src/views/pages/account/sections/Profile.vue`, `app/src/views/pages/account/sections/Security.vue`, `app/tests/views/accountPage.test.ts`, `app/tests/views/accountProfile.test.ts`, `app/tests/views/accountSecurity.test.ts`
- Modify:
  - `app/src/views/pages/account/Index.vue` (rewrite).
  - `app/src/router/routes/account.ts` (rewrite, below).
  - `app/src/router/middlewares/before-each/auth/index.ts:27` → `return { name: 'account-security' };`.
  - `app/src/views/pages/auth/Otp.vue:56` → `router.replace({ name: 'account-security' })`.
  - `app/tests/router/buildMenu.test.ts` (account section).
  - i18n (Task 4 rows of the copy table).
- Delete: `app/src/views/pages/account/profile/`, `app/src/views/pages/account/settings/`.
- Unchanged on purpose: `Access.vue`, `Error.vue`, `NotFound.vue` and the dialog middleware fallback link to `account-profile`, which still exists.

**Interfaces:**
- Consumes: `uploadAvatar`, `removeAvatar`, `validateAvatarFile`, `AVATAR_TYPES`, `signOutOtherSessions` (Task 2); `profileSchema`, `toProfileFormValues`, `updateProfile`, `passwordSchema`, `updatePassword` (`@/api/account`, unchanged); `useMenuSection` (`@/router/menu`); `localeDateString` (`@/lib/dayjs`).
- Produces:
  - `account.ts`: the parent `path: 'account'`, `name: 'account'`, `redirect: { name: 'account-profile' }`, same meta as today, and `components.default: Index.vue`. Children:

```ts
{ path: 'profile', name: 'account-profile', meta: { label: 'route.label.profile', icon: PrimeIcons.USER, index: 1 }, component: () => import('@/views/pages/account/sections/Profile.vue') },
{ path: 'security', name: 'account-security', meta: { label: 'route.label.security', icon: PrimeIcons.LOCK, index: 2 }, component: () => import('@/views/pages/account/sections/Security.vue') },
// Old links (bookmarks, e-mails) still open the right section; hidden from every menu.
{ path: 'settings', redirect: { name: 'account-profile' }, meta: { visible: false } },
{ path: 'settings/update-profile', redirect: { name: 'account-profile' }, meta: { visible: false } },
{ path: 'settings/update-password', redirect: { name: 'account-security' }, meta: { visible: false } },
```

  The redirect records have no names, so the old names are gone; every caller is updated above. `meta.visible: false` keeps them out of `buildMenu` (it nests by path segment, so they would otherwise show as entries).
  - `Index.vue` (no props):
    - It renders `<AccountHeader />`, then `<Tabs :value="activeSection" scrollable>`. A `<Tab>` per `useMenuSection('account').value?.items` has `:value="item.name"`, `@click="router.push({ name: item.name })"`, icon and label.
    - After the tabs comes `<CustomRouteView />`.
    - `activeSection` is the name of the matched route that is one of the items. There is no `watchEffect` redirect; the route's `redirect` does that job.
  - `AccountHeader.vue` (no props), reading `useAuthStore().user`:
    - `AvatarPlaceholder` (`src` = `user_metadata.avatar_url`, placeholder = `display_name || email`).
    - `display_name`, the email, and a `Tag` that reads `account.header.email_verified` (severity success) when `email_confirmed_at` is set, else `account.header.email_not_verified` (warn).
    - `account.header.member_since` with `{ date: localeDateString({ value: created_at, validate: false }) }`.
    - A `FileUpload mode="basic" auto customUpload :accept="AVATAR_TYPES.join(',')"` labelled upload or change, a remove button when an avatar is set, and `account.avatar.hint`.
    - On select: if `validateAvatarFile` returns a code, show an error toast with `t('errors.<code>')` and stop. Otherwise call `uploadAvatar(file, user.id)`, then show a success toast `toast.updated`. On remove: `removeAvatar(user.id)`. Errors go through `appErrorHandler`.
    - The store's `USER_UPDATED` session refresh updates the header and the popover, so no manual state is kept.
  - `sections/Profile.vue`: today's `update-profile` form inside `FormBox :legend="t('account.profile.legend')"`, keeping `useUnsavedChangesGuard(isDirty)`.
    - Under the email field: `<small>` with `account.profile.email_change_hint`.
    - After a save whose submitted email differs from `user.email` before the save, it shows an info toast `account.profile.email_change_sent` with `{ email }`; otherwise it shows `toast.updated`.
  - `sections/Security.vue`: today's `update-password` form in `FormBox :legend="t('account.security.password_legend')"`. A second `FormBox :legend="t('account.security.sessions_legend')"` holds the hint and a button `account.security.sign_out_others`. The button confirms with `account.security.confirm_sign_out_others.{header,question}` (`useConfirm`, same props as `useLogout`), then calls `signOutOtherSessions()` and shows a success toast `account.security.signed_out_others`. This session stays signed in.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/supabase`, `@/store/auth` with a `user`, and `@/api/account` / `@/api/account/avatar` keeping the real `validateAvatarFile`; plugins `i18NPlugin`, `PrimeVue`, `ToastService`, `ConfirmationService`).
  - `buildMenu.test.ts`, new `describe('account section')`. Build `createRouter({ history: createMemoryHistory(), routes: [{ path: '/', children: accountRoutes }] })`, with `@/store/auth` mocked to `isSignedIn: true`.
    - `buildMenu(router.getRoutes(), …)` → the `account` entry's `items.map(i => i.name)` equals `['account-profile', 'account-security']`.
    - `getRoutes().find(r => r.path === '/account/settings/update-password')!.redirect` equals `{ name: 'account-security' }`, and `/account/settings/update-profile` and `/account/settings` → `{ name: 'account-profile' }`.
    - The `account` record redirects to `{ name: 'account-profile' }`.
  - `accountPage.test.ts`. Mock `@/router/menu` so `useMenuSection` returns profile and security items, and mock `vue-router`'s `useRoute` → `{ name: 'account-security', matched: [{ name: 'account' }, { name: 'account-security' }] }` with `useRouter` → `{ push }`.
    - The security `Tab` has `data-p-active="true"`.
    - Clicking the profile tab calls `push({ name: 'account-profile' })`.
    - The header shows `Ada Lovelace`, `ada@x.test` and `Verified`.
    - With `email_confirmed_at: null`, it shows `Not verified`.
    - Selecting an `image/svg+xml` file shows the `errors.avatar_type` toast and does not call `uploadAvatar`.
    - Selecting a PNG calls `uploadAvatar(file, 'u1')`.
    - The remove button is present only when `avatar_url` is set, and clicking it calls `removeAvatar('u1')`.
  - `accountProfile.test.ts`:
    - Submitting with the email unchanged calls `updateProfile` once and shows `toast.updated`.
    - Changing the email to `new@x.test` shows the text of `account.profile.email_change_sent` with `new@x.test`.
    - The hint text is rendered.
  - `accountSecurity.test.ts`:
    - Mismatched passwords show `form.passwords_do_not_match`, and `updatePassword` is not called.
    - Accepting the sign-out-others confirm calls `signOutOtherSessions` once and does not call the store's `logout`.
    - Rejecting it calls nothing.
- [ ] **Step 2: Run and see them fail**: run `pnpm test tests/router/buildMenu.test.ts tests/views/accountPage.test.ts tests/views/accountProfile.test.ts tests/views/accountSecurity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the routes, page, header and sections; delete the old pages; update `Otp.vue` and the auth middleware; add the Task 4 keys (and change `route.label.account`); run `pnpm i18n-sync`.
- [ ] **Step 4: Verify no stale names**: run `git grep -n "update-password\|update-profile\|account-settings\|pages/account/profile\|pages/account/settings" app/src`. Expected: only the redirect `path:` lines in `account.ts`.
- [ ] **Step 5: Run**: run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then in `pnpm dev:vue`:
  - Open `/account`. Expected: Profile.
  - Open `/account/settings/update-password`. Expected: Security.
  - Upload a PNG. Expected: the header and the popover avatar change.
  - Upload a JPEG. Expected: Storage shows only `<uid>/avatar.jpg`.
  - Edit the name and click Security. Expected: the unsaved-changes prompt.
- [ ] **Step 6: Commit**

```bash
git add -A app/src/views/pages/account app/src/router app/src/views/pages/auth/Otp.vue app/tests/router/buildMenu.test.ts app/tests/views/accountPage.test.ts app/tests/views/accountProfile.test.ts app/tests/views/accountSecurity.test.ts app/src/plugins/i18n/locales
git commit -m "feat(account): one My account page with avatar, profile and security sections"
```

---

### Task 5: Preferences section and shared configurator controls

**Files:**
- Create: `app/src/components/layout/app-config/LanguageField.vue`, `app/src/components/layout/app-config/ThemeModeToggles.vue`, `app/src/components/layout/app-config/ThemeFields.vue`, `app/src/views/pages/account/sections/Preferences.vue`, `app/tests/components/AppConfigurator.test.ts`, `app/tests/views/accountPreferences.test.ts`
- Modify: `app/src/components/layout/AppConfigurator.vue`, `app/src/router/routes/account.ts` (+ child), `app/tests/router/buildMenu.test.ts` (expected names + `'account-preferences'`), i18n (Task 5 rows).

**Interfaces:**
- Consumes: `useThemeStore` (`settings`, `profile`, `isDark`, `toggleDark`), `useSidebar`, `SUPPORTED_LOCALES` (`@plugins/i18n`), `PRIMARY_COLORS`, `SURFACES`, `PRESET_NAMES`, `SIDEBAR_MODES`.
- Produces (no props, no emits; each owns the markup and the `.app-configurator__*` style rules it uses, moved out of `AppConfigurator.vue`):
  - `LanguageField.vue`: the language `FormField` + `Select` from `AppConfigurator.vue:56-84`. Changing it still calls `$router.replace({ params: { locale } })`, and the i18n plugin's watcher still writes `localStorage['app_lang']`.
  - `ThemeModeToggles.vue`: the two `ToggleButton`s from the legend slot (dark mode, linked light/dark settings).
  - `ThemeFields.vue`: UI scale, primary colour, surface colour, preset, and sidebar mode (still `v-if="isSignedIn && !sidebar.isMobile.value"`).
  - `AppConfigurator.vue` keeps the same `FormBox` and legend. Its legend slot renders `<ThemeModeToggles />`, and its body renders `<LanguageField />` and `<ThemeFields />`. The rendered DOM and behaviour are unchanged.
  - `sections/Preferences.vue` holds two forms:
    - `FormBox :legend="t('account.preferences.language_legend')"` with `<LanguageField />`.
    - `FormBox :legend="t('account.preferences.appearance_legend')"`, whose legend slot shows the legend text and `<ThemeModeToggles />`, and whose body is `<ThemeFields />`.

    Below them, a muted `account.preferences.stored_locally`.
  - Route child: `{ path: 'preferences', name: 'account-preferences', meta: { label: 'route.label.preferences', icon: PrimeIcons.SLIDERS_H, index: 3 }, component: () => import('@/views/pages/account/sections/Preferences.vue') }`.

- [ ] **Step 1: Write the failing tests** (real Pinia via `createPinia()`/`setActivePinia`, `@/store/auth` mocked with `isSignedIn: true`, and `vue-router` mocked with `useRouter → { replace }`):
  - `AppConfigurator.test.ts` is written against the current component first, so it guards the extraction.
    - `.app-configurator__color-button` count equals `PRIMARY_COLORS.length + SURFACES.length`.
    - One language `Select` is present.
    - Two `ToggleButton`s are in the legend.
    - Clicking the first surface button sets `useThemeStore().profile.surface` to `SURFACES[0].name`.
    - This file passes before the extraction (Step 2 checks that).
  - `accountPreferences.test.ts`:
    - It renders the two legends and `account.preferences.stored_locally`.
    - Choosing `tr` in the language select calls `replace({ params: { locale: 'tr' } })`.
    - Clicking a primary colour button changes `profile.primary`.
    - The dark-mode toggle calls `toggleDark` (spy on the store).
  - `buildMenu.test.ts`: expected names now end with `'account-preferences'`.
- [ ] **Step 2: Run**: run `pnpm test tests/components/AppConfigurator.test.ts tests/views/accountPreferences.test.ts tests/router/buildMenu.test.ts`. Expected: AppConfigurator PASS, the other two FAIL.
- [ ] **Step 3: Implement** the three components, slim `AppConfigurator.vue`, the section and the route; add the Task 5 keys and run `pnpm i18n-sync`.
- [ ] **Step 4: Run**: run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS (AppConfigurator still green). Then in `pnpm dev:vue`, change the language and the theme on Preferences. Expected: the top-bar configurator shows the same values, and they survive a reload.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout app/src/views/pages/account/sections/Preferences.vue app/src/router/routes/account.ts app/tests/components/AppConfigurator.test.ts app/tests/views/accountPreferences.test.ts app/tests/router/buildMenu.test.ts app/src/plugins/i18n/locales
git commit -m "feat(account): preferences section reusing the configurator's language and theme controls"
```

---

### Task 6: Memberships section

**Files:**
- Create: `app/src/views/pages/account/sections/Memberships.vue`, `app/tests/views/accountMemberships.test.ts`
- Modify: `app/src/router/routes/account.ts` (+ child), `app/tests/router/buildMenu.test.ts` (+ `'account-memberships'`), i18n (Task 6 rows).

**Interfaces:**
- Consumes: `useMyMemberships()` and `Membership` (Task 2).
- Produces:
  - `Memberships.vue` (no props):
    - `FormBox :legend="t('account.memberships.legend')"` with a list, one row per membership (`data-membership` attribute).
    - Each row is indented by `depth * 1.25rem` (`padding-inline-start`) and shows `display_name`, a `Tag` `account.memberships.owner` when `owned`, then one secondary `Tag` per role name (stored names, not translated), or muted `account.memberships.no_roles` when there are no roles and the row is not owned.
    - While `isPending`, it shows a `Skeleton`; with no memberships, it shows `account.memberships.empty`.
  - Route child: `{ path: 'memberships', name: 'account-memberships', meta: { label: 'route.label.memberships', icon: PrimeIcons.BUILDING, index: 4 }, component: () => import('@/views/pages/account/sections/Memberships.vue') }`.

- [ ] **Step 1: Write the failing tests**: mock `@/api/account/memberships` `useMyMemberships` with refs.
  - Three memberships render three `[data-membership]` rows in the given order, and the depth-1 row has `padding-inline-start: 1.25rem`.
  - The owned row shows `Owner`.
  - A row with roles `['coordinator']` shows `coordinator`.
  - A non-owned row without roles shows `No role`.
  - An empty list shows `account.memberships.empty`'s text.
  - `isPending` shows a skeleton and no rows.
  - `buildMenu.test.ts` expected names end with `'account-memberships'`.
- [ ] **Step 2: Run and see them fail**: run `pnpm test tests/views/accountMemberships.test.ts tests/router/buildMenu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the section and the route; add the Task 6 keys and run `pnpm i18n-sync`.
- [ ] **Step 4: Run**: run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then in `pnpm dev:vue`, as `koordinator@moesa-panel.test`, open Memberships. Expected: `MOESA LTD`, coordinator. As `ayse@moesa-panel.test`, expect Atlas Danışmanlık (Owner) with its branches indented beneath.
- [ ] **Step 5: Commit**

```bash
git add app/src/views/pages/account/sections/Memberships.vue app/src/router/routes/account.ts app/tests/views/accountMemberships.test.ts app/tests/router/buildMenu.test.ts app/src/plugins/i18n/locales
git commit -m "feat(account): memberships section listing the user's companies, branches and roles"
```

---

### Task 7: Remove stale copy and verify the whole branch

**Files:**
- Modify: `app/src/plugins/i18n/locales/en/index.json`, `app/src/plugins/i18n/locales/tr/index.json` (then `pnpm i18n-sync` updates the rest)

- [ ] **Step 1: Prove the keys are unused**: run `git grep -n "account\.profile\.\(user_info\|name\|email\|phone\|events\|logs\)\|route\.label\.\(settings\|update-profile\|update-password\|logout\)\|auth\.logout\." app/src -- ':!app/src/plugins/i18n/locales'`. Expected: no output.
- [ ] **Step 2: Remove them** from `en` and `tr`, then run `pnpm i18n-sync`. Expected: every other locale loses the same keys and gains none.
- [ ] **Step 3: Run the whole suite**: run `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: every step PASS (the `usedKeys` test catches a removed key that is still used), and `git status` shows no regenerated-type drift.
- [ ] **Step 4: Walk the Review Focus in the browser** (`pnpm dev:vue`):
  - (1) Upload a PNG, then a JPEG. Expected: one file, and the new image shows everywhere without a reload.
  - (2) Pick a 2 MB PNG. Expected: refused with "The photo must be at most 1 MB." and no request in the network tab.
  - (3) Open `/account/settings/update-password`. Expected: Security.
  - (4) Signed in, open `/register` and choose No, then Yes. Expected: you stay, then you land on login.
  - (5) Check Memberships as `ayse@`.
- [ ] **Step 5: Commit**

```bash
git add app/src/plugins/i18n/locales
git commit -m "chore(i18n): drop copy of the removed account pages and logout route"
```

---

## Self-review notes

- **Spec coverage:**
  - Design 1 (routes, redirects, reference updates) is in T4, with T5 and T6 adding their children; the logout route's removal is in T3.
  - Design 2 (header + tabs) and 3 (Profile + email note + guard) are in T4.
  - Design 4 (avatar) is in T1 (bucket), T2 (API) and T4 (UI).
  - Design 5 (Security + sign out others) is in T2 and T4.
  - Design 6 (Preferences + extraction) is in T5, and 7 (Memberships, RPC since the payload has no roles) is in T1, T2 and T6.
  - Design 8 (popover) is in T3, where the items follow the menu section automatically as T4–T6 add routes.
  - Design 9 (i18n) is in every task plus T7, and 10 (tests) is in every task. Design 11 is honoured: no MFA, no admin, no server-side preferences.
- **Rulings I made against the brief, from the code:**
  - Logout navigation stays in `useAuthUi` (`app/src/composables/useAuthUi.ts`). It already pushes a signed-out user from a protected page to `auth-login`; `confirmLogout` navigating too would race it.
  - `useLogout()` is a composable returning `confirmLogout`, because `useConfirm()` needs the injection context (in the guard, before its first `await`).
  - `logoutBeforeEnter` moves to `router/middlewares/before-enter/logout.ts` so it can be tested without importing the router.
  - The avatar SELECT policy is owner-only, not "public read". The public bucket URL serves reads (014 pattern), and a world-readable SELECT policy would let anyone list every user's folder.
  - `uploadAvatar`/`removeAvatar` take `userId`, which makes them testable without a session.
  - `my_memberships()` RPC rather than a client query: `public.role` select is permission-gated (`008_init_reference_data.sql`).
  - Redirect records keep the old paths but not the old names.
  - The section views render in `CustomRouteView`, the project's `RouterView` wrapper.
- **Not in this plan:**
  - MFA, admin user management, server-side preferences, and an email-change verification screen.
  - `public.user_role` select is `bypass TRUE` (`008_init_reference_data.sql`), so any signed-in user can read every user-role pair. This predates this plan; it is noted for a separate fix.
- **Type consistency:**
  - `Membership` and `TenantRoles` (T2) are used in T6.
  - `AvatarErrorCode` codes map to `errors.avatar_type|avatar_size` (T2) and are used by T4's header.
  - `useLogout().confirmLogout` (T3) is used by the popover and by `logoutBeforeEnter`.
  - The route names `account-profile|security|preferences|memberships` match across T4–T6, `buildMenu.test.ts`, `Otp.vue` and the auth middleware.
