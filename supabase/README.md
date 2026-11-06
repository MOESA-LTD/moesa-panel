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

| Command | What it does |
|---|---|
| `pnpm dev:supabase-reset` | `supabase db reset`, then the story, then the types. This is the usual one. |
| `pnpm dev:seed-story` | Loads the story onto a freshly reset database: uploads the sample files, runs `seed_story.sql` in one transaction, then the smoke check. It prints `seed-story: ok (N checks)`, or a `FAIL <check> <detail>` line for each check that fails, and exits 1. |
| `pnpm test:db` | `supabase db reset`, then the pgTAP suite. The reset puts the database back on the small seed, so run `pnpm dev:seed-story` again afterwards. |
| `pnpm test:scripts` | The unit tests of `scripts/seed-story.mjs`. |

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

| Refusal | How to get it |
|---|---|
| `transfer_product_in_use` | Move only the product THO-CONES-100 out of MOESA LTD, for example into MOESA Europe. It is on a closed project, a closed order and market cells. The rehearsal lists those links under "Links that stay in the source", and the panel keeps the Transfer button disabled, so you never reach the server's own refusal `transfer_product_in_use` from the UI (the smoke check asks the server directly). |
| `transfer_files_pending` | As baris, transfer MOESA Europe's copy of KRN onward, for example into MOESA Trading GmbH. The check looks at the transfer's target company and target customer. akif on the same path gets `transfer_owner_required` first. In the panel, the target picker lists the refused company as disabled, with the reason. A second copy of KRN from MOESA LTD into Europe is not refused. It shows the GTIN and code conflicts instead. |
| `transfer_owner_required` | akif (management, not owner) calls `transfer_customer` into MOESA Trading GmbH. The panel's target picker never lists Trading for him. |
| `media_too_large` | baris copies THO into MOESA Trading GmbH. The 12 MB catalogue goes over Trading's 5 MB cap. The cap is read from the root company, so the setting sits on Trading. |

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

## Amazon schedules (pg_cron + pg_net)

Migration 047 schedules `amazon-poll` (every 10 minutes) and `amazon-schema-refresh` (Mondays 04:00).
They call the Edge Functions through `private.amazon_cron_call`, which reads two Vault secrets at
run time: `edge_function_url` (the functions base URL, no trailing path) and `edge_service_key`
(the service role key). Locally `pnpm dev:seed-story` sets both. On the hosted project the owner
sets the same two secrets once in the dashboard (Project, Vault); until then the jobs log
`amazon_cron_unconfigured` and do nothing. Rotating the key means updating the secret only.
