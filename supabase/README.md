# Local database: the two seeds

## Two seeds

- `seed.sql` is small. The pgTAP suite (`supabase/tests/`) asserts its exact contents, and
  `supabase db reset` loads it (`config.toml`: `sql_paths = ['./seed.sql']`).
- `seed_story.sql` is the development story. It goes on top of `seed.sql` and fills MOESA LTD
  with one connected story around the demo customer THOMETZKI (THO): products, projects and
  gates, orders, shipments, market cells, incidents, change requests, documents and media, and
  the feed in four date bands. A second customer, Kernhaus Living GmbH (KRN), and the stubs LEA
  (lead), PAU (paused) and CLS (closed) come with it. `pnpm dev:seed-story` loads it.
  `seed_story.check.sql` is its smoke check.

The story is for development only. Staging and CI never load it.

## Commands

All of these run from `app/`:

| Command                   | What it does                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:supabase-reset` | `supabase db reset`, then the story, then the types. This is the usual one.                                                                                                                                                                               |
| `pnpm dev:seed-story`     | Loads the story onto a freshly reset database: uploads the sample files, runs `seed_story.sql` in one transaction, then the smoke check. It prints `seed-story: ok (N checks)`, or a `FAIL <check> <detail>` line for each check that fails, and exits 1. |
| `pnpm test:db`            | `supabase db reset`, then the pgTAP suite. The reset puts the database back on the small seed, so run `pnpm dev:seed-story` again afterwards.                                                                                                             |
| `pnpm test:scripts`       | The unit tests of `scripts/seed-story.mjs`.                                                                                                                                                                                                               |

The story will not load twice. If customer KRN exists, the script stops before it uploads
anything, and the SQL has the same guard. After a failed or partial run, run
`supabase db reset` and start again.

A failed run leaves two things behind. The uploaded files stay in Storage after the SQL rolls
back; after a reset a rerun upserts them, so nothing piles up. And `pnpm dev:supabase-reset` stops
before it regenerates the types when the story or a check fails, so fix the failure and run the
types step (`pnpm dev:supabase-types`) by hand or reset again.

The story and the smoke check run as two transactions. The script reads the database date before
the story and hands it to the check (`story.today`), so a run that crosses 00:00 UTC does not fail
the date checks. The script also refuses to run unless the API URL is `127.0.0.1` or `localhost`.

## What each user sees

Every demo account uses the password `Demo1234!`.

- **baris@moesa-panel.test**: owner of MOESA LTD and MOESA Trading GmbH.
   - Every dashboard box has rows. The market box's customer switch shows THO and KRN.
   - The notifications have entries in today, yesterday, last week and older. At its default
     narrow size the box lists only the first four, so "older" appears once the box is set to wide.
   - The Media page has PNG, PDF and MP4 previews, plus an orphan PNG that can be deleted.
   - Trading's `media_max_mb` setting is 5 MB. THO's 12 MB catalogue goes over it.
- **akif@moesa-panel.test**: management in MOESA LTD and MOESA Europe.
   - The incidents he closed, and the change requests.
   - In MOESA Europe, the copy of KRN that the story's transfer made. Its files are pending:
     no client copies them, so the copy keeps `files_status = 'pending'` for good.
   - In the feed, that transfer shows as "cannot be reverted".
   - The refused transfers below.
- **koordinator@moesa-panel.test**: coordinator in MOESA LTD.
   - Projects, tasks, market cells and shipments.
   - The pilot project "Mop ailesi çok ülke pilotu" waits on G1. Passing G1 is refused first
     because it has no customer approval date or document. With both in place, its blocking task
     refuses it (`gate_blocked_by_task`).

### Values that change on every reset

- The transfer row and every row the copy created in MOESA Europe get their ids from
  `public.transfer_customer`, so they are new on every reset. Find them by source and target
  customer: `transfer.customer_id` is MOESA LTD's KRN and `transfer.target_customer_id` is
  Europe's KRN. Every other story row has a fixed id: `5eed00SS-0000-4000-8000-0000000000NN`,
  where `SS` is the story step and `NN` the row.
- Codes depend on the year (`PO-THO-<year>-…`). Never write them down. Find rows by fixed id,
  sku or name.
- The closed incidents' `closed_on` is today, and so is CR-002's `created_at`. The guards own
  those columns, and the bypass flag does not reach them.
- Every other date is relative to the day of the reset (`current_date ± n`, `now() - interval`).

## Refused-move situations and how to reproduce them

Nothing is stored for these. The data simply makes each refusal happen when you try it, and
the smoke check asks the server for each one (`m21.*`).

| Refusal                   | How to get it                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transfer_product_in_use` | Move only the product THO-CONES-100 out of MOESA LTD, for example into MOESA Europe. It is on a closed project, a closed order and market cells. The rehearsal lists those links under "Links that stay in the source", and the panel keeps the Transfer button disabled, so you never reach the server's own refusal `transfer_product_in_use` from the UI (the smoke check asks the server directly).                            |
| `transfer_files_pending`  | As baris, transfer MOESA Europe's copy of KRN onward, for example into MOESA Trading GmbH. The check looks at the transfer's target company and target customer. akif on the same path gets `transfer_owner_required` first. In the panel, the target picker lists the refused company as disabled, with the reason. A second copy of KRN from MOESA LTD into Europe is not refused. It shows the GTIN and code conflicts instead. |
| `transfer_owner_required` | akif (management, not owner) calls `transfer_customer` into MOESA Trading GmbH. The panel's target picker never lists Trading for him.                                                                                                                                                                                                                                                                                             |
| `media_too_large`         | baris copies THO into MOESA Trading GmbH. The 12 MB catalogue goes over Trading's 5 MB cap. The cap is read from the root company, so the setting sits on Trading.                                                                                                                                                                                                                                                                 |

`transfer_source_read_only` cannot be reproduced with the seed's cast. It would need a second
company owned by another user, plus a read-only subscription, and that needs new users or
tenants. The story adds neither.

## Adding a state when a module grows

1. Add the state as a row of the scenario matrix: which table, which status, and which screen
   shows it.
2. Write it in the step block of `seed_story.sql` that owns the module. Each step is a `DO`
   block that opens with `private.story_begin(<user>, <company>)`. Use a fixed id of that step
   (`5eed00SS-…`), never a code.
   - Pass the real rules. `moesa.rules_bypass` is only for backdated transitions of orders and
     shipments.
   - Make dates relative, with at least two days of margin around business-day rules.
3. Add a check query to `seed_story.check.sql`, in the section of that task. The query returns no
   row when the state is there, and `'<check id>', <detail>` when it is not. A check is a line
   that starts with `SELECT`, which is how the script counts checks.
   - A new enum column also needs a `story_enum_column` row: either `all` or `exempt` with a
     reason. Until it has one, `enum.unlisted` fails.
   - A new dashboard box needs a `box.<id>` check. A new guide page needs a row in `guide.page`.
4. Run `pnpm dev:supabase-reset`.

## Sample files

`supabase/seed_files/` holds the files that the media rows point at. Each one is under 500 KB.
`.gitattributes` marks them binary, so the PDF's byte offsets survive checkout.
`scripts/seed-story.mjs` uploads them to the local `media` bucket under MOESA LTD's folder. The
12 MB PDF is generated in memory by the script and never committed. The PNG, WebP and MP4 files
were made once with ffmpeg:

```bash
cd supabase/seed_files
ffmpeg -f lavfi -i testsrc2=size=480x360 -frames:v 1 photo-1.png
ffmpeg -f lavfi -i smptebars=size=480x360 -frames:v 1 photo-2.png
ffmpeg -f lavfi -i mandelbrot=size=480x360 -frames:v 1 photo-3.png
for i in 1 2 3; do ffmpeg -i photo-$i.png -vf scale=160:-1 thumb-$i.webp; done
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=15 -t 2 -c:v libx264 -pix_fmt yuv420p -movflags +faststart sample.mp4
```

`sample.pdf` is a one-page PDF with the text "MOESA seed sample". A small Node snippet wrote it,
with the xref offsets computed.

## Amazon (M22)

Every Amazon call goes through the Edge Functions `amazon-schema`, `amazon-auth`,
`amazon-listing` and `amazon-poll`. They hold all the Amazon secrets: no Amazon value is in a
`VITE_*` variable, a response, a log line or a table column. A customer's refresh token lives in
Vault (`amazon:<customer_platform_account id>`); the panel shows only the connection state.

### Environment keys

`supabase/functions/.env.example` lists them. Copy it to `supabase/functions/.env` (git-ignored)
for local work and set `AMAZON_SPAPI_ENV=sandbox` there. Do not push that file to the hosted
project: set each hosted secret with `supabase secrets set NAME=value`, with the production
values below. The hosted project must set **every** key of the table except
`AMAZON_SPAPI_REFRESH_TOKEN` and `AMAZON_SPAPI_SELLER_ID` (sandbox only), and it must set
`AMAZON_SPAPI_ENV=production` explicitly.

| Key                                                            | What it is                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AMAZON_SPAPI_LWA_CLIENT_ID`, `AMAZON_SPAPI_LWA_CLIENT_SECRET` | The app's LWA credentials (Solution Provider Portal, the app client, "View"). Without them every function answers `amazon_unconfigured`.                                                                                                                                                                                                                             |
| `AMAZON_SPAPI_REFRESH_TOKEN`                                   | The self-authorized refresh token ("Authorize"). Only the sandbox, the probe and the live tests use it.                                                                                                                                                                                                                                                              |
| `AMAZON_SPAPI_SELLER_ID`                                       | The seller id a sandbox connect stores. When it is empty, the placeholder `SANDBOX_SELLER` is stored, and the story seeds the same. Production takes the seller id from OAuth.                                                                                                                                                                                       |
| `AMAZON_SPAPI_ENV`                                             | `sandbox` or `production`, required, with no default: unset (or any other value) makes every function answer `amazon_unconfigured`, so a deploy that forgets it fails closed instead of reaching the sandbox. The hosted project sets `production`.                                                                                                                  |
| `AMAZON_SPAPI_REGION`                                          | `eu`, the only region the panel supports (R1).                                                                                                                                                                                                                                                                                                                       |
| `AMAZON_SPAPI_APP_ID`                                          | The application id (`amzn1.sp.solution.…`) the consent URL is built from. Required in production.                                                                                                                                                                                                                                                                    |
| `AMAZON_SPAPI_APP_BETA`                                        | `true` while the app is a draft, so the consent URL carries `version=beta`. Set it to `false` once the app is published.                                                                                                                                                                                                                                             |
| `AMAZON_SPAPI_STATE_SECRET`                                    | Signs the OAuth state. It needs at least 32 characters (`openssl rand -base64 32`) and is required in production. The sandbox falls back to a value derived from the service role key.                                                                                                                                                                               |
| `APP_URL`                                                      | The panel's base URL, where the OAuth callback redirects back to. Required in production; the sandbox defaults to `http://localhost:6161`. A callback that cannot read its config sends the seller to `APP_URL/?amazon=error&reason=amazon_unconfigured`.                                                                                                            |
| `PUBLIC_SUPABASE_URL`                                          | The public Supabase URL. It is the host of the OAuth `redirect_uri`, and Amazon fetches the listing images from it. Required in production (no localhost default, else `amazon_unconfigured`); the sandbox defaults to `http://127.0.0.1:54321`. In production it must be https and not a local host, else a publish is refused with `listing_image_url_not_public`. |

### Sandbox and production

- **Sandbox** (`AMAZON_SPAPI_ENV=sandbox`) calls the static SP-API sandbox
  (`sandbox.sellingpartnerapi-eu.amazon.com`), which answers fixed mock responses.
   - **Connect Amazon** connects the account at once, without a consent page. It stores no token;
     the functions use the self-authorized `AMAZON_SPAPI_REFRESH_TOKEN`.
   - A sandbox publish is accepted, and the next poll ends in `issues` with Amazon's canned
     messages, for example `18027` for the image, which the drawer lists under "General". This is
     the expected sandbox result, not a bug.
   - The sandbox's canned `getListingsItem` knows every SKU, so there the panel's own done
     submission decides between a create (PUT) and an update (PATCH). Production asks Amazon.
   - "Validate with Amazon" gets the mock's ACCEPTED answer.
- **Production** (`AMAZON_SPAPI_ENV=production`) calls `sellingpartnerapi-eu.amazon.com`, and
  **Connect Amazon** runs the OAuth flow of a public app:
   1. The panel calls `amazon-auth` with `connect`. The function answers with the Seller Central
      consent URL, `https://sellercentral-europe.amazon.com/apps/authorize/consent` with
      `application_id` and a signed `state`, plus `version=beta` while `AMAZON_SPAPI_APP_BETA=true`.
      The state names the user, the tenant and the account.
   2. The seller signs in to Seller Central and approves. Amazon redirects to
      `<PUBLIC_SUPABASE_URL>/functions/v1/amazon-auth/callback` with `state`,
      `selling_partner_id` and `spapi_oauth_code`.
   3. The callback checks the state and exchanges the code for the refresh token with LWA. It
      stores the token in Vault and the seller id on the account, then redirects to `APP_URL`
      plus the page with `?amazon=connected`, or with `?amazon=error&reason=<code>`.
   4. The callback carries no JWT (`verify_jwt = false` in `config.toml`). The signed state is its
      only credential.

### Previews (staging)

Cloudflare previews of `feat/*` branches use the staging project, which runs the **sandbox**. The CI
`staging` job, after a pull request's database tests pass, resets the staging database, deploys the
branch's Edge Functions, sets their secrets and writes the two Vault secrets the cron jobs read:

- Function secrets come from repository secrets `STAGING_AMAZON_SPAPI_LWA_CLIENT_ID`,
  `STAGING_AMAZON_SPAPI_LWA_CLIENT_SECRET`, `STAGING_AMAZON_SPAPI_REFRESH_TOKEN` and
  `STAGING_AMAZON_SPAPI_STATE_SECRET`; `AMAZON_SPAPI_ENV=sandbox`, `AMAZON_SPAPI_REGION=eu`,
  `APP_URL` is the branch's preview alias and `PUBLIC_SUPABASE_URL` the staging project URL.
- `edge_function_url` and `edge_service_key` are written through the Management API with the
  staging service-role key, read in the job and masked in the log.
- Staging has no story seed: connect a customer with **Connect Amazon** (one click in sandbox) to try
  publishing in a preview. Only the newest preview's database matches its code.

### Publishing rules

- A SKU Amazon does not have yet is created with `putListingsItem`, with its initial
  availability: FBM starts at quantity 0, FBA names `AMAZON_EU` with no quantity.
- An existing SKU (an update, or a matched ASIN the seller already sells) is updated with
  `patchListingsItem`, replacing only the attributes the panel owns. `fulfillment_availability`
  is never sent for it, so the stock the seller keeps in Seller Central is never overwritten.
- One submission at a time per cell: a publish while the cell's latest submission is accepted or
  processing is refused with `listing_in_progress` (409). The submission row and the cell's
  `submitted` state are written before Amazon is called, so a run that dies leaves a row the
  poll settles (or gives up after 24 hours).
- A bulk publish sends 10 products per call; a call stops starting products after 60 s and
  answers the rest in `remaining`, which the panel sends again.
- The drawer's **Refresh status** asks Amazon at once for a `submitted` or `issues` cell, without
  waiting for the poll.

### What the owner does in the Solution Provider Portal for production

A sandbox app never becomes the production app. After the developer profile is approved:

1. Create a second app, the **production** app, as a **public** app. Our customers are separate
   seller accounts, and a private app can authorize only our own organisation. An unlisted
   public app can authorize up to 25 sellers; more needs an Appstore listing.
2. Give it the **Product Listing** role only: no restricted roles, no PII, no RDT.
3. Register the redirect URI `<PUBLIC_SUPABASE_URL>/functions/v1/amazon-auth/callback`. For the
   hosted project that is `https://<ref>.supabase.co/functions/v1/amazon-auth/callback`. The
   OAuth login URI can be the panel's `APP_URL`.
4. Put its LWA client id and secret and its application id into the hosted secrets. Also set
   `AMAZON_SPAPI_ENV=production`, a fresh `AMAZON_SPAPI_STATE_SECRET`, `APP_URL`,
   `PUBLIC_SUPABASE_URL`, and `AMAZON_SPAPI_APP_BETA=true` while the app is a draft (Amazon then
   accepts consents only from the sellers authorized for the beta). Leave
   `AMAZON_SPAPI_REFRESH_TOKEN` and `AMAZON_SPAPI_SELLER_ID` unset.
5. After the switch, accounts connected in sandbox report "not connected", because they hold no
   token. Each customer connects again through the consent page.

### The hosted database

Production is at migration 027, and the owner pushes every migration in one go. That push must
include `046_amazon_listing_core.sql` and `047_amazon_cron.sql` with the rest. Then set the two
Vault secrets the cron jobs read, once, in the SQL editor (or in the dashboard: Project, Vault):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_function_url');
select vault.create_secret('<service role key>', 'edge_service_key');
```

`edge_service_key` must be exactly the key the functions' runtime holds as
`SUPABASE_SERVICE_ROLE_KEY`: the legacy JWT service role key (Project Settings, API keys,
"Legacy API keys"), not an `sb_secret_…` key. With any other value every cron call is refused
with 401 and nothing says so in the panel. To check the calls, run
`select id, status_code, content::text, error_msg from net._http_response order by id desc limit 10;`
in the SQL editor: a working poll answers 200 with `{"polled":…}`.

Deploy the four functions with
`supabase functions deploy amazon-schema amazon-auth amazon-listing amazon-poll`.

### Field-level permissions (064)

Migrations 048–064 move every user-side read and write to the masked views in the `api` schema,
and 064 revokes anon's and authenticated's grants on every `public` table and view. From then on
a signed-in request that names `public` gets 42501. The service role keeps its grants. To ship it:

1. Before `supabase db push`, set Dashboard → Settings → API → Exposed schemas to `public, api`, or
   send the same PATCH that CI sends to staging:
   `curl -fsS -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' "https://api.supabase.com/v1/projects/<ref>/postgrest" --data '{"db_schema":"public,api"}'`.
2. Push 048–064 in one go.
3. Deploy the app in the same window. Open tabs must reload: a stale bundle still asks for
   `public` and gets 42501.

### Schedules (pg_cron + pg_net)

Migration 047 schedules `amazon-poll` (every 10 minutes) and `amazon-schema-refresh` (daily at
04:00; each run re-fetches up to 20 cached schemas older than a week, so the cache keeps up). The
jobs call `private.amazon_cron_call`, which reads the two Vault secrets at run time:
`edge_function_url` (the functions base URL, no trailing path) and `edge_service_key` (the
service role key). It POSTs `{}` to `<edge_function_url>/amazon-poll` or
`<edge_function_url>/amazon-schema/refresh` with `Authorization: Bearer <edge_service_key>`.
Those two routes accept only the service key (`assertServiceCall`). Each request waits up to
120 s (the functions stop starting work after 100 s). Until the secrets exist, the jobs log
`amazon_cron_unconfigured` and do nothing. Rotating the key means updating the secret only.

The poll answers `{polled, failed, given_up, skipped, remaining}`. It asks Amazon only for a
cell's latest submission still in flight; a settled one (a variation parent that shows its
children's state) is not asked again. A cell whose customer's account is not connected (a
transferred cell, a revoked grant) is skipped and set to draft. Give-up (the submission
`failed`, the cell `issues`) applies only to the latest submission that Amazon has not reported
within 24 hours.

Locally, `pnpm dev:seed-story` sets both secrets. The URL is
`http://supabase_kong_moesa-panel:8000/functions/v1`, the gateway as the database container sees
it. To poll now instead of waiting for the cron, run
`select private.amazon_cron_call('amazon-poll');` as `postgres` (for example in Studio's SQL
editor).

### Running the functions locally

From the repo root, with `supabase/functions/.env` filled:

```sh
supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
```

Then run `pnpm dev` from `app/`, and the panel talks to the served functions. The cron reaches
them through the gateway. The story connects THO in sandbox and seeds the THO-MOP40-2P listing
across the markets: DE live, FR issues, IT submitted, ES ready, NL draft.

From `supabase/functions/`:

| Command               | What it does                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task test`      | The mocked unit tests (no network).                                                                                                                  |
| `deno task check`     | Type-checks the functions and the tests.                                                                                                             |
| `deno task test:live` | The live tests against the SP-API sandbox, with `.env`. They skip cleanly when the credentials are missing.                                          |
| `deno task probe`     | The smoke test: one LWA exchange and `getMarketplaceParticipations`. It prints `ok <n> marketplaces (sandbox, eu)` or an error code, never a secret. |

`pnpm dev:amazon-probe` from `app/` runs the same probe.
