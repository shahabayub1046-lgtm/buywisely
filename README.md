# Buy Wisely — backend

A dependency-free backend (Node's built-in `http` + `node:sqlite`, Python's
built-in `sqlite3`/`csv`) that replaces the hardcoded `PRODUCTS`/`CATS`/`TERMS`
arrays that used to live inside `index.html`.

## What's in here

```
backend/
  schema.sql          Database schema (products, brands, categories, terms,
                       price_history, corrections, + users/saved_products
                       tables ready for Phase 2 accounts)
  data/
    categories.csv     4 categories
    terms.csv           19 glossary terms (ported from the old TERMS array)
    products_phones.csv   } one CSV per category — THIS is where you add
    products_laptops.csv  } real products. Flat, spreadsheet-editable
    products_bikes.csv    } columns, not raw JSON.
    products_cars.csv     }
  generate_seed.py    Generated the demo CSVs above (81 products across
                       29 brands). You don't need to run this again unless
                       you want to regenerate more placeholder rows.
  import_data.py      Reads schema.sql + everything in /data and builds
                       buywisely.db. THIS is the command you run every time
                       you update the CSVs.
  server.js           The API + static file server.
  public/
    index.html         The frontend (fetches from the API instead of
                        hardcoded arrays).
```

## Running it locally

```bash
cd backend
python3 import_data.py     # builds buywisely.db from the CSVs
node server.js              # starts the API + serves the frontend
```

Then open `http://localhost:8787`. That's it — no `npm install`, no
external database to stand up, no API keys.

## ⚠️ About the seeded data

The 81 products currently in `/data` are **programmatically generated
placeholders** — brand and model names are real, but prices and specs
are randomized within plausible ranges, not sourced from anywhere real.
Every row's `source_name` column is honestly labeled `"Manufacturer
listing (demo data)"` for exactly this reason. This proves the pipeline
works end-to-end; it is not something to publish as fact.

## Scaling to 500+ real products

This is the actual point of moving to CSVs: **you (or anyone) can now add
products by editing a spreadsheet, not by editing code.**

1. Open `data/products_<category>.csv` in Excel/Google Sheets/Numbers.
2. Add a row per product, matching the existing columns exactly (see the
   column reference below — each category has a fixed, documented set).
3. Need a brand-new category (e.g. "headphones")? Add a row to
   `data/categories.csv`, create `data/products_headphones.csv` with
   whatever columns make sense, and add a matching `build_specs_headphones()`
   function + `SPEC_BUILDERS` entry in `import_data.py` (copy one of the
   existing four — it's ~10 lines).
4. Re-run `python3 import_data.py`. It rebuilds the whole database from
   the CSVs every time, so it's always a clean, repeatable import —
   you can throw away `buywisely.db` and regenerate it at any time.

Where would 500 real rows actually come from? Realistically one of:
- Manual entry (slow, but fully accurate — fine for a soft launch)
- A manufacturer/retailer data feed or affiliate network's product API
  (fastest to scale, usually requires a partner agreement)
- Scraping public listings (works, but fragile and has its own legal/ToS
  considerations depending on the source — worth checking before relying
  on it)

### CSV column reference

**All categories share:** `id, brand, name, price, currency, color_swatch, image_url, source_name, source_url, affiliate_url`
(`id` must be unique across the whole catalog — lowercase-with-hyphens is the convention used by the generator. Leave `affiliate_url` blank for a product with no deal link yet — the frontend simply won't show a "View deal" button for that row.)

| Category | Category-specific columns |
|---|---|
| phones  | display, processor, ram, storage, battery, weight, operating_system, cameras, charging, connectivity, colors |
| laptops | display, processor, gpu, ram, storage, battery, weight, build_material, operating_system, ports |
| bikes   | engine, horsepower, torque, transmission, fuel_capacity, top_speed, fuel_economy, brakes, tire_size, seat_height, ground_clearance, weight, colors |
| cars    | engine, horsepower, torque, transmission, drivetrain, fuel_economy, seats, airbags, adas, infotainment |

## API reference

| Endpoint | Returns |
|---|---|
| `GET /api/categories` | `[{id, label, icon}]` |
| `GET /api/products` | Array of products. Query params: `category`, `brand`, `q` (search), `limit`, `offset` |
| `GET /api/products/:id` | Single product, or `404` |
| `GET /api/terms?q=` | Glossary terms, optionally filtered |
| `POST /api/corrections` | Body `{productId?, field?, message, submittedBy?}` — logs a correction (powers the footer "Corrections" link's eventual real form) |

All responses are JSON with `Access-Control-Allow-Origin: *` set, so the
frontend can be hosted on a different domain from the API if you want
(set `API_BASE` at the top of the data-loading section in `index.html`).

## Deploying this for real

### Why not Vercel
Worth stating plainly: **this doesn't work on Vercel as-is.** Vercel runs
backends as short-lived serverless functions with no persistent
filesystem — every file this app writes (`buywisely.db`, uploaded product
photos) would vanish between requests. That's not a config issue to work
around; it's a different hosting model than this app (one continuously-
running Node process + a local file) is built for. Making it Vercel-
compatible for real means swapping SQLite for a hosted database (Vercel
Postgres, Turso) and photo storage for a blob service (Vercel Blob) — a
real rebuild of the data layer, not a deploy tweak.

### Deploying to Render (recommended — matches what's already built)
Render runs this exactly as-is: one long-running Node process, zero
`npm install` step. Steps:

1. Push this repo to GitHub (Render deploys from a GitHub repo).
2. On Render: **New → Web Service**, connect the repo, set:
   - **Build Command:** `python3 import_data.py` (only runs if the DB
     doesn't already exist on the disk — see step 4)
   - **Start Command:** `node server.js`
   - **Environment variables:** `ADMIN_KEY` (pick a real secret value),
     `NODE_ENV=production`
3. **Add a persistent disk** (Render dashboard → your service → Disks):
   mount path e.g. `/data`, 1GB is plenty. **This step is not optional**
   if you want your real product data and photos to survive a redeploy —
   skip it and Render's default filesystem resets on every deploy.
4. Set two more environment variables pointing at that disk:
   - `DB_PATH=/data/buywisely.db`
   - `UPLOADS_DIR=/data/product-images`
   (Both were made configurable specifically for this — see `DB_PATH`/
   `UPLOADS_DIR` in `server.js`/`import_data.py`. Without setting these,
   the app falls back to storing both inside the code checkout, which
   Render wipes on every deploy.)
5. Deploy. First deploy: the disk is empty, so the Build Command creates
   `buywisely.db` there from the seed CSVs. Every deploy after that, the
   file already exists on the disk, so nothing gets overwritten — your
   real admin-entered data (and the warning about never re-running
   `import_data.py` manually once you have real data, from earlier in
   this README) still applies here too.
6. Free vs. paid: Render's free tier works for a first look, but **free
   web services don't include a persistent disk at all** — step 3 isn't
   available, so anything written to disk resets on restart/sleep, not
   just redeploy. For real data to actually stick, this needs Render's
   paid Starter tier (currently ~$7/month) plus the disk (a few cents/GB/
   month) — correct as of when this was written, worth double-checking
   Render's current pricing before committing.

### Other options
- **Railway / Fly.io / a plain VPS** — same shape as Render: one
  long-running Node process + a persistent volume/disk pointed at via
  `DB_PATH`/`UPLOADS_DIR`. No free tier on Railway/Fly.io anymore as of
  when this was written.
- **Split hosting** (frontend on Vercel/Netlify, API on Render/a VPS) —
  works fine since CORS already reflects the request origin; set
  `API_BASE` in `index.html` to your API's URL before deploying the
  frontend. The backend half still needs persistent-disk hosting either
  way — Vercel only solves the frontend half of this split.

One limitation beyond hosting choice: **SQLite is still a single file.**
Fine for one server instance; does not work if you ever need to
auto-scale to multiple instances (each would have its own disk and see
different data). If you outgrow one instance, the fix is swapping SQLite
for a hosted Postgres — `schema.sql` is close to drop-in standard SQL
already, and only the functions marked `// DB:` in `server.js` would
need to change to use a Postgres client instead of `node:sqlite`.

## Accounts & Saved sync (Phase 2)

Email/password auth, built the same zero-dependency way as the rest of
this backend:

- **Passwords** are hashed with `crypto.scryptSync` (built into Node —
  no `bcrypt` package needed), salted per-user, stored as
  `saltHex:hashHex` in `users.password_hash`. Verified with
  `crypto.timingSafeEqual` to avoid timing attacks.
- **Sessions** are a random 32-byte token (`crypto.randomBytes`) stored
  in the `sessions` table and sent to the browser as an `httpOnly`,
  `SameSite=Lax` cookie (`Secure` too once `NODE_ENV=production`, which
  requires HTTPS — true on basically every host once you've deployed).
  The browser never touches the password after login, only this opaque
  cookie, and every authenticated request looks it up server-side.
- **Saved/Favorites now has two backends**, switched automatically by
  the frontend: logged out, it's `localStorage` exactly like before;
  logged in, every save/unsave hits `/api/saved/:id` and the
  `saved_products` table. **Signing up or logging in merges whatever
  you'd saved as a guest into the account** (`localSavedIds` in the
  signup/login request body) so nothing gets silently dropped.

### Auth endpoints

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/auth/signup` | `{email, password, localSavedIds?}` | password min 8 chars; `409` if email taken |
| `POST /api/auth/login` | `{email, password, localSavedIds?}` | `401` on wrong email/password |
| `POST /api/auth/logout` | — | clears the session cookie |
| `GET /api/auth/me` | — | `{user: {id,email} \| null}` |
| `GET /api/saved` | — | *(requires login)* full product objects currently saved |
| `POST /api/saved/:productId` | — | *(requires login)* save one |
| `DELETE /api/saved/:productId` | — | *(requires login)* unsave one |

### Trying it yourself

Click **"Log in"** in the header → **"New here? Sign up"** → any email +
an 8+ character password. The button becomes your username; click it
again for a small account menu with **Log out**. Saved items you add
while logged in now live in `buywisely.db`, not the browser — check
with `sqlite3 buywisely.db "select * from saved_products;"` and
they'll still be there after closing the tab, clearing site data, or
opening the site on a different device/browser.

### Split-origin deployment note

If frontend and API end up on different domains (see "Deploying this
for real" above), cookie-based auth needs two things `API_BASE` alone
doesn't give you: the CORS layer already reflects the real request
origin with credentials allowed (not a bare `*`), so that part's
covered — but you must also serve both over **HTTPS** (`Secure`
cookies won't be sent over plain HTTP in production) and the two
domains need compatible `SameSite` handling, which `Lax` satisfies for
normal top-level navigation/fetch but can get stricter in some
embedded/iframe contexts. Same-origin deployment (the default here —
one `node server.js` serving both) sidesteps all of this.

## Legal pages & real corrections (Phase 3)

- **Privacy Policy, Terms of Service, and Cookie Policy** are real pages now
  (`public/legal/privacy.html`, `terms.html`, `cookies.html`), linked from
  the footer's new "Legal" column. **Read the notice box at the top of
  each one before publishing** — these are drafted starting templates,
  not legal advice, and every `[bracketed placeholder]` (your company
  name, contact email, governing law/jurisdiction, liability terms)
  needs filling in and a real lawyer's review, especially the Terms'
  liability section. What they do accurately reflect already: the
  actual cookie (`bw_session` — session auth, nothing else), what data
  accounts/corrections actually store, and the current ad/affiliate
  state (clearly marked as "not yet enabled" rather than a stated promise).
- **"Corrections" in the footer is now a real form**, not an info
  popover — it posts to the `/api/corrections` endpoint that already
  existed from Phase 1 and actually writes to the `corrections` table
  (verified: submitted a test correction, confirmed it landed in the
  database with the right product/message/email, `status='open'`
  ready for manual review). Product pages also got a direct "Report an
  issue" link that opens the form pre-filled with that product.
- **Product pages now show the product's real source/last-updated
  date** from the database instead of a hardcoded `"Last updated:
  today"` string that was left over from Phase 1 — small thing, but it
  was a straightforwardly false claim sitting right next to the "Trust
  & credibility" messaging, worth fixing while in this area.

## Monetization: affiliate links + ad infrastructure (Phase 3)

You chose **both**. Here's what's actually live vs. what still needs your own account setup:

### Affiliate links — fully live
- Every product can have an `affiliate_url` (see CSV columns above). When set, the
  product page shows a primary **"View deal →"** button, with an **"Affiliate
  link"** disclosure directly underneath it — not just buried in the Terms page.
- The button never links to the affiliate URL directly. It links to
  `/api/clickout/:productId`, which logs the click to the `clickouts` table
  (who, when, which product — `user_id` is `null` for guests) and *then* issues
  a `302` redirect to the real URL. This is the standard pattern affiliate
  sites use, for two reasons: (1) you get accurate click counts to reconcile
  against the commission statements your affiliate network sends you, even if
  a visitor has analytics/JS blocked, since the redirect happens server-side;
  (2) you can change where a product's "deal" link points later without
  touching the frontend at all.
- Check click counts with `GET /api/analytics/clickouts?key=YOUR_ADMIN_KEY`
  (set the `ADMIN_KEY` environment variable before starting the server — the
  endpoint is `401` without it, since this is commission-relevant data you
  don't want public).
- **What's demo vs. real:** the 81 seeded products all have a placeholder
  `affiliate_url` pointing at `example-retailer.com` — obviously not a real,
  paying affiliate link. To actually earn anything, sign up for a real
  affiliate program (a retailer's own program, Amazon Associates, a network
  like CJ/Impact/Awin, etc.), get your real tracking links, and put those in
  the `affiliate_url` column instead.

### Display ads — infrastructure built, not connected to a real network
There are two ad zones on the homepage (`#adZone1`, `#adZone2`). Today they
show the same honest "Sponsored placement" placeholder copy they always
did — **no fake or broken ad unit is ever shown to a visitor.** Turning on
real ads (e.g. Google AdSense, used as the worked example) is a config change,
not a code change:

1. Apply at [google.com/adsense](https://google.com/adsense). Approval
   requires a live, publicly reachable site with real content — that's a
   genuine prerequisite of actual ad networks, not something I can shortcut
   from here.
2. Once approved, open `index.html`, find the `AD_CONFIG` object (search for
   it), set `enabled: true`, your `publisherId`, and a slot ID per zone from
   your AdSense dashboard.
3. Fill in `public/ads.txt` with the exact line AdSense gives you — almost
   every ad network requires this file at your domain root before they'll
   serve ads or pay out, and it must come from your dashboard, not be
   invented.

Using a different network instead of AdSense? Keep the `enabled` /
`publisherId` / `slots` shape in `AD_CONFIG` and swap the script tag + `<ins>`
markup inside `renderAds()` in `index.html` for whatever that network's docs
specify — nothing else on the page needs to change.

### Why ads never conflict with rankings/trust
This was a design constraint going in, not an afterthought: `renderAds()` only
ever touches the two dedicated `.ad-zone` elements. There is no code path from
an ad network or an affiliate relationship into `scoreProducts()` (the match
wizard's ranking logic) or the compare-table win/lose scoring — both are
driven purely by the specs/priorities you select. The Terms of Service and
the "Affiliate disclosure" footer popover both state this explicitly, and now
that it's true, I removed the old "in a live version, this would..." hedging
language from both.

## Technical readiness (Phase 4)

### File splitting
`index.html` was a single self-contained file — 1.36 MB, because two hero
images were base64-embedded directly in it, plus all CSS/JS inline. It's now:
- `index.html` — **14 KB** (just markup)
- `css/styles.css`, `js/app.js` — real, separately-cacheable files
- `images/scale-bg.jpg`, `images/scale-beam.png` — real image files

Practical effect: a repeat visitor's browser now caches the CSS/JS/images
independently, so only the 14 KB HTML needs refetching on return visits,
instead of re-downloading 1.36 MB every single time.

### SEO basics
- Real `<meta name="description">`, Open Graph (`og:title`, `og:description`,
  `og:image`, etc.) and Twitter Card tags in `index.html`'s `<head>`, so
  sharing a link to the site actually shows a proper preview card instead of
  nothing.
- Page `<title>` now updates per-view as you navigate (`updatePageTitle()` in
  `app.js`) — e.g. "Apple iPhone 17 — Buy Wisely" on a product page, not a
  static title everywhere.
- `robots.txt` and `/sitemap.xml` (server-generated).
- **Important honest limitation:** the sitemap lists only the homepage and
  legal pages — *not* individual products. This app navigates with `#hash`
  routing (`#product/apple-iphone-17`), and search engines do not reliably
  index hash-fragment URLs as separate pages. So even though every product
  has a real shareable URL within the app, Google won't index
  `yoursite.com/#product/apple-iphone-17` as its own search result. Getting
  individual products discoverable in search would need real path-based
  routes (`/product/apple-iphone-17`) rendered server-side — a genuine
  architecture change (server-side rendering or at least per-product static
  HTML generation), not a config tweak. Worth doing if organic search traffic
  to specific products matters to you; skippable if most traffic will come
  from shared links/ads/social instead, since those all work fine today.

### Self-hosted analytics
No Google Analytics/Plausible account needed — every navigation logs a
pageview to the new `pageviews` table (`POST /api/pageview`, fired from
`go()`). View your numbers at **`/admin/analytics.html`** — enter the same
`ADMIN_KEY` you set as an environment variable (same key the clickout
analytics endpoint already used) and it shows total views, views by section,
top-viewed products (with real product names resolved), a 7-day trend, and
affiliate clickout counts, all on one page — no command line required, which
matters given you're working from a phone. This is genuinely minimal (no
session/device/geo tracking, no cookies beyond the existing auth one) — if
you later want real analytics depth (funnels, geo, device breakdowns), the
honest answer is to add a real tool (Plausible is the privacy-respecting,
GDPR-simple option; Google Analytics is the "everyone uses it" option) —
that's a `<script>` tag addition to `index.html`, not a backend change.

### Testing scope — what I could and couldn't verify
I tested across three viewport sizes (mobile/tablet/desktop) in a real
headless browser with zero JS errors on any of them. **I could not test real
Firefox or Safari (WebKit) engines** — this sandbox only has Chromium
installed, with no network access to download the others. Everything here
uses plain, widely-supported CSS/JS (no bleeding-edge APIs), so I'd expect it
to behave the same elsewhere, but "expect" isn't "verified" — a real
cross-browser pass (or at minimum, you opening it in Firefox/Safari once
deployed) is the honest way to close that gap.

## Product admin panel

A real screen for managing the catalog — no CSV editing, no code, no
re-running import scripts. Open **`/admin/products.html`**, enter your
`ADMIN_KEY` (same one used for analytics), and you can:

- **Add a product** — pick a category, fill in brand/name/price, and the
  form shows the right spec fields for that category (a bike gets Engine/
  Horsepower/Seat height; a phone gets RAM/Storage/Battery — matching
  exactly what `import_data.py` expects, so admin-added and CSV-imported
  products are indistinguishable in the data).
- **Upload a real photo** — JPEG/PNG/WebP, 5MB cap, saved to
  `public/images/products/` and immediately used everywhere the site shows
  that product (previously, `productIllus()` always showed a generic CSS
  icon regardless of whether a photo existed — fixed as part of this, since
  an upload feature that doesn't change what visitors see wouldn't be worth
  building).
- **Edit** any existing product, including the demo-seeded ones. A price
  change is logged to `price_history` — same mechanism "last updated" on
  the product page already relies on, so it stays an honest, real date.
- **Deactivate / Restore** — not a hard delete. A deactivated product
  disappears from the public site (and the "View deal" clickout) but stays
  in the database and can be restored anytime. This also means the row
  count on `/admin/products.html` includes inactive products (shown dimmed)
  — that's intentional, so you can find and restore something you retired
  by mistake.

This directly closes the gap you flagged — e.g. the demo data had Honda
`CD 70` but not `CD 125`/`CD 150`; now you add those (and every other real
model/price/photo for your actual market) through this screen, at your own
pace, without touching a single file.

### ⚠️ Critical: once you're using the admin panel for real, stop running `import_data.py`
`import_data.py` **wipes and rebuilds the entire database from the CSVs**
every time it runs (that's by design for Phase 1's seed/demo workflow). If
you've added or edited real products through the admin panel and then run
`python3 import_data.py` again, **everything you added through the UI is
gone** — it only knows about what's in `/data/*.csv`. Treat the admin panel
and the CSV importer as two different eras of this project's life: CSVs to
get a demo dataset running fast, the admin panel from then on for real data
entry. (If you genuinely need both — e.g. bulk-importing a supplier's
spreadsheet *and* preserving admin edits — that's a real feature to build
properly later: an importer that upserts by product id instead of wiping
the table. Flagging it, not building it preemptively, since you don't need
it yet.)

## Corrections review, forgot-password, and brute-force protection

Three more real gaps closed:

### Corrections review screen
`/admin/corrections.html` (same `ADMIN_KEY` as the other admin pages) lists
every correction submitted through the site, with the product it's about,
the message, who sent it (if they gave an email), and a dropdown to move it
through `open → reviewed → applied → rejected`. Previously these were only
visible by querying the database directly.

### Forgot / reset password
- **"Forgot password?"** in the login modal → enter your email →
  `POST /api/auth/forgot-password`. For privacy, this endpoint returns the
  *exact same response* whether or not that email has an account — otherwise
  the endpoint becomes a way to check which emails are registered, a
  well-known leak for this kind of form.
- **No email service is connected yet**, so the generated reset link is
  surfaced two other ways in the meantime: logged to the server's own
  console, and listed at `/admin/password-resets.html`-equivalent section on
  the corrections admin page, so you can copy and manually send it (text,
  WhatsApp, whatever) until real email sending exists. In non-production mode
  (`NODE_ENV` unset or not `production`), the link is also shown directly in
  the UI for fast local testing.
- **Reset tokens are single-use and expire after 60 minutes.** Using one
  resets the password, invalidates *every* existing session for that account
  (so a stolen old session can't survive a password change), and logs the
  user in fresh.
- Verified end-to-end: signed up → logged out → requested reset → used the
  link → old password rejected, new password works, old session dead.

### Brute-force protection
Simple in-memory rate limiting (no dependency, resets if the server
restarts — a real limitation, noted below):
- **Login:** 8 attempts per email+IP per 15 minutes, then `429`.
- **Signup:** 10 per IP per hour (stops mass fake-account creation).
- **Forgot-password:** 5 per IP per hour (stops using it to spam someone's
  inbox once real email is connected, and limits account-enumeration timing
  attempts even though responses are already identical either way).

## What's NOT done yet (Phase 5+, from the roadmap)

- **Uploaded product photos aren't resized/compressed** — stored exactly
  as uploaded (up to 5MB). Fine for a handful of products; worth adding
  server-side resizing (a real image library, which means finally taking
  on an actual npm dependency — the zero-dependency approach was a
  reasonable choice early on, not a permanent constraint) before uploading
  hundreds of full-resolution photos.
- **The admin panel is single-operator** — one shared `ADMIN_KEY`, no
  per-person logins/audit trail of who changed what. Fine for one person
  running this; a team managing the catalog together would want real
  admin accounts.
- **No real email sending** — signup trusts whatever email is typed in
  (no "click to verify" step), and password reset links are logged/shown
  in an admin screen rather than actually emailed (see above). Both need
  a real email service (e.g. Resend, Postmark, SES) — an external account
  this zero-dependency approach deliberately hasn't forced on you yet.
- **Google/social login** wasn't built — OAuth requires registering a
  real app with a real redirect domain, which doesn't exist yet in this
  sandboxed environment. Email/password (with working reset, now) was the
  deployable option right now; Google login can layer onto the same
  `sessions` table later.
- **Rate limiting is in-memory, single-process** — resets on server
  restart, and won't coordinate across multiple instances if you ever
  scale beyond one server. Real brute-force protection at scale needs a
  shared store (Redis, or a DB table) instead — worth upgrading if this
  ever runs on more than one instance.
