# Changelog

## [2.0.0-alpha.1](https://github.com/MOESA-LTD/moesa-panel/compare/moesa-panel-app-v1.5.3-alpha.1...moesa-panel-app-v2.0.0-alpha.1) (2026-11-03)


### ⚠ BREAKING CHANGES

* js to ts big refactor

### Features

* **access:** read tenants and permissions from the tables, not the token ([6ca67e5](https://github.com/MOESA-LTD/moesa-panel/commit/6ca67e58d49ec7e79b8c981df38f92af674d6e96))
* add innerMoldModels and update moldSpeakerPowers for clarity ([f36cb46](https://github.com/MOESA-LTD/moesa-panel/commit/f36cb46075a929b61628d1b80f936957ee050dc0))
* add PrintElementButton component for printing elements with dark mode support ([6cd26f9](https://github.com/MOESA-LTD/moesa-panel/commit/6cd26f9dcfa7a0760110fdfd60ac5c325cc2b312))
* add SelectResource component for resource selection dialog ([63f7f55](https://github.com/MOESA-LTD/moesa-panel/commit/63f7f556c8b399593fb0a680f222d0f3e8033cbe))
* **api:** add tenant-scoped query keys and table invalidation ([bd42ac9](https://github.com/MOESA-LTD/moesa-panel/commit/bd42ac9b05bfd6fc69fc974c5d44ab3ed604d0b9))
* **app:** add `primelocale` for  primevue internationalization support ([24c6042](https://github.com/MOESA-LTD/moesa-panel/commit/24c60424e90ef812e271086873507006f9ae470c))
* **audit:** transaction-grouped audit trail with safe revert ([53f6db1](https://github.com/MOESA-LTD/moesa-panel/commit/53f6db16a54e93c8483ae029d1a72c546f95df4e))
* **BaseModel:** introduce BaseModel ([29650f3](https://github.com/MOESA-LTD/moesa-panel/commit/29650f3868d55480df98c446fe583223987df4ef))
* **branch:** add branch profile page and tenant update permission ([32f7f43](https://github.com/MOESA-LTD/moesa-panel/commit/32f7f43a2accfecbf187158ffd8d623c5a60f735))
* **branches:** branch column and per-row permissions in lists, forms scoped to their row's branch ([15fe60b](https://github.com/MOESA-LTD/moesa-panel/commit/15fe60bf8f75ae699c941ecf7633146ddcd33f87))
* **branches:** branch management page ([89127e2](https://github.com/MOESA-LTD/moesa-panel/commit/89127e2b07f733061b07a27a3212b184f4ab1e05))
* **branches:** branch picker and requests over the selected branches ([0c91e79](https://github.com/MOESA-LTD/moesa-panel/commit/0c91e7947e2954a7a45232383257dd91281cfe4a))
* **branches:** list a member once per branch they belong to ([34386c0](https://github.com/MOESA-LTD/moesa-panel/commit/34386c014d52869b5c0260a4b9e1660a1a4390a4))
* **branches:** show the owners above a branch with its users ([2558ae9](https://github.com/MOESA-LTD/moesa-panel/commit/2558ae9401e47c545f58e7dfc5ffff97c10bdf0f))
* **branches:** sort and filter the branch column ([e73f7f3](https://github.com/MOESA-LTD/moesa-panel/commit/e73f7f3eb39357f23fdc4313ec15e5f5c3603545))
* **branch:** profile with logo, website, tax details and address ([a10347d](https://github.com/MOESA-LTD/moesa-panel/commit/a10347d12150265bd78cbaa2c020347fbf39bb08))
* **customer:** customer cards with contacts, warehouses, platforms and brands ([0ad90fb](https://github.com/MOESA-LTD/moesa-panel/commit/0ad90fb040b508947941509f1332efae85032ac6))
* **dashboard:** add monthly trends chart ([47ec576](https://github.com/MOESA-LTD/moesa-panel/commit/47ec57651818c336ff936689ff55f5d36cc666ec))
* **dashboard:** weekly rhythm cards from gate, task and evidence views ([2118bfd](https://github.com/MOESA-LTD/moesa-panel/commit/2118bfd9c2874695a345a3f251779d0b92bcde98))
* **dayjs:** Introduce date parsing and validation utilities ([fb11505](https://github.com/MOESA-LTD/moesa-panel/commit/fb1150592c687b6cc7216a7ea9dff3319ed8c26e))
* **db:** reference data in migrations, transactional RPCs, one types file ([4d192dc](https://github.com/MOESA-LTD/moesa-panel/commit/4d192dc99fd10b884bfe13dc64156556a18a43e4))
* define ResourceTableProps type and update props in ResourceTable component ([b3987bf](https://github.com/MOESA-LTD/moesa-panel/commit/b3987bffc0313f0f5f9bdac4426f5864b59994d5))
* **dialog:** open route dialogs maximized or snapped from the query string ([4e2132d](https://github.com/MOESA-LTD/moesa-panel/commit/4e2132dc8d825c07b5e19888d073e50f2d6f0289))
* **dialog:** resize snapped dialogs ([e35f0cf](https://github.com/MOESA-LTD/moesa-panel/commit/e35f0cf8e4768e5ad596b43f29dc82a2931dc381))
* **dialog:** show where a dragged dialog can be snapped ([e7e9cd0](https://github.com/MOESA-LTD/moesa-panel/commit/e7e9cd008753e19341a0263293a724a4631cbdfa))
* **dialog:** snap route dialogs to halves and quarters of the viewport ([656a471](https://github.com/MOESA-LTD/moesa-panel/commit/656a471c74aa05959001caf3d3353b148d006acd))
* **dialog:** window buttons and maximize/minimize for route dialogs ([7d5c3f8](https://github.com/MOESA-LTD/moesa-panel/commit/7d5c3f8a4d096702bea680e6d3a27f60034ec334))
* **document:** a document's file can be a media file instead of a Drive link ([705e515](https://github.com/MOESA-LTD/moesa-panel/commit/705e51553b8d094e20b4106bef77cdad93618ce2))
* **document:** document list per record and upsert dialog ([58c3174](https://github.com/MOESA-LTD/moesa-panel/commit/58c3174c48503a76ab1e304b4d919f3262ed4d83))
* **document:** global document list ([c98e2b4](https://github.com/MOESA-LTD/moesa-panel/commit/c98e2b4a4f3407c12fa821df88e750d95e168e83))
* **document:** upload or pick a media file for any document; product list thumbnails ([b0479fe](https://github.com/MOESA-LTD/moesa-panel/commit/b0479fe24effb00957a7fde8e53f2bd56cf59812))
* **form:** add field routes for form handling ([de4bf3b](https://github.com/MOESA-LTD/moesa-panel/commit/de4bf3b8b263f83166ae42358b146a15294736e6))
* **form:** add zod-based useForm with field-level database errors ([c4f5f7a](https://github.com/MOESA-LTD/moesa-panel/commit/c4f5f7acd6b2f8a7bc185fefdf97b0ed7113bd17))
* **forms:** ask before discarding unsaved changes ([4923643](https://github.com/MOESA-LTD/moesa-panel/commit/4923643a8cbd4268038ce1e58282c789ac5a83c8))
* **forms:** keep unsaved edits and open dialogs across reloads ([a80f57d](https://github.com/MOESA-LTD/moesa-panel/commit/a80f57d75912c7097225a9756f51bf0f7629fdeb))
* **i18n:** add Italian support and update translations ([cfba374](https://github.com/MOESA-LTD/moesa-panel/commit/cfba3748fab5e0e47198b812d915c08022805c0b))
* **i18n:** glossary of packages, gates, document types and statuses ([3b01f1c](https://github.com/MOESA-LTD/moesa-panel/commit/3b01f1ce8a82acae411a77a64ab1e7ce7a1704e9))
* implement error tooltip component styles and integrate with ErrorBadge and FormField ([cf66188](https://github.com/MOESA-LTD/moesa-panel/commit/cf66188a80e1ca1d044ee6d3efbb6d45404a1c07))
* **layout:** consolidate theme options and improve UI components ([d8cbea7](https://github.com/MOESA-LTD/moesa-panel/commit/d8cbea7b1c04ed81338aa958bee299b54d8bb15b))
* **media:** link media to records with one primary image and a library view ([0625363](https://github.com/MOESA-LTD/moesa-panel/commit/06253632c6e239f2d2edcbe65fb6c617459d8f00))
* **media:** media library with customer, type, tag and linked-record filters ([ab9f2dd](https://github.com/MOESA-LTD/moesa-panel/commit/ab9f2ddbf79448ec5d6355f4d9ec9e730dd6f5fd))
* **media:** media tab on product and customer cards with upload, primary image and library links ([6f3a3a2](https://github.com/MOESA-LTD/moesa-panel/commit/6f3a3a2fe5780c38dfbcd3fd04af27f7be9bde40))
* **media:** media table and private bucket with type and size rules ([fdd96f1](https://github.com/MOESA-LTD/moesa-panel/commit/fdd96f15338f2978eb002f4319f7318a331336e4))
* **media:** upload, signed URLs, links and library queries ([4f73ab6](https://github.com/MOESA-LTD/moesa-panel/commit/4f73ab6fbfa3600c360db81ce62aa13492b74491))
* **model:** map API DTOs to models with derived values ([4666999](https://github.com/MOESA-LTD/moesa-panel/commit/46669992fe52be7bb3f0e22b3e045a51bcce53f2))
* Moesa Panel — infrastructure refactor, phase 1 and phase 2a ([231750e](https://github.com/MOESA-LTD/moesa-panel/commit/231750e5af20fb1a0b199fda6b10591686556f1d))
* **ops:** core settings, code sequences, platforms and pgTAP test setup ([3a03709](https://github.com/MOESA-LTD/moesa-panel/commit/3a0370906c4c8741f576b871d67759d3ea58246b))
* **ops:** operations section, settings page and customer filter store ([1801347](https://github.com/MOESA-LTD/moesa-panel/commit/1801347e0cc0ee565a8399db477f6966b9e1306a))
* phase 2a — media management (M19) and glossary (M20) ([db23dc9](https://github.com/MOESA-LTD/moesa-panel/commit/db23dc976f6c07d6a717c46c3b88ec870e5a5059))
* **product:** add S10 CSV import with transactional report and export ([5db08e3](https://github.com/MOESA-LTD/moesa-panel/commit/5db08e3f70259269dbaedaddca33d56d0bd9ace8))
* **product:** filter the list by signed spec and link the dashboard card to it ([e58447d](https://github.com/MOESA-LTD/moesa-panel/commit/e58447d238a56d614545e1b8337aec7d0634396c))
* **product:** product list and card with dimensions, cost and documents ([e69d2d9](https://github.com/MOESA-LTD/moesa-panel/commit/e69d2d937c03bd5161a9ad534d44261defaedd20))
* **project:** project list, phase strip, gate panel and task checklist ([bf71305](https://github.com/MOESA-LTD/moesa-panel/commit/bf71305c599065df3255d0bce0b304a00bda58bf))
* Refactor Record and Stock forms to improve type safety and localization ([15b6ece](https://github.com/MOESA-LTD/moesa-panel/commit/15b6ece0e7303da5c0a0ca549ed781476dffd8be))
* **service-components/resource-table:** add new props and enable expansion ([f90c7e9](https://github.com/MOESA-LTD/moesa-panel/commit/f90c7e9bff365e275c9d13e7eea23c2e67e32e51))
* **StatisticCard:** Adds new StatisticCard component for displaying statistical data ([203804d](https://github.com/MOESA-LTD/moesa-panel/commit/203804d34361ad5d8fc60e16eaa6e2f8b4f944be))
* **subscriptions:** enforce the plan's limits and read-only state ([1488608](https://github.com/MOESA-LTD/moesa-panel/commit/14886081eff7f04a3119a454c54937a2e8f9e949))
* **subscriptions:** show the plan in the app, with locked modules ([c3638bd](https://github.com/MOESA-LTD/moesa-panel/commit/c3638bd129cd357acc71dcfc167c724dcb42728f))
* **subscriptions:** super admin panel for plans and subscriptions ([77b87b1](https://github.com/MOESA-LTD/moesa-panel/commit/77b87b1597d38efe392a2d05670f69d6ba2d658a))
* **supplier:** supplier register with terms, contacts and documents ([dee8946](https://github.com/MOESA-LTD/moesa-panel/commit/dee89466173f82ffd06287603c88b14716563349))
* **TotalRowCountCard:** Adds TotalRowCountCard component to display total row count with date filters. ([a3a3316](https://github.com/MOESA-LTD/moesa-panel/commit/a3a33167059780b54352a3229c5960dae4c3e9ed))
* **ui:** enum selects explain each option from the glossary ([ba68409](https://github.com/MOESA-LTD/moesa-panel/commit/ba68409f368fae155a5346080432c915fa1c9ba1))
* **user:** add user management functionality ([df5187a](https://github.com/MOESA-LTD/moesa-panel/commit/df5187a477364616f9f3d0ef224b947284d83c84))


### Bug Fixes

* **Account Profile:** remove unnecessary '+' from phone value ([6f66092](https://github.com/MOESA-LTD/moesa-panel/commit/6f66092571be2fc035d19297aa7eac3fcd4d9efa))
* **account-popover:** adjust spacing and options in account popover component ([461bbc6](https://github.com/MOESA-LTD/moesa-panel/commit/461bbc6691d0472cfc6df3f9d12d630959655c86))
* **account/profile:** update phone input model value ([9a21141](https://github.com/MOESA-LTD/moesa-panel/commit/9a2114148b880d93151be1a6d0ecdf63e4048c20))
* add currency_code field to Database type for improved data structure ([052f2c8](https://github.com/MOESA-LTD/moesa-panel/commit/052f2c84027cfe5fd9c712498a2da5115de54384))
* add JSDoc type annotation for fields in Index.vue ([be7d9b9](https://github.com/MOESA-LTD/moesa-panel/commit/be7d9b9da880794038ce6afe8fb89a72d08f6296))
* add JSDoc types for columns and filters in various Index.vue files ([fd229b7](https://github.com/MOESA-LTD/moesa-panel/commit/fd229b74a07c3da9835f7224571114101f1a94a4))
* add JSDoc types for fields in Upsert components ([29fbd35](https://github.com/MOESA-LTD/moesa-panel/commit/29fbd354473cf06bc1013a013f10453a2ebd172c))
* add loading progress bar and improve layout class structure for better UI responsiveness ([f1b4b45](https://github.com/MOESA-LTD/moesa-panel/commit/f1b4b45c7a5bda12a74da30cb6c618b28dc577ae))
* add tax field to Database type for improved financial tracking ([c3e0b2b](https://github.com/MOESA-LTD/moesa-panel/commit/c3e0b2b529e7c68acc0b5ce56369c6d73eb8f06b))
* adjust styling for actions bar and button container in FormBox component ([18a979b](https://github.com/MOESA-LTD/moesa-panel/commit/18a979bc2669e12df7adf556a6f473ec94054fb5))
* **AppConfigurator.vue:** remove language tooltip ([cdc4fd3](https://github.com/MOESA-LTD/moesa-panel/commit/cdc4fd3a27b8531681284db24299032d935b3421))
* **appErrorHandler:** prioritize error.message over other fields ([ff1b9cb](https://github.com/MOESA-LTD/moesa-panel/commit/ff1b9cb00cfed259683f0e121d4da42dfa1c0f40))
* **appErrorHandler:** remove unnecessary string interpolation ([cd4e3dd](https://github.com/MOESA-LTD/moesa-panel/commit/cd4e3dd64e472ce4b69c0750e2af25d9cac4bff1))
* **auth/register:** remove invalid prop from Password component ([53468ac](https://github.com/MOESA-LTD/moesa-panel/commit/53468ac738f53600dcae697fdb49a53c9fb81723))
* **branches:** label the branch picker and keep the header on one line on phones ([a6a7fe8](https://github.com/MOESA-LTD/moesa-panel/commit/a6a7fe8f87f0b19ed2e7265cd7492662b9a5ec75))
* **branches:** manage a user in their own branch, not the active one ([ae33fc6](https://github.com/MOESA-LTD/moesa-panel/commit/ae33fc60cfecdaef54e686fa9eb2359c74d10439))
* **branches:** reopen the last picked branch after a reload ([ab6a9fe](https://github.com/MOESA-LTD/moesa-panel/commit/ab6a9fe4dd5901ad5e4388e19eea264817b85cef))
* brand select emitted "client" and misspelled injection key ([47d0cc7](https://github.com/MOESA-LTD/moesa-panel/commit/47d0cc77b659c7ecf04b3bbda47a8798ac84eb03))
* change event listener from click to mouseup in Sidebar.vue ([1f1e4a5](https://github.com/MOESA-LTD/moesa-panel/commit/1f1e4a5c3758b10067a010e15b52b6e67a73a250))
* **client-address:** correct router link name for manage address feature ([a1ebb1f](https://github.com/MOESA-LTD/moesa-panel/commit/a1ebb1f62dfeba528aa7a2969dddf5e99f443535))
* **client/upsert/Index.vue:** correct router names for client management tabs ([c2c3d98](https://github.com/MOESA-LTD/moesa-panel/commit/c2c3d9838627aaa9d67df458f3720fadbe91464d))
* **client:** drop unused duplicate rules and stop mutating parent data ([e7ca3e3](https://github.com/MOESA-LTD/moesa-panel/commit/e7ca3e3864c7c9fe02a3044396814c30fb431d0a))
* **Collection:** update merge method to accept array of attributes ([a1da302](https://github.com/MOESA-LTD/moesa-panel/commit/a1da302ad32352f33b88dde04e2885b932bbe009))
* correct 'assembly' to 'assemble' in record types and update related SQL constraint ([837b117](https://github.com/MOESA-LTD/moesa-panel/commit/837b11730f9f529065786ba7bad09f53f576787f))
* correct import path for ResourceDataView component ([8c1b9a9](https://github.com/MOESA-LTD/moesa-panel/commit/8c1b9a9a4c00c07afe4c345848e65981a88cbe2c))
* correct margin utility for phone input select component ([44f3b99](https://github.com/MOESA-LTD/moesa-panel/commit/44f3b99fc725a5212106c9c82320d5d1ee0c55ee))
* correct type for options.body in customFetch function ([a60bedf](https://github.com/MOESA-LTD/moesa-panel/commit/a60bedf3ee8c1909088b236bbf9b2c3efeb77bcf))
* **custom-table:** respect stateStorage, scope session cleanup, unique column keys ([8053186](https://github.com/MOESA-LTD/moesa-panel/commit/8053186f4e90f7ceec4394dcd04fb3fe3d9e6194))
* **custom-table:** update date format to include time and change hour format ([a9a5b54](https://github.com/MOESA-LTD/moesa-panel/commit/a9a5b54032a58e43c961b8c752f52739b20ac151))
* **customer:** only management changes contract terms ([b2418dc](https://github.com/MOESA-LTD/moesa-panel/commit/b2418dc0c0011b67b4ea926ca8874010c01dca4d))
* **dashboard:** include sign-in status in sidebar inactive logic ([67cdbac](https://github.com/MOESA-LTD/moesa-panel/commit/67cdbac2321a9f0624e79cde5ab1fb4bb7da60b2))
* **dashboard:** name the user in notifications, or the system when there is none ([8f14474](https://github.com/MOESA-LTD/moesa-panel/commit/8f144746f8067e2008bc15a9d6af47bebdaaca26))
* **dashboard:** resolve management gates for every viewer and filter the SKU links ([0b636b1](https://github.com/MOESA-LTD/moesa-panel/commit/0b636b1fa433549e3f739bbe705521eb4292e1a4))
* **dashboard:** show "user" rather than the e-mail when a user has no name ([1d80618](https://github.com/MOESA-LTD/moesa-panel/commit/1d80618be8423e5208469149e3a4f50150b4a817))
* **dashboard:** update notification button styling ([53799a5](https://github.com/MOESA-LTD/moesa-panel/commit/53799a5fbac5765428335bc3a1158da7b8b1e566))
* **dashboard:** update text color and enhance user display logic ([24ee8e3](https://github.com/MOESA-LTD/moesa-panel/commit/24ee8e34abfdd198161401f44d0be42baa9cbd66))
* **database:** correct typo in record repair status enum ([a8b1f59](https://github.com/MOESA-LTD/moesa-panel/commit/a8b1f5993db142f6c94ca4c41f5b9ca080dac44e))
* **date:** update date handling logic ([2d8e44a](https://github.com/MOESA-LTD/moesa-panel/commit/2d8e44acd675d0d6ec21c1a950e271d2784ffe4f))
* **deploy:** update configuration for related projects ([c085f00](https://github.com/MOESA-LTD/moesa-panel/commit/c085f0095279bdf669bf426058766c6b16e0c43b))
* **deploy:** update ignore command for Vercel deployment ([68ea1a1](https://github.com/MOESA-LTD/moesa-panel/commit/68ea1a1c4bb6730cfb0c5932b9ae37743f337085))
* **deploy:** update ignore command syntax in vercel.json ([1e08b95](https://github.com/MOESA-LTD/moesa-panel/commit/1e08b9552a5652b6371baf40849253227cc8deb4))
* **dialog:** opening a dialog's URL directly showed it twice ([656a471](https://github.com/MOESA-LTD/moesa-panel/commit/656a471c74aa05959001caf3d3353b148d006acd))
* **dialog:** reopen a tenant's dialogs when switching back to it ([2ebaff2](https://github.com/MOESA-LTD/moesa-panel/commit/2ebaff2bee6b334690fce9efb8ce05f787c4a076))
* **document:** file a new document under the record it was opened from ([2409ce8](https://github.com/MOESA-LTD/moesa-panel/commit/2409ce8015fd27d325c4802eccd879bc27a73cd2))
* **document:** require signatures for approved spec sheets and freeze document identity ([4bf5202](https://github.com/MOESA-LTD/moesa-panel/commit/4bf520232ff45cf687bd51954d7475c4c0494840))
* **document:** signature flags for approved spec sheets only ([e559bf7](https://github.com/MOESA-LTD/moesa-panel/commit/e559bf7afb4aaa0c2495b8de55317c5fbae81171))
* enhance Address and General components with dynamic data fetching and props ([20810bd](https://github.com/MOESA-LTD/moesa-panel/commit/20810bd79991aa8031e2b3360303b80c0280f14f))
* enhance fetchQuery logic with improved error handling and query invalidation for data updates ([a10667a](https://github.com/MOESA-LTD/moesa-panel/commit/a10667addb5a79dd02f55315bbafc731a61b8ba7))
* enhance validation rules and improve stock selection in Upsert component ([3341dce](https://github.com/MOESA-LTD/moesa-panel/commit/3341dcec27b51244f4e49940208afd10ccfec0e4))
* **forms:** pick readonly by the action the form submits; stock form fixes ([ec17262](https://github.com/MOESA-LTD/moesa-panel/commit/ec17262857c8e9d24785499498bdb23db8adb8d5))
* **form:** validate edited fields and clear errors on reset ([00699ef](https://github.com/MOESA-LTD/moesa-panel/commit/00699ef1cd36a1bc5618e033c8e0a60bdbc0a200))
* handle optional chaining for data properties in audit log components ([1c5e8bb](https://github.com/MOESA-LTD/moesa-panel/commit/1c5e8bbf7eadc598c577c5624557267ab541d447))
* **i18n:** add missing database error messages ([5526646](https://github.com/MOESA-LTD/moesa-panel/commit/55266465c04b71bb63a12ac2fc851b031203e6c8))
* **i18n:** correct route label translations for better readability ([c65537e](https://github.com/MOESA-LTD/moesa-panel/commit/c65537e546b990bfd3a44eeff2b7eebc15232a36))
* **i18n:** import validatorjs with correct extension ([6592c0c](https://github.com/MOESA-LTD/moesa-panel/commit/6592c0ceaeaef6c672a655f438b8fe96d8bfeaa4))
* **i18n:** name the business tables and modules, and the import error toast ([2b5787a](https://github.com/MOESA-LTD/moesa-panel/commit/2b5787a384261288e75daa432415fa39255419ac))
* **i18n:** update locale fields for better clarity and translation ([d99eb5e](https://github.com/MOESA-LTD/moesa-panel/commit/d99eb5e2f58b4e975c4fcbd7e14927a9852ea2b2))
* **i18n:** update locale handling for Arabic (AE) ([509e260](https://github.com/MOESA-LTD/moesa-panel/commit/509e26095db2ee101b79e03eb6b1bdcd4f371160))
* **i18n:** update translation for product selection ([8468cc3](https://github.com/MOESA-LTD/moesa-panel/commit/8468cc3a58936a7ef0920fd20bdfc1031a14718c))
* import PrimeVue MenuItem as a type ([d931113](https://github.com/MOESA-LTD/moesa-panel/commit/d931113f09da5a24f706d7026786a18df8d8def4))
* improve delete confirmation dialog by ensuring headers are cleared properly ([c44e3c4](https://github.com/MOESA-LTD/moesa-panel/commit/c44e3c4717b9091cc20d5d395817e17bd12210ae))
* improve error handling for phone field to use optional chaining for stability ([0cd6d30](https://github.com/MOESA-LTD/moesa-panel/commit/0cd6d30b1e66d2fc06bfd7f951192d7eb5063370))
* **layout:** conditionally render sidebar mode selector based on breakpoint ([3c76b28](https://github.com/MOESA-LTD/moesa-panel/commit/3c76b28f6f9000a3eab53e3a3995c7faf720af7b))
* **layout:** make route loading state reactive for descendants ([f1ec178](https://github.com/MOESA-LTD/moesa-panel/commit/f1ec1783c46e737c112f0e8e50e6a7598f3785c5))
* **layout:** stop pages being left mounted as copies that no longer update ([9a64935](https://github.com/MOESA-LTD/moesa-panel/commit/9a64935ff1260c8631db36bd07452d353a95d9a1))
* **LogChangesCard.vue:** remove unnecessary flex-wrap gap from value container ([b021f5b](https://github.com/MOESA-LTD/moesa-panel/commit/b021f5bc5d97fd61717f40181809a7268d770947))
* **media:** name the MB limit when a file is refused as too large ([fb5401c](https://github.com/MOESA-LTD/moesa-panel/commit/fb5401cda87b23e7928ee61f4e658364b90f1afb))
* **media:** offer only files the database accepts, gated by each media right ([c8acbf0](https://github.com/MOESA-LTD/moesa-panel/commit/c8acbf031b2615c3ef50ceb21d9818ed63a3bdf0))
* **media:** show a refused Storage upload instead of failing silently ([3186b2a](https://github.com/MOESA-LTD/moesa-panel/commit/3186b2a471ba1f363f63cc85ac3c538d8767a831))
* optimize event listener management in PrintElementButton component ([8143dc9](https://github.com/MOESA-LTD/moesa-panel/commit/8143dc905d0f28e179d3b0117e7b66cc2ae7689b))
* pass 'id' prop to Upsert component and simplify slot usage in form field ([af6908a](https://github.com/MOESA-LTD/moesa-panel/commit/af6908ae65da2fc50a4c42bf539d54558d7ef8be))
* pass data to stock-update event emissions for improved data handling ([a4a1a08](https://github.com/MOESA-LTD/moesa-panel/commit/a4a1a08bdea2637a8b170231f46d3d70a6fab209))
* **PhoneInput.vue:** prepend '+' to phone number inputs ([657d061](https://github.com/MOESA-LTD/moesa-panel/commit/657d06148dbb06e79752f04a59d716073443a56a))
* **product:** accept the S10 template's list values on import ([77f021a](https://github.com/MOESA-LTD/moesa-panel/commit/77f021a0c720b1bed8d99ac1a23cbf7530a7167e))
* **production:** update git ignore command for Vercel deployment ([7f906c1](https://github.com/MOESA-LTD/moesa-panel/commit/7f906c16ab5b18b5a22197d31b4f0e76c416ca74))
* **product:** one form for the card tabs, keyed on the saved product ([715702a](https://github.com/MOESA-LTD/moesa-panel/commit/715702a8d1c31c49e6c998debffcc2f65952a398))
* **project:** no new projects for closed customers ([7c1b460](https://github.com/MOESA-LTD/moesa-panel/commit/7c1b460f5d9927f71d851d0567d042410bed304b))
* **query:** clear persisted query cache on sign-out and tenant change ([1942e35](https://github.com/MOESA-LTD/moesa-panel/commit/1942e35d14547bb1d5cd09a1e4d1a2dab983d86c))
* refactor product data retrieval and category handling in Upsert component ([21c5eb2](https://github.com/MOESA-LTD/moesa-panel/commit/21c5eb296b8f358c04ee335e2c75ede8f4594487))
* refactor stock form logic for improved data handling and validation ([fababf0](https://github.com/MOESA-LTD/moesa-panel/commit/fababf0900327685ceb942a946a04e9077699c05))
* refine select query to specify fields and enhance data handling in tableProps ([761ce60](https://github.com/MOESA-LTD/moesa-panel/commit/761ce607c2cea3540b79718b6cf77c6b7ce0efff))
* remove '_id' from attribute formatting in formAttributeFormatter ([4a3419c](https://github.com/MOESA-LTD/moesa-panel/commit/4a3419c338f2bde9779902240ea43069887850f9))
* remove unnecessary positioning classes from Popover for improved layout consistency ([900f2dd](https://github.com/MOESA-LTD/moesa-panel/commit/900f2dd41f809995c05035564b945d615f063638))
* remove unnecessary route loading check and simplify component lifecycle management ([f0ebdd1](https://github.com/MOESA-LTD/moesa-panel/commit/f0ebdd1c7c19e895c225c82997174163f0a9f9f2))
* rename handleDelete to handleDeleteDialog and improve delete confirmation logic ([a9a2f3f](https://github.com/MOESA-LTD/moesa-panel/commit/a9a2f3f4a4a22cca716de385d0ecffd13d8954f5))
* **ResourceTable.vue:** update prop definitions and remove redundant lazy attribute ([fd773bf](https://github.com/MOESA-LTD/moesa-panel/commit/fd773bf4bfd3d8559b54c3f56301f8a18ab00818))
* return value from toggleDarkMode function to ensure proper view transition handling ([12fb1fc](https://github.com/MOESA-LTD/moesa-panel/commit/12fb1fc7572919eca55d10f5113ab0d99229c9a1))
* **role/upsert:** handle undefined data gracefully and add router import ([311986b](https://github.com/MOESA-LTD/moesa-panel/commit/311986bf350a5bd940e84d3f6e3fc10b8b10c28c))
* **router/account.js:** resolve and redirect issues on account route ([80fe5e7](https://github.com/MOESA-LTD/moesa-panel/commit/80fe5e79990e92ad5038c23c57c7c50c7c0bcb7e))
* **router:** update dialog header to use computed property ([297ee36](https://github.com/MOESA-LTD/moesa-panel/commit/297ee361e97ea0d342d617c253461100ee66617b))
* **router:** update redirect routes to account profile ([31f6506](https://github.com/MOESA-LTD/moesa-panel/commit/31f650683afeefd61e0407ff627460429934db79))
* **routes/client.js:** update route labels for better clarity ([1ece162](https://github.com/MOESA-LTD/moesa-panel/commit/1ece162769575b1f32e8436bcf52f1de07ac856d))
* **route:** update labels for branch-related routes ([46e32c2](https://github.com/MOESA-LTD/moesa-panel/commit/46e32c2af4e1d9fdeeaf356117a426bef02299b1))
* **security:** a tenant admin cannot take over another account ([c25ad7c](https://github.com/MOESA-LTD/moesa-panel/commit/c25ad7c856eb3926c815bb1c240ec890d3dcf0a8))
* **Sidebar:** remove translate-x for inactive state ([cb13892](https://github.com/MOESA-LTD/moesa-panel/commit/cb13892141c1e80fbd7b09de2bb4976705e8e3c6))
* simplify conditional logic in state setter for improved readability ([ffd6476](https://github.com/MOESA-LTD/moesa-panel/commit/ffd6476862e976e2ea5c8215fe1cfca250821cac))
* simplify loading condition for client data retrieval ([7ddeb5d](https://github.com/MOESA-LTD/moesa-panel/commit/7ddeb5d2864d24d9a092b1528c444bab693de1c3))
* **stock:** update device list label to use route-specific translation key ([33065f2](https://github.com/MOESA-LTD/moesa-panel/commit/33065f2b3608392be425efb1b5048ba4dcefd3bd))
* **stock:** update table headers to use i18n translations ([88328ef](https://github.com/MOESA-LTD/moesa-panel/commit/88328ef18fe5014e321da5c3974a629ccbd48d24))
* streamline data fetching logic by removing unnecessary route loading check ([10dac9b](https://github.com/MOESA-LTD/moesa-panel/commit/10dac9ba8e40fa334d523277d86e5c32fa204c54))
* streamline filters and simplify tableProps in Index component ([d4214eb](https://github.com/MOESA-LTD/moesa-panel/commit/d4214eb2fed622a685cc2f8eb231409138d5f8f3))
* **subscriptions:** no extending open-ended subscriptions; guard the stock section ([58b4467](https://github.com/MOESA-LTD/moesa-panel/commit/58b446711d794899480b1c368d104a8971d6829c))
* **supplier:** keep the dialog route after the first save ([a549faa](https://github.com/MOESA-LTD/moesa-panel/commit/a549faa1a926eae8d66443c0a3c2c32cf4321c38))
* **supplier:** scope the contact foreign key to the tenant ([6ee7a45](https://github.com/MOESA-LTD/moesa-panel/commit/6ee7a45e2fe9c15b36aa9b533b9b766ea83521d4))
* **table:** ignore stored filters and sorts of columns a table no longer has ([4e6a081](https://github.com/MOESA-LTD/moesa-panel/commit/4e6a081116e23e5244ace854e4ffdc20b72fb888))
* **tables:** hand slots mutable copies of query rows ([f9b248b](https://github.com/MOESA-LTD/moesa-panel/commit/f9b248b3edcdfbdc7523055211fa53e7dc0714d6))
* **table:** type slot and row action data with the row/model type ([8635692](https://github.com/MOESA-LTD/moesa-panel/commit/8635692e5c68f16410461defd8514f8415049564))
* toggle remove unused translations functionality ([2b33e46](https://github.com/MOESA-LTD/moesa-panel/commit/2b33e46b5223fc58be0871d762ed93a8f5ae8457))
* update backdrop blur effect in form actions for improved UI consistency ([ccab1de](https://github.com/MOESA-LTD/moesa-panel/commit/ccab1dee91f57ac361de54b6972f14c855466d6b))
* update ClientUpsert component to pass id prop instead of data ([965f2c9](https://github.com/MOESA-LTD/moesa-panel/commit/965f2c91a92aa562724f3d460385c9705f086fd7))
* update error handling in form fields to use optional chaining for improved stability ([81f194c](https://github.com/MOESA-LTD/moesa-panel/commit/81f194c04c7973082bbf3f42c40044df06f8c478))
* update font size and dark mode selector ([1a18853](https://github.com/MOESA-LTD/moesa-panel/commit/1a18853a6415432485c260ef9603ab7aaaaf3787))
* update initial form data and financial calculations for stock management ([18c8a53](https://github.com/MOESA-LTD/moesa-panel/commit/18c8a5320fb2c17381c65d9f7a694977c77d956e))
* update JSDoc types for validation rules in Form class ([7b919a3](https://github.com/MOESA-LTD/moesa-panel/commit/7b919a340b7545aed9213b18720a648a23aec56c))
* update select query to specify fields and improve data handling in Upsert component ([83a41d8](https://github.com/MOESA-LTD/moesa-panel/commit/83a41d82684325dcda781c281976f01098659d34))
* update select statement in tableProps and pass id prop to Upsert component ([b43eec4](https://github.com/MOESA-LTD/moesa-panel/commit/b43eec43ea5563ab6c8e5851e3133e27ac8ac5ba))
* update select statement in tableProps and pass id prop to Upsert component ([b034c95](https://github.com/MOESA-LTD/moesa-panel/commit/b034c95edf5b9370e56536de5fd28d05293b24f8))
* **vite:** do not pre-bundle the local mitt plugin ([fc6cdef](https://github.com/MOESA-LTD/moesa-panel/commit/fc6cdef0e5b6a2098ad83c09d352d43ae1d4305e))


### Code Refactoring

* js to ts big refactor ([abc5f22](https://github.com/MOESA-LTD/moesa-panel/commit/abc5f22f3aefe2edc4292c5049d1b686bb8462c9))

## [1.5.3-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.5.2-alpha.1...echochart-app-v1.5.3-alpha.1) (2025-12-07)


### Bug Fixes

* **AppConfigurator.vue:** remove language tooltip ([cdc4fd3](https://github.com/EchoChart/echochart/commit/cdc4fd3a27b8531681284db24299032d935b3421))
* **date:** update date handling logic ([2d8e44a](https://github.com/EchoChart/echochart/commit/2d8e44acd675d0d6ec21c1a950e271d2784ffe4f))

## [1.5.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.5.1-alpha.1...echochart-app-v1.5.2-alpha.1) (2025-10-08)


### Bug Fixes

* **Sidebar:** remove translate-x for inactive state ([cb13892](https://github.com/EchoChart/echochart/commit/cb13892141c1e80fbd7b09de2bb4976705e8e3c6))

## [1.5.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.5.0-alpha.1...echochart-app-v1.5.1-alpha.1) (2025-10-04)


### Bug Fixes

* **stock:** update table headers to use i18n translations ([88328ef](https://github.com/EchoChart/echochart/commit/88328ef18fe5014e321da5c3974a629ccbd48d24))

## [1.5.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.4.2-alpha.1...echochart-app-v1.5.0-alpha.1) (2025-10-03)


### Features

* **i18n:** add Italian support and update translations ([cfba374](https://github.com/EchoChart/echochart/commit/cfba3748fab5e0e47198b812d915c08022805c0b))


### Bug Fixes

* **dashboard:** update text color and enhance user display logic ([24ee8e3](https://github.com/EchoChart/echochart/commit/24ee8e34abfdd198161401f44d0be42baa9cbd66))
* **i18n:** update locale handling for Arabic (AE) ([509e260](https://github.com/EchoChart/echochart/commit/509e26095db2ee101b79e03eb6b1bdcd4f371160))

## [1.4.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.4.1-alpha.1...echochart-app-v1.4.2-alpha.1) (2025-09-30)


### Bug Fixes

* **route:** update labels for branch-related routes ([46e32c2](https://github.com/EchoChart/echochart/commit/46e32c2af4e1d9fdeeaf356117a426bef02299b1))

## [1.4.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.4.0-alpha.1...echochart-app-v1.4.1-alpha.1) (2025-09-30)


### Bug Fixes

* correct type for options.body in customFetch function ([a60bedf](https://github.com/EchoChart/echochart/commit/a60bedf3ee8c1909088b236bbf9b2c3efeb77bcf))
* **router:** update dialog header to use computed property ([297ee36](https://github.com/EchoChart/echochart/commit/297ee361e97ea0d342d617c253461100ee66617b))

## [1.4.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.5-alpha.1...echochart-app-v1.4.0-alpha.1) (2025-09-29)


### Features

* **app:** add `primelocale` for  primevue internationalization support ([24c6042](https://github.com/EchoChart/echochart/commit/24c60424e90ef812e271086873507006f9ae470c))

## [1.3.5-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.4-alpha.1...echochart-app-v1.3.5-alpha.1) (2025-09-29)


### Bug Fixes

* **dashboard:** update notification button styling ([53799a5](https://github.com/EchoChart/echochart/commit/53799a5fbac5765428335bc3a1158da7b8b1e566))

## [1.3.4-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.3-alpha.1...echochart-app-v1.3.4-alpha.1) (2025-09-28)


### Bug Fixes

* **deploy:** update configuration for related projects ([c085f00](https://github.com/EchoChart/echochart/commit/c085f0095279bdf669bf426058766c6b16e0c43b))

## [1.3.3-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.2-alpha.1...echochart-app-v1.3.3-alpha.1) (2025-09-28)


### Bug Fixes

* **deploy:** update ignore command syntax in vercel.json ([1e08b95](https://github.com/EchoChart/echochart/commit/1e08b9552a5652b6371baf40849253227cc8deb4))

## [1.3.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.1-alpha.1...echochart-app-v1.3.2-alpha.1) (2025-09-28)


### Bug Fixes

* **deploy:** update ignore command for Vercel deployment ([68ea1a1](https://github.com/EchoChart/echochart/commit/68ea1a1c4bb6730cfb0c5932b9ae37743f337085))

## [1.3.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.3.0-alpha.1...echochart-app-v1.3.1-alpha.1) (2025-09-28)


### Bug Fixes

* **production:** update git ignore command for Vercel deployment ([7f906c1](https://github.com/EchoChart/echochart/commit/7f906c16ab5b18b5a22197d31b4f0e76c416ca74))

## [1.3.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.2.1-alpha.1...echochart-app-v1.3.0-alpha.1) (2025-09-28)


### Features

* **layout:** consolidate theme options and improve UI components ([d8cbea7](https://github.com/EchoChart/echochart/commit/d8cbea7b1c04ed81338aa958bee299b54d8bb15b))

## [1.2.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.2.0-alpha.1...echochart-app-v1.2.1-alpha.1) (2025-09-28)


### Bug Fixes

* update font size and dark mode selector ([1a18853](https://github.com/EchoChart/echochart/commit/1a18853a6415432485c260ef9603ab7aaaaf3787))

## [1.2.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.1.2-alpha.1...echochart-app-v1.2.0-alpha.1) (2025-09-27)


### Features

* **form:** add field routes for form handling ([de4bf3b](https://github.com/EchoChart/echochart/commit/de4bf3b8b263f83166ae42358b146a15294736e6))
* **service-components/resource-table:** add new props and enable expansion ([f90c7e9](https://github.com/EchoChart/echochart/commit/f90c7e9bff365e275c9d13e7eea23c2e67e32e51))
* **StatisticCard:** Adds new StatisticCard component for displaying statistical data ([203804d](https://github.com/EchoChart/echochart/commit/203804d34361ad5d8fc60e16eaa6e2f8b4f944be))
* **TotalRowCountCard:** Adds TotalRowCountCard component to display total row count with date filters. ([a3a3316](https://github.com/EchoChart/echochart/commit/a3a33167059780b54352a3229c5960dae4c3e9ed))


### Bug Fixes

* **appErrorHandler:** remove unnecessary string interpolation ([cd4e3dd](https://github.com/EchoChart/echochart/commit/cd4e3dd64e472ce4b69c0750e2af25d9cac4bff1))
* **auth/register:** remove invalid prop from Password component ([53468ac](https://github.com/EchoChart/echochart/commit/53468ac738f53600dcae697fdb49a53c9fb81723))
* change event listener from click to mouseup in Sidebar.vue ([1f1e4a5](https://github.com/EchoChart/echochart/commit/1f1e4a5c3758b10067a010e15b52b6e67a73a250))
* **client-address:** correct router link name for manage address feature ([a1ebb1f](https://github.com/EchoChart/echochart/commit/a1ebb1f62dfeba528aa7a2969dddf5e99f443535))
* **client/upsert/Index.vue:** correct router names for client management tabs ([c2c3d98](https://github.com/EchoChart/echochart/commit/c2c3d9838627aaa9d67df458f3720fadbe91464d))
* **Collection:** update merge method to accept array of attributes ([a1da302](https://github.com/EchoChart/echochart/commit/a1da302ad32352f33b88dde04e2885b932bbe009))
* **dashboard:** include sign-in status in sidebar inactive logic ([67cdbac](https://github.com/EchoChart/echochart/commit/67cdbac2321a9f0624e79cde5ab1fb4bb7da60b2))
* **i18n:** correct route label translations for better readability ([c65537e](https://github.com/EchoChart/echochart/commit/c65537e546b990bfd3a44eeff2b7eebc15232a36))

## [1.1.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.1.1-alpha.1...echochart-app-v1.1.2-alpha.1) (2025-07-18)


### Bug Fixes

* **LogChangesCard.vue:** remove unnecessary flex-wrap gap from value container ([b021f5b](https://github.com/EchoChart/echochart/commit/b021f5bc5d97fd61717f40181809a7268d770947))

## [1.1.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.1.0-alpha.1...echochart-app-v1.1.1-alpha.1) (2025-07-18)


### Bug Fixes

* **router:** update redirect routes to account profile ([31f6506](https://github.com/EchoChart/echochart/commit/31f650683afeefd61e0407ff627460429934db79))

## [1.1.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v1.0.0-alpha.1...echochart-app-v1.1.0-alpha.1) (2025-07-18)


### Features

* **BaseModel:** introduce BaseModel ([29650f3](https://github.com/EchoChart/echochart/commit/29650f3868d55480df98c446fe583223987df4ef))
* **user:** add user management functionality ([df5187a](https://github.com/EchoChart/echochart/commit/df5187a477364616f9f3d0ef224b947284d83c84))


### Bug Fixes

* **Account Profile:** remove unnecessary '+' from phone value ([6f66092](https://github.com/EchoChart/echochart/commit/6f66092571be2fc035d19297aa7eac3fcd4d9efa))
* **account/profile:** update phone input model value ([9a21141](https://github.com/EchoChart/echochart/commit/9a2114148b880d93151be1a6d0ecdf63e4048c20))
* **appErrorHandler:** prioritize error.message over other fields ([ff1b9cb](https://github.com/EchoChart/echochart/commit/ff1b9cb00cfed259683f0e121d4da42dfa1c0f40))
* **custom-table:** update date format to include time and change hour format ([a9a5b54](https://github.com/EchoChart/echochart/commit/a9a5b54032a58e43c961b8c752f52739b20ac151))
* **database:** correct typo in record repair status enum ([a8b1f59](https://github.com/EchoChart/echochart/commit/a8b1f5993db142f6c94ca4c41f5b9ca080dac44e))
* **i18n:** import validatorjs with correct extension ([6592c0c](https://github.com/EchoChart/echochart/commit/6592c0ceaeaef6c672a655f438b8fe96d8bfeaa4))
* **i18n:** update locale fields for better clarity and translation ([d99eb5e](https://github.com/EchoChart/echochart/commit/d99eb5e2f58b4e975c4fcbd7e14927a9852ea2b2))
* **PhoneInput.vue:** prepend '+' to phone number inputs ([657d061](https://github.com/EchoChart/echochart/commit/657d06148dbb06e79752f04a59d716073443a56a))
* **ResourceTable.vue:** update prop definitions and remove redundant lazy attribute ([fd773bf](https://github.com/EchoChart/echochart/commit/fd773bf4bfd3d8559b54c3f56301f8a18ab00818))
* **role/upsert:** handle undefined data gracefully and add router import ([311986b](https://github.com/EchoChart/echochart/commit/311986bf350a5bd940e84d3f6e3fc10b8b10c28c))
* **router/account.js:** resolve and redirect issues on account route ([80fe5e7](https://github.com/EchoChart/echochart/commit/80fe5e79990e92ad5038c23c57c7c50c7c0bcb7e))
* **routes/client.js:** update route labels for better clarity ([1ece162](https://github.com/EchoChart/echochart/commit/1ece162769575b1f32e8436bcf52f1de07ac856d))
* **stock:** update device list label to use route-specific translation key ([33065f2](https://github.com/EchoChart/echochart/commit/33065f2b3608392be425efb1b5048ba4dcefd3bd))

## [1.0.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.18.0-alpha.1...echochart-app-v1.0.0-alpha.1) (2025-07-17)


### ⚠ BREAKING CHANGES

* js to ts big refactor

### Features

* add 'auto' sidebar layout option ([7670e43](https://github.com/EchoChart/echochart/commit/7670e43d8e96234241939612349ec0fa4162a118))
* add 'p-0' class to Upsert component for consistent styling ([db62762](https://github.com/EchoChart/echochart/commit/db62762db9ef50fa3d360b6089cc76d34e0dc19d))
* add ActionButtons component for handling row actions in CustomTable ([2409c1c](https://github.com/EchoChart/echochart/commit/2409c1cae6f7ecde6b4e492c8f8f5762e17e58f1))
* add address management functionality with CRUD operations and related database triggers ([de5dff0](https://github.com/EchoChart/echochart/commit/de5dff0390086010b1d4f37df7900c12741fec61))
* add AvatarPlaceholder component for user profile images and update profile view to use it ([cf166ca](https://github.com/EchoChart/echochart/commit/cf166ca5e4b9a25055b868b2e95600c7d0888f5c))
* add client management functionality with routing and database integration ([febd3f8](https://github.com/EchoChart/echochart/commit/febd3f84cbfbc5bba66f2a8cf1d00937b3919651))
* add columnResizeMode property to CustomTable for improved column resizing behavior ([ea0560b](https://github.com/EchoChart/echochart/commit/ea0560b881605593d58868f2d8f5533627d27839))
* add computed property for detailed changed data in Form class ([1111855](https://github.com/EchoChart/echochart/commit/1111855eb44340a598eb7f7c30dcdddebd3c0c13))
* add context menu items for branch, client, and stock routes with dialog positions ([3df8f4f](https://github.com/EchoChart/echochart/commit/3df8f4fe3a0fa104836371827f67724ea0a7be0a))
* add currencies constant for currency selection component ([131bdde](https://github.com/EchoChart/echochart/commit/131bdde16048ef0d8f32490f000cb59f30f5904e))
* add description filter to product index page ([466a06b](https://github.com/EchoChart/echochart/commit/466a06bdd738324364a5edf825268e173a0221ca))
* add email and phone templates for ResourceTable to enhance data display ([efad75b](https://github.com/EchoChart/echochart/commit/efad75b3bbfc68a2039643885070a98c78d40d4f))
* add ErrorBadge component with tooltip for error display ([d3c84a6](https://github.com/EchoChart/echochart/commit/d3c84a617bae7a8665048accef6b80763490f58a))
* add fetchClient function to retrieve a single client by ID ([458b1a9](https://github.com/EchoChart/echochart/commit/458b1a9ac3e95cd1857039819cc969ca6c4ba241))
* add innerMoldModels and update moldSpeakerPowers for clarity ([f36cb46](https://github.com/EchoChart/echochart/commit/f36cb46075a929b61628d1b80f936957ee050dc0))
* add PhoneInput component for enhanced phone number input handling and validation ([cd3116d](https://github.com/EchoChart/echochart/commit/cd3116d05f7f390c60be26af56388e8d22083591))
* add placeholders to select components for improved user guidance ([2c5fa0e](https://github.com/EchoChart/echochart/commit/2c5fa0e4b84399c43df4ca2db9f40033bcb21e20))
* add PrintElementButton component for printing elements with dark mode support ([6cd26f9](https://github.com/EchoChart/echochart/commit/6cd26f9dcfa7a0760110fdfd60ac5c325cc2b312))
* add readonly and disabled props to PhoneInput component for better control ([e43611c](https://github.com/EchoChart/echochart/commit/e43611cd1e337fe40bfe43aab7d6a45786da00d0))
* add ResourceDataView component for dynamic data display ([91fe57c](https://github.com/EchoChart/echochart/commit/91fe57c1bf6e6fc89d2ae585de8e49d5ceddf900))
* add SelectResource component for resource selection dialog ([63f7f55](https://github.com/EchoChart/echochart/commit/63f7f556c8b399593fb0a680f222d0f3e8033cbe))
* add SelectStockUnitType component for unit type selection in stock management ([fca1a75](https://github.com/EchoChart/echochart/commit/fca1a75213fee5a7b7892cb09754cbc775a1c0bd))
* add stock page with dynamic routing and menu bar integration ([c88e7d8](https://github.com/EchoChart/echochart/commit/c88e7d8d3751460c1d79430f84198aec8a61d7a4))
* add stock_date field to Upsert form and update related error handling ([c671915](https://github.com/EchoChart/echochart/commit/c671915992367527e62e4f33dfd63fac94ba5299))
* add vendor filter to stock tables ([051ca2f](https://github.com/EchoChart/echochart/commit/051ca2fb88b819e26df62b754a0cee271fe82303))
* **audit-log:** add audit log functionality with CRUD operations and UI components ([cf67c7a](https://github.com/EchoChart/echochart/commit/cf67c7a1155bbd108ca8ad96e6ce9d0082bb73df))
* **BaseModel:** introduce BaseModel ([29650f3](https://github.com/EchoChart/echochart/commit/29650f3868d55480df98c446fe583223987df4ef))
* **dayjs:** Introduce date parsing and validation utilities ([fb11505](https://github.com/EchoChart/echochart/commit/fb1150592c687b6cc7216a7ea9dff3319ed8c26e))
* define ResourceTableProps type and update props in ResourceTable component ([b3987bf](https://github.com/EchoChart/echochart/commit/b3987bffc0313f0f5f9bdac4426f5864b59994d5))
* enhance CustomTable component with improved slot handling and filter logic ([a3ac3b1](https://github.com/EchoChart/echochart/commit/a3ac3b1b5e7a6bf9646328e12996a320f268d21a))
* enhance PhoneInput component with improved phone number validation and formatting ([14ffaaa](https://github.com/EchoChart/echochart/commit/14ffaaa4dbf6c95bb9fc97768a68096cb2630384))
* enhance ProductSelect component with edit and add functionality, and improve props handling ([6f9dd16](https://github.com/EchoChart/echochart/commit/6f9dd16ff2a3d0807ce4c949fe1af2bf29d0c4c6))
* implement centralized app error handler for improved error management ([a3fa40b](https://github.com/EchoChart/echochart/commit/a3fa40bd609e33987240113d866b0b2eff9d10ca))
* implement CorrelatedAuditLogs component and replace AuditLogChangesCard in Index.vue ([7a8bf32](https://github.com/EchoChart/echochart/commit/7a8bf3229c6dc11d5b78113e4719c43d53d3e25a))
* implement error tooltip component styles and integrate with ErrorBadge and FormField ([cf66188](https://github.com/EchoChart/echochart/commit/cf66188a80e1ca1d044ee6d3efbb6d45404a1c07))
* implement meta storage handling with local and session options ([795114f](https://github.com/EchoChart/echochart/commit/795114f64bc6fe63728adbde11add69f1fed8ccb))
* implement record management with CRUD, validation and routing for sales ([5947df5](https://github.com/EchoChart/echochart/commit/5947df571e226c8591cddead67071341418c0f40))
* improve product and category fetching by resetting state and handling defaults ([7880204](https://github.com/EchoChart/echochart/commit/7880204a6e53bd42c214215a638ba77eb276369b))
* integrate TanStack Query for improved data fetching and caching ([6581634](https://github.com/EchoChart/echochart/commit/6581634050fa4473e19ba8a74e8e178e7f725601))
* integrate Upsert component and enhance error handling in client forms ([718b46c](https://github.com/EchoChart/echochart/commit/718b46c09169000e3492c317b848e5602b295bc4))
* introduce SelectCountry component and update filters for consistency in client and product forms ([c037eca](https://github.com/EchoChart/echochart/commit/c037eca085ba1477c2a3cb2313f8d96d35613830))
* **product:** add product and category store with fetching capabilities ([562970e](https://github.com/EchoChart/echochart/commit/562970e41f8e777f29aec432635e36815a5c0cba))
* **product:** add product management page with upsert functionality and filters ([177f41e](https://github.com/EchoChart/echochart/commit/177f41ec4ed8245917d9206c6137f82e06bd874a))
* **product:** add PRODUCT_CATEGORY_PROPS for category styling and icons ([8b04b2b](https://github.com/EchoChart/echochart/commit/8b04b2b0b0a5be5ea9c9eab56da8412fdffba2a2))
* **product:** add ProductBrandSelect component for brand selection with loading state ([041dab2](https://github.com/EchoChart/echochart/commit/041dab2e2f65ee0942abe5d3701629b5123f0bc1))
* **product:** add ProductCategorySelect component for category selection with loading state ([28c7fe3](https://github.com/EchoChart/echochart/commit/28c7fe383c94b5dc9660a90dbd667f3e6e0b461e))
* **product:** add ProductSelect component for selecting products by category with loading state ([67cf366](https://github.com/EchoChart/echochart/commit/67cf366ba5a116cdbd1c2d28c4cea7a8913b7e8a))
* Refactor Record and Stock forms to improve type safety and localization ([15b6ece](https://github.com/EchoChart/echochart/commit/15b6ece0e7303da5c0a0ca549ed781476dffd8be))
* refactor validator logic into separate module for improved organization ([7e6174d](https://github.com/EchoChart/echochart/commit/7e6174ddb420c579d0186fca527cebc0ed7d142c))
* replace currency-codes with countries-list and implement SelectCurrency component ([ea748c2](https://github.com/EchoChart/echochart/commit/ea748c2170833cb2388d58d8ad00fa3935358224))
* replace InputMask with PhoneInput component for phone fields in profile forms ([c254361](https://github.com/EchoChart/echochart/commit/c254361aa9146dd740641cc6a802a36eaec4fc52))
* **stock:** add device routes and device management page for stock handling ([c59dcb2](https://github.com/EchoChart/echochart/commit/c59dcb234e7546a000550ea4d31640ff3a63a217))
* **stock:** add routes and views for battery, spare part, and product management ([f64890b](https://github.com/EchoChart/echochart/commit/f64890b1ee77622fb526350f0ac509b3a2f03ef6))
* **stock:** add stocks and vendors store with fetching capabilities ([f91996a](https://github.com/EchoChart/echochart/commit/f91996a7985023e8efc61c125baf54557bec7e8a))
* **stock:** add StockVendorSelect component for vendor selection with fetching capabilities ([c21134e](https://github.com/EchoChart/echochart/commit/c21134e5ae76ad6c94f78ec8e6135dbe0ed08f90))
* update numeric precision for unit_cost and total_cost to 3 decimal places ([01c0280](https://github.com/EchoChart/echochart/commit/01c028000a2c797621ead39ffd3e6f44c041068b))
* update product route to include optional category and enhance Upsert component with category prop ([81ba4cb](https://github.com/EchoChart/echochart/commit/81ba4cbc06d6570039041435f6e348a7827b44c8))
* update stock event emissions for improved event handling ([1cbfbf2](https://github.com/EchoChart/echochart/commit/1cbfbf237753ce9dc20fae26d0de31b483dd1ef1))


### Bug Fixes

* **Account Profile:** remove unnecessary '+' from phone value ([6f66092](https://github.com/EchoChart/echochart/commit/6f66092571be2fc035d19297aa7eac3fcd4d9efa))
* **account-popover:** adjust spacing and options in account popover component ([461bbc6](https://github.com/EchoChart/echochart/commit/461bbc6691d0472cfc6df3f9d12d630959655c86))
* add ctrl-click functionality to router-link for improved navigation ([e24e7dd](https://github.com/EchoChart/echochart/commit/e24e7dd048dc6fb33e2930769fb8312285d97d40))
* add currency_code field to Database type for improved data structure ([052f2c8](https://github.com/EchoChart/echochart/commit/052f2c84027cfe5fd9c712498a2da5115de54384))
* add fluid prop to FormField components for consistent styling ([0f68bb7](https://github.com/EchoChart/echochart/commit/0f68bb74c90b08770d6365902db47fd1250d86eb))
* add JSDoc type annotation for fields in Index.vue ([be7d9b9](https://github.com/EchoChart/echochart/commit/be7d9b9da880794038ce6afe8fb89a72d08f6296))
* add JSDoc types for columns and filters in various Index.vue files ([fd229b7](https://github.com/EchoChart/echochart/commit/fd229b74a07c3da9835f7224571114101f1a94a4))
* add JSDoc types for fields in Upsert components ([29fbd35](https://github.com/EchoChart/echochart/commit/29fbd354473cf06bc1013a013f10453a2ebd172c))
* add loading progress bar and improve layout class structure for better UI responsiveness ([f1b4b45](https://github.com/EchoChart/echochart/commit/f1b4b45c7a5bda12a74da30cb6c618b28dc577ae))
* add minimum width to table columns for better layout ([1a9946c](https://github.com/EchoChart/echochart/commit/1a9946c43ee1516722da32fcc9e509b8cd293038))
* add padding to card component in Address and General views for improved layout ([25539e3](https://github.com/EchoChart/echochart/commit/25539e3420c44445a9cde5fa3ec9465942219dc5))
* add padding to card component in client upsert view for improved layout ([03eaff6](https://github.com/EchoChart/echochart/commit/03eaff6eaa77590a463233892db08c061a9c8c93))
* add service routes and update product category props for service ([e72ff2e](https://github.com/EchoChart/echochart/commit/e72ff2e32d86b47ef4f900feb0a0947026ff833f))
* add tax field to Database type for improved financial tracking ([c3e0b2b](https://github.com/EchoChart/echochart/commit/c3e0b2b529e7c68acc0b5ce56369c6d73eb8f06b))
* add vite-plugin-compression for improved asset compression ([e69052d](https://github.com/EchoChart/echochart/commit/e69052db5e05bf36977d75b766b2180919dc986b))
* adjust AddressTable class for improved layout responsiveness ([df95426](https://github.com/EchoChart/echochart/commit/df9542670889e23ffa2ae1115a1e83f4d0b5426d))
* adjust flex properties in FormField component for improved layout consistency ([9b268f1](https://github.com/EchoChart/echochart/commit/9b268f119acaae1e8cd8abcb48c06288163aeaae))
* adjust layout classes for better responsiveness in auth forms ([8179b3c](https://github.com/EchoChart/echochart/commit/8179b3c2c054a00de5afa23acf3102f0a8bc6986))
* adjust layout for permission field in role upsert component ([797ec85](https://github.com/EchoChart/echochart/commit/797ec8561cf06c8a819da93cb55f6902b6c9078b))
* adjust margin for PhoneInput component styling ([e36a498](https://github.com/EchoChart/echochart/commit/e36a498c85963c72abd27a0dbd0cfd15460d36cb))
* adjust min-width and max-width styles for table actions ([2ab1888](https://github.com/EchoChart/echochart/commit/2ab1888b2551851ebb222b0970e4194b2ea11294))
* adjust Skeleton component height in CustomTable for improved UI consistency ([b80623f](https://github.com/EchoChart/echochart/commit/b80623fc771d8f3a4ce0e7a71a246b78947203d9))
* adjust styling for actions bar and button container in FormBox component ([18a979b](https://github.com/EchoChart/echochart/commit/18a979bc2669e12df7adf556a6f473ec94054fb5))
* associate validation instance with the form for improved validation context ([0d0522c](https://github.com/EchoChart/echochart/commit/0d0522ccb250e230506b105c24705e47b0c0b0a1))
* clear default email value in login form and adjust Remember me field styling ([8f15628](https://github.com/EchoChart/echochart/commit/8f1562808be2d519e2004681500a0255d86ef57f))
* conditionally render RouteMenuBar based on dialogRef in branch and stock views ([b5b7a46](https://github.com/EchoChart/echochart/commit/b5b7a462ce23fd87c06f6a110b7a1ceb98e5a266))
* correct 'assembly' to 'assemble' in record types and update related SQL constraint ([837b117](https://github.com/EchoChart/echochart/commit/837b11730f9f529065786ba7bad09f53f576787f))
* correct font declaration syntax in body styles ([edda4c1](https://github.com/EchoChart/echochart/commit/edda4c1232afb064fb80b620db7467295fb45f2f))
* correct import path for ResourceDataView component ([8c1b9a9](https://github.com/EchoChart/echochart/commit/8c1b9a9a4c00c07afe4c345848e65981a88cbe2c))
* correct labels for operations in SelectAuditOperation component ([a56b016](https://github.com/EchoChart/echochart/commit/a56b016ebed43c1cc456c4fbb3a68bc1c3905557))
* correct margin utility for phone input select component ([44f3b99](https://github.com/EchoChart/echochart/commit/44f3b99fc725a5212106c9c82320d5d1ee0c55ee))
* correct rules selection in form validation to use provided rules ([5d16c7a](https://github.com/EchoChart/echochart/commit/5d16c7a0ea39bb60805cedebed5beadfecdcdcd6))
* correct variable name from client to clients in getClient function ([1216161](https://github.com/EchoChart/echochart/commit/121616183fce8f0dd44f1c928cce3bfab53ab6d3))
* encode URI for item and meta headers in various components for improved data handling ([c417dbd](https://github.com/EchoChart/echochart/commit/c417dbdd6f3b5a601fa5f114a3b05f24ee545ad2))
* enhance Address and General components with dynamic data fetching and props ([20810bd](https://github.com/EchoChart/echochart/commit/20810bd79991aa8031e2b3360303b80c0280f14f))
* enhance API request validation by excluding RPC calls in Supabase options ([4c1c807](https://github.com/EchoChart/echochart/commit/4c1c807fe3430e14d9de8e40295aaf93bbbad984))
* enhance breadcrumb separator and update active link styling ([e8dffd6](https://github.com/EchoChart/echochart/commit/e8dffd67dc30eeb3b41d319f5d35032fc0e9c78b))
* enhance change logging by refining update handling and improving value formatting ([d4c789b](https://github.com/EchoChart/echochart/commit/d4c789b13dee815e9a7bfbc255a9359f33ead251))
* enhance fetchQuery logic with improved error handling and query invalidation for data updates ([a10667a](https://github.com/EchoChart/echochart/commit/a10667addb5a79dd02f55315bbafc731a61b8ba7))
* enhance formatValue function to handle arrays and improve object stringification ([7bf0b9e](https://github.com/EchoChart/echochart/commit/7bf0b9ea9cda7e8d4599921510466804f1f5224a))
* enhance FormBox component with error handling and styling adjustments ([50b7549](https://github.com/EchoChart/echochart/commit/50b7549cc3db6c3cd74893aee5fea9fc8f054065))
* enhance log operation handling by adding 'select' case in getLogTagProps ([91c1782](https://github.com/EchoChart/echochart/commit/91c1782df2a2658d9e84d017133ec6988bce8ccf))
* enhance phone validation logic to ensure country code is included ([c499bcc](https://github.com/EchoChart/echochart/commit/c499bccaed0aaecf71d47c2e44b2aed454123df8))
* enhance row action permissions and add SELECT operation to audit log ([8b6236a](https://github.com/EchoChart/echochart/commit/8b6236aad3c4aac889b71e05230ef5f1899dad29))
* enhance stock management by adding unit type, discount, and tax fields in Upsert component and database schema ([9429125](https://github.com/EchoChart/echochart/commit/9429125534e9eead1923eef813c7afea32972978))
* enhance transition animations in layout components for smoother effects ([093a839](https://github.com/EchoChart/echochart/commit/093a83981505bb7b9c735f241d6b2c327ba90362))
* enhance user avatar display in AccountPopover and Profile views for improved user experience ([46732f3](https://github.com/EchoChart/echochart/commit/46732f37de9961f726e32082e33875af024c4d1a))
* enhance validation rules and improve stock selection in Upsert component ([3341dce](https://github.com/EchoChart/echochart/commit/3341dcec27b51244f4e49940208afd10ccfec0e4))
* ensure contextMenuItems default to an empty array in CustomLink component ([9b608e2](https://github.com/EchoChart/echochart/commit/9b608e2a6d273a4b8367d769c56ab8f3c5adea7f))
* ensure deep cloning of permissions when toggling all selections ([f9d3223](https://github.com/EchoChart/echochart/commit/f9d322388f7bef3c1047a023431ffd9caa9d7881))
* ensure phone numbers are prefixed with '+' for validation consistency ([b535dbc](https://github.com/EchoChart/echochart/commit/b535dbc01db41bb91b39fe36579d230338ee9bd5))
* handle optional chaining for data properties in audit log components ([1c5e8bb](https://github.com/EchoChart/echochart/commit/1c5e8bbf7eadc598c577c5624557267ab541d447))
* handle optional chaining for log operation and improve data fetching logic ([5d127aa](https://github.com/EchoChart/echochart/commit/5d127aa5e782242391d01a1edb1733d13857aa65))
* improve cost calculation logic and enhance input field configurations in Upsert component ([dc36afc](https://github.com/EchoChart/echochart/commit/dc36afc3e4202fa5e112856263a9641c1cb92c1d))
* improve delete confirmation dialog by ensuring headers are cleared properly ([c44e3c4](https://github.com/EchoChart/echochart/commit/c44e3c4717b9091cc20d5d395817e17bd12210ae))
* improve error handling for phone field to use optional chaining for stability ([0cd6d30](https://github.com/EchoChart/echochart/commit/0cd6d30b1e66d2fc06bfd7f951192d7eb5063370))
* include auto-imports definitions in tsconfig and reorder imports in vite.config ([ff0f33c](https://github.com/EchoChart/echochart/commit/ff0f33c03161c13a5fc6d1eb056e824561764eef))
* include resource_name in permission selection for role table ([70c4913](https://github.com/EchoChart/echochart/commit/70c4913a8f948f02b1c94a6425f22f70b56d323c))
* merge attrs.filters into filters for consistent filter handling across components ([f12b5c9](https://github.com/EchoChart/echochart/commit/f12b5c9064750778dc9f25d2f6148eced3303878))
* optimize event listener management in PrintElementButton component ([8143dc9](https://github.com/EchoChart/echochart/commit/8143dc905d0f28e179d3b0117e7b66cc2ae7689b))
* optimize phone number validation logic in PhoneInput component ([75ea589](https://github.com/EchoChart/echochart/commit/75ea589c2947ec8dd87f526bf881beee552620ad))
* pass 'id' prop to Upsert component and simplify slot usage in form field ([af6908a](https://github.com/EchoChart/echochart/commit/af6908ae65da2fc50a4c42bf539d54558d7ef8be))
* pass data to stock-update event emissions for improved data handling ([a4a1a08](https://github.com/EchoChart/echochart/commit/a4a1a08bdea2637a8b170231f46d3d70a6fab209))
* refactor category handling in Upsert component for improved data initialization ([f841e73](https://github.com/EchoChart/echochart/commit/f841e73a02a3603ffc9e1593cf0a11fb6af46daa))
* refactor formAttributeFormatter for improved attribute name formatting ([1cba672](https://github.com/EchoChart/echochart/commit/1cba672fd73c2ba968ae11704b45d3bda0e367ad))
* refactor FormField component styles for improved layout and responsiveness ([93e53aa](https://github.com/EchoChart/echochart/commit/93e53aa7b413bffb3b0ca7a4b10f855b69f720cd))
* refactor product data retrieval and category handling in Upsert component ([21c5eb2](https://github.com/EchoChart/echochart/commit/21c5eb296b8f358c04ee335e2c75ede8f4594487))
* refactor stock form logic for improved data handling and validation ([fababf0](https://github.com/EchoChart/echochart/commit/fababf0900327685ceb942a946a04e9077699c05))
* refactor Upsert component to improve form structure and enhance readability ([caac63f](https://github.com/EchoChart/echochart/commit/caac63f1a46f93e6907e3b61d6fddebbad512516))
* refine filter query logic to handle empty values more accurately ([f4cd29b](https://github.com/EchoChart/echochart/commit/f4cd29b64121e6434099a5f639a5dd2f0f8e26c7))
* refine select query to specify fields and enhance data handling in tableProps ([761ce60](https://github.com/EchoChart/echochart/commit/761ce607c2cea3540b79718b6cf77c6b7ce0efff))
* remove '_id' from attribute formatting in formAttributeFormatter ([4a3419c](https://github.com/EchoChart/echochart/commit/4a3419c338f2bde9779902240ea43069887850f9))
* remove keyfilter from InputText in KeywordSearchInput for simplified input handling ([c7a9e2e](https://github.com/EchoChart/echochart/commit/c7a9e2e074c71b574dce38a3368bc476d98b2e39))
* remove redundant total_cost update in computed property ([0774b5d](https://github.com/EchoChart/echochart/commit/0774b5dfe47d0ef13113bd2154494d6447969142))
* remove required validation for brand field in Upsert form ([209013f](https://github.com/EchoChart/echochart/commit/209013fa0b1221a42e51be3104af4f54ecff9a43))
* remove unnecessary condition from RouteMenuBar in branch and stock views for cleaner code ([3afd836](https://github.com/EchoChart/echochart/commit/3afd836326285b540ce7892a998971592bbd0301))
* remove unnecessary positioning classes from Popover for improved layout consistency ([900f2dd](https://github.com/EchoChart/echochart/commit/900f2dd41f809995c05035564b945d615f063638))
* remove unnecessary route loading check and simplify component lifecycle management ([f0ebdd1](https://github.com/EchoChart/echochart/commit/f0ebdd1c7c19e895c225c82997174163f0a9f9f2))
* remove unused authentication store references in ResourceTable component ([2f499c3](https://github.com/EchoChart/echochart/commit/2f499c33a53cf15ef9ed68510b7244c309fa433f))
* remove unused mapClass prop and improve totalRecords initialization ([93e595d](https://github.com/EchoChart/echochart/commit/93e595d313a87c24a00c90fe64eef3b2dc26166e))
* rename 'created_at' to 'stock_date' for consistency across battery, device, and spare-part components ([bfded88](https://github.com/EchoChart/echochart/commit/bfded8830c0ff527a980c22cd5b684d8a7224954))
* rename ClientSelect to SelectClient in Address component ([6d72919](https://github.com/EchoChart/echochart/commit/6d72919ceca80ba2f7f0ea2a4cc121df321b6622))
* rename handleDelete to handleDeleteDialog and improve delete confirmation logic ([a9a2f3f](https://github.com/EchoChart/echochart/commit/a9a2f3f4a4a22cca716de385d0ecffd13d8954f5))
* rename stock_date to stocked_at in components and SQL migration ([bfc33c6](https://github.com/EchoChart/echochart/commit/bfc33c6e3dec072e2b84be99e87043de3159c854))
* reorder columns in Audit Log table for consistent display ([e0313de](https://github.com/EchoChart/echochart/commit/e0313def9041deac8f9ba28e1a09c199d264af14))
* replace isRef check with unref for cleaner property access in Collection class ([0e1de9c](https://github.com/EchoChart/echochart/commit/0e1de9c54da99c293a7d4a1ca75900fd12899fc7))
* replace span with anchor tag in router-link for proper link behavior ([531d543](https://github.com/EchoChart/echochart/commit/531d543038057fae39319a97ba9f34b96c5c3b1f))
* **ResourceTable.vue:** update prop definitions and remove redundant lazy attribute ([fd773bf](https://github.com/EchoChart/echochart/commit/fd773bf4bfd3d8559b54c3f56301f8a18ab00818))
* return value from toggleDarkMode function to ensure proper view transition handling ([12fb1fc](https://github.com/EchoChart/echochart/commit/12fb1fc7572919eca55d10f5113ab0d99229c9a1))
* **router/account.js:** resolve and redirect issues on account route ([80fe5e7](https://github.com/EchoChart/echochart/commit/80fe5e79990e92ad5038c23c57c7c50c7c0bcb7e))
* **routes/client.js:** update route labels for better clarity ([1ece162](https://github.com/EchoChart/echochart/commit/1ece162769575b1f32e8436bcf52f1de07ac856d))
* simplify bodyCell class assignment in CustomTable for improved readability ([09f083e](https://github.com/EchoChart/echochart/commit/09f083e294c65029c4d81cf644978575a9c7e505))
* simplify conditional logic in state setter for improved readability ([ffd6476](https://github.com/EchoChart/echochart/commit/ffd6476862e976e2ea5c8215fe1cfca250821cac))
* simplify CustomLink usage in NotFound.vue for cleaner code ([112b4fd](https://github.com/EchoChart/echochart/commit/112b4fde79f76a82cf62f19c0b8e5809de739c0a))
* simplify FormField usage by removing unnecessary template slots in profile and update-password components ([59bfcbe](https://github.com/EchoChart/echochart/commit/59bfcbe2233f0805d733a14776467890305b60a4))
* simplify loading condition for client data retrieval ([7ddeb5d](https://github.com/EchoChart/echochart/commit/7ddeb5d2864d24d9a092b1528c444bab693de1c3))
* simplify readonly prop usage in FormField components across Upsert views ([6781464](https://github.com/EchoChart/echochart/commit/6781464c87b8e3bda9b6bdde58168368f33734ef))
* simplify select statement in save function of Upsert component ([bf6500c](https://github.com/EchoChart/echochart/commit/bf6500cb90f978d478b15ef6b710d4d8d7ec92f8))
* simplify Skeleton component height logic in CustomTable ([9793b4b](https://github.com/EchoChart/echochart/commit/9793b4b3dc0b8363a74d448daa1dd5a6d2c0699e))
* **stock:** update device list label to use route-specific translation key ([33065f2](https://github.com/EchoChart/echochart/commit/33065f2b3608392be425efb1b5048ba4dcefd3bd))
* streamline button component structure in SelectProduct.vue ([fa5add6](https://github.com/EchoChart/echochart/commit/fa5add6e5aab0e35fd2d3c49318a8c2e8e37045e))
* streamline country selection logic and improve model value handling in PhoneInput component ([d3dea3f](https://github.com/EchoChart/echochart/commit/d3dea3ff01bb8b5bac46d6b2b75046371cff007e))
* streamline data fetching logic by removing unnecessary route loading check ([10dac9b](https://github.com/EchoChart/echochart/commit/10dac9ba8e40fa334d523277d86e5c32fa204c54))
* streamline filters and simplify tableProps in Index component ([d4214eb](https://github.com/EchoChart/echochart/commit/d4214eb2fed622a685cc2f8eb231409138d5f8f3))
* streamline FormField usage by removing unnecessary template slots in Login and Register components ([cdbc3f4](https://github.com/EchoChart/echochart/commit/cdbc3f42a8f44e30d4d91fcd9904cf663960b1aa))
* toggle remove unused translations functionality ([2b33e46](https://github.com/EchoChart/echochart/commit/2b33e46b5223fc58be0871d762ed93a8f5ae8457))
* update backdrop blur effect in form actions for improved UI consistency ([ccab1de](https://github.com/EchoChart/echochart/commit/ccab1dee91f57ac361de54b6972f14c855466d6b))
* update BlockUI integration in FormField component for improved state handling ([cf0756e](https://github.com/EchoChart/echochart/commit/cf0756eb7b69faa5e89db45d188c1e6a8d1fdffd))
* update breadcrumb separator to use a simple slash instead of icon ([07aa521](https://github.com/EchoChart/echochart/commit/07aa521f28f665379ff7d45050c642265c7e51ae))
* update class names for consistency and improve layout responsiveness in form components ([89b6ef6](https://github.com/EchoChart/echochart/commit/89b6ef64b4ce506ed8a5b19e35f281f714f8c2d2))
* update ClientUpsert component to pass id prop instead of data ([965f2c9](https://github.com/EchoChart/echochart/commit/965f2c91a92aa562724f3d460385c9705f086fd7))
* update emit definitions to use array syntax for consistency ([0e88b88](https://github.com/EchoChart/echochart/commit/0e88b88015ba3071339d52a09a762badb08696f1))
* update error handling in form fields to use optional chaining for improved stability ([81f194c](https://github.com/EchoChart/echochart/commit/81f194c04c7973082bbf3f42c40044df06f8c478))
* update form validation and calculations in Upsert component ([4b6ce6e](https://github.com/EchoChart/echochart/commit/4b6ce6eb2e67417deedbe065e76fb9c2d8967ad3))
* update FormBox actions styling for full width layout ([07d4240](https://github.com/EchoChart/echochart/commit/07d4240b1f6e4568a770f4ce214c4365eee70155))
* update FormBox component to handle legend prop as null and improve form structure ([4c74f89](https://github.com/EchoChart/echochart/commit/4c74f891baf0e68f66fdf49363465ab5d5f4185f))
* update FormBox styles to remove max-width constraint on form fields and adjust FormField skeleton class binding ([8c43985](https://github.com/EchoChart/echochart/commit/8c43985672d8b121c1107dd067b4a545a1b377a2))
* update FormField component to improve error handling and styling ([b177e95](https://github.com/EchoChart/echochart/commit/b177e95f6fbddadf6c9b0c7157120683c88f74d5))
* update handleDelete function to properly handle promise rejection ([75db2e1](https://github.com/EchoChart/echochart/commit/75db2e189930b9e38eabd411819289efd929650e))
* update image paths in Error and NotFound components ([687baea](https://github.com/EchoChart/echochart/commit/687baea61e15270f9d37c9033b519538bbdf2a1b))
* update initial form data and financial calculations for stock management ([18c8a53](https://github.com/EchoChart/echochart/commit/18c8a5320fb2c17381c65d9f7a694977c77d956e))
* update JSDoc types for validation rules in Form class ([7b919a3](https://github.com/EchoChart/echochart/commit/7b919a340b7545aed9213b18720a648a23aec56c))
* update keyfilter pattern to allow "@" character in KeywordSearchInput ([3d8af0b](https://github.com/EchoChart/echochart/commit/3d8af0be44af956d9d84cc6fe1adb69f9e5af400))
* update layout model default to 'list' in ResourceDataView and adjust grid column count in CorrelatedAuditLogs ([5b03f34](https://github.com/EchoChart/echochart/commit/5b03f34efef51ea07c5bb2b75084e41b0af3b76a))
* update permission check in ClientSelect and ProductSelect components to use 'read' instead of 'modify' ([74612af](https://github.com/EchoChart/echochart/commit/74612af97e73e735ba65baa95ed75c08d94eae98))
* update PhoneInput component in Profile to prepend '+' to phone numbers for consistent formatting ([0b18ffc](https://github.com/EchoChart/echochart/commit/0b18ffca30b323fe92aae203b69cdac0803df9c8))
* update placeholder logic in AvatarPlaceholder and AccountPopover components for improved user metadata handling ([a45a709](https://github.com/EchoChart/echochart/commit/a45a7092447ca76bdba1f3ebaf5651dfdabf78d5))
* update primevue dependency to version 4.3.3 for compatibility improvements ([2fa3535](https://github.com/EchoChart/echochart/commit/2fa353535f3f2d3865a6b8de3f5ad82fa30f2096))
* update RouteMenuBar rendering condition in branch and stock views for improved logic ([b1889bf](https://github.com/EchoChart/echochart/commit/b1889bf6f26f8b6c76b8fc5450b4b055f9e0e951))
* update rowActions to use table_name for ability checks instead of resource ([5eacbad](https://github.com/EchoChart/echochart/commit/5eacbadfb4759ab69cb3ce25b127883e8b3384ca))
* update scrollbar width in _core.scss and add route name in useLayout.js ([982cff7](https://github.com/EchoChart/echochart/commit/982cff7a444d0b8ce8eda070ff23d03be51e15e1))
* update select query to specify fields and improve data handling in Upsert component ([83a41d8](https://github.com/EchoChart/echochart/commit/83a41d82684325dcda781c281976f01098659d34))
* update select statement in tableProps and pass id prop to Upsert component ([b43eec4](https://github.com/EchoChart/echochart/commit/b43eec43ea5563ab6c8e5851e3133e27ac8ac5ba))
* update select statement in tableProps and pass id prop to Upsert component ([b034c95](https://github.com/EchoChart/echochart/commit/b034c95edf5b9370e56536de5fd28d05293b24f8))
* update severity level for device category in PRODUCT_CATEGORY_PROPS ([762d201](https://github.com/EchoChart/echochart/commit/762d2019e4c56782f912bd4f763504d9f6a12657))
* update stock field names and calculations in Upsert component and SQL migration ([0230065](https://github.com/EchoChart/echochart/commit/02300650d6289436daab114c8430adacabf04fe4))
* update tooltip directive syntax in ActionButtons component ([79112f8](https://github.com/EchoChart/echochart/commit/79112f814995944b109a875877aa5a3b325976d9))
* update topbar styles for improved layout and spacing ([e022a3b](https://github.com/EchoChart/echochart/commit/e022a3b63ba32f751fc055c2de97a9401c500981))
* update type annotations and return types in Form class methods for clarity ([00050a3](https://github.com/EchoChart/echochart/commit/00050a3045c82157744d246877e3e72007d7616a))
* update type annotations for _state and _defaults to improve clarity ([d71816f](https://github.com/EchoChart/echochart/commit/d71816f0dd304d7f368688c86de7053a616c3cb1))
* update visibility condition for product action buttons based on readonly state ([b693064](https://github.com/EchoChart/echochart/commit/b693064366381574a72eda9c04adf0ce57d65858))
* wrap email and phone input fields in a form box for better layout ([65bb4c0](https://github.com/EchoChart/echochart/commit/65bb4c09dcfbc7b597a7cb94e12f00c092e8c51d))


### Code Refactoring

* js to ts big refactor ([abc5f22](https://github.com/EchoChart/echochart/commit/abc5f22f3aefe2edc4292c5049d1b686bb8462c9))

## [1.0.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.17.1-alpha.1...echochart-app-v1.0.0-alpha.1) (2025-07-08)


### ⚠ BREAKING CHANGES

* js to ts big refactor

### Features

* add innerMoldModels and update moldSpeakerPowers for clarity ([f36cb46](https://github.com/EchoChart/echochart/commit/f36cb46075a929b61628d1b80f936957ee050dc0))
* add PrintElementButton component for printing elements with dark mode support ([6cd26f9](https://github.com/EchoChart/echochart/commit/6cd26f9dcfa7a0760110fdfd60ac5c325cc2b312))
* **dayjs:** Introduce date parsing and validation utilities ([fb11505](https://github.com/EchoChart/echochart/commit/fb1150592c687b6cc7216a7ea9dff3319ed8c26e))
* define ResourceTableProps type and update props in ResourceTable component ([b3987bf](https://github.com/EchoChart/echochart/commit/b3987bffc0313f0f5f9bdac4426f5864b59994d5))
* implement error tooltip component styles and integrate with ErrorBadge and FormField ([cf66188](https://github.com/EchoChart/echochart/commit/cf66188a80e1ca1d044ee6d3efbb6d45404a1c07))
* Refactor Record and Stock forms to improve type safety and localization ([15b6ece](https://github.com/EchoChart/echochart/commit/15b6ece0e7303da5c0a0ca549ed781476dffd8be))


### Bug Fixes

* **account-popover:** adjust spacing and options in account popover component ([461bbc6](https://github.com/EchoChart/echochart/commit/461bbc6691d0472cfc6df3f9d12d630959655c86))
* add JSDoc type annotation for fields in Index.vue ([be7d9b9](https://github.com/EchoChart/echochart/commit/be7d9b9da880794038ce6afe8fb89a72d08f6296))
* add JSDoc types for columns and filters in various Index.vue files ([fd229b7](https://github.com/EchoChart/echochart/commit/fd229b74a07c3da9835f7224571114101f1a94a4))
* add JSDoc types for fields in Upsert components ([29fbd35](https://github.com/EchoChart/echochart/commit/29fbd354473cf06bc1013a013f10453a2ebd172c))
* adjust styling for actions bar and button container in FormBox component ([18a979b](https://github.com/EchoChart/echochart/commit/18a979bc2669e12df7adf556a6f473ec94054fb5))
* correct import path for ResourceDataView component ([8c1b9a9](https://github.com/EchoChart/echochart/commit/8c1b9a9a4c00c07afe4c345848e65981a88cbe2c))
* correct margin utility for phone input select component ([44f3b99](https://github.com/EchoChart/echochart/commit/44f3b99fc725a5212106c9c82320d5d1ee0c55ee))
* improve delete confirmation dialog by ensuring headers are cleared properly ([c44e3c4](https://github.com/EchoChart/echochart/commit/c44e3c4717b9091cc20d5d395817e17bd12210ae))
* optimize event listener management in PrintElementButton component ([8143dc9](https://github.com/EchoChart/echochart/commit/8143dc905d0f28e179d3b0117e7b66cc2ae7689b))
* pass 'id' prop to Upsert component and simplify slot usage in form field ([af6908a](https://github.com/EchoChart/echochart/commit/af6908ae65da2fc50a4c42bf539d54558d7ef8be))
* remove '_id' from attribute formatting in formAttributeFormatter ([4a3419c](https://github.com/EchoChart/echochart/commit/4a3419c338f2bde9779902240ea43069887850f9))
* return value from toggleDarkMode function to ensure proper view transition handling ([12fb1fc](https://github.com/EchoChart/echochart/commit/12fb1fc7572919eca55d10f5113ab0d99229c9a1))
* toggle remove unused translations functionality ([2b33e46](https://github.com/EchoChart/echochart/commit/2b33e46b5223fc58be0871d762ed93a8f5ae8457))
* update initial form data and financial calculations for stock management ([18c8a53](https://github.com/EchoChart/echochart/commit/18c8a5320fb2c17381c65d9f7a694977c77d956e))
* update JSDoc types for validation rules in Form class ([7b919a3](https://github.com/EchoChart/echochart/commit/7b919a340b7545aed9213b18720a648a23aec56c))


### Code Refactoring

* js to ts big refactor ([abc5f22](https://github.com/EchoChart/echochart/commit/abc5f22f3aefe2edc4292c5049d1b686bb8462c9))

## [0.17.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.17.0-alpha.1...echochart-app-v0.17.1-alpha.1) (2025-05-22)


### Bug Fixes

* add currency_code field to Database type for improved data structure ([052f2c8](https://github.com/EchoChart/echochart/commit/052f2c84027cfe5fd9c712498a2da5115de54384))

## [0.17.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.16.0-alpha.1...echochart-app-v0.17.0-alpha.1) (2025-05-22)


### Features

* add AvatarPlaceholder component for user profile images and update profile view to use it ([cf166ca](https://github.com/EchoChart/echochart/commit/cf166ca5e4b9a25055b868b2e95600c7d0888f5c))
* add computed property for detailed changed data in Form class ([1111855](https://github.com/EchoChart/echochart/commit/1111855eb44340a598eb7f7c30dcdddebd3c0c13))
* add currencies constant for currency selection component ([131bdde](https://github.com/EchoChart/echochart/commit/131bdde16048ef0d8f32490f000cb59f30f5904e))
* add ErrorBadge component with tooltip for error display ([d3c84a6](https://github.com/EchoChart/echochart/commit/d3c84a617bae7a8665048accef6b80763490f58a))
* add readonly and disabled props to PhoneInput component for better control ([e43611c](https://github.com/EchoChart/echochart/commit/e43611cd1e337fe40bfe43aab7d6a45786da00d0))
* add ResourceDataView component for dynamic data display ([91fe57c](https://github.com/EchoChart/echochart/commit/91fe57c1bf6e6fc89d2ae585de8e49d5ceddf900))
* add SelectResource component for resource selection dialog ([63f7f55](https://github.com/EchoChart/echochart/commit/63f7f556c8b399593fb0a680f222d0f3e8033cbe))
* add SelectStockUnitType component for unit type selection in stock management ([fca1a75](https://github.com/EchoChart/echochart/commit/fca1a75213fee5a7b7892cb09754cbc775a1c0bd))
* implement CorrelatedAuditLogs component and replace AuditLogChangesCard in Index.vue ([7a8bf32](https://github.com/EchoChart/echochart/commit/7a8bf3229c6dc11d5b78113e4719c43d53d3e25a))
* implement record management with CRUD, validation and routing for sales ([5947df5](https://github.com/EchoChart/echochart/commit/5947df571e226c8591cddead67071341418c0f40))
* integrate TanStack Query for improved data fetching and caching ([6581634](https://github.com/EchoChart/echochart/commit/6581634050fa4473e19ba8a74e8e178e7f725601))
* replace InputMask with PhoneInput component for phone fields in profile forms ([c254361](https://github.com/EchoChart/echochart/commit/c254361aa9146dd740641cc6a802a36eaec4fc52))


### Bug Fixes

* add ctrl-click functionality to router-link for improved navigation ([e24e7dd](https://github.com/EchoChart/echochart/commit/e24e7dd048dc6fb33e2930769fb8312285d97d40))
* add fluid prop to FormField components for consistent styling ([0f68bb7](https://github.com/EchoChart/echochart/commit/0f68bb74c90b08770d6365902db47fd1250d86eb))
* add loading progress bar and improve layout class structure for better UI responsiveness ([f1b4b45](https://github.com/EchoChart/echochart/commit/f1b4b45c7a5bda12a74da30cb6c618b28dc577ae))
* add padding to card component in Address and General views for improved layout ([25539e3](https://github.com/EchoChart/echochart/commit/25539e3420c44445a9cde5fa3ec9465942219dc5))
* add padding to card component in client upsert view for improved layout ([03eaff6](https://github.com/EchoChart/echochart/commit/03eaff6eaa77590a463233892db08c061a9c8c93))
* add service routes and update product category props for service ([e72ff2e](https://github.com/EchoChart/echochart/commit/e72ff2e32d86b47ef4f900feb0a0947026ff833f))
* add tax field to Database type for improved financial tracking ([c3e0b2b](https://github.com/EchoChart/echochart/commit/c3e0b2b529e7c68acc0b5ce56369c6d73eb8f06b))
* adjust flex properties in FormField component for improved layout consistency ([9b268f1](https://github.com/EchoChart/echochart/commit/9b268f119acaae1e8cd8abcb48c06288163aeaae))
* adjust layout classes for better responsiveness in auth forms ([8179b3c](https://github.com/EchoChart/echochart/commit/8179b3c2c054a00de5afa23acf3102f0a8bc6986))
* adjust min-width and max-width styles for table actions ([2ab1888](https://github.com/EchoChart/echochart/commit/2ab1888b2551851ebb222b0970e4194b2ea11294))
* adjust Skeleton component height in CustomTable for improved UI consistency ([b80623f](https://github.com/EchoChart/echochart/commit/b80623fc771d8f3a4ce0e7a71a246b78947203d9))
* associate validation instance with the form for improved validation context ([0d0522c](https://github.com/EchoChart/echochart/commit/0d0522ccb250e230506b105c24705e47b0c0b0a1))
* clear default email value in login form and adjust Remember me field styling ([8f15628](https://github.com/EchoChart/echochart/commit/8f1562808be2d519e2004681500a0255d86ef57f))
* conditionally render RouteMenuBar based on dialogRef in branch and stock views ([b5b7a46](https://github.com/EchoChart/echochart/commit/b5b7a462ce23fd87c06f6a110b7a1ceb98e5a266))
* correct 'assembly' to 'assemble' in record types and update related SQL constraint ([837b117](https://github.com/EchoChart/echochart/commit/837b11730f9f529065786ba7bad09f53f576787f))
* correct font declaration syntax in body styles ([edda4c1](https://github.com/EchoChart/echochart/commit/edda4c1232afb064fb80b620db7467295fb45f2f))
* correct labels for operations in SelectAuditOperation component ([a56b016](https://github.com/EchoChart/echochart/commit/a56b016ebed43c1cc456c4fbb3a68bc1c3905557))
* correct rules selection in form validation to use provided rules ([5d16c7a](https://github.com/EchoChart/echochart/commit/5d16c7a0ea39bb60805cedebed5beadfecdcdcd6))
* encode URI for item and meta headers in various components for improved data handling ([c417dbd](https://github.com/EchoChart/echochart/commit/c417dbdd6f3b5a601fa5f114a3b05f24ee545ad2))
* enhance Address and General components with dynamic data fetching and props ([20810bd](https://github.com/EchoChart/echochart/commit/20810bd79991aa8031e2b3360303b80c0280f14f))
* enhance breadcrumb separator and update active link styling ([e8dffd6](https://github.com/EchoChart/echochart/commit/e8dffd67dc30eeb3b41d319f5d35032fc0e9c78b))
* enhance change logging by refining update handling and improving value formatting ([d4c789b](https://github.com/EchoChart/echochart/commit/d4c789b13dee815e9a7bfbc255a9359f33ead251))
* enhance fetchQuery logic with improved error handling and query invalidation for data updates ([a10667a](https://github.com/EchoChart/echochart/commit/a10667addb5a79dd02f55315bbafc731a61b8ba7))
* enhance formatValue function to handle arrays and improve object stringification ([7bf0b9e](https://github.com/EchoChart/echochart/commit/7bf0b9ea9cda7e8d4599921510466804f1f5224a))
* enhance FormBox component with error handling and styling adjustments ([50b7549](https://github.com/EchoChart/echochart/commit/50b7549cc3db6c3cd74893aee5fea9fc8f054065))
* enhance log operation handling by adding 'select' case in getLogTagProps ([91c1782](https://github.com/EchoChart/echochart/commit/91c1782df2a2658d9e84d017133ec6988bce8ccf))
* enhance row action permissions and add SELECT operation to audit log ([8b6236a](https://github.com/EchoChart/echochart/commit/8b6236aad3c4aac889b71e05230ef5f1899dad29))
* enhance stock management by adding unit type, discount, and tax fields in Upsert component and database schema ([9429125](https://github.com/EchoChart/echochart/commit/9429125534e9eead1923eef813c7afea32972978))
* enhance transition animations in layout components for smoother effects ([093a839](https://github.com/EchoChart/echochart/commit/093a83981505bb7b9c735f241d6b2c327ba90362))
* enhance user avatar display in AccountPopover and Profile views for improved user experience ([46732f3](https://github.com/EchoChart/echochart/commit/46732f37de9961f726e32082e33875af024c4d1a))
* enhance validation rules and improve stock selection in Upsert component ([3341dce](https://github.com/EchoChart/echochart/commit/3341dcec27b51244f4e49940208afd10ccfec0e4))
* ensure contextMenuItems default to an empty array in CustomLink component ([9b608e2](https://github.com/EchoChart/echochart/commit/9b608e2a6d273a4b8367d769c56ab8f3c5adea7f))
* ensure deep cloning of permissions when toggling all selections ([f9d3223](https://github.com/EchoChart/echochart/commit/f9d322388f7bef3c1047a023431ffd9caa9d7881))
* ensure phone numbers are prefixed with '+' for validation consistency ([b535dbc](https://github.com/EchoChart/echochart/commit/b535dbc01db41bb91b39fe36579d230338ee9bd5))
* handle optional chaining for data properties in audit log components ([1c5e8bb](https://github.com/EchoChart/echochart/commit/1c5e8bbf7eadc598c577c5624557267ab541d447))
* handle optional chaining for log operation and improve data fetching logic ([5d127aa](https://github.com/EchoChart/echochart/commit/5d127aa5e782242391d01a1edb1733d13857aa65))
* improve cost calculation logic and enhance input field configurations in Upsert component ([dc36afc](https://github.com/EchoChart/echochart/commit/dc36afc3e4202fa5e112856263a9641c1cb92c1d))
* improve error handling for phone field to use optional chaining for stability ([0cd6d30](https://github.com/EchoChart/echochart/commit/0cd6d30b1e66d2fc06bfd7f951192d7eb5063370))
* include auto-imports definitions in tsconfig and reorder imports in vite.config ([ff0f33c](https://github.com/EchoChart/echochart/commit/ff0f33c03161c13a5fc6d1eb056e824561764eef))
* include resource_name in permission selection for role table ([70c4913](https://github.com/EchoChart/echochart/commit/70c4913a8f948f02b1c94a6425f22f70b56d323c))
* merge attrs.filters into filters for consistent filter handling across components ([f12b5c9](https://github.com/EchoChart/echochart/commit/f12b5c9064750778dc9f25d2f6148eced3303878))
* pass data to stock-update event emissions for improved data handling ([a4a1a08](https://github.com/EchoChart/echochart/commit/a4a1a08bdea2637a8b170231f46d3d70a6fab209))
* refactor category handling in Upsert component for improved data initialization ([f841e73](https://github.com/EchoChart/echochart/commit/f841e73a02a3603ffc9e1593cf0a11fb6af46daa))
* refactor formAttributeFormatter for improved attribute name formatting ([1cba672](https://github.com/EchoChart/echochart/commit/1cba672fd73c2ba968ae11704b45d3bda0e367ad))
* refactor FormField component styles for improved layout and responsiveness ([93e53aa](https://github.com/EchoChart/echochart/commit/93e53aa7b413bffb3b0ca7a4b10f855b69f720cd))
* refactor product data retrieval and category handling in Upsert component ([21c5eb2](https://github.com/EchoChart/echochart/commit/21c5eb296b8f358c04ee335e2c75ede8f4594487))
* refactor stock form logic for improved data handling and validation ([fababf0](https://github.com/EchoChart/echochart/commit/fababf0900327685ceb942a946a04e9077699c05))
* refactor Upsert component to improve form structure and enhance readability ([caac63f](https://github.com/EchoChart/echochart/commit/caac63f1a46f93e6907e3b61d6fddebbad512516))
* refine select query to specify fields and enhance data handling in tableProps ([761ce60](https://github.com/EchoChart/echochart/commit/761ce607c2cea3540b79718b6cf77c6b7ce0efff))
* remove keyfilter from InputText in KeywordSearchInput for simplified input handling ([c7a9e2e](https://github.com/EchoChart/echochart/commit/c7a9e2e074c71b574dce38a3368bc476d98b2e39))
* remove redundant total_cost update in computed property ([0774b5d](https://github.com/EchoChart/echochart/commit/0774b5dfe47d0ef13113bd2154494d6447969142))
* remove required validation for brand field in Upsert form ([209013f](https://github.com/EchoChart/echochart/commit/209013fa0b1221a42e51be3104af4f54ecff9a43))
* remove unnecessary condition from RouteMenuBar in branch and stock views for cleaner code ([3afd836](https://github.com/EchoChart/echochart/commit/3afd836326285b540ce7892a998971592bbd0301))
* remove unnecessary positioning classes from Popover for improved layout consistency ([900f2dd](https://github.com/EchoChart/echochart/commit/900f2dd41f809995c05035564b945d615f063638))
* remove unnecessary route loading check and simplify component lifecycle management ([f0ebdd1](https://github.com/EchoChart/echochart/commit/f0ebdd1c7c19e895c225c82997174163f0a9f9f2))
* remove unused authentication store references in ResourceTable component ([2f499c3](https://github.com/EchoChart/echochart/commit/2f499c33a53cf15ef9ed68510b7244c309fa433f))
* remove unused mapClass prop and improve totalRecords initialization ([93e595d](https://github.com/EchoChart/echochart/commit/93e595d313a87c24a00c90fe64eef3b2dc26166e))
* rename ClientSelect to SelectClient in Address component ([6d72919](https://github.com/EchoChart/echochart/commit/6d72919ceca80ba2f7f0ea2a4cc121df321b6622))
* rename handleDelete to handleDeleteDialog and improve delete confirmation logic ([a9a2f3f](https://github.com/EchoChart/echochart/commit/a9a2f3f4a4a22cca716de385d0ecffd13d8954f5))
* rename stock_date to stocked_at in components and SQL migration ([bfc33c6](https://github.com/EchoChart/echochart/commit/bfc33c6e3dec072e2b84be99e87043de3159c854))
* reorder columns in Audit Log table for consistent display ([e0313de](https://github.com/EchoChart/echochart/commit/e0313def9041deac8f9ba28e1a09c199d264af14))
* replace isRef check with unref for cleaner property access in Collection class ([0e1de9c](https://github.com/EchoChart/echochart/commit/0e1de9c54da99c293a7d4a1ca75900fd12899fc7))
* replace span with anchor tag in router-link for proper link behavior ([531d543](https://github.com/EchoChart/echochart/commit/531d543038057fae39319a97ba9f34b96c5c3b1f))
* simplify bodyCell class assignment in CustomTable for improved readability ([09f083e](https://github.com/EchoChart/echochart/commit/09f083e294c65029c4d81cf644978575a9c7e505))
* simplify conditional logic in state setter for improved readability ([ffd6476](https://github.com/EchoChart/echochart/commit/ffd6476862e976e2ea5c8215fe1cfca250821cac))
* simplify CustomLink usage in NotFound.vue for cleaner code ([112b4fd](https://github.com/EchoChart/echochart/commit/112b4fde79f76a82cf62f19c0b8e5809de739c0a))
* simplify loading condition for client data retrieval ([7ddeb5d](https://github.com/EchoChart/echochart/commit/7ddeb5d2864d24d9a092b1528c444bab693de1c3))
* simplify readonly prop usage in FormField components across Upsert views ([6781464](https://github.com/EchoChart/echochart/commit/6781464c87b8e3bda9b6bdde58168368f33734ef))
* simplify select statement in save function of Upsert component ([bf6500c](https://github.com/EchoChart/echochart/commit/bf6500cb90f978d478b15ef6b710d4d8d7ec92f8))
* streamline button component structure in SelectProduct.vue ([fa5add6](https://github.com/EchoChart/echochart/commit/fa5add6e5aab0e35fd2d3c49318a8c2e8e37045e))
* streamline data fetching logic by removing unnecessary route loading check ([10dac9b](https://github.com/EchoChart/echochart/commit/10dac9ba8e40fa334d523277d86e5c32fa204c54))
* streamline filters and simplify tableProps in Index component ([d4214eb](https://github.com/EchoChart/echochart/commit/d4214eb2fed622a685cc2f8eb231409138d5f8f3))
* update backdrop blur effect in form actions for improved UI consistency ([ccab1de](https://github.com/EchoChart/echochart/commit/ccab1dee91f57ac361de54b6972f14c855466d6b))
* update BlockUI integration in FormField component for improved state handling ([cf0756e](https://github.com/EchoChart/echochart/commit/cf0756eb7b69faa5e89db45d188c1e6a8d1fdffd))
* update breadcrumb separator to use a simple slash instead of icon ([07aa521](https://github.com/EchoChart/echochart/commit/07aa521f28f665379ff7d45050c642265c7e51ae))
* update class names for consistency and improve layout responsiveness in form components ([89b6ef6](https://github.com/EchoChart/echochart/commit/89b6ef64b4ce506ed8a5b19e35f281f714f8c2d2))
* update ClientUpsert component to pass id prop instead of data ([965f2c9](https://github.com/EchoChart/echochart/commit/965f2c91a92aa562724f3d460385c9705f086fd7))
* update emit definitions to use array syntax for consistency ([0e88b88](https://github.com/EchoChart/echochart/commit/0e88b88015ba3071339d52a09a762badb08696f1))
* update error handling in form fields to use optional chaining for improved stability ([81f194c](https://github.com/EchoChart/echochart/commit/81f194c04c7973082bbf3f42c40044df06f8c478))
* update FormBox actions styling for full width layout ([07d4240](https://github.com/EchoChart/echochart/commit/07d4240b1f6e4568a770f4ce214c4365eee70155))
* update FormBox component to handle legend prop as null and improve form structure ([4c74f89](https://github.com/EchoChart/echochart/commit/4c74f891baf0e68f66fdf49363465ab5d5f4185f))
* update FormBox styles to remove max-width constraint on form fields and adjust FormField skeleton class binding ([8c43985](https://github.com/EchoChart/echochart/commit/8c43985672d8b121c1107dd067b4a545a1b377a2))
* update FormField component to improve error handling and styling ([b177e95](https://github.com/EchoChart/echochart/commit/b177e95f6fbddadf6c9b0c7157120683c88f74d5))
* update keyfilter pattern to allow "@" character in KeywordSearchInput ([3d8af0b](https://github.com/EchoChart/echochart/commit/3d8af0be44af956d9d84cc6fe1adb69f9e5af400))
* update layout model default to 'list' in ResourceDataView and adjust grid column count in CorrelatedAuditLogs ([5b03f34](https://github.com/EchoChart/echochart/commit/5b03f34efef51ea07c5bb2b75084e41b0af3b76a))
* update PhoneInput component in Profile to prepend '+' to phone numbers for consistent formatting ([0b18ffc](https://github.com/EchoChart/echochart/commit/0b18ffca30b323fe92aae203b69cdac0803df9c8))
* update placeholder logic in AvatarPlaceholder and AccountPopover components for improved user metadata handling ([a45a709](https://github.com/EchoChart/echochart/commit/a45a7092447ca76bdba1f3ebaf5651dfdabf78d5))
* update primevue dependency to version 4.3.3 for compatibility improvements ([2fa3535](https://github.com/EchoChart/echochart/commit/2fa353535f3f2d3865a6b8de3f5ad82fa30f2096))
* update RouteMenuBar rendering condition in branch and stock views for improved logic ([b1889bf](https://github.com/EchoChart/echochart/commit/b1889bf6f26f8b6c76b8fc5450b4b055f9e0e951))
* update rowActions to use table_name for ability checks instead of resource ([5eacbad](https://github.com/EchoChart/echochart/commit/5eacbadfb4759ab69cb3ce25b127883e8b3384ca))
* update scrollbar width in _core.scss and add route name in useLayout.js ([982cff7](https://github.com/EchoChart/echochart/commit/982cff7a444d0b8ce8eda070ff23d03be51e15e1))
* update select query to specify fields and improve data handling in Upsert component ([83a41d8](https://github.com/EchoChart/echochart/commit/83a41d82684325dcda781c281976f01098659d34))
* update select statement in tableProps and pass id prop to Upsert component ([b43eec4](https://github.com/EchoChart/echochart/commit/b43eec43ea5563ab6c8e5851e3133e27ac8ac5ba))
* update select statement in tableProps and pass id prop to Upsert component ([b034c95](https://github.com/EchoChart/echochart/commit/b034c95edf5b9370e56536de5fd28d05293b24f8))
* update severity level for device category in PRODUCT_CATEGORY_PROPS ([762d201](https://github.com/EchoChart/echochart/commit/762d2019e4c56782f912bd4f763504d9f6a12657))
* update stock field names and calculations in Upsert component and SQL migration ([0230065](https://github.com/EchoChart/echochart/commit/02300650d6289436daab114c8430adacabf04fe4))
* update tooltip directive syntax in ActionButtons component ([79112f8](https://github.com/EchoChart/echochart/commit/79112f814995944b109a875877aa5a3b325976d9))
* update topbar styles for improved layout and spacing ([e022a3b](https://github.com/EchoChart/echochart/commit/e022a3b63ba32f751fc055c2de97a9401c500981))
* update type annotations and return types in Form class methods for clarity ([00050a3](https://github.com/EchoChart/echochart/commit/00050a3045c82157744d246877e3e72007d7616a))
* update type annotations for _state and _defaults to improve clarity ([d71816f](https://github.com/EchoChart/echochart/commit/d71816f0dd304d7f368688c86de7053a616c3cb1))

## [0.16.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.15.0-alpha.1...echochart-app-v0.16.0-alpha.1) (2025-04-18)


### Features

* **audit-log:** add audit log functionality with CRUD operations and UI components ([cf67c7a](https://github.com/EchoChart/echochart/commit/cf67c7a1155bbd108ca8ad96e6ce9d0082bb73df))


### Bug Fixes

* enhance API request validation by excluding RPC calls in Supabase options ([4c1c807](https://github.com/EchoChart/echochart/commit/4c1c807fe3430e14d9de8e40295aaf93bbbad984))
* streamline country selection logic and improve model value handling in PhoneInput component ([d3dea3f](https://github.com/EchoChart/echochart/commit/d3dea3ff01bb8b5bac46d6b2b75046371cff007e))

## [0.15.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.14.0-alpha.1...echochart-app-v0.15.0-alpha.1) (2025-04-11)


### Features

* add ActionButtons component for handling row actions in CustomTable ([2409c1c](https://github.com/EchoChart/echochart/commit/2409c1cae6f7ecde6b4e492c8f8f5762e17e58f1))
* add email and phone templates for ResourceTable to enhance data display ([efad75b](https://github.com/EchoChart/echochart/commit/efad75b3bbfc68a2039643885070a98c78d40d4f))


### Bug Fixes

* add minimum width to table columns for better layout ([1a9946c](https://github.com/EchoChart/echochart/commit/1a9946c43ee1516722da32fcc9e509b8cd293038))
* add vite-plugin-compression for improved asset compression ([e69052d](https://github.com/EchoChart/echochart/commit/e69052db5e05bf36977d75b766b2180919dc986b))
* adjust AddressTable class for improved layout responsiveness ([df95426](https://github.com/EchoChart/echochart/commit/df9542670889e23ffa2ae1115a1e83f4d0b5426d))
* adjust layout for permission field in role upsert component ([797ec85](https://github.com/EchoChart/echochart/commit/797ec8561cf06c8a819da93cb55f6902b6c9078b))
* adjust margin for PhoneInput component styling ([e36a498](https://github.com/EchoChart/echochart/commit/e36a498c85963c72abd27a0dbd0cfd15460d36cb))
* enhance phone validation logic to ensure country code is included ([c499bcc](https://github.com/EchoChart/echochart/commit/c499bccaed0aaecf71d47c2e44b2aed454123df8))
* optimize phone number validation logic in PhoneInput component ([75ea589](https://github.com/EchoChart/echochart/commit/75ea589c2947ec8dd87f526bf881beee552620ad))
* rename 'created_at' to 'stock_date' for consistency across battery, device, and spare-part components ([bfded88](https://github.com/EchoChart/echochart/commit/bfded8830c0ff527a980c22cd5b684d8a7224954))
* simplify FormField usage by removing unnecessary template slots in profile and update-password components ([59bfcbe](https://github.com/EchoChart/echochart/commit/59bfcbe2233f0805d733a14776467890305b60a4))
* streamline FormField usage by removing unnecessary template slots in Login and Register components ([cdbc3f4](https://github.com/EchoChart/echochart/commit/cdbc3f42a8f44e30d4d91fcd9904cf663960b1aa))
* update form validation and calculations in Upsert component ([4b6ce6e](https://github.com/EchoChart/echochart/commit/4b6ce6eb2e67417deedbe065e76fb9c2d8967ad3))
* update handleDelete function to properly handle promise rejection ([75db2e1](https://github.com/EchoChart/echochart/commit/75db2e189930b9e38eabd411819289efd929650e))
* update permission check in ClientSelect and ProductSelect components to use 'read' instead of 'modify' ([74612af](https://github.com/EchoChart/echochart/commit/74612af97e73e735ba65baa95ed75c08d94eae98))
* wrap email and phone input fields in a form box for better layout ([65bb4c0](https://github.com/EchoChart/echochart/commit/65bb4c09dcfbc7b597a7cb94e12f00c092e8c51d))

## [0.14.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.13.0-alpha.1...echochart-app-v0.14.0-alpha.1) (2025-04-08)


### Features

* add columnResizeMode property to CustomTable for improved column resizing behavior ([ea0560b](https://github.com/EchoChart/echochart/commit/ea0560b881605593d58868f2d8f5533627d27839))
* add PhoneInput component for enhanced phone number input handling and validation ([cd3116d](https://github.com/EchoChart/echochart/commit/cd3116d05f7f390c60be26af56388e8d22083591))
* add placeholders to select components for improved user guidance ([2c5fa0e](https://github.com/EchoChart/echochart/commit/2c5fa0e4b84399c43df4ca2db9f40033bcb21e20))
* add stock_date field to Upsert form and update related error handling ([c671915](https://github.com/EchoChart/echochart/commit/c671915992367527e62e4f33dfd63fac94ba5299))
* enhance PhoneInput component with improved phone number validation and formatting ([14ffaaa](https://github.com/EchoChart/echochart/commit/14ffaaa4dbf6c95bb9fc97768a68096cb2630384))
* implement centralized app error handler for improved error management ([a3fa40b](https://github.com/EchoChart/echochart/commit/a3fa40bd609e33987240113d866b0b2eff9d10ca))
* introduce SelectCountry component and update filters for consistency in client and product forms ([c037eca](https://github.com/EchoChart/echochart/commit/c037eca085ba1477c2a3cb2313f8d96d35613830))
* replace currency-codes with countries-list and implement SelectCurrency component ([ea748c2](https://github.com/EchoChart/echochart/commit/ea748c2170833cb2388d58d8ad00fa3935358224))

## [0.13.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.12.0-alpha.1...echochart-app-v0.13.0-alpha.1) (2025-03-25)


### Features

* add address management functionality with CRUD operations and related database triggers ([de5dff0](https://github.com/EchoChart/echochart/commit/de5dff0390086010b1d4f37df7900c12741fec61))

## [0.12.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.11.0-alpha.1...echochart-app-v0.12.0-alpha.1) (2025-03-17)


### Features

* add 'auto' sidebar layout option ([7670e43](https://github.com/EchoChart/echochart/commit/7670e43d8e96234241939612349ec0fa4162a118))
* add 'p-0' class to Upsert component for consistent styling ([db62762](https://github.com/EchoChart/echochart/commit/db62762db9ef50fa3d360b6089cc76d34e0dc19d))
* add description filter to product index page ([466a06b](https://github.com/EchoChart/echochart/commit/466a06bdd738324364a5edf825268e173a0221ca))
* enhance CustomTable component with improved slot handling and filter logic ([a3ac3b1](https://github.com/EchoChart/echochart/commit/a3ac3b1b5e7a6bf9646328e12996a320f268d21a))
* implement meta storage handling with local and session options ([795114f](https://github.com/EchoChart/echochart/commit/795114f64bc6fe63728adbde11add69f1fed8ccb))
* refactor validator logic into separate module for improved organization ([7e6174d](https://github.com/EchoChart/echochart/commit/7e6174ddb420c579d0186fca527cebc0ed7d142c))
* update stock event emissions for improved event handling ([1cbfbf2](https://github.com/EchoChart/echochart/commit/1cbfbf237753ce9dc20fae26d0de31b483dd1ef1))


### Bug Fixes

* correct variable name from client to clients in getClient function ([1216161](https://github.com/EchoChart/echochart/commit/121616183fce8f0dd44f1c928cce3bfab53ab6d3))

## [0.11.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.10.0-alpha.1...echochart-app-v0.11.0-alpha.1) (2025-03-14)


### Features

* update numeric precision for unit_cost and total_cost to 3 decimal places ([01c0280](https://github.com/EchoChart/echochart/commit/01c028000a2c797621ead39ffd3e6f44c041068b))

## [0.10.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.9.0-alpha.1...echochart-app-v0.10.0-alpha.1) (2025-03-14)


### Features

* add context menu items for branch, client, and stock routes with dialog positions ([3df8f4f](https://github.com/EchoChart/echochart/commit/3df8f4fe3a0fa104836371827f67724ea0a7be0a))


### Bug Fixes

* update image paths in Error and NotFound components ([687baea](https://github.com/EchoChart/echochart/commit/687baea61e15270f9d37c9033b519538bbdf2a1b))

## [0.9.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.8.0-alpha.1...echochart-app-v0.9.0-alpha.1) (2025-03-12)


### Features

* add fetchClient function to retrieve a single client by ID ([458b1a9](https://github.com/EchoChart/echochart/commit/458b1a9ac3e95cd1857039819cc969ca6c4ba241))
* integrate Upsert component and enhance error handling in client forms ([718b46c](https://github.com/EchoChart/echochart/commit/718b46c09169000e3492c317b848e5602b295bc4))

## [0.8.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.7.0-alpha.1...echochart-app-v0.8.0-alpha.1) (2025-03-10)


### Features

* add client management functionality with routing and database integration ([febd3f8](https://github.com/EchoChart/echochart/commit/febd3f84cbfbc5bba66f2a8cf1d00937b3919651))

## [0.7.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.6.0-alpha.1...echochart-app-v0.7.0-alpha.1) (2025-03-10)


### Features

* add stock page with dynamic routing and menu bar integration ([c88e7d8](https://github.com/EchoChart/echochart/commit/c88e7d8d3751460c1d79430f84198aec8a61d7a4))

## [0.6.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.5.0-alpha.1...echochart-app-v0.6.0-alpha.1) (2025-03-09)


### Features

* enhance ProductSelect component with edit and add functionality, and improve props handling ([6f9dd16](https://github.com/EchoChart/echochart/commit/6f9dd16ff2a3d0807ce4c949fe1af2bf29d0c4c6))
* improve product and category fetching by resetting state and handling defaults ([7880204](https://github.com/EchoChart/echochart/commit/7880204a6e53bd42c214215a638ba77eb276369b))
* update product route to include optional category and enhance Upsert component with category prop ([81ba4cb](https://github.com/EchoChart/echochart/commit/81ba4cbc06d6570039041435f6e348a7827b44c8))

## [0.5.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.4.1-alpha.1...echochart-app-v0.5.0-alpha.1) (2025-03-07)


### Features

* add vendor filter to stock tables ([051ca2f](https://github.com/EchoChart/echochart/commit/051ca2fb88b819e26df62b754a0cee271fe82303))

## [0.4.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.4.0-alpha.1...echochart-app-v0.4.1-alpha.1) (2025-03-07)


### Bug Fixes

* refine filter query logic to handle empty values more accurately ([f4cd29b](https://github.com/EchoChart/echochart/commit/f4cd29b64121e6434099a5f639a5dd2f0f8e26c7))
* simplify Skeleton component height logic in CustomTable ([9793b4b](https://github.com/EchoChart/echochart/commit/9793b4b3dc0b8363a74d448daa1dd5a6d2c0699e))
* update visibility condition for product action buttons based on readonly state ([b693064](https://github.com/EchoChart/echochart/commit/b693064366381574a72eda9c04adf0ce57d65858))

## [0.4.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.3.1-alpha.1...echochart-app-v0.4.0-alpha.1) (2025-03-06)


### Features

* **CustomTable:** enhance filter functionality and improve data handling ([b88af33](https://github.com/EchoChart/echochart/commit/b88af33312a37ee99a478ac5796e8e5ab062c6cd))
* **Form:** add validation rules and enhance form functionality with reactive properties ([43f1672](https://github.com/EchoChart/echochart/commit/43f1672ea7cca009c6d850d2dfc60de0f0883428))
* **KeywordSearchInput:** add keyword search input component with model binding ([eadff20](https://github.com/EchoChart/echochart/commit/eadff2075ca523f73384a03a52abf29912a5ad33))
* **PermissionsSelect:** rename `SelectPermissions` component to `PermissionsSelect` ([3345100](https://github.com/EchoChart/echochart/commit/3345100f0e27fe2508e4a325299ecc85c5cd0e10))
* **product:** add product and category store with fetching capabilities ([562970e](https://github.com/EchoChart/echochart/commit/562970e41f8e777f29aec432635e36815a5c0cba))
* **product:** add product management page with upsert functionality and filters ([177f41e](https://github.com/EchoChart/echochart/commit/177f41ec4ed8245917d9206c6137f82e06bd874a))
* **product:** add PRODUCT_CATEGORY_PROPS for category styling and icons ([8b04b2b](https://github.com/EchoChart/echochart/commit/8b04b2b0b0a5be5ea9c9eab56da8412fdffba2a2))
* **product:** add ProductBrandSelect component for brand selection with loading state ([041dab2](https://github.com/EchoChart/echochart/commit/041dab2e2f65ee0942abe5d3701629b5123f0bc1))
* **product:** add ProductCategorySelect component for category selection with loading state ([28c7fe3](https://github.com/EchoChart/echochart/commit/28c7fe383c94b5dc9660a90dbd667f3e6e0b461e))
* **product:** add ProductSelect component for selecting products by category with loading state ([67cf366](https://github.com/EchoChart/echochart/commit/67cf366ba5a116cdbd1c2d28c4cea7a8913b7e8a))
* **stock:** add device routes and device management page for stock handling ([c59dcb2](https://github.com/EchoChart/echochart/commit/c59dcb234e7546a000550ea4d31640ff3a63a217))
* **stock:** add routes and views for battery, spare part, and product management ([f64890b](https://github.com/EchoChart/echochart/commit/f64890b1ee77622fb526350f0ac509b3a2f03ef6))
* **stock:** add stocks and vendors store with fetching capabilities ([f91996a](https://github.com/EchoChart/echochart/commit/f91996a7985023e8efc61c125baf54557bec7e8a))
* **stock:** add StockVendorSelect component for vendor selection with fetching capabilities ([c21134e](https://github.com/EchoChart/echochart/commit/c21134e5ae76ad6c94f78ec8e6135dbe0ed08f90))
* **Supabase:** enhance filter query generation with new match modes and operators ([261136e](https://github.com/EchoChart/echochart/commit/261136eab3f790384591b16b881a7f989615fa61))


### Bug Fixes

* **AppConfigurator:** adjust UIScale slider step and minimum value for better user experience ([7936c3c](https://github.com/EchoChart/echochart/commit/7936c3c15108fc3b2fc4255396d1badd6efff6b4))
* **CustomLink:** replace hardcoded dialog position with constant from router ([486d5ba](https://github.com/EchoChart/echochart/commit/486d5ba45bbf4e58dc8ffcccad365c97351d4e0c))
* **FormBox, FormField:** adjust spacing and error message formatting for improved UI consistency ([e732bcb](https://github.com/EchoChart/echochart/commit/e732bcb09fd04bb00c6fb1baa8128ba1f127bd29))
* **imports:** update theme imports from @primevue/themes to @primeuix/themes ([3e2bd22](https://github.com/EchoChart/echochart/commit/3e2bd224299dd1442d10896eccea069fe7a321fd))
* **ResourceTable:** streamline Supabase request handling and improve event emitter usage ([50f50d2](https://github.com/EchoChart/echochart/commit/50f50d296126705926475fde4d39f2bcd8606b56))

## [0.3.1-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.3.0-alpha.1...echochart-app-v0.3.1-alpha.1) (2025-01-30)


### Bug Fixes

* **customtable:** customTable component skeleton loader bugfix ([f6a4eab](https://github.com/EchoChart/echochart/commit/f6a4eab3bb7a0c8f0d1d9ac8ff76524968b5bf97))

## [0.3.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.2.0-alpha.1...echochart-app-v0.3.0-alpha.1) (2025-01-30)


### Features

* cASL.js plugin added ([1e94de2](https://github.com/EchoChart/echochart/commit/1e94de20bee7f048cc0dad6f659cfa1382f4a4df))

## [0.2.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.1.0-alpha.1...echochart-app-v0.2.0-alpha.1) (2025-01-24)


### Features

* branch and branch roles added ([c2a384c](https://github.com/EchoChart/echochart/commit/c2a384c202a0552c3239fce0b5a2be83dff60621))
* mitt.js plugin added ([7e9c363](https://github.com/EchoChart/echochart/commit/7e9c36386ca6244533e813ca07c24619faa3597d))
* **resourcetable:** base resource service table added ([0e58d8f](https://github.com/EchoChart/echochart/commit/0e58d8f7730cbdc5b524193bd7b55e0d679b6dfa))
* service component added for select permissions ([1e1ca44](https://github.com/EchoChart/echochart/commit/1e1ca44211b4f16b9777db6194a42fffa1545116))
* **supabase-client:** added primevue table filter support to supabase client's global fetch ([73107c4](https://github.com/EchoChart/echochart/commit/73107c4ea76ecd46201c0022d65e5420f781720c))
* users can switch between their branches ([dcb4a48](https://github.com/EchoChart/echochart/commit/dcb4a489407436c32cc650ac93a73db698f5010b))

## [0.1.0-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.0.2-alpha.1...echochart-app-v0.1.0-alpha.1) (2025-01-08)


### Features

* **account:** update account ([c23f84a](https://github.com/EchoChart/echochart/commit/c23f84a790c03cb35d6241b668bb57d9f02737b7))

## [0.0.2-alpha.1](https://github.com/EchoChart/echochart/compare/echochart-app-v0.0.1-alpha.1...echochart-app-v0.0.2-alpha.1) (2025-01-07)


### Performance Improvements

* **supabase:** cache supabase requests ([27d7aea](https://github.com/EchoChart/echochart/commit/27d7aea33f8fd8aa0156ef4791e7b4a4521fc42b))

## 0.0.1-alpha.1 (2025-01-07)


### Miscellaneous Chores

* release 0.0.1 ([974f07e](https://github.com/EchoChart/echochart/commit/974f07e750591bff3d27bbdd8d74b7d265683304))
* release 0.0.1-alpha.1 ([7adbc2b](https://github.com/EchoChart/echochart/commit/7adbc2bfa4437a6f750bb9ed33809ee06c470ae6))
