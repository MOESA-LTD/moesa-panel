# Hesap alanı refactor'u: ertelenen bulgular ve kararlar

Dal: `feat/account-refactor` (taban `c60b029`). Final inceleme "düzeltmelerle hazır" dedi; iki önemli bulgu (avatar politikası yalnız `avatar.<ext>`; durum/kod taşımayan hatalar artık toast gösteriyor) ve üç küçük bulgu düzeltme dalgasında kapandı (`83cfdef..9f9ca1e`), yeniden inceleme temiz. Tarayıcı turu (a-g) geçti.

## Ertelenen küçük bulgular

- Task 1: policies enforce the folder, not the `avatar.<ext>` filename; nested folders inside the own folder accepted; no runtime anon-RPC-call test (privilege asserted).
- Task 2: cleanup `remove` after upload can reject and surface a failure after success (catch it); removeAvatar ignores remove error silently (log); useMyMemberships lacks `enabled: !!user`; untested: updateUser failure on upload, removeAvatar error path, useMyMemberships wrapper; parent-cycle drop theoretical.
- Task 3: sign-out failure inside the guard is silent (no toast); redundant double redirect to login (harmless); useLogout test lacks hide-mid-accept (covered in useConfirmAction).
- Task 4: Profile email-change toast compares raw strings (case/whitespace); untested failure paths (upload error, signOutOtherSessions reject); remove test mounts twice; <h1> in header may clash with layout heading order; extra `preview` prop on AvatarPlaceholder.
- Task 4: a rejecting guard may be reported twice if router.onError is registered.
- Task 5: empty <script setup> in LanguageField; flags markup untested; dead language-badge CSS carried over; Preferences legend wrapper duplicates configurator header markup.
- Task 6: failed RPC indistinguishable from empty list (show an error state); tree has no aria-level; role-chip test checks text not chip count.
- Task 7: locales/template.json not maintained by i18n-sync (3 stale keys remain; pre-existing); "Zoom Image" button on the initials placeholder; popover avatar square.
- Fix-wave minors (deferred): stale comment in media/upload.ts about appErrorHandler; AVATAR_PUBLIC_PREFIX built from raw env vs normalized URL; 028 lines > 100 chars; UPDATE/DELETE name-regex refusals untested in pgTAP.

## Koordinatör kararları

- Ruling: an owner-only branch shows BOTH the Owner badge and "No role" (Review Focus 5 wins over T6's text); T6 adds that test — cost: none.
- Ruling: T3's "no 'logout' left" grep targets `name: 'logout'` (route name), not the menu key — cost: none.
- Ruling: T4's old-route-name grep is scoped to `app/src` minus `plugins/i18n/locales` (keys go in T7); T7's stale-key grep uses anchored exact keys — cost: none.
- Ruling: T5's test provides `global.mocks.$router` (the moved language Select uses `$router.replace`) — cost: none.
- Ruling: `usedKeys.test.ts` exists at app/tests/plugins/i18n (scanner error); T7 relies on it as planned.
- Ruling: one shared confirm helper `useConfirmAction({ header, message, accept })` in app/src/composables (modelled on useConfirmDelete) is created in T3 and reused by T4's "sign out other devices" — no copied dialog setup — cost: none.
- Ruling: `useLogout`'s promise resolves only after `authStore.logout()` settles; `onHide` must not resolve false once accept started; a throw inside accept rejects the promise (tests cover both) — cost: none.
- Ruling: avatar type validation is tested on `validateAvatarFile` directly (FileUpload's `accept` may pre-filter SVG); the toast path is not asserted — cost: none.
- Ruling: a signed-in user who confirms logout on /login or /register lands on login, as today ("[owner to confirm]" closed) — cost: none.
- Ruling: T1's test file carries the design comment the prose mentions — cost: none.
- Ruling: avatar INSERT/UPDATE policies enforce `^<uid>/avatar\.(png|jpg|webp)$` (no nested paths, no other names) — public bucket must not become free hosting — cost: none.
- Ruling: `appErrorHandler` shows `error.message` for any Error lacking status/code (generic toast) instead of returning early — silent failures hide outages — cost: a few more toasts for errors that were previously swallowed on purpose (check existing tests).
- Ruling: `avatar_url` is rendered only when it starts with the avatar bucket's public URL prefix (`safeAvatarUrl`) — tracking-pixel leak — cost: externally set URLs (none expected) stop rendering.

## Sahip için notlar

- `appErrorHandler` artık durum/kod taşımayan her `Error` için genel bir toast gösterir (`errors.unknown`); çalışma zamanı TypeError'ları kullanıcıya ham mesajla görünür. İstenirse belirli yollarla sınırlanabilir.
- Faz 0'dan kalan güvenlik gözlemi: `user_role` okuma izni her oturum açmış kullanıcıya tüm kullanıcı-rol çiftlerini gösteriyor (008_init_reference_data). Bu dalda düzeltilmedi.
- `locales/template.json` i18n-sync tarafından güncellenmiyor; 3 eski anahtar duruyor (önceden de geride idi).
