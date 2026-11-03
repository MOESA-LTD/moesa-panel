# Changelog

## [0.14.0-alpha.1](https://github.com/MOESA-LTD/moesa-panel/compare/moesa-panel-supabase-v0.13.0-alpha.1...moesa-panel-supabase-v0.14.0-alpha.1) (2026-11-03)


### Features

* **access:** read tenants and permissions from the tables, not the token ([6ca67e5](https://github.com/MOESA-LTD/moesa-panel/commit/6ca67e58d49ec7e79b8c981df38f92af674d6e96))
* add dashboard views for sales analytics and notifications ([b61b17a](https://github.com/MOESA-LTD/moesa-panel/commit/b61b17a69ce65eaefca464c6b5f7a6d569ceafbe))
* **audit:** transaction-grouped audit trail with safe revert ([53f6db1](https://github.com/MOESA-LTD/moesa-panel/commit/53f6db16a54e93c8483ae029d1a72c546f95df4e))
* **branch:** add branch profile page and tenant update permission ([32f7f43](https://github.com/MOESA-LTD/moesa-panel/commit/32f7f43a2accfecbf187158ffd8d623c5a60f735))
* **branches:** branch picker and requests over the selected branches ([0c91e79](https://github.com/MOESA-LTD/moesa-panel/commit/0c91e7947e2954a7a45232383257dd91281cfe4a))
* **branches:** list a member once per branch they belong to ([34386c0](https://github.com/MOESA-LTD/moesa-panel/commit/34386c014d52869b5c0260a4b9e1660a1a4390a4))
* **branches:** show the owners above a branch with its users ([2558ae9](https://github.com/MOESA-LTD/moesa-panel/commit/2558ae9401e47c545f58e7dfc5ffff97c10bdf0f))
* **branches:** sort and filter the branch column ([e73f7f3](https://github.com/MOESA-LTD/moesa-panel/commit/e73f7f3eb39357f23fdc4313ec15e5f5c3603545))
* **branches:** tenant tree, inherited ownership and multi-tenant requests ([b3b558a](https://github.com/MOESA-LTD/moesa-panel/commit/b3b558a2317d8e1b56f03dd245b5d90b137814a7))
* **branch:** profile with logo, website, tax details and address ([a10347d](https://github.com/MOESA-LTD/moesa-panel/commit/a10347d12150265bd78cbaa2c020347fbf39bb08))
* **customer:** customer cards with contacts, warehouses, platforms and brands ([0ad90fb](https://github.com/MOESA-LTD/moesa-panel/commit/0ad90fb040b508947941509f1332efae85032ac6))
* **dashboard:** weekly rhythm cards from gate, task and evidence views ([2118bfd](https://github.com/MOESA-LTD/moesa-panel/commit/2118bfd9c2874695a345a3f251779d0b92bcde98))
* **db:** reference data in migrations, transactional RPCs, one types file ([4d192dc](https://github.com/MOESA-LTD/moesa-panel/commit/4d192dc99fd10b884bfe13dc64156556a18a43e4))
* **document:** a document's file can be a media file instead of a Drive link ([705e515](https://github.com/MOESA-LTD/moesa-panel/commit/705e51553b8d094e20b4106bef77cdad93618ce2))
* **document:** evidence records with versions and signing rules ([55f92a0](https://github.com/MOESA-LTD/moesa-panel/commit/55f92a0aa6bbc59931c2518a113c58a52f3985bc))
* **media:** grant media permissions to existing roles ([b879c62](https://github.com/MOESA-LTD/moesa-panel/commit/b879c6267cdc2acb39d5f27f2bd133dec5505404))
* **media:** link media to records with one primary image and a library view ([0625363](https://github.com/MOESA-LTD/moesa-panel/commit/06253632c6e239f2d2edcbe65fb6c617459d8f00))
* **media:** media table and private bucket with type and size rules ([fdd96f1](https://github.com/MOESA-LTD/moesa-panel/commit/fdd96f15338f2978eb002f4319f7318a331336e4))
* Moesa Panel — infrastructure refactor, phase 1 and phase 2a ([231750e](https://github.com/MOESA-LTD/moesa-panel/commit/231750e5af20fb1a0b199fda6b10591686556f1d))
* **ops:** core settings, code sequences, platforms and pgTAP test setup ([3a03709](https://github.com/MOESA-LTD/moesa-panel/commit/3a0370906c4c8741f576b871d67759d3ea58246b))
* phase 2a — media management (M19) and glossary (M20) ([db23dc9](https://github.com/MOESA-LTD/moesa-panel/commit/db23dc976f6c07d6a717c46c3b88ec870e5a5059))
* **product:** add S10 CSV import with transactional report and export ([5db08e3](https://github.com/MOESA-LTD/moesa-panel/commit/5db08e3f70259269dbaedaddca33d56d0bd9ace8))
* **product:** filter the list by signed spec and link the dashboard card to it ([e58447d](https://github.com/MOESA-LTD/moesa-panel/commit/e58447d238a56d614545e1b8337aec7d0634396c))
* **product:** product master with GTIN validation and evidence view ([a4e5352](https://github.com/MOESA-LTD/moesa-panel/commit/a4e53523d99c219fd5176cc5b81baed12e9d3da8))
* **project:** projects with generated gates, phase checklists and pass_gate rules ([f256b22](https://github.com/MOESA-LTD/moesa-panel/commit/f256b2276ca8e69708869064ca9ec5476062ea77))
* **subscriptions:** enforce the plan's limits and read-only state ([1488608](https://github.com/MOESA-LTD/moesa-panel/commit/14886081eff7f04a3119a454c54937a2e8f9e949))
* **subscriptions:** plans of modules that limit what a company may use ([59494f2](https://github.com/MOESA-LTD/moesa-panel/commit/59494f2624666902851b7301ac60a526e52e454b))
* **subscriptions:** show the plan in the app, with locked modules ([c3638bd](https://github.com/MOESA-LTD/moesa-panel/commit/c3638bd129cd357acc71dcfc167c724dcb42728f))
* **subscriptions:** super admin panel for plans and subscriptions ([77b87b1](https://github.com/MOESA-LTD/moesa-panel/commit/77b87b1597d38efe392a2d05670f69d6ba2d658a))
* **supplier:** supplier register with terms, contacts and documents ([dee8946](https://github.com/MOESA-LTD/moesa-panel/commit/dee89466173f82ffd06287603c88b14716563349))
* **user:** add user management functionality ([df5187a](https://github.com/MOESA-LTD/moesa-panel/commit/df5187a477364616f9f3d0ef224b947284d83c84))


### Bug Fixes

* add created_at field to client seeding function for accurate timestamps ([a8de518](https://github.com/MOESA-LTD/moesa-panel/commit/a8de5188575fa395cf850f91490629350b80aa33))
* add currency_code and tax fields to record table for improved financial tracking ([65506d9](https://github.com/MOESA-LTD/moesa-panel/commit/65506d943b7a2d3c25f2c85aca81445108419f1f))
* **branches:** manage a user in their own branch, not the active one ([ae33fc6](https://github.com/MOESA-LTD/moesa-panel/commit/ae33fc60cfecdaef54e686fa9eb2359c74d10439))
* comment out tenant entries in seed.sql for clarity ([11ed37c](https://github.com/MOESA-LTD/moesa-panel/commit/11ed37c28b6760965514db8a14ba875ac1f9a850))
* correct 'assembly' to 'assemble' in record types and update related SQL constraint ([837b117](https://github.com/MOESA-LTD/moesa-panel/commit/837b11730f9f529065786ba7bad09f53f576787f))
* **customer:** only management changes contract terms ([b2418dc](https://github.com/MOESA-LTD/moesa-panel/commit/b2418dc0c0011b67b4ea926ca8874010c01dca4d))
* **dashboard:** resolve management gates for every viewer and filter the SKU links ([0b636b1](https://github.com/MOESA-LTD/moesa-panel/commit/0b636b1fa433549e3f739bbe705521eb4292e1a4))
* **database:** correct typo in record repair status enum ([a8b1f59](https://github.com/MOESA-LTD/moesa-panel/commit/a8b1f5993db142f6c94ca4c41f5b9ca080dac44e))
* **db:** cascade audit_log rows when a tenant is deleted ([39bea11](https://github.com/MOESA-LTD/moesa-panel/commit/39bea111fe7a349ba5449335fde42f4304585314))
* **document:** require signatures for approved spec sheets and freeze document identity ([4bf5202](https://github.com/MOESA-LTD/moesa-panel/commit/4bf520232ff45cf687bd51954d7475c4c0494840))
* **document:** scope definer triggers and uniqueness to the tenant ([47ee6e3](https://github.com/MOESA-LTD/moesa-panel/commit/47ee6e3709ba283ca81acce24a826cd23de454cc))
* **document:** signature flags for approved spec sheets only ([e559bf7](https://github.com/MOESA-LTD/moesa-panel/commit/e559bf7afb4aaa0c2495b8de55317c5fbae81171))
* enhance stock seeding function with unit_discount and unit_tax fields ([8ee16cd](https://github.com/MOESA-LTD/moesa-panel/commit/8ee16cd6fa816773230af4883af6f3fba6f7c137))
* **functions:** enforce authorization and validate input in edge functions ([eda9b82](https://github.com/MOESA-LTD/moesa-panel/commit/eda9b822881a0f7cd029255ed0bd9179c9b65f13))
* **project:** guard gate rules in the table, complete phase checklists, lock rollback ([cef3773](https://github.com/MOESA-LTD/moesa-panel/commit/cef3773431699230d23f031ba1fee4a49e02902f))
* **project:** guard un-passing, one advance per statement, lock on direct pass ([cd30381](https://github.com/MOESA-LTD/moesa-panel/commit/cd3038162d2a0bd019e1c589360456db51bb7cfc))
* **project:** no new projects for closed customers ([7c1b460](https://github.com/MOESA-LTD/moesa-panel/commit/7c1b460f5d9927f71d851d0567d042410bed304b))
* **project:** start non-npi projects at the phase their first gate closes ([3dee3aa](https://github.com/MOESA-LTD/moesa-panel/commit/3dee3aabf8d2e486d311edd12b2ea6dd7b6009b2))
* **public.audit_log:** ensure user_id and reverted_by references can be null ([01d87ef](https://github.com/MOESA-LTD/moesa-panel/commit/01d87efca86d3183470e126df779d124165fc0bc))
* **record:** correct spelling error in record status ([9982486](https://github.com/MOESA-LTD/moesa-panel/commit/998248695471d5cae4de9517e327e3b394584ad0))
* **security:** a tenant admin cannot take over another account ([c25ad7c](https://github.com/MOESA-LTD/moesa-panel/commit/c25ad7c856eb3926c815bb1c240ec890d3dcf0a8))
* **security:** tenants are not moved, memberships not re-pointed ([6a9d3e9](https://github.com/MOESA-LTD/moesa-panel/commit/6a9d3e9c757d1b8c36d52f92b84e7238f9e37d19))
* **seed.sql:** enable insert/update/delete permissions for all tables ([4105d11](https://github.com/MOESA-LTD/moesa-panel/commit/4105d11b570cbb08158dacd36361d1e2f712dd07))
* **seed:** coordinator cannot manage branches ([856e194](https://github.com/MOESA-LTD/moesa-panel/commit/856e194bd1ec68d75b511c710e140eaa1b8fe8c2))
* **seed:** generate valid client phone numbers ([6b259e3](https://github.com/MOESA-LTD/moesa-panel/commit/6b259e3c1b5ba08cc6a41333830bcd6c4e4fe2d0))
* set search_path for validate_record_amount function for consistency ([6b608a1](https://github.com/MOESA-LTD/moesa-panel/commit/6b608a1515e84c94e396c9d33a03fb8828501820))
* **supabase/config.toml:** enable SMTP/POP3 ports and update site URL ([0d89629](https://github.com/MOESA-LTD/moesa-panel/commit/0d89629cb30f77e038796ebfa03b884bba0e9369))
* **supplier:** scope the contact foreign key to the tenant ([6ee7a45](https://github.com/MOESA-LTD/moesa-panel/commit/6ee7a45e2fe9c15b36aa9b533b9b766ea83521d4))
* **tables:** remove unnecessary spaces and improve readability in SQL migrations ([8e182b3](https://github.com/MOESA-LTD/moesa-panel/commit/8e182b33e88f2ef9f8716ed109c7cf5d9990036b))
* update record seeding to include currency_code and tax fields ([8ee6502](https://github.com/MOESA-LTD/moesa-panel/commit/8ee6502d13291e9033b857de8997eea99e5a25fd))
* update valid_stock_quantity domain to allow zero values ([5a0efba](https://github.com/MOESA-LTD/moesa-panel/commit/5a0efbafce6966da08ff6c3ae1d19851f4c9e8fb))
* **user:** correct column names for metadata and tenant_id ([221b16e](https://github.com/MOESA-LTD/moesa-panel/commit/221b16ed4fa7089ca7930a0aab5799786ee92c80))

## [0.13.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.12.0-alpha.1...echochart-supabase-v0.13.0-alpha.1) (2025-09-27)


### Features

* add dashboard views for sales analytics and notifications ([b61b17a](https://github.com/EchoChart/echochart/commit/b61b17a69ce65eaefca464c6b5f7a6d569ceafbe))

## [0.12.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.11.1-alpha.1...echochart-supabase-v0.12.0-alpha.1) (2025-07-18)


### Features

* **user:** add user management functionality ([df5187a](https://github.com/EchoChart/echochart/commit/df5187a477364616f9f3d0ef224b947284d83c84))


### Bug Fixes

* **database:** correct typo in record repair status enum ([a8b1f59](https://github.com/EchoChart/echochart/commit/a8b1f5993db142f6c94ca4c41f5b9ca080dac44e))
* **public.audit_log:** ensure user_id and reverted_by references can be null ([01d87ef](https://github.com/EchoChart/echochart/commit/01d87efca86d3183470e126df779d124165fc0bc))
* **record:** correct spelling error in record status ([9982486](https://github.com/EchoChart/echochart/commit/998248695471d5cae4de9517e327e3b394584ad0))
* **seed.sql:** enable insert/update/delete permissions for all tables ([4105d11](https://github.com/EchoChart/echochart/commit/4105d11b570cbb08158dacd36361d1e2f712dd07))
* **supabase/config.toml:** enable SMTP/POP3 ports and update site URL ([0d89629](https://github.com/EchoChart/echochart/commit/0d89629cb30f77e038796ebfa03b884bba0e9369))
* **tables:** remove unnecessary spaces and improve readability in SQL migrations ([8e182b3](https://github.com/EchoChart/echochart/commit/8e182b33e88f2ef9f8716ed109c7cf5d9990036b))
* **user:** correct column names for metadata and tenant_id ([221b16e](https://github.com/EchoChart/echochart/commit/221b16ed4fa7089ca7930a0aab5799786ee92c80))

## [0.11.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.11.0-alpha.1...echochart-supabase-v0.11.1-alpha.1) (2025-07-08)


### Bug Fixes

* update valid_stock_quantity domain to allow zero values ([5a0efba](https://github.com/EchoChart/echochart/commit/5a0efbafce6966da08ff6c3ae1d19851f4c9e8fb))

## [0.11.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.10.0-alpha.1...echochart-supabase-v0.11.0-alpha.1) (2025-05-22)


### Features

* enhance audit logging with request ID tracking ([30d8745](https://github.com/EchoChart/echochart/commit/30d8745e771eb7ed6066c0aa43ec906f36b71e02))
* implement record management with CRUD, validation and routing for sales ([5947df5](https://github.com/EchoChart/echochart/commit/5947df571e226c8591cddead67071341418c0f40))


### Bug Fixes

* add created_at field to client seeding function for accurate timestamps ([a8de518](https://github.com/EchoChart/echochart/commit/a8de5188575fa395cf850f91490629350b80aa33))
* add currency_code and tax fields to record table for improved financial tracking ([65506d9](https://github.com/EchoChart/echochart/commit/65506d943b7a2d3c25f2c85aca81445108419f1f))
* add IF NOT EXISTS to index creation statements in migration script ([0a1056c](https://github.com/EchoChart/echochart/commit/0a1056c7245d4e09e9f460cba0bfd65a04db3a5c))
* add initial tenant entries to seed data for better testing coverage ([992eed9](https://github.com/EchoChart/echochart/commit/992eed90c23c6d7d499f68e616a58b42bc0b69af))
* add service routes and update product category props for service ([e72ff2e](https://github.com/EchoChart/echochart/commit/e72ff2e32d86b47ef4f900feb0a0947026ff833f))
* comment out tenant entries in seed.sql for clarity ([11ed37c](https://github.com/EchoChart/echochart/commit/11ed37c28b6760965514db8a14ba875ac1f9a850))
* correct 'assembly' to 'assemble' in record types and update related SQL constraint ([837b117](https://github.com/EchoChart/echochart/commit/837b11730f9f529065786ba7bad09f53f576787f))
* enhance stock management by adding unit type, discount, and tax fields in Upsert component and database schema ([9429125](https://github.com/EchoChart/echochart/commit/9429125534e9eead1923eef813c7afea32972978))
* enhance stock seeding function with unit_discount and unit_tax fields ([8ee16cd](https://github.com/EchoChart/echochart/commit/8ee16cd6fa816773230af4883af6f3fba6f7c137))
* prevent duplicate role assignment in tenant owner trigger function ([635d71c](https://github.com/EchoChart/echochart/commit/635d71c1a49438a6bb1432020725f5ed71e6af30))
* rename assigned_user_id to user_id for consistency in sales table ([4a740ae](https://github.com/EchoChart/echochart/commit/4a740ae18bdb42fdf6b2c2dc498666566ac3313e))
* rename sales table to record and update references, enhancing record management ([3d22ff6](https://github.com/EchoChart/echochart/commit/3d22ff6bd226216f9bed2a33672a05db30a6c64e))
* rename stock_date to stocked_at in components and SQL migration ([bfc33c6](https://github.com/EchoChart/echochart/commit/bfc33c6e3dec072e2b84be99e87043de3159c854))
* set default values for JSONB fields in user, record, and audit_log tables for better data integrity ([bcb6401](https://github.com/EchoChart/echochart/commit/bcb64011572e9bf2def8b4d84446ceb0944668c5))
* set search_path for validate_record_amount function for consistency ([6b608a1](https://github.com/EchoChart/echochart/commit/6b608a1515e84c94e396c9d33a03fb8828501820))
* standardize index naming conventions across database tables for consistency ([10f0bd2](https://github.com/EchoChart/echochart/commit/10f0bd29acbae5791156fa522348a15320c49996))
* update client seeding to use dynamic data generation for improved randomness ([c14006e](https://github.com/EchoChart/echochart/commit/c14006e876b1f1a40309ed361987aa2b597fec47))
* update column name and increase stock generation range in seed.sql ([f0216f8](https://github.com/EchoChart/echochart/commit/f0216f8a419e46b39cc6389f7217d796f95e3037))
* update display_name value to lowercase in seed data for uniformity ([4a740ae](https://github.com/EchoChart/echochart/commit/4a740ae18bdb42fdf6b2c2dc498666566ac3313e))
* update init_request_id and get_request_id functions to include search_path setting for improved context ([d9f3a3a](https://github.com/EchoChart/echochart/commit/d9f3a3a0b0ea3f239fd9d38c4ddc5f68b3ddedcf))
* update record seeding to include currency_code and tax fields ([8ee6502](https://github.com/EchoChart/echochart/commit/8ee6502d13291e9033b857de8997eea99e5a25fd))
* update record table to use NUMERIC type for amount, bid, and bid_discount for improved precision ([ce25fda](https://github.com/EchoChart/echochart/commit/ce25fda9ebca9f8243d2c392a5d242e3d1a35ebc))
* update stock field names and calculations in Upsert component and SQL migration ([0230065](https://github.com/EchoChart/echochart/commit/02300650d6289436daab114c8430adacabf04fe4))
* update stock table to use NUMERIC type for quantity, unit_cost, unit_discount, and unit_tax for better precision ([ad4c4f8](https://github.com/EchoChart/echochart/commit/ad4c4f8172ef27e8235925726564558312b75162))
* update user table to store metadata directly instead of separate fields ([1b5a26e](https://github.com/EchoChart/echochart/commit/1b5a26e9de99e2cb6bc13a5ada3d3223b7b469a8))

## [0.10.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.9.0-alpha.1...echochart-supabase-v0.10.0-alpha.1) (2025-04-18)


### Features

* **audit-log:** add audit log functionality with CRUD operations and UI components ([cf67c7a](https://github.com/EchoChart/echochart/commit/cf67c7a1155bbd108ca8ad96e6ce9d0082bb73df))

## [0.9.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.8.0-alpha.1...echochart-supabase-v0.9.0-alpha.1) (2025-04-08)


### Features

* introduce SelectCountry component and update filters for consistency in client and product forms ([c037eca](https://github.com/EchoChart/echochart/commit/c037eca085ba1477c2a3cb2313f8d96d35613830))

## [0.8.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.7.0-alpha.1...echochart-supabase-v0.8.0-alpha.1) (2025-03-25)


### Features

* add address management functionality with CRUD operations and related database triggers ([de5dff0](https://github.com/EchoChart/echochart/commit/de5dff0390086010b1d4f37df7900c12741fec61))

## [0.7.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.6.0-alpha.1...echochart-supabase-v0.7.0-alpha.1) (2025-03-17)


### Features

* enable query plan explanation and reload configuration in seed script ([7848a37](https://github.com/EchoChart/echochart/commit/7848a37b504ca2eb2a75669140e541b8ce73933c))
* enable row level security for specified tables in migration scripts ([2fc35d5](https://github.com/EchoChart/echochart/commit/2fc35d523074819493a1929071e7064ccd28ce57))
* set search path in assign_owner_role function for improved security context ([685dde5](https://github.com/EchoChart/echochart/commit/685dde56934f2cf6fd4ad77b010a0001f7ea6821))

## [0.6.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.5.0-alpha.1...echochart-supabase-v0.6.0-alpha.1) (2025-03-14)


### Features

* update numeric precision for unit_cost and total_cost to 3 decimal places ([01c0280](https://github.com/EchoChart/echochart/commit/01c028000a2c797621ead39ffd3e6f44c041068b))
* update tenant_user and tenant_owner references, add role assignment trigger for tenant owners ([ed8428a](https://github.com/EchoChart/echochart/commit/ed8428a6e6adade1b4b24884929fef8255908d21))

## [0.5.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.4.0-alpha.1...echochart-supabase-v0.5.0-alpha.1) (2025-03-13)


### Features

* add tenant_owner table and update account creation logic to associate users with tenants ([f1c9d29](https://github.com/EchoChart/echochart/commit/f1c9d29eb65d7f51848a1416c53be98c56011669))

## [0.4.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.3.0-alpha.1...echochart-supabase-v0.4.0-alpha.1) (2025-03-10)


### Features

* add client management functionality with routing and database integration ([febd3f8](https://github.com/EchoChart/echochart/commit/febd3f84cbfbc5bba66f2a8cf1d00937b3919651))

## [0.3.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.2.2-alpha.1...echochart-supabase-v0.3.0-alpha.1) (2025-03-06)


### Features

* **stock:** add stocks table with constraints, indexes, and views for stock management ([6d4e474](https://github.com/EchoChart/echochart/commit/6d4e4745106ef081c1f802de1fd886c911ade11f))

## [0.2.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.2.1-alpha.1...echochart-supabase-v0.2.2-alpha.1) (2025-02-06)


### Bug Fixes

* **migrations:** ensure proper newline at end of file in init_schemas.sql ([6de4162](https://github.com/EchoChart/echochart/commit/6de416228cc0f32ce9afe58625783ea52126347e))

## [0.2.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.2.0-alpha.1...echochart-supabase-v0.2.1-alpha.1) (2025-01-30)


### Performance Improvements

* permissons are cached. RLS performance improved ([21e28ad](https://github.com/EchoChart/echochart/commit/21e28adb21c22bd1297bde1ff534532127f9dd49))

## [0.2.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.1.0-alpha.1...echochart-supabase-v0.2.0-alpha.1) (2025-01-24)


### Features

* users can switch between their branches ([dcb4a48](https://github.com/EchoChart/echochart/commit/dcb4a489407436c32cc650ac93a73db698f5010b))

## [0.1.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-supabase-v0.0.1-alpha.1...echochart-supabase-v0.1.0-alpha.1) (2025-01-08)


### Features

* **account:** update account ([c23f84a](https://github.com/EchoChart/echochart/commit/c23f84a790c03cb35d6241b668bb57d9f02737b7))

## 0.0.1-alpha.1 (2025-01-07)


### Features

* db migrations added ([2d80716](https://github.com/EchoChart/echochart/commit/2d8071644c43ab112f0cf16d22b19078746862df))
* Initial commit with boilerplate setup ([54d00d1](https://github.com/EchoChart/echochart/commit/54d00d17fd3852455070082322817b76cff7ea48))


### Miscellaneous Chores

* release 0.0.1 ([974f07e](https://github.com/EchoChart/echochart/commit/974f07e750591bff3d27bbdd8d74b7d265683304))
* release 0.0.1-alpha.1 ([7adbc2b](https://github.com/EchoChart/echochart/commit/7adbc2bfa4437a6f750bb9ed33809ee06c470ae6))
