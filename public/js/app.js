/* ===================== MOCK DATA ===================== */
const CURRENCY = { symbol:'Rs.', locale:'en-IN' }; // change this one place to switch currency/locale

/* ===================== AUTH ===================== */
let currentUser = null; // {id, email} while logged in, else null
const AUTH_INPUT_STYLE = 'width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(0,0,0,.25);color:var(--fg);font-size:14.5px;';

async function checkAuth(){
  try{
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials:'include' });
    const data = await res.json();
    currentUser = data.user;
  }catch(e){ currentUser = null; }
  updateAuthUI();
  await refreshSavedIds();
}
function updateAuthUI(){
  const btn = document.getElementById('loginBtn');
  if(!btn) return;
  btn.textContent = currentUser ? currentUser.email.split('@')[0] : 'Log in';
  btn.onclick = currentUser ? showAccountMenu : ()=>showAuthModal('login');
}
function showAuthModal(mode){
  mode = (mode==='signup') ? 'signup' : 'login';
  const isLogin = mode==='login';
  document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">Account</div>
      <h4>${isLogin ? 'Log in' : 'Create your account'}</h4>
      <div id="authError" style="display:none;color:#ff8a8a;font-size:13px;margin:2px 0 10px;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin:8px 0 14px;">
        <input id="authEmail" type="email" placeholder="Email" autocomplete="email" style="${AUTH_INPUT_STYLE}">
        <input id="authPassword" type="password" placeholder="Password (min 8 characters)" autocomplete="${isLogin?'current-password':'new-password'}" style="${AUTH_INPUT_STYLE}">
      </div>
      <div class="row-btns">
        <div class="pbtn" onclick="showAuthModal('${isLogin?'signup':'login'}')">${isLogin ? 'New here? Sign up' : 'Have an account? Log in'}</div>
        <div class="pbtn primary" onclick="submitAuth('${mode}')">${isLogin ? 'Log in' : 'Sign up'}</div>
      </div>
      <p style="color:var(--fg-soft);font-size:12px;margin-top:12px;">Anything you've saved in this browser will be added to your account.${isLogin ? ' <a href="#" onclick="showForgotPasswordModal();return false;" style="color:var(--accent);">Forgot password?</a>' : ''}</p>
    </div></div>`;
  const onEnter = e=>{ if(e.key==='Enter') submitAuth(mode); };
  ['authEmail','authPassword'].forEach(id=>document.getElementById(id).addEventListener('keydown', onEnter));
  setTimeout(()=>document.getElementById('authEmail')?.focus(), 50);
}
async function submitAuth(mode){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';
  try{
    const res = await fetch(`${API_BASE}/api/auth/${mode}`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password, localSavedIds: getLocalSaved() }),
    });
    const data = await res.json();
    if(!res.ok){ errEl.textContent = data.error || 'Something went wrong'; errEl.style.display='block'; return; }
    currentUser = { id:data.id, email:data.email };
    setLocalSaved([]); // now lives on the account server-side instead
    closePopover();
    updateAuthUI();
    await refreshSavedIds();
    if(state.view==='saved') renderSaved();
  }catch(e){
    errEl.textContent = "Couldn't reach the server — is the backend running?";
    errEl.style.display = 'block';
  }
}
function showAccountMenu(){
  document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">Account</div>
      <h4>${currentUser.email}</h4>
      <p style="color:var(--fg-soft);font-size:13.5px;">Your saved items are synced to this account across devices.</p>
      <div class="row-btns">
        <div class="pbtn" onclick="closePopover();go('saved');">View saved</div>
        <div class="pbtn primary" onclick="logout()">Log out</div>
      </div>
    </div></div>`;
}
async function logout(){
  try{ await fetch(`${API_BASE}/api/auth/logout`, { method:'POST', credentials:'include' }); }catch(e){}
  currentUser = null;
  closePopover();
  updateAuthUI();
  await refreshSavedIds();
  if(state.view==='saved') renderSaved();
}

function showForgotPasswordModal(){
  document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">Account</div>
      <h4>Reset your password</h4>
      <div id="forgotError" style="display:none;color:#ff8a8a;font-size:13px;margin:2px 0 10px;"></div>
      <div id="forgotOk" style="display:none;color:var(--good);font-size:13.5px;margin:2px 0 10px;"></div>
      <input id="forgotEmail" type="email" placeholder="Your account email" autocomplete="email" style="${AUTH_INPUT_STYLE}">
      <div class="row-btns" style="margin-top:12px;">
        <div class="pbtn" onclick="showAuthModal('login')">Back to log in</div>
        <div class="pbtn primary" onclick="submitForgotPassword()">Send reset link</div>
      </div>
    </div></div>`;
  setTimeout(()=>document.getElementById('forgotEmail')?.focus(), 50);
}
async function submitForgotPassword(){
  const email = document.getElementById('forgotEmail').value.trim();
  const errEl = document.getElementById('forgotError');
  const okEl = document.getElementById('forgotOk');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  try{
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if(!res.ok){ errEl.textContent = data.error || 'Something went wrong'; errEl.style.display='block'; return; }
    okEl.textContent = data.devResetUrl
      ? `Dev mode — here's your reset link: ${data.devResetUrl}`
      : "If an account exists for that email, a reset link is on its way (or ask the site admin — email sending isn't connected yet).";
    okEl.style.display = 'block';
  }catch(e){
    errEl.textContent = "Couldn't reach the server.";
    errEl.style.display = 'block';
  }
}
function renderResetView(token){
  document.getElementById('resetFormBody').innerHTML = `
    <div id="resetError" style="display:none;color:#ff8a8a;font-size:13px;margin-bottom:10px;"></div>
    <div id="resetOk" style="display:none;color:var(--good);font-size:13.5px;margin-bottom:10px;"></div>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:360px;">
      <input id="resetPassword" type="password" placeholder="New password (min 8 characters)" autocomplete="new-password" style="${AUTH_INPUT_STYLE}">
    </div>
    <button class="w-btn primary" style="margin-top:14px;" onclick="submitResetPassword('${token}')">Set new password</button>`;
}
async function submitResetPassword(token){
  const password = document.getElementById('resetPassword').value;
  const errEl = document.getElementById('resetError');
  const okEl = document.getElementById('resetOk');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  try{
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if(!res.ok){ errEl.textContent = data.error || 'Something went wrong'; errEl.style.display='block'; return; }
    currentUser = { id:data.id, email:data.email };
    updateAuthUI();
    await refreshSavedIds();
    okEl.textContent = "Password updated — you're logged in.";
    okEl.style.display = 'block';
    setTimeout(()=>go('home'), 1500);
  }catch(e){
    errEl.textContent = "Couldn't reach the server.";
    errEl.style.display = 'block';
  }
}

/* ===================== ADS =====================
 * Disabled by default — this site has no ad network connected yet, so
 * the two .ad-zone elements just keep showing their honest "Sponsored
 * placement" placeholder copy (already in the HTML). Nothing fake is
 * ever shown to a visitor.
 *
 * To go live with real ads (example shown here: Google AdSense):
 *   1. Apply at google.com/adsense. Approval requires a live, publicly
 *      reachable site with real content — that's a real prerequisite,
 *      not something to fake your way around.
 *   2. Once approved, set enabled:true and fill in publisherId below,
 *      plus a slot ID per zone from your AdSense dashboard.
 *   3. Put the "ads.txt" line AdSense gives you into public/ads.txt
 *      (most networks require this file to pay out at all).
 * Using a different network? Keep the enabled/publisherId/slots shape
 * and swap the script URL + <ins> markup in renderAds() for whatever
 * that network's docs specify — the zone IDs (adZone1/adZone2) and the
 * rest of the page don't need to change either way. */
const AD_CONFIG = {
  enabled: false,
  publisherId: '',  // e.g. 'ca-pub-XXXXXXXXXXXXXXXX'
  slots: { adZone1: '', adZone2: '' },  // ad unit/slot IDs from your network dashboard
};
function renderAds(){
  if(!AD_CONFIG.enabled || !AD_CONFIG.publisherId) return;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CONFIG.publisherId}`;
  document.head.appendChild(script);
  Object.entries(AD_CONFIG.slots).forEach(([zoneId, slotId])=>{
    const el = document.getElementById(zoneId);
    if(!el || !slotId) return;
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${AD_CONFIG.publisherId}" data-ad-slot="${slotId}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}

/* ===================== SAVED / FAVORITES =====================
 * Logged in: the server (saved_products table) is the source of truth.
 * Logged out (guest): localStorage is the source of truth, same as before.
 * Either way, `savedIds` is an in-memory cache so isSaved() stays a
 * synchronous call usable inline in template strings — only
 * toggleSave()/refreshSavedIds() need to be async to talk to the server. */
const SAVED_KEY = 'bw_saved_v1';
let savedIds = new Set();
function getLocalSaved(){ try{ return JSON.parse(localStorage.getItem(SAVED_KEY)||'[]'); }catch(e){ return []; } }
function setLocalSaved(arr){ try{ localStorage.setItem(SAVED_KEY, JSON.stringify(arr)); }catch(e){} }
function isSaved(id){ return savedIds.has(id); }

async function refreshSavedIds(){
  if(currentUser){
    try{
      const res = await fetch(`${API_BASE}/api/saved`, { credentials:'include' });
      const items = res.ok ? await res.json() : [];
      savedIds = new Set(items.map(p=>p.id));
    }catch(e){ savedIds = new Set(); }
  } else {
    savedIds = new Set(getLocalSaved());
  }
  updateSavedBadge();
}

async function toggleSave(id, btnEl){
  const was = savedIds.has(id);
  // optimistic UI update — flipped back below only if the server call fails
  if(was) savedIds.delete(id); else savedIds.add(id);
  if(btnEl){ btnEl.classList.toggle('saved', !was); btnEl.innerHTML = (!was ? '♥ Saved' : '♡ Save'); }
  updateSavedBadge();
  if(state.view==='saved') renderSaved();

  if(currentUser){
    try{
      const res = await fetch(`${API_BASE}/api/saved/${encodeURIComponent(id)}`, { method: was?'DELETE':'POST', credentials:'include' });
      if(!res.ok) throw new Error('save request failed');
    }catch(e){
      if(was) savedIds.add(id); else savedIds.delete(id); // revert
      if(btnEl){ btnEl.classList.toggle('saved', was); btnEl.innerHTML = (was ? '♥ Saved' : '♡ Save'); }
      updateSavedBadge();
      if(state.view==='saved') renderSaved();
    }
  } else {
    setLocalSaved(Array.from(savedIds));
  }
}
function updateSavedBadge(){
  const n = savedIds.size;
  const el = document.getElementById('savedCountBadge');
  if(el){ el.textContent = n; el.style.display = n>0 ? 'flex' : 'none'; }
}
function renderSaved(){
  const items = PRODUCTS.filter(p=>savedIds.has(p.id));
  const grid = document.getElementById('savedGrid');
  const empty = document.getElementById('savedEmpty');
  if(!grid) return;
  if(items.length===0){ grid.innerHTML=''; if(empty) empty.classList.remove('hide'); return; }
  if(empty) empty.classList.add('hide');
  grid.innerHTML = items.map(p=>`<div class="trend-card" style="display:flex;gap:14px;align-items:center;text-align:left;">
      <div onclick="go('product','${p.id}')" style="cursor:pointer;display:flex;gap:14px;align-items:center;flex:1;">
        ${productIllus(p,64)}
        <div><div style="font-weight:700;font-size:14.5px;">${p.brand} ${p.name}</div><div style="color:var(--accent);font-weight:700;font-size:13.5px;margin-top:3px;">${money(p.price)}</div></div>
      </div>
      <span class="a" onclick="toggleSave('${p.id}').then(renderSaved);" style="white-space:nowrap;">Remove</span>
    </div>`).join('');
}

/* ===================== SHARE ===================== */
function copyShareLink(btnEl, view, payload){
  const url = location.origin + location.pathname + hashFor(view || state.view, payload!==undefined ? payload : state.payload);
  const done = ()=>{
    if(!btnEl) return;
    const original = btnEl.dataset.label || btnEl.textContent;
    btnEl.dataset.label = original;
    btnEl.textContent = 'Link copied ✓';
    setTimeout(()=>{ btnEl.textContent = original; }, 1800);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(done).catch(()=>fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
  if(cb) cb();
}

/* ===================== TRUST / CREDIBILITY INFO ===================== */
const TRUST_INFO = {
  source: {
    title: 'How we source data',
    body: `This is a prototype — every price and specification you see is mock data written for demonstration, not pulled from a live retailer or manufacturer feed. In a production version, each spec would carry its own source (manufacturer listing, retailer page, or user-submitted correction) and a per-field "last checked" date, rather than a single blanket disclaimer.`
  },
  affiliate: {
    title: 'Affiliate disclosure',
    body: `Some "View deal" buttons on this site are affiliate links — if you click through and make a purchase, we may earn a commission, at no extra cost to you. That link is always labeled "Affiliate link" at the point of the button itself, not just here. An affiliate relationship never changes a product's listed specs or price on this site, and never affects its position in a head-to-head comparison or in "Why this?" reasoning on match results — rankings are driven by the specs/priorities you select, not by which retailer pays. Separately, ad zones (labeled "Sponsored"/"Advertisement") are visually separated from comparison data and are never blended into search results or rankings either.`
  },
  corrections: {
    title: 'Corrections',
    body: `Spot something wrong — a price, a spec, a translation? In a live version this page would link to a simple correction form, and corrections would be logged with a timestamp and shown against the product's "last updated" date. This prototype doesn't have a live backend yet, so corrections aren't collected here.`
  }
};
function showTrustInfo(key){
  const t = TRUST_INFO[key];
  if(!t) return;
  document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">Trust &amp; credibility</div>
      <h4>${t.title}</h4>
      <p>${t.body}</p>
      <div class="row-btns"><div class="pbtn primary" onclick="closePopover()">Got it</div></div>
    </div></div>`;
}

/* ===================== CORRECTIONS FORM =====================
 * Replaces what used to be just an explanatory popover. This actually
 * submits to POST /api/corrections (backend/server.js), which logs it
 * to the `corrections` table with status='open' for someone to review. */
function showCorrectionForm(productId){
  const preselected = productId || (state.view==='product' ? state.payload : '');
  const options = PRODUCTS.map(p=>`<option value="${p.id}" ${p.id===preselected?'selected':''}>${p.brand} ${p.name}</option>`).join('');
  document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">Trust &amp; credibility</div>
      <h4>Report a correction</h4>
      <p style="margin-bottom:12px;">Spot a wrong price or spec? Tell us — every submission is logged for review.</p>
      <div id="corrError" style="display:none;color:#ff8a8a;font-size:13px;margin-bottom:8px;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <select id="corrProduct" style="${AUTH_INPUT_STYLE}">
          <option value="">Not about a specific product</option>
          ${options}
        </select>
        <input id="corrField" type="text" placeholder="Which field? (optional, e.g. 'Battery', 'Price')" style="${AUTH_INPUT_STYLE}">
        <textarea id="corrMessage" rows="3" placeholder="What's wrong, and what should it say instead?" style="${AUTH_INPUT_STYLE}resize:vertical;font-family:inherit;"></textarea>
        <input id="corrEmail" type="email" placeholder="Your email (optional — only if you want a reply)" style="${AUTH_INPUT_STYLE}">
      </div>
      <div class="row-btns">
        <div class="pbtn" onclick="closePopover()">Cancel</div>
        <div class="pbtn primary" onclick="submitCorrection()">Submit</div>
      </div>
    </div></div>`;
}
async function submitCorrection(){
  const message = document.getElementById('corrMessage').value.trim();
  const errEl = document.getElementById('corrError');
  errEl.style.display = 'none';
  if(!message){ errEl.textContent = 'Please describe what needs fixing.'; errEl.style.display='block'; return; }
  try{
    const res = await fetch(`${API_BASE}/api/corrections`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        productId: document.getElementById('corrProduct').value || undefined,
        field: document.getElementById('corrField').value.trim() || undefined,
        message,
        submittedBy: document.getElementById('corrEmail').value.trim() || undefined,
      }),
    });
    if(!res.ok){ const d = await res.json().catch(()=>({})); errEl.textContent = d.error || 'Something went wrong — try again.'; errEl.style.display='block'; return; }
    document.getElementById('popoverRoot').innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
      <div class="popover-card" onclick="event.stopPropagation()">
        <div class="term-cat">Trust &amp; credibility</div>
        <h4>Thanks — got it ✓</h4>
        <p>Your correction has been logged for review. We don't have an automatic reply system yet, so if you left an email and it needs a response, it'll be a manual follow-up.</p>
        <div class="row-btns"><div class="pbtn primary" onclick="closePopover()">Close</div></div>
      </div></div>`;
  }catch(e){
    errEl.textContent = "Couldn't reach the server — is the backend running?";
    errEl.style.display = 'block';
  }
}

/* ===================== DATA (loaded from the API) =====================
 * These used to be hardcoded arrays. They're now populated at
 * startup by loadAllData() below, which fetches from the backend
 * API (see /backend in this project). Every render function further
 * down the file still just reads CATS/PRODUCTS/TERMS as plain
 * in-memory arrays — nothing else in the app had to change.
 *
 * SPEC SCHEMA (normalized) — now enforced server-side by
 * backend/import_data.py, not just documented here. See that file
 * for the authoritative mapping of CSV columns -> quick/full specs
 * per category.
 */
let CATS = [];
let PRODUCTS = [];
let TERMS = [];

// Point this at your deployed API. Empty string = same origin as this
// page (the default — matches `node server.js` serving both the API
// and this file). Set it to e.g. 'https://api.yoursite.com' if the
// frontend and backend are hosted separately.
const API_BASE = '';

async function loadAllData(){
  const [cats, products, terms] = await Promise.all([
    fetch(`${API_BASE}/api/categories`).then(r=>{ if(!r.ok) throw new Error('categories '+r.status); return r.json(); }),
    fetch(`${API_BASE}/api/products?limit=1000`).then(r=>{ if(!r.ok) throw new Error('products '+r.status); return r.json(); }),
    fetch(`${API_BASE}/api/terms`).then(r=>{ if(!r.ok) throw new Error('terms '+r.status); return r.json(); }),
  ]);
  CATS = cats; PRODUCTS = products; TERMS = terms;
}

/* ===================== STATE / ROUTING ===================== */
let state = { view:'home', payload:null };
let navStack = []; // history of {view, payload} for the page-level Back button
let _syncingFromHash = false; // guards against a feedback loop when we set location.hash ourselves

function hashFor(view, payload){
  return '#' + view + (payload ? '/' + encodeURIComponent(payload) : '');
}
function parseHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  if(!raw) return { view:'home', payload:null };
  const parts = raw.split('/');
  const view = parts[0] || 'home';
  const payload = parts[1] ? decodeURIComponent(parts[1]) : null;
  return document.getElementById('view-'+view) ? { view, payload } : { view:'home', payload:null };
}
const VIEW_TITLES = {
  home: 'BUY WISELY — Know What You\'re Buying',
  compare: 'Compare — Buy Wisely',
  ask: 'Ask — Buy Wisely',
  match: 'Find My Match — Buy Wisely',
  saved: 'Saved — Buy Wisely',
};
function updatePageTitle(view, payload){
  if(view==='product' && payload){
    const p = PRODUCTS.find(x=>x.id===payload);
    document.title = p ? `${p.brand} ${p.name} — Buy Wisely` : 'Product — Buy Wisely';
    return;
  }
  document.title = VIEW_TITLES[view] || 'Buy Wisely';
}
// Minimal, self-hosted pageview logging (no third-party analytics account
// needed) — see /api/pageview in server.js and dbPageviewSummary(). Fire-
// and-forget: a failed/slow analytics call should never block navigation.
function logPageview(view, payload){
  fetch(`${API_BASE}/api/pageview`, {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ view, payload: payload || null }),
  }).catch(()=>{});
}
function go(view, payload, _isBack){
  closePopover(); // never leave a modal (e.g. "reset link sent") stranded on top of the next view
  if(!_isBack && (state.view !== view || state.payload !== payload)){
    navStack.push({ view: state.view, payload: state.payload });
  }
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hide'));
  document.getElementById('view-'+view).classList.remove('hide');
  document.getElementById('mobileMenu').classList.add('hide');
  document.querySelectorAll('nav.primary a').forEach(a=>a.classList.remove('active'));
  state.view = view;
  state.payload = payload || null;
  window.scrollTo({top:0, behavior:'smooth'});
  if(view==='product' && payload) renderProduct(payload);
  if(view==='match' && !_isBack) renderWizard();
  if(view==='ask') { renderCatTabs(); renderTerms(''); }
  if(view==='compare'){
    if(payload && payload.includes(',')){
      const [pa, pb] = payload.split(',');
      if(PRODUCTS.find(p=>p.id===pa) && PRODUCTS.find(p=>p.id===pb)){
        populateCompareSelects();
        document.getElementById('cmpA').value = pa;
        document.getElementById('cmpB').value = pb;
        renderCompare();
      } else { populateCompareSelects(); }
    } else if(!document.getElementById('cmpA').value) {
      populateCompareSelects();
    }
  }
  if(view==='saved') renderSaved();
  if(view==='reset' && payload) renderResetView(payload);
  updatePageTitle(view, payload);
  logPageview(view, payload);
  // Keep the URL in sync so views are shareable/bookmarkable, without fighting the hashchange listener below
  if(!_syncingFromHash){
    const target = hashFor(view, payload);
    if(location.hash !== target) location.hash = target;
  }
}
function goBack(){
  const prev = navStack.pop();
  if(prev){ go(prev.view, prev.payload, true); }
  else { go('home', null, true); }
}
function toggleMobileMenu(){ document.getElementById('mobileMenu').classList.toggle('hide'); }

// Restores the right view on page refresh/shared link, and supports the browser's own back/forward buttons
window.addEventListener('hashchange', ()=>{
  const { view, payload } = parseHash();
  if(view===state.view && payload===state.payload) return;
  _syncingFromHash = true;
  go(view, payload, true);
  _syncingFromHash = false;
});

/* ===================== SEARCH INTENT (typo-tolerant, phrasing-tolerant) ===================== */
// Small edit-distance function so "iphone17" / "ram" / "torqe" etc. still match despite typos.
function levenshtein(a, b){
  if(a===b) return 0;
  const al=a.length, bl=b.length;
  if(al===0) return bl; if(bl===0) return al;
  let prev = Array(bl+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=al;i++){
    const cur=[i];
    for(let j=1;j<=bl;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1 + Math.min(prev[j-1], prev[j], cur[j-1]);
    }
    prev = cur;
  }
  return prev[bl];
}
function normalize(s){
  return (s||'').toLowerCase().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
}
// token-overlap + fuzzy-token score between a query and a target string; higher is better
function fuzzyScore(query, target){
  const qTokens = normalize(query).split(' ').filter(Boolean);
  const tTokens = normalize(target).split(' ').filter(Boolean);
  if(!qTokens.length || !tTokens.length) return 0;
  let score = 0;
  qTokens.forEach(qt=>{
    let best = 0;
    tTokens.forEach(tt=>{
      if(qt===tt){ best = Math.max(best, 3); return; }
      if(tt.includes(qt) || qt.includes(tt)){ best = Math.max(best, 2); return; }
      if(qt.length>=3 && tt.length>=3){
        const d = levenshtein(qt, tt);
        const tolerance = Math.max(1, Math.floor(Math.min(qt.length,tt.length)/4));
        if(d<=tolerance) best = Math.max(best, 1.5);
      }
    });
    score += best;
  });
  return score / qTokens.length; // normalized so longer queries aren't unfairly boosted
}
function findBestProduct(query){
  let best=null, bestScore=0;
  PRODUCTS.forEach(p=>{
    const s = fuzzyScore(query, p.brand+' '+p.name);
    if(s>bestScore){ bestScore=s; best=p; }
  });
  return bestScore>=1.1 ? best : null; // require a reasonably confident match
}
function findBestTerm(query){
  let best=null, bestScore=0;
  TERMS.forEach(t=>{
    const s = fuzzyScore(query, t.term);
    if(s>bestScore){ bestScore=s; best=t; }
  });
  return bestScore>=1.1 ? best : null;
}
// phrasing families so "cheapest", "affordable", "top rated" etc. all route the same as "best"
const ASK_PATTERNS = /^(what('?s| is| are| does)?|whats|define|explain|meaning of|difference between)\b|\bmean(s|ing)?\??$/i;
const RECOMMEND_PATTERNS = /\b(best|cheap(est)?|affordable|budget|top rated|recommend|suggest|which .* should i|under\s*(rs\.?|inr|pkr|\$)?\s*\d)/i;
const VS_PATTERNS = /\bvs\.?\b|\bversus\b|\bcompared? to\b/i;

function runSearch(q){
  q = (q||'').trim();
  if(!q) return;
  document.getElementById('suggestPanel').innerHTML='';
  const lower = q.toLowerCase();

  // 1. "X vs Y" style comparisons — split on vs/versus/compared to, fuzzy-match each side
  if(VS_PATTERNS.test(lower)){
    const parts = q.split(VS_PATTERNS);
    if(parts.length>=2){
      const pa = findBestProduct(parts[0]);
      const pb = findBestProduct(parts[1]);
      go('compare');
      populateCompareSelects(pa ? pa.cat : undefined);
      if(pa) document.getElementById('cmpA').value = pa.id;
      if(pb) document.getElementById('cmpB').value = pb.id;
      renderCompare();
      return;
    }
  }

  // 2. "What is X" / "define X" / "X meaning" style — route to Ask, fuzzy-matched
  if(ASK_PATTERNS.test(lower)){
    go('ask');
    document.getElementById('askSearch').value = q;
    renderTerms(q);
    return;
  }

  // 3. "best / cheapest / affordable / under budget" style — route to Find My Match
  if(RECOMMEND_PATTERNS.test(lower)){
    go('match');
    return;
  }

  // 4. Otherwise, try a confident fuzzy product match first, then a fuzzy term match, then fall back to Ask
  const directProduct = findBestProduct(q);
  if(directProduct){ go('product', directProduct.id); return; }

  const directTerm = findBestTerm(q);
  if(directTerm){
    go('ask'); document.getElementById('askSearch').value = q; renderTerms(q);
    return;
  }

  go('ask'); document.getElementById('askSearch').value = q; renderTerms(q);
}

function renderSuggest(v){
  const panel = document.getElementById('suggestPanel');
  if(!v || v.length<2){ panel.innerHTML=''; return; }
  let rows=[];
  PRODUCTS.map(p=>({p, s:fuzzyScore(v, p.brand+' '+p.name)}))
    .filter(x=>x.s>=1)
    .sort((a,b)=>b.s-a.s)
    .slice(0,4)
    .forEach(({p})=>{
      rows.push(`<div class="suggest-row" onclick="go('product','${p.id}')"><span>${p.brand} ${p.name}</span><span class="suggest-tag">PRODUCT</span></div>`);
    });
  TERMS.map(t=>({t, s:fuzzyScore(v, t.term)}))
    .filter(x=>x.s>=1)
    .sort((a,b)=>b.s-a.s)
    .slice(0,3)
    .forEach(({t})=>{
      rows.push(`<div class="suggest-row" onclick="document.getElementById('heroSearch').value='What is ${t.term}?';runSearch('What is ${t.term}?')"><span>What is ${t.term}?</span><span class="suggest-tag" style="color:#A6531C;background:#F0DCC8;">ASK</span></div>`);
    });
  panel.innerHTML = rows.length ? `<div class="suggest-panel">${rows.join('')}</div>` : '';
}
document.addEventListener('click', e=>{
  if(!e.target.closest('.search-shell')) document.getElementById('suggestPanel').innerHTML='';
});

/* ===================== HOME RENDER ===================== */
function money(n){ return CURRENCY.symbol + ' ' + n.toLocaleString(CURRENCY.locale); }
function productIllus(p, size){
  size = size || 100;
  if(p.image){
    return `<img class="pillus" src="/${p.image}" alt="${p.brand} ${p.name}" style="width:${size}px;height:${size}px;object-fit:cover;background:${p.color};" loading="lazy">`;
  }
  const glyphs = {phones:'▯', laptops:'▭', bikes:'◫', cars:'▬'};
  return `<div class="pillus" style="width:${size}px;height:${size}px;background:${p.color};font-size:${size*0.4}px;color:rgba(0,0,0,.28)">${glyphs[p.cat]||'▢'}</div>`;
}
function renderTrending(){
  // Picks one pair per category from whatever's actually loaded, rather than
  // hardcoded IDs — the dataset now comes from the API and can change size/content.
  const pairs = [];
  CATS.forEach(c=>{
    const inCat = PRODUCTS.filter(p=>p.cat===c.id);
    if(inCat.length>=2) pairs.push([inCat[0], inCat[1]]);
  });
  document.getElementById('trendGrid').innerHTML = pairs.map(([pa,pb])=>{
    return `<div class="trend-card" onclick="openCompareFor('${pa.id}','${pb.id}')">
      <div class="vs-row">${productIllus(pa,52)}<span class="vs-x">VS</span>${productIllus(pb,52)}</div>
      <div class="names">${pa.brand} vs ${pb.brand}</div>
      <div class="cat">${pa.name} · ${pb.name}</div>
    </div>`;
  }).join('');
}
function openCompareFor(a,b){
  go('compare'); populateCompareSelects();
  document.getElementById('cmpA').value=a; document.getElementById('cmpB').value=b; renderCompare();
}
function renderCategories(){
  document.getElementById('catGrid').innerHTML = CATS.map(c=>`<div class="cat-card" onclick="filterCategory('${c.id}')"><div class="ic">${c.icon}</div><div class="lb">${c.label}</div></div>`).join('');
}
function filterCategory(catId){
  go('compare'); populateCompareSelects(catId);
}
function renderQuestions(){
  const picks = ['RAM','Horsepower','OLED','CVT','Torque','EV'];
  document.getElementById('qGrid').innerHTML = picks.map(t=>`<span class="q-chip" onclick="go('ask');document.getElementById('askSearch').value='What is ${t}?';renderTerms('What is ${t}?')">What is ${t}?</span>`).join('');
}

/* ===================== COMPARE ===================== */
function populateCompareSelects(defaultCat){
  const catId = defaultCat || (PRODUCTS.find(p=>document.getElementById('cmpA')&&document.getElementById('cmpA').value===p.id)||{}).cat || 'phones';
  const opts = CATS.map(c=>`<optgroup label="${c.label}">${PRODUCTS.filter(p=>p.cat===c.id).map(p=>`<option value="${p.id}">${p.brand} ${p.name}</option>`).join('')}</optgroup>`).join('');
  const inCat = PRODUCTS.filter(p=>p.cat===catId);
  document.getElementById('cmpA').innerHTML = opts;
  document.getElementById('cmpB').innerHTML = opts;
  if(inCat[0]) document.getElementById('cmpA').value = inCat[0].id;
  if(inCat[1]) document.getElementById('cmpB').value = inCat[1].id;
  renderCompare();
}
function renderCompare(){
  const a = PRODUCTS.find(p=>p.id===document.getElementById('cmpA').value);
  const b = PRODUCTS.find(p=>p.id===document.getElementById('cmpB').value);
  if(!a||!b) return;
  let winsA = 0, winsB = 0;
  // For these specs a *lower* number is actually better (weight, price, charging time, 0-100 time, braking distance...)
  const LOWER_IS_BETTER = /weight|price|charging time|0.?-?100|braking|thickness/i;
  let html = `<div class="compare-head">
    <div class="chead-card">${productIllus(a,120)}<div class="brand">${a.brand}</div><h3>${a.name}</h3><div class="price">${money(a.price)}</div></div>
    <div class="chead-card">${productIllus(b,120)}<div class="brand">${b.brand}</div><h3>${b.name}</h3><div class="price">${money(b.price)}</div></div>
  </div><div class="compare-table">`;
  const sections = Array.from(new Set([...Object.keys(a.specs), ...Object.keys(b.specs)]));
  sections.forEach(sec=>{
    html += `<div class="ct-section">${sec}</div>`;
    const keys = Array.from(new Set([...Object.keys(a.specs[sec]||{}), ...Object.keys(b.specs[sec]||{})]));
    keys.forEach(k=>{
      const va = (a.specs[sec]||{})[k] || '—';
      const vb = (b.specs[sec]||{})[k] || '—';
      const compareCtx = `${a.brand} ${a.name.split(' ')[0]}: ${va} · ${b.brand} ${b.name.split(' ')[0]}: ${vb}`.replace(/'/g,'');
      const na = numFrom(va), nb = numFrom(vb);
      let badgeA = '', badgeB = '';
      if(na!=null && nb!=null && na!==nb){
        const aWins = LOWER_IS_BETTER.test(k) ? na<nb : na>nb;
        if(aWins){ badgeA = `<span class="spec-badge win">1</span>`; badgeB = `<span class="spec-badge lose">0</span>`; winsA++; }
        else { badgeB = `<span class="spec-badge win">1</span>`; badgeA = `<span class="spec-badge lose">0</span>`; winsB++; }
      }
      html += `<div class="ct-row"><div class="ct-key">${k}<span class="info-i" onclick="showTermPopover('${k.replace(/'/g,"")}', null, '${compareCtx}')">i</span></div><div class="ct-val">${va}${badgeA}</div><div class="ct-val">${vb}${badgeB}</div></div>`;
    });
  });
  html += `</div>`;
  html += `<div class="compare-total">
    <div class="tot-key">Specs won</div>
    <div class="tot-val ${winsA>winsB?'win':winsA<winsB?'lose':'tie'}">${winsA}</div>
    <div class="tot-val ${winsB>winsA?'win':winsB<winsA?'lose':'tie'}">${winsB}</div>
  </div>`;
  html += `
  <div style="display:flex;gap:12px;margin-top:24px;">
    <button class="w-btn" onclick="go('product','${a.id}')" style="flex:1;">View ${a.brand} ${a.name.split(' ')[0]} →</button>
    <button class="w-btn" onclick="go('product','${b.id}')" style="flex:1;">View ${b.brand} ${b.name.split(' ')[0]} →</button>
  </div>`;
  document.getElementById('compareOut').innerHTML = html;
}

/* ===================== ASK / EXPLANATIONS ===================== */
function renderCatTabs(){
  const cats = ['All', ...Array.from(new Set(TERMS.map(t=>t.cat)))];
  document.getElementById('catTabs').innerHTML = cats.map((c,i)=>`<span class="cat-tab ${i===0?'active':''}" onclick="filterTermCat('${c}',this)">${c}</span>`).join('');
}
let activeTermCat = 'All';
function filterTermCat(c, el){
  activeTermCat = c;
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderTerms(document.getElementById('askSearch').value);
}
function renderTerms(q){
  q = (q||'').toLowerCase().replace(/what (is|does)|mean|\?/g,'').trim();
  let list = TERMS.filter(t=> (activeTermCat==='All'||t.cat===activeTermCat) && (!q || t.term.toLowerCase().includes(q)));
  if(list.length===0) list = TERMS.filter(t=>activeTermCat==='All'||t.cat===activeTermCat);
  document.getElementById('termGrid').innerHTML = list.map(t=>`<div class="term-card" onclick="showTermPopover('${t.term.replace(/'/g,"")}')"><div class="t">${t.term}</div><div class="c">${t.cat}</div></div>`).join('');
}
function showTermPopover(termName, productContext, compareContext){
  let t = TERMS.find(x=>x.term.toLowerCase()===termName.toLowerCase()) || TERMS.find(x=>termName.toLowerCase().includes(x.term.toLowerCase().split(' ')[0].toLowerCase()));
  const root = document.getElementById('popoverRoot');
  if(!t){
    root.innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
      <div class="popover-card">
        <h4>${termName}</h4>
        <p style="color:var(--fg-soft)">Information unavailable — we don't have a plain-language explanation for this term yet.</p>
        <div class="row-btns"><div class="pbtn primary" onclick="closePopover()">Close</div></div>
      </div></div>`;
    return;
  }
  root.innerHTML = `<div class="popover-backdrop" onclick="closePopover(event)">
    <div class="popover-card" onclick="event.stopPropagation()">
      <div class="term-cat">${t.cat}</div>
      <h4>What is ${t.term}?</h4>
      <p>${t.def}</p>
      ${productContext ? `<div class="ctx">This product's value: <strong>${productContext}</strong></div>` : ''}
      ${compareContext ? `<div class="ctx">${compareContext}</div>` : ''}
      <div class="row-btns">
        <div class="pbtn" onclick="closePopover();go('ask');document.getElementById('askSearch').value='';renderTerms('')">Still confused? Ask more</div>
        <div class="pbtn primary" onclick="closePopover()">Got it</div>
      </div>
    </div></div>`;
}
function closePopover(e){
  if(e && e.target && !e.target.classList.contains('popover-backdrop')) return;
  document.getElementById('popoverRoot').innerHTML='';
}

/* ===================== FIND MY MATCH ===================== */
let wizard = { step:1, cat:null, budgetMax:200000, purpose:null, priorities:[] };
const PURPOSES = {
  phones:['General use','Photography','Gaming','Business'],
  laptops:['University','Programming','Gaming','Editing','Business'],
  bikes:['Daily commute','Delivery/work','Long distance','Performance'],
  cars:['Daily commute','Family','Long distance','Performance']
};
const PRIORITIES = ['Performance','Price','Battery','Camera','Durability','Design','Reliability','Fuel economy'];

function renderWizard(){
  wizard = { step:1, cat:null, budgetMax:200000, purpose:null, priorities:[] };
  drawWizard();
}
function drawProgress(){
  document.getElementById('wProgress').innerHTML = [1,2,3,4].map(i=>`<div class="${i<=wizard.step?'done':''}"></div>`).join('');
}
function drawWizard(){
  drawProgress();
  const body = document.getElementById('wizardBody');
  if(wizard.step===1){
    body.innerHTML = `<div class="w-step"><h2>What are you looking for?</h2><p class="hint">Pick a category to get started.</p>
      <div class="opt-grid">${CATS.map(c=>`<div class="opt-card ${wizard.cat===c.id?'sel':''}" onclick="wizard.cat='${c.id}';drawWizard()">${c.icon} ${c.label}</div>`).join('')}</div>
      <div class="w-nav"><span></span><button class="w-btn primary" onclick="wizardNext()" ${!wizard.cat?'disabled style="opacity:.4"':''}>Continue →</button></div>
    </div>`;
  } else if(wizard.step===2){
    body.innerHTML = `<div class="w-step"><h2>What's your budget?</h2><p class="hint">Set a maximum you're comfortable spending.</p>
      <div class="budget-box"><div class="budget-val" id="budgetLabel">${money(wizard.budgetMax)}</div>
      <input type="range" min="20000" max="15000000" step="10000" value="${wizard.budgetMax}" oninput="wizard.budgetMax=+this.value;document.getElementById('budgetLabel').textContent=money(wizard.budgetMax)"></div>
      <div class="w-nav"><button class="w-btn" onclick="wizardBack()">← Back</button><button class="w-btn primary" onclick="wizardNext()">Continue →</button></div>
    </div>`;
  } else if(wizard.step===3){
    const opts = PURPOSES[wizard.cat]||[];
    body.innerHTML = `<div class="w-step"><h2>What will you mainly use it for?</h2><p class="hint">This helps us weigh the right specifications.</p>
      <div class="opt-grid">${opts.map(o=>`<div class="opt-card ${wizard.purpose===o?'sel':''}" onclick="wizard.purpose='${o}';drawWizard()">${o}</div>`).join('')}</div>
      <div class="w-nav"><button class="w-btn" onclick="wizardBack()">← Back</button><button class="w-btn primary" onclick="wizardNext()" ${!wizard.purpose?'disabled style="opacity:.4"':''}>Continue →</button></div>
    </div>`;
  } else if(wizard.step===4){
    body.innerHTML = `<div class="w-step"><h2>What matters most to you?</h2><p class="hint">Select one or more priorities.</p>
      <div style="text-align:center;margin-top:20px;">${PRIORITIES.map(p=>`<span class="priority-chip ${wizard.priorities.includes(p)?'sel':''}" onclick="togglePriority('${p}')">${p}</span>`).join('')}</div>
      <div class="w-nav"><button class="w-btn" onclick="wizardBack()">← Back</button><button class="w-btn primary" onclick="showMatchResults()" ${wizard.priorities.length===0?'disabled style="opacity:.4"':''}>See my matches →</button></div>
    </div>`;
  }
}
function togglePriority(p){
  const i = wizard.priorities.indexOf(p);
  if(i>-1) wizard.priorities.splice(i,1); else wizard.priorities.push(p);
  drawWizard();
}
function wizardNext(){ wizard.step++; drawWizard(); }
function wizardBack(){ wizard.step--; drawWizard(); }
/* Pull a plain number out of a spec string like "16GB" or "45 km/l" */
function numFrom(str){
  if(str==null) return null;
  const m = String(str).match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}
/* Only priorities backed by an actual field in this mock dataset can rank results.
   Design/Durability/Reliability aren't measured here, so they stay selectable
   but are called out as not affecting order, rather than silently pretending to. */
const PRIORITY_SCORERS = {
  'Price': p => -p.price,
  'Battery': p => numFrom(p.quick.Battery) ?? numFrom(p.specs.Battery && p.specs.Battery.Battery),
  'Fuel economy': p => numFrom(p.quick['Fuel economy']),
  'Performance': p => (p.cat==='phones' || p.cat==='laptops') ? numFrom(p.quick.RAM) : numFrom(p.quick.Horsepower),
  'Camera': p => numFrom(p.specs.Camera && p.specs.Camera.Cameras)
};
function scoreProducts(pool, priorities){
  const active = priorities.filter(pr => PRIORITY_SCORERS[pr]);
  if(active.length===0) return pool.map(p=>({ p, matched:[] }));
  const ranges = {};
  active.forEach(pr=>{
    const vals = pool.map(p=>PRIORITY_SCORERS[pr](p)).filter(v=>v!=null);
    ranges[pr] = { min: Math.min(...vals), max: Math.max(...vals) };
  });
  return pool.map(p=>{
    let score = 0, matched = [];
    active.forEach(pr=>{
      const v = PRIORITY_SCORERS[pr](p);
      if(v==null) return;
      const { min, max } = ranges[pr];
      score += max>min ? (v-min)/(max-min) : 1;
      matched.push(pr);
    });
    return { p, score, matched };
  }).sort((x,y)=>y.score-x.score);
}
function showMatchResults(){
  const inCat = PRODUCTS.filter(p=>p.cat===wizard.cat && p.price<=wizard.budgetMax);
  const pool = inCat.length ? inCat : PRODUCTS.filter(p=>p.cat===wizard.cat);
  const ranked = scoreProducts(pool, wizard.priorities);
  const results = ranked.slice(0,3);
  const body = document.getElementById('wizardBody');
  document.getElementById('wProgress').innerHTML = [1,2,3,4].map(()=>`<div class="done"></div>`).join('');
  if(results.length===0){
    body.innerHTML = `<div class="w-step"><h2>No matches yet</h2><p class="hint">Try widening your budget.</p><div class="w-nav"><button class="w-btn" onclick="renderWizard()">Start over</button></div></div>`;
    return;
  }
  body.innerHTML = `<h2 style="text-align:center;">Your matches</h2>
    <p class="hint">Based on a ${money(wizard.budgetMax)} budget, ${wizard.purpose.toLowerCase()} use, and ${wizard.priorities.join(', ').toLowerCase()} as priorities.</p>
    <div style="margin-top:26px;">${results.map((r,i)=>matchCard(r.p,i,r.matched)).join('')}</div>
    <div class="w-nav"><button class="w-btn" onclick="renderWizard()">↺ Adjust preferences</button><span></span></div>`;
}
function matchCard(p, idx, matchedPriorities){
  matchedPriorities = matchedPriorities || [];
  const unmeasured = wizard.priorities.filter(pr=>!matchedPriorities.includes(pr));
  const specPills = Object.entries(p.quick).slice(0,4).map(([k,v])=>`<span class="spec-pill">${k}: ${v}</span>`).join('');
  const rankNote = matchedPriorities.length
    ? `It ranked highest among these options for ${matchedPriorities.join(', ').toLowerCase()}.`
    : `None of your selected priorities are measured in this dataset, so results are shown by budget fit — review the full specs before deciding.`;
  const unmeasuredNote = unmeasured.length
    ? ` (${unmeasured.join(', ').toLowerCase()} ${unmeasured.length>1?'aren\u2019t':'isn\u2019t'} tracked in this dataset, so ${unmeasured.length>1?'they didn\u2019t':'it didn\u2019t'} affect ranking.)`
    : '';
  const why = `You set a budget up to ${money(wizard.budgetMax)}, ${wizard.purpose.toLowerCase()} as your main use, and prioritised ${wizard.priorities.join(', ').toLowerCase()}. The ${p.name} is priced at ${money(p.price)} and its listed specifications (${Object.entries(p.quick).slice(0,3).map(([k,v])=>`${k.toLowerCase()}: ${v}`).join(', ')}) are relevant to those requirements. ${rankNote}${unmeasuredNote}`;
  return `<div class="result-card">
    ${productIllus(p,110)}
    <div>
      <div class="brand">${p.brand}</div>
      <h3>${p.name}</h3>
      <div class="price">${money(p.price)}</div>
      <div class="spec-pills">${specPills}</div>
      <span class="why-btn" onclick="toggleWhy(${idx})">Why this? ▾</span>
      <div class="why-box" id="why${idx}">${why}</div>
      <div class="rc-actions">
        <span class="a primary" onclick="go('product','${p.id}')">View product</span>
        <span class="a" onclick="openCompareFor('${p.id}','${PRODUCTS.find(x=>x.cat===p.cat && x.id!==p.id)?.id||p.id}')">Compare</span>
        <span class="a" onclick="toggleSave('${p.id}',this)">${isSaved(p.id)?'♥ Saved':'♡ Save'}</span>
      </div>
    </div>
  </div>`;
}
function toggleWhy(i){ document.getElementById('why'+i).classList.toggle('open'); }

/* ===================== PRODUCT DETAIL ===================== */
function renderProduct(id){
  const p = PRODUCTS.find(x=>x.id===id);
  if(!p) return;
  const similar = PRODUCTS.filter(x=>x.cat===p.cat && x.id!==p.id).slice(0,2);
  const allSpecSections = Object.entries(p.specs).map(([sec, kv])=>{
    const rows = Object.entries(kv).map(([k,v])=>`<div class="ct-row" style="grid-template-columns:1fr 1fr;"><div class="ct-key">${k}<span class="info-i" onclick="showTermPopover('${k.replace(/'/g,"")}','${(v+'').replace(/'/g,"")}')">i</span></div><div class="ct-val">${v}</div></div>`).join('');
    return `<div class="ct-section">${sec}</div>${rows}`;
  }).join('');
  const quickHtml = Object.entries(p.quick).map(([k,v])=>`<div class="qs-item"><div class="k">${k}<span class="info-i" onclick="showTermPopover('${k.replace(/'/g,"")}','${(v+'').replace(/'/g,"")}')">i</span></div><div class="v">${v}</div></div>`).join('');
  document.getElementById('productOut').innerHTML = `
    <div class="view">
      <div class="crumb"><span class="crumb-left"><a href="#" onclick="go('home');return false;">Home</a> / <a href="#" onclick="go('compare');return false;">${CATS.find(c=>c.id===p.cat).label}</a> / ${p.name}</span><button class="back-btn" onclick="goBack()"><span class="arrow">←</span>Back</button></div>
      <div class="pdp-top">
        <div class="pdp-media">
          ${productIllus(p,'100%')}
          <div class="pdp-thumbs">
            <div class="th active">Front</div><div class="th">Back</div><div class="th">Side</div><div class="th">Detail</div>
          </div>
        </div>
        <div class="pdp-info">
          <div class="brand">${p.brand}</div>
          <h1>${p.name}</h1>
          <div class="price">${money(p.price)}</div>
          <div class="meta">Price checked today · Source: manufacturer listing</div>
          <div class="variant-row"><div class="lbl">Color</div>
            <div class="swatches"><span class="swatch sel" style="background:${p.color}"></span></div>
          </div>
          ${p.affiliateUrl ? `
          <div class="pdp-cta">
            <a class="w-btn primary" href="${API_BASE}/api/clickout/${p.id}" target="_blank" rel="sponsored noopener" style="flex:1;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;">View deal →</a>
          </div>
          <div style="font-size:11.5px;color:var(--fg-soft);margin-top:7px;">Affiliate link — we may earn a commission at no extra cost to you. <a href="#" onclick="showTrustInfo('affiliate');return false;" style="color:var(--accent);">Learn more</a></div>
          ` : ''}
          <div class="pdp-cta" style="margin-top:${p.affiliateUrl?'14px':'0'};">
            <button class="w-btn ${p.affiliateUrl?'':'primary'}" onclick="openCompareFor('${p.id}','${similar[0]?similar[0].id:p.id}')" style="flex:1;">Compare</button>
            <button class="w-btn" onclick="go('match')" style="flex:1;">Find My Match</button>
          </div>
          <div class="pdp-cta" style="margin-top:10px;">
            <button class="w-btn ${isSaved(p.id)?'saved':''}" onclick="toggleSave('${p.id}',this)" style="flex:1;">${isSaved(p.id)?'♥ Saved':'♡ Save'}</button>
            <button class="w-btn" onclick="copyShareLink(this,'product','${p.id}')" style="flex:1;">🔗 Share</button>
          </div>
        </div>
      </div>

      <div class="qs-grid">${quickHtml}</div>

      <div class="full-specs">
        <div class="fs-toggle" onclick="document.getElementById('fullSpecBlock').classList.toggle('hide')">View all specifications ↓</div>
        <div id="fullSpecBlock" class="compare-table hide" style="margin-top:12px;">${allSpecSections}</div>
      </div>

      <div style="margin-top:44px;">
        <div class="section-head"><h2 style="font-size:19px;">Similar products</h2></div>
        <div class="trend-row" style="grid-template-columns:repeat(2,1fr);">
          ${similar.map(s=>`<div class="trend-card" onclick="go('product','${s.id}')" style="display:flex;gap:14px;align-items:center;text-align:left;">${productIllus(s,64)}<div><div style="font-weight:700;font-size:14.5px;">${s.brand} ${s.name}</div><div style="color:var(--accent);font-weight:700;font-size:13.5px;margin-top:3px;">${money(s.price)}</div></div></div>`).join('')}
        </div>
      </div>

      <div class="source-note">
        <span>Source: ${(p.source&&p.source.name)||'Unknown'} · Not independently verified</span>
        <span>Last updated: ${p.source&&p.source.updatedAt ? new Date(p.source.updatedAt).toLocaleDateString() : 'Unknown'} · <a href="#" onclick="showCorrectionForm('${p.id}');return false;" style="color:var(--accent);">Report an issue</a></span>
      </div>
    </div>`;
}

/* ===================== INIT ===================== */
(async function init(){
  const loader = document.getElementById('dataLoading');
  const errorBox = document.getElementById('dataError');
  try{
    await loadAllData();
  }catch(err){
    console.error('Failed to load data from API:', err);
    if(loader) loader.classList.add('hide');
    if(errorBox) errorBox.classList.remove('hide');
    return;
  }
  if(loader) loader.classList.add('hide');
  renderTrending();
  renderCategories();
  renderQuestions();
  populateCompareSelects();
  renderAds();
  await checkAuth(); // sets currentUser + loads savedIds from server or localStorage accordingly
  (function initFromUrl(){
    const initial = parseHash();
    if(initial.view !== 'home'){
      _syncingFromHash = true;
      go(initial.view, initial.payload, true);
      _syncingFromHash = false;
    } else {
      logPageview('home', null); // go() wasn't called for the default landing view, so log it here
    }
  })();
})();
