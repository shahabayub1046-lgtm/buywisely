#!/usr/bin/env node
/**
 * Buy Wisely API — built on Node's built-in http + node:sqlite only.
 * No `npm install` required, which means no dependency to go stale
 * or break on a fresh server. Swap node:sqlite for Postgres later
 * by changing only the functions in this file marked "DB:".
 *
 * Run:   node server.js
 * Then:  http://localhost:8787/            (serves the frontend)
 *        http://localhost:8787/api/products
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 8787;
// Configurable so the database can live on a mounted persistent disk in
// production (e.g. Render) instead of next to the code — code directories
// on most hosts are read-only or wiped on redeploy; a mounted disk isn't.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'buywisely.db');
const STATIC_DIR = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;

if (!fs.existsSync(DB_PATH)) {
  console.error('buywisely.db not found. Run `python3 import_data.py` first.');
  process.exit(1);
}
const db = new DatabaseSync(DB_PATH, { readOnly: false });

// CORS: reflect the actual request origin (rather than hardcoding '*')
// and allow credentials, because cookie-based auth requires that — a
// wildcard origin cannot be combined with credentialed requests per
// the browser spec. Same-origin deployments (frontend+API on one
// server, the default here) aren't affected by this either way.
function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function sendJSON(req, res, status, data, extraHeaders) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, corsHeaders(req), extraHeaders || {}));
  res.end(body);
}

/* ===================== COOKIES ===================== */
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}
function sessionCookieHeader(token, maxAgeSeconds) {
  const parts = [
    `bw_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (IS_PROD) parts.push('Secure'); // requires HTTPS — on by default once you deploy behind TLS
  return parts.join('; ');
}
const CLEAR_COOKIE = 'bw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

/* ===================== RATE LIMITING =====================
 * In-memory, per-process — resets on restart, and doesn't share state
 * across multiple instances if you ever scale beyond one. That's a real
 * limitation (noted in README), but it's the honest zero-dependency
 * option, and brute-force protection that resets on restart is still
 * far better than none at all. */
const rateLimitBuckets = new Map(); // key -> { count, resetAt }
function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= maxAttempts) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}
function clientIp(req) {
  return req.socket.remoteAddress || 'unknown'; // behind a reverse proxy, prefer X-Forwarded-For — see README
}
// Periodically forget old buckets so this Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of rateLimitBuckets) if (b.resetAt < now) rateLimitBuckets.delete(key);
}, 10 * 60 * 1000).unref();

/* ===================== PASSWORDS ===================== */
// scrypt is built into node:crypto — no bcrypt dependency needed.
// Stored as "saltHex:hashHex" in users.password_hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function rowToProduct(row) {
  return {
    id: row.id,
    cat: row.category_id,
    brand: row.brand_name,
    name: row.name,
    price: row.price,
    currency: row.currency,
    color: row.color_swatch,
    image: row.image_url,
    quick: JSON.parse(row.quick_specs),
    specs: JSON.parse(row.full_specs),
    source: { name: row.source_name, url: row.source_url, updatedAt: row.updated_at },
    affiliateUrl: row.affiliate_url || null,
  };
}

// DB: list products, optionally filtered by category / brand / free-text search
function dbListProducts({ category, brand, q, limit, offset }) {
  let sql = `SELECT p.*, b.name AS brand_name FROM products p
             JOIN brands b ON b.id = p.brand_id
             WHERE p.is_active = 1`;
  const params = [];
  if (category) { sql += ' AND p.category_id = ?'; params.push(category); }
  if (brand)    { sql += ' AND p.brand_id = ?'; params.push(brand); }
  if (q)        { sql += ' AND (p.name LIKE ? OR b.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit) || 100, Number(offset) || 0);
  const stmt = db.prepare(sql);
  return stmt.all(...params).map(rowToProduct);
}

function dbGetProduct(id) {
  const row = db.prepare(`SELECT p.*, b.name AS brand_name FROM products p
                           JOIN brands b ON b.id = p.brand_id
                           WHERE p.id = ? AND p.is_active = 1`).get(id);
  return row ? rowToProduct(row) : null;
}

function dbListCategories() {
  return db.prepare('SELECT id, label, icon FROM categories ORDER BY sort_order').all();
}

function dbListTerms(q) {
  if (q) {
    return db.prepare('SELECT term, category AS cat, definition AS def FROM terms WHERE term LIKE ? OR definition LIKE ?')
      .all(`%${q}%`, `%${q}%`);
  }
  return db.prepare('SELECT term, category AS cat, definition AS def FROM terms').all();
}

function dbInsertCorrection({ productId, field, message, submittedBy }) {
  db.prepare(`INSERT INTO corrections (product_id, field, message, submitted_by) VALUES (?,?,?,?)`)
    .run(productId || null, field || null, message, submittedBy || null);
}

/* ===================== DB: AUTH ===================== */
function dbGetUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
}
function dbGetUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function dbCreateUser(email, passwordHash) {
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?,?)')
    .run(email.toLowerCase(), passwordHash);
  return Number(result.lastInsertRowid);
}
function dbCreateSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}
function dbGetSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return row;
}
function dbDeleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
// Pulls the logged-in user (or null) out of the request's session cookie.
function getCurrentUser(req) {
  const token = parseCookies(req).bw_session;
  const session = dbGetSession(token);
  if (!session) return null;
  const user = dbGetUserById(session.user_id);
  return user ? { id: user.id, email: user.email } : null;
}

function validateProductFields(data, { isNew }) {
  if (isNew) {
    if (!data.id || !/^[a-z0-9-]+$/.test(data.id)) return 'id is required and must be lowercase letters/numbers/hyphens only';
  }
  if (!data.cat || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(data.cat)) return 'A valid category is required';
  if (!data.brand || !String(data.brand).trim()) return 'Brand is required';
  if (!data.name || !String(data.name).trim()) return 'Name is required';
  if (data.price == null || isNaN(Number(data.price)) || Number(data.price) < 0) return 'Price must be a positive number';
  if (data.quick && typeof data.quick !== 'object') return 'quick must be an object';
  if (data.specs && typeof data.specs !== 'object') return 'specs must be an object';
  return null;
}

/* ===================== DB: ADMIN PRODUCT MANAGEMENT ===================== */
function rowToAdminProduct(row) {
  return Object.assign(rowToProduct(row), {
    brandId: row.brand_id,
    isActive: !!row.is_active,
  });
}
function dbListProductsAdmin() {
  return db.prepare(`SELECT p.*, b.name AS brand_name FROM products p
                      JOIN brands b ON b.id = p.brand_id
                      ORDER BY p.updated_at DESC`).all().map(rowToAdminProduct);
}
function dbGetProductAdmin(id) {
  const row = db.prepare(`SELECT p.*, b.name AS brand_name FROM products p
                           JOIN brands b ON b.id = p.brand_id WHERE p.id = ?`).get(id);
  return row ? rowToAdminProduct(row) : null;
}
function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function dbUpsertBrand(name) {
  const id = slugify(name);
  db.prepare('INSERT OR IGNORE INTO brands (id, name) VALUES (?,?)').run(id, name.trim());
  return id;
}
function dbListBrands() {
  return db.prepare('SELECT id, name FROM brands ORDER BY name').all();
}
function dbInsertProduct(f) {
  db.prepare(`INSERT INTO products
    (id,category_id,brand_id,name,price,currency,color_swatch,image_url,
     quick_specs,full_specs,source_name,source_url,affiliate_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    f.id, f.cat, f.brandId, f.name, f.price, f.currency || 'PKR',
    f.color || '', f.imageUrl || '', JSON.stringify(f.quick || {}), JSON.stringify(f.specs || {}),
    f.sourceName || '', f.sourceUrl || '', f.affiliateUrl || '');
  db.prepare('INSERT INTO price_history (product_id, price) VALUES (?,?)').run(f.id, f.price);
}
function dbUpdateProduct(id, f) {
  const existing = db.prepare('SELECT price FROM products WHERE id = ?').get(id);
  db.prepare(`UPDATE products SET category_id=?, brand_id=?, name=?, price=?, currency=?,
              color_swatch=?, image_url=COALESCE(NULLIF(?,''), image_url),
              quick_specs=?, full_specs=?, source_name=?, source_url=?, affiliate_url=?,
              updated_at=datetime('now') WHERE id=?`).run(
    f.cat, f.brandId, f.name, f.price, f.currency || 'PKR', f.color || '', f.imageUrl || '',
    JSON.stringify(f.quick || {}), JSON.stringify(f.specs || {}),
    f.sourceName || '', f.sourceUrl || '', f.affiliateUrl || '', id);
  if (existing && Number(existing.price) !== Number(f.price)) {
    db.prepare('INSERT INTO price_history (product_id, price) VALUES (?,?)').run(id, f.price);
  }
}
function dbSetProductActive(id, active) {
  db.prepare("UPDATE products SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(active ? 1 : 0, id);
}

// Saves a base64 data-URI image to disk as /images/products/<id>.<ext> and
// returns the relative URL. Validates the MIME type against a small
// allowlist (never trusts a client-supplied file extension) since this
// writes a real file to disk based on request input.
const ALLOWED_IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Configurable for the same reason as DB_PATH above — defaults to inside
// the code checkout for local dev, but should point at the persistent
// disk in production so uploaded photos survive a redeploy.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(STATIC_DIR, 'images', 'products');
function saveProductImage(productId, dataUri) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUri || '');
  if (!match) throw new Error('Image must be a JPEG, PNG, or WebP data URI');
  const ext = ALLOWED_IMAGE_TYPES[match[1]];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('Image must be under 5MB');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const fname = `${productId}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fname), buf);
  return `images/products/${fname}`;
}

/* ===================== DB: CLICKOUTS (affiliate link tracking) ===================== */
function dbLogClickout(productId, userId) {
  db.prepare('INSERT INTO clickouts (product_id, user_id) VALUES (?,?)').run(productId, userId || null);
}
function dbClickoutSummary() {
  return db.prepare(`SELECT c.product_id, p.name, COUNT(*) as clicks, MAX(c.clicked_at) as last_click
                      FROM clickouts c JOIN products p ON p.id = c.product_id
                      GROUP BY c.product_id ORDER BY clicks DESC`).all();
}

/* ===================== DB: PAGEVIEWS (self-hosted analytics) ===================== */
function dbLogPageview(view, payload, userId) {
  db.prepare('INSERT INTO pageviews (view, payload, user_id) VALUES (?,?,?)').run(view, payload || null, userId || null);
}
function dbPageviewSummary() {
  const byView = db.prepare(`SELECT view, COUNT(*) as views FROM pageviews GROUP BY view ORDER BY views DESC`).all();
  const topProducts = db.prepare(`SELECT payload as product_id, COUNT(*) as views FROM pageviews
                                   WHERE view='product' AND payload IS NOT NULL
                                   GROUP BY payload ORDER BY views DESC LIMIT 20`).all();
  const last7Days = db.prepare(`SELECT date(viewed_at) as day, COUNT(*) as views FROM pageviews
                                 WHERE viewed_at >= datetime('now','-7 days')
                                 GROUP BY day ORDER BY day`).all();
  const totalViews = db.prepare('SELECT COUNT(*) as n FROM pageviews').get().n;
  return { totalViews, byView, topProducts, last7Days };
}

/* ===================== DB: PASSWORD RESET ===================== */
const RESET_TOKEN_MINUTES = 60;
function dbCreateResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}
function dbGetValidResetToken(token) {
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}
function dbMarkResetTokenUsed(token) {
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
}
function dbSetUserPassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}
function dbInvalidateUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
function dbListPendingResets() {
  // For the admin screen — only ever shows still-valid, unused tokens,
  // since a used/expired one is useless to hand to anyone.
  return db.prepare(`SELECT pr.token, pr.created_at, pr.expires_at, u.email
                      FROM password_resets pr JOIN users u ON u.id = pr.user_id
                      WHERE pr.used = 0 AND pr.expires_at > datetime('now')
                      ORDER BY pr.created_at DESC`).all();
}

/* ===================== DB: CORRECTIONS (admin review) ===================== */
function dbListCorrectionsAdmin() {
  return db.prepare(`SELECT c.*, p.name as product_name, p.brand_id FROM corrections c
                      LEFT JOIN products p ON p.id = c.product_id
                      ORDER BY c.created_at DESC`).all();
}
function dbUpdateCorrectionStatus(id, status) {
  const valid = ['open', 'reviewed', 'applied', 'rejected'];
  if (!valid.includes(status)) throw new Error('Invalid status');
  db.prepare('UPDATE corrections SET status = ? WHERE id = ?').run(status, id);
}

/* ===================== DB: SAVED PRODUCTS ===================== */
function dbListSavedProductIds(userId) {
  return db.prepare('SELECT product_id FROM saved_products WHERE user_id = ? ORDER BY saved_at DESC')
    .all(userId).map(r => r.product_id);
}
function dbAddSaved(userId, productId) {
  db.prepare('INSERT OR IGNORE INTO saved_products (user_id, product_id) VALUES (?,?)').run(userId, productId);
}
function dbRemoveSaved(userId, productId) {
  db.prepare('DELETE FROM saved_products WHERE user_id = ? AND product_id = ?').run(userId, productId);
}
// Merges a guest's localStorage-saved IDs into their account on login/signup
// (so logging in for the first time doesn't silently drop what they'd saved).
function dbMergeSaved(userId, productIds) {
  (productIds || []).forEach(pid => {
    if (db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid)) dbAddSaved(userId, pid);
  });
}

function readJSONBody(req, maxBytes) {
  const cap = maxBytes || 1e6; // 1MB default; admin routes with image uploads pass a higher cap
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > cap) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}
// Same shared-secret pattern as the rest of the admin-only endpoints —
// not a real multi-user admin role system, just enough to keep product
// management and analytics out of public hands with one env var.
function isAdmin(req, url) {
  return !!process.env.ADMIN_KEY && url.searchParams.get('key') === process.env.ADMIN_KEY;
}
function requireAdmin(req, res, url) {
  if (isAdmin(req, url)) return true;
  sendJSON(req, res, 401, { error: 'Set ADMIN_KEY in the environment and pass ?key=' });
  return false;
}

const MIME = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
                '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
                '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain' };

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(STATIC_DIR, reqPath);
  if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') { // CORS preflight
    res.writeHead(204, Object.assign({
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }, corsHeaders(req)));
    return res.end();
  }

  try {
    if (url.pathname === '/api/categories') {
      return sendJSON(req, res, 200, dbListCategories());
    }
    if (url.pathname === '/api/products') {
      return sendJSON(req, res, 200, dbListProducts({
        category: url.searchParams.get('category'),
        brand: url.searchParams.get('brand'),
        q: url.searchParams.get('q'),
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
      }));
    }
    const productMatch = url.pathname.match(/^\/api\/products\/([a-zA-Z0-9-]+)$/);
    if (productMatch) {
      const p = dbGetProduct(productMatch[1]);
      if (!p) return sendJSON(req, res, 404, { error: 'Product not found' });
      return sendJSON(req, res, 200, p);
    }
    if (url.pathname === '/api/terms') {
      return sendJSON(req, res, 200, dbListTerms(url.searchParams.get('q')));
    }
    if (url.pathname === '/api/corrections' && req.method === 'POST') {
      const data = await readJSONBody(req);
      if (!data.message) return sendJSON(req, res, 400, { error: 'message is required' });
      dbInsertCorrection({ productId: data.productId, field: data.field, message: data.message, submittedBy: data.submittedBy });
      return sendJSON(req, res, 201, { ok: true });
    }

    /* ===================== AUTH ROUTES ===================== */
    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      const rl = rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60 * 1000); // 10/hour per IP
      if (!rl.ok) return sendJSON(req, res, 429, { error: 'Too many signups from this network — try again later' }, { 'Retry-After': String(rl.retryAfterSeconds) });
      const data = await readJSONBody(req);
      const email = (data.email || '').trim();
      if (!isValidEmail(email)) return sendJSON(req, res, 400, { error: 'A valid email is required' });
      if (!data.password || String(data.password).length < 8) {
        return sendJSON(req, res, 400, { error: 'Password must be at least 8 characters' });
      }
      if (dbGetUserByEmail(email)) return sendJSON(req, res, 409, { error: 'An account with that email already exists' });
      const userId = dbCreateUser(email, hashPassword(String(data.password)));
      dbMergeSaved(userId, data.localSavedIds); // pull in anything they'd saved as a guest
      const token = dbCreateSession(userId);
      return sendJSON(req, res, 201, { id: userId, email: email.toLowerCase() },
        { 'Set-Cookie': sessionCookieHeader(token, SESSION_DAYS * 24 * 3600) });
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const data = await readJSONBody(req);
      const email = (data.email || '').trim();
      // Keyed by email+IP, not just IP, so one person mistyping their own password
      // repeatedly doesn't get blocked by someone else's attempts on the same network.
      const rl = rateLimit(`login:${email.toLowerCase()}:${clientIp(req)}`, 8, 15 * 60 * 1000); // 8 attempts / 15 min
      if (!rl.ok) return sendJSON(req, res, 429, { error: 'Too many attempts — try again in a few minutes' }, { 'Retry-After': String(rl.retryAfterSeconds) });
      const user = email && dbGetUserByEmail(email);
      if (!user || !verifyPassword(String(data.password || ''), user.password_hash)) {
        return sendJSON(req, res, 401, { error: 'Incorrect email or password' });
      }
      dbMergeSaved(user.id, data.localSavedIds);
      const token = dbCreateSession(user.id);
      return sendJSON(req, res, 200, { id: user.id, email: user.email },
        { 'Set-Cookie': sessionCookieHeader(token, SESSION_DAYS * 24 * 3600) });
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req).bw_session;
      if (token) dbDeleteSession(token);
      return sendJSON(req, res, 200, { ok: true }, { 'Set-Cookie': CLEAR_COOKIE });
    }
    if (url.pathname === '/api/auth/me') {
      const user = getCurrentUser(req);
      return sendJSON(req, res, 200, { user });
    }
    if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const rl = rateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000); // 5/hour per IP
      if (!rl.ok) return sendJSON(req, res, 429, { error: 'Too many requests — try again later' }, { 'Retry-After': String(rl.retryAfterSeconds) });
      const data = await readJSONBody(req);
      const email = (data.email || '').trim();
      const user = email && dbGetUserByEmail(email);
      // Always return the same response whether or not the account exists —
      // otherwise this endpoint becomes a way to check which emails have
      // accounts (a real, well-known privacy leak for this kind of form).
      const genericResponse = { ok: true, message: "If an account exists for that email, a reset link has been generated." };
      if (!user) return sendJSON(req, res, 200, genericResponse);
      const token = dbCreateResetToken(user.id);
      const proto = req.headers['x-forwarded-proto'] || url.protocol.replace(':', '');
      const resetUrl = `${proto}://${url.host}/#reset/${token}`;
      // No email service connected yet (see README) — the link is logged
      // here, and also visible at /admin/password-resets.html so the site
      // operator can copy/send it manually in the meantime.
      console.log(`[password reset] ${user.email} -> ${resetUrl} (expires in ${RESET_TOKEN_MINUTES} min)`);
      if (!IS_PROD) genericResponse.devResetUrl = resetUrl; // convenience for local testing only, never in production
      return sendJSON(req, res, 200, genericResponse);
    }
    if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
      const data = await readJSONBody(req);
      const resetRow = data.token && dbGetValidResetToken(String(data.token));
      if (!resetRow) return sendJSON(req, res, 400, { error: 'This reset link is invalid or has expired. Request a new one.' });
      if (!data.password || String(data.password).length < 8) {
        return sendJSON(req, res, 400, { error: 'Password must be at least 8 characters' });
      }
      dbSetUserPassword(resetRow.user_id, hashPassword(String(data.password)));
      dbMarkResetTokenUsed(resetRow.token);
      dbInvalidateUserSessions(resetRow.user_id); // log out everywhere — a changed password should kill old sessions
      const newToken = dbCreateSession(resetRow.user_id);
      const user = dbGetUserById(resetRow.user_id);
      return sendJSON(req, res, 200, { id: user.id, email: user.email },
        { 'Set-Cookie': sessionCookieHeader(newToken, SESSION_DAYS * 24 * 3600) });
    }

    /* ===================== SITEMAP =====================
     * Deliberately lists ONLY the homepage + legal pages, not individual
     * product URLs. This app navigates with #hash routing (#product/id,
     * #compare/a,b, etc.), and search engines do not reliably treat hash
     * fragments as separate indexable pages — so listing
     * yoursite.com/#product/apple-iphone-17 here would be misleading; it
     * would not actually get crawled/indexed as its own result. Getting
     * individual products into Google requires real path-based routes
     * (e.g. /product/apple-iphone-17) rendered server-side — a genuine
     * architecture change, not a config tweak. See README.md, "Path-based
     * routing for real product SEO" under Phase 4+ for what that'd take. */
    if (url.pathname === '/sitemap.xml') {
      const base = `${url.protocol}//${url.host}`;
      const urls = ['/', '/legal/privacy.html', '/legal/terms.html', '/legal/cookies.html'];
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n') +
        `\n</urlset>\n`;
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/xml; charset=utf-8' }, corsHeaders(req)));
      return res.end(body);
    }

    /* ===================== ANALYTICS (self-hosted, no 3rd-party account) ===================== */
    if (url.pathname === '/api/pageview' && req.method === 'POST') {
      const data = await readJSONBody(req).catch(() => ({}));
      if (!data.view) return sendJSON(req, res, 400, { error: 'view is required' });
      const user = getCurrentUser(req);
      dbLogPageview(String(data.view), data.payload ? String(data.payload) : null, user ? user.id : null);
      return sendJSON(req, res, 201, { ok: true });
    }
    if (url.pathname === '/api/analytics/summary') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbPageviewSummary());
    }

    /* ===================== ADMIN: CORRECTIONS REVIEW ===================== */
    if (url.pathname === '/api/admin/corrections' && req.method === 'GET') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbListCorrectionsAdmin());
    }
    const correctionMatch = url.pathname.match(/^\/api\/admin\/corrections\/(\d+)$/);
    if (correctionMatch && req.method === 'PATCH') {
      if (!requireAdmin(req, res, url)) return;
      const data = await readJSONBody(req);
      try { dbUpdateCorrectionStatus(Number(correctionMatch[1]), data.status); }
      catch (e) { return sendJSON(req, res, 400, { error: e.message }); }
      return sendJSON(req, res, 200, { ok: true });
    }

    /* ===================== ADMIN: PENDING PASSWORD RESETS ===================== */
    if (url.pathname === '/api/admin/password-resets') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbListPendingResets());
    }

    /* ===================== ADMIN: PRODUCT MANAGEMENT =====================
     * Same ADMIN_KEY gate as analytics — this is a single-operator tool,
     * not a multi-user role system. Lets you add/edit/deactivate products
     * (including uploading a real photo) without touching CSVs or code. */
    if (url.pathname === '/api/admin/brands') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbListBrands());
    }
    if (url.pathname === '/api/admin/products' && req.method === 'GET') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbListProductsAdmin());
    }
    if (url.pathname === '/api/admin/products' && req.method === 'POST') {
      if (!requireAdmin(req, res, url)) return;
      const data = await readJSONBody(req, 6e6); // 6MB cap — room for a base64-encoded photo
      const err = validateProductFields(data, { isNew: true });
      if (err) return sendJSON(req, res, 400, { error: err });
      if (dbGetProductAdmin(data.id)) return sendJSON(req, res, 409, { error: `A product with id "${data.id}" already exists` });
      const brandId = dbUpsertBrand(data.brand);
      let imageUrl = '';
      if (data.imageDataUri) {
        try { imageUrl = saveProductImage(data.id, data.imageDataUri); }
        catch (e) { return sendJSON(req, res, 400, { error: e.message }); }
      }
      dbInsertProduct({ ...data, brandId, imageUrl });
      return sendJSON(req, res, 201, dbGetProductAdmin(data.id));
    }
    const adminProductMatch = url.pathname.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
    if (adminProductMatch) {
      if (!requireAdmin(req, res, url)) return;
      const id = adminProductMatch[1];
      if (req.method === 'GET') {
        const p = dbGetProductAdmin(id);
        return p ? sendJSON(req, res, 200, p) : sendJSON(req, res, 404, { error: 'Not found' });
      }
      if (req.method === 'PUT') {
        if (!dbGetProductAdmin(id)) return sendJSON(req, res, 404, { error: 'Not found' });
        const data = await readJSONBody(req, 6e6);
        const err = validateProductFields(data, { isNew: false });
        if (err) return sendJSON(req, res, 400, { error: err });
        const brandId = dbUpsertBrand(data.brand);
        let imageUrl = '';
        if (data.imageDataUri) {
          try { imageUrl = saveProductImage(id, data.imageDataUri); }
          catch (e) { return sendJSON(req, res, 400, { error: e.message }); }
        }
        dbUpdateProduct(id, { ...data, brandId, imageUrl });
        return sendJSON(req, res, 200, dbGetProductAdmin(id));
      }
      if (req.method === 'DELETE') {
        if (!dbGetProductAdmin(id)) return sendJSON(req, res, 404, { error: 'Not found' });
        dbSetProductActive(id, false);
        return sendJSON(req, res, 200, { ok: true });
      }
    }
    const restoreMatch = url.pathname.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)\/restore$/);
    if (restoreMatch && req.method === 'POST') {
      if (!requireAdmin(req, res, url)) return;
      if (!dbGetProductAdmin(restoreMatch[1])) return sendJSON(req, res, 404, { error: 'Not found' });
      dbSetProductActive(restoreMatch[1], true);
      return sendJSON(req, res, 200, { ok: true });
    }

    /* ===================== AFFILIATE CLICKOUT ===================== */
    // Every "View deal" link on the frontend points here, never straight at the
    // affiliate URL — logging the click server-side first means you still have
    // accurate numbers even if the shopper has JS/analytics blocked, and you can
    // change the destination URL later without redeploying the frontend.
    const clickoutMatch = url.pathname.match(/^\/api\/clickout\/([a-zA-Z0-9-]+)$/);
    if (clickoutMatch) {
      const p = dbGetProduct(clickoutMatch[1]);
      if (!p || !p.affiliateUrl) {
        res.writeHead(404, corsHeaders(req));
        return res.end('No deal link available for this product.');
      }
      const user = getCurrentUser(req);
      dbLogClickout(p.id, user ? user.id : null);
      res.writeHead(302, Object.assign({ Location: p.affiliateUrl }, corsHeaders(req)));
      return res.end();
    }
    // Simple clickout analytics — gated by a shared key (set ADMIN_KEY in your
    // environment) rather than left wide open, since this is seller/commission
    // data you don't want public. Not a real admin auth system — good enough
    // for one operator checking numbers, not for a team with roles.
    if (url.pathname === '/api/analytics/clickouts') {
      if (!requireAdmin(req, res, url)) return;
      return sendJSON(req, res, 200, dbClickoutSummary());
    }

    /* ===================== SAVED PRODUCTS (requires login) ===================== */
    if (url.pathname === '/api/saved') {
      const user = getCurrentUser(req);
      if (!user) return sendJSON(req, res, 401, { error: 'Log in to view saved products' });
      if (req.method === 'GET') {
        const ids = dbListSavedProductIds(user.id);
        return sendJSON(req, res, 200, ids.map(dbGetProduct).filter(Boolean));
      }
    }
    const savedMatch = url.pathname.match(/^\/api\/saved\/([a-zA-Z0-9-]+)$/);
    if (savedMatch && (req.method === 'POST' || req.method === 'DELETE')) {
      const user = getCurrentUser(req);
      if (!user) return sendJSON(req, res, 401, { error: 'Log in to save products' });
      const productId = savedMatch[1];
      if (req.method === 'POST') {
        if (!dbGetProduct(productId)) return sendJSON(req, res, 404, { error: 'Product not found' });
        dbAddSaved(user.id, productId);
      } else {
        dbRemoveSaved(user.id, productId);
      }
      return sendJSON(req, res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/')) {
      return sendJSON(req, res, 404, { error: 'Unknown endpoint' });
    }
    // Uploaded product photos: served from UPLOADS_DIR specifically, since
    // in production that's a persistent disk, not the (read-only/ephemeral)
    // code checkout serveStatic() below reads everything else from.
    const uploadMatch = url.pathname.match(/^\/images\/products\/([a-zA-Z0-9.-]+)$/);
    if (uploadMatch) {
      const filePath = path.join(UPLOADS_DIR, uploadMatch[1]);
      if (!filePath.startsWith(UPLOADS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
      return fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    }
    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    return sendJSON(req, res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Buy Wisely API + frontend running at http://localhost:${PORT}`);
});
