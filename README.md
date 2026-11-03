# OxyService

An offline-first app for logging oxygen transfills from a manifold of up to three donor cylinders, with UK tax-year (1 April – 31 March) accounts. Everything is saved on the device first, so it works with no signal. When online, it backs up to a Cloudflare D1 database and keeps your other devices in step.

## What it records

| Screen | What you capture |
|---|---|
| **Fill** | Fill no. (auto-numbered), date, customer, contact number, cylinder size, start pressure, final fill pressure, charge, and the pressure of each manifold cylinder after the fill. Past customers autocomplete and fill in their phone number. |
| **Manifold** | Live gauge for cylinders 1–3. **Swap** records the replacement date, cylinder ID, pressure when fitted and the refill cost. "Remove only" leaves a position empty. |
| **Service** | A cylinder taken in for service or certification: date in, status (in / ready / returned), customer and contact number, size, serial no., work done, test date and next-test-due date, which fills itself in 5 years after the test date. Records the charge to the customer and your costs for the job: miles, tolls, and any other cost. Shows what's in the workshop, a **Certifications due** list (overdue in red, due within 60 days in amber), and completed jobs with CSV export. |
| **Log** | Every fill in the selected tax year, searchable, with CSV export. |
| **Accounts** | Totals for the tax year: fill returns, service returns, refill costs, rentals, tolls and other costs, and mileage allowance. Net is shown both after and before the mileage allowance, with a running-totals ledger underneath. Add the annual cylinder rental, other costs or income, and mileage for trips that aren't service jobs here. Mileage is valued at 55p a mile for the first 10,000 business miles in the tax year, then 25p (HMRC 2026/27 rates, which you can change in Settings). |
| **Settings** | Sync key, pressure unit (psi or bar), default charge and refill cost, the list of cylinder sizes, and backup download and restore. |

Pick the tax year from the menu at the top. Tap any entry to edit or delete it.

Your spreadsheet's 2026/27 figures are preloaded: cylinder 1 fitted 15 May 2026 (refill £46.86), rental £353, the £250 estimate for fills #1–10, fills #11–13 at £25, cylinder 1 at 1800 psi after fill #13, and cylinder 2 swapped on 3 Nov 2026. Cylinder 2's refill cost wasn't recorded, so tap that entry on the Manifold screen to add it.

## Putting it on Cloudflare (about 10 minutes, one time)

You need a free Cloudflare account and Node.js on a computer. In this folder, run:

```bash
npx wrangler login                          # opens a browser to sign in to Cloudflare
npx wrangler d1 create oxyservice           # prints a database_id
```

Paste the `database_id` into `wrangler.toml`, then run:

```bash
npx wrangler d1 execute oxyservice --remote --file schema.sql
npx wrangler pages project create oxyservice --production-branch main
npx wrangler pages deploy
npx wrangler pages secret put SYNC_TOKEN --project-name oxyservice   # choose a long random key
npx wrangler pages deploy                   # deploy again so the key is applied
```

Next, open the `https://oxyservice.pages.dev` address it prints:

1. Go to **Settings**, enter your sync key and tap **Save & sync now**. The badge at the top should change to **Synced ✓**.
2. On your phone, use **Add to Home Screen**. In Chrome on Android, use **Install app**. From then on it opens like an app and works offline.
3. Do the same on any other device using the same key, and they will share data.

**Updating the app later:** change `VERSION` in `public/sw.js`, then run `npx wrangler pages deploy`.

## How the backup works

- Each fill, cylinder change, rental and setting is one row in the D1 table `records`. Each row carries a timestamp from the device that last changed it, and the newest change wins.
- Deletes are kept as markers, so a delete on one device reaches the others.
- The app syncs when you save something, when you come back online, when you reopen it, and every 5 minutes.
- To browse the backup, open Cloudflare dashboard → D1 → oxyservice and query the ready-made views:
  `SELECT * FROM fills;`, `SELECT * FROM cylinder_changes;`, `SELECT * FROM service_jobs;`, `SELECT * FROM money_entries;`
- If you deployed an earlier version, run the `d1 execute ... --file schema.sql` step again to add the `service_jobs` view. Nothing else in the database changes.
- **Settings → Download backup** saves a complete JSON copy whenever you want one.

## Files

```
public/index.html          the whole app (no build step)
public/sw.js               offline cache
public/manifest.webmanifest, icons
functions/api/sync.js      Cloudflare Pages Function: the sync endpoint
schema.sql                 D1 table + views
wrangler.toml              Cloudflare config
```

To test locally, put `SYNC_TOKEN="any-key"` in `.dev.vars`, then run `npx wrangler d1 execute oxyservice --local --file schema.sql`, followed by `npx wrangler pages dev`.
