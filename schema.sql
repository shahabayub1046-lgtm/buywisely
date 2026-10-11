-- ============================================================
-- BUY WISELY — database schema
-- SQLite (swap-compatible with Postgres/MySQL with minor tweaks)
-- ============================================================

-- Product categories (Phones, Laptops, Motorbikes, Cars, ...)
-- Keeping this as a table (not a hardcoded list) means adding a
-- whole new category later is a data change, not a code change.
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,     -- short slug, e.g. 'phones'
  label       TEXT NOT NULL,        -- display name, e.g. 'Phones'
  icon        TEXT,                 -- emoji/icon shown on the homepage
  sort_order  INTEGER DEFAULT 0
);

-- Brands (Apple, Samsung, Toyota, ...) — normalized so a brand's
-- name/logo is edited in one place, not duplicated per product.
CREATE TABLE IF NOT EXISTS brands (
  id          TEXT PRIMARY KEY,     -- slug, e.g. 'apple'
  name        TEXT NOT NULL,        -- display name, e.g. 'Apple'
  logo_url    TEXT
);

-- The products table. Core fields that EVERY category shares are
-- real columns (so they can be indexed/filtered/sorted fast).
-- Category-specific attributes (a phone's RAM vs a car's Airbags)
-- live in the `quick_specs` / `full_specs` JSON columns instead of
-- a few hundred mostly-empty columns — this is the standard,
-- well-established pattern for "variable attributes per category"
-- (Postgres calls this JSONB; SQLite just stores it as TEXT/JSON).
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,         -- slug, e.g. 'iphone17pm'
  category_id   TEXT NOT NULL REFERENCES categories(id),
  brand_id      TEXT NOT NULL REFERENCES brands(id),
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,         -- smallest currency unit (whole Rs. here)
  currency      TEXT NOT NULL DEFAULT 'PKR',
  color_swatch  TEXT,                     -- hex color shown as the product's swatch
  image_url     TEXT,                     -- real product photo (prototype uses CSS illustrations)
  quick_specs   TEXT NOT NULL DEFAULT '{}',  -- JSON: the ~6 specs shown as pills
  full_specs    TEXT NOT NULL DEFAULT '{}',  -- JSON: {section: {key: value}} — full compare table
  source_name   TEXT,                     -- e.g. 'Manufacturer listing', 'Retailer: XYZ'
  source_url    TEXT,
  affiliate_url TEXT,                     -- where "View deal" sends the shopper (real affiliate/retailer link)
  is_active     INTEGER NOT NULL DEFAULT 1, -- soft-delete / hide without losing data
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- Price history — this is what makes "last updated" and "price
-- checked today" on the product page an actual fact instead of a
-- hardcoded string. One row per price change.
CREATE TABLE IF NOT EXISTS price_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    TEXT NOT NULL REFERENCES products(id),
  price         INTEGER NOT NULL,
  recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, recorded_at);

-- Glossary terms for the "Ask" page.
CREATE TABLE IF NOT EXISTS terms (
  term        TEXT PRIMARY KEY,
  category    TEXT,          -- which spec category it belongs to (loosely groups it in the UI)
  definition  TEXT NOT NULL
);

-- User-submitted corrections (wires up the "Corrections" footer
-- link to something real instead of a dead end).
CREATE TABLE IF NOT EXISTS corrections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    TEXT REFERENCES products(id),
  field         TEXT,          -- which spec/price they're flagging, if any
  message       TEXT NOT NULL,
  submitted_by  TEXT,          -- optional email, if they gave one
  status        TEXT NOT NULL DEFAULT 'open',  -- open | reviewed | applied | rejected
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Accounts (Phase 2).
-- password_hash stores "scryptSalt:scryptHash" (both hex) — see
-- hashPassword()/verifyPassword() in server.js. scrypt is built into
-- Node's own crypto module, so password hashing needs no dependency
-- (no bcrypt) and no external service.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS saved_products (
  user_id       INTEGER NOT NULL REFERENCES users(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  saved_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

-- Login sessions. A session token is a long random value sent to the
-- browser as an httpOnly cookie — the browser never sees/handles the
-- password after login, only this opaque token, and the server looks
-- it up here on every authenticated request. This is a plain, well
-- understood pattern (equivalent to what express-session does) with
-- no library needed on top of node:crypto for the random token.
CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Every "View deal" click goes through /api/clickout/:productId first (never
-- a raw affiliate link in the page), which logs a row here and THEN redirects.
-- This is what lets you reconcile clicks against the commission statements
-- affiliate networks send you, and is the standard reason affiliate links are
-- routed through your own server instead of linked directly.
CREATE TABLE IF NOT EXISTS clickouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    TEXT NOT NULL REFERENCES products(id),
  user_id       INTEGER REFERENCES users(id),  -- null if the shopper wasn't logged in
  clicked_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clickouts_product ON clickouts(product_id, clicked_at);

-- Minimal, self-hosted pageview analytics — no third-party account
-- (Google Analytics, etc.) required to see basic traffic numbers. See
-- "Swapping in a real analytics tool" in README.md for going further.
CREATE TABLE IF NOT EXISTS pageviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  view        TEXT NOT NULL,     -- 'home' | 'product' | 'compare' | 'ask' | 'match' | 'saved'
  payload     TEXT,              -- e.g. a product id, or "idA,idB" for a compare pair
  user_id     INTEGER REFERENCES users(id),  -- null if not logged in
  viewed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pageviews_view ON pageviews(view, viewed_at);

-- Password reset tokens. No email service is connected yet, so a
-- generated link is surfaced two ways in the meantime: logged to the
-- server console, and listed at /admin/password-resets.html so the
-- site operator can manually copy/send it until real email exists.
CREATE TABLE IF NOT EXISTS password_resets (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
