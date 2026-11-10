'use strict';
// Hoodie Combo Lab. Any blank color on three pieces (body, sleeves, pocket), 30 rendered angles.
// Each angle has a grey "shade" render and a flat id map; the page multiplies color * shade per pixel.

const STEPS = 30, W = 800, H = 600, ALBEDO = 0.8;
const GROUPS = [['Body', 'hood and waist band follow'], ['Sleeves', 'cuffs follow'], ['Pocket', '']];
const KICKS = ['#ff9000', '#0089ff', '#0089ff'];
// region id (red channel of id_NN.png) -> group index. 80 is the Kicks patch, drawn as rendered.
const ID2G = new Int8Array(256).fill(-1);
[10, 20, 30].forEach(i => ID2G[i] = 0); [40, 50].forEach(i => ID2G[i] = 1); ID2G[60] = 2;
const PATCH = 80;

const $ = s => document.querySelector(s);
const state = { c: [...KICKS], sel: 0, pal: 0, angle: 0, spin: true, drag: null, seed: 1, patch: false };
let PALS = [];

// ---- color math (linear light)
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const L2S = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) { const c = i / 4095; L2S[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
const hexLin = h => { const n = parseInt(h.slice(1), 16); return [S2L[n >> 16 & 255], S2L[n >> 8 & 255], S2L[n & 255]]; };
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s, l };
}
const sortKey = c => { const { h, s, l } = hsl(c.h); return s < 0.12 ? [0, -l] : [1, h, -l]; };
const sorted = cs => [...cs].sort((a, b) => { const x = sortKey(a), y = sortKey(b); return x[0] - y[0] || x[1] - y[1] || (x[2] || 0) - (y[2] || 0); });
const colorName = hex => { for (const p of PALS) for (const c of p.colors) if (c.h.toLowerCase() === hex.toLowerCase()) return c.n; return hex; };

// ---- load the 30 angles
const frames = new Array(STEPS);
let loaded = 0;
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; }); }
const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
const sx = scratch.getContext('2d', { willReadFrequently: true });
function px(img) { sx.clearRect(0, 0, W, H); sx.drawImage(img, 0, 0, W, H); return sx.getImageData(0, 0, W, H).data; }
async function loadFrame(i) {
  const n = String(i).padStart(2, '0');
  const [a, b] = await Promise.all([loadImg(`assets/spin/shade_${n}.png`), loadImg(`assets/spin/id_${n}.png`)]);
  const shade = new Uint8ClampedArray(px(a)); const idd = px(b);
  // ids are multiples of 10; Blender's output dither moves them by 1, so snap back
  const ids = new Uint8Array(W * H); for (let k = 0; k < ids.length; k++) ids[k] = idd[k * 4 + 3] ? Math.round(idd[k * 4] / 10) * 10 : 0;
  // a few edge pixels have color but no id: borrow the nearest id within 3 px
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (ids[k] || !shade[k * 4 + 3]) continue;
    for (let r = 1; r <= 3 && !ids[k]; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && ids[yy * W + xx]) { ids[k] = ids[yy * W + xx]; break; } }
  }
  // shade with the patch painted out: each patch pixel takes the average of the nearest plain pixels left, right, above, below
  const ns = new Uint8ClampedArray(shade);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (ids[k] !== PATCH) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let s = 1; s < 60; s++) { const xx = x + dx * s, yy = y + dy * s; if (xx < 0 || yy < 0 || xx >= W || yy >= H) break; const j = yy * W + xx; if (ids[j] !== PATCH && ids[j]) { r += shade[j * 4]; g += shade[j * 4 + 1]; b += shade[j * 4 + 2]; n++; break; } }
    }
    if (n) { ns[k * 4] = r / n; ns[k * 4 + 1] = g / n; ns[k * 4 + 2] = b / n; }
  }
  frames[i] = { shade, ns, ids };
  loaded++;
}

// ---- paint one frame. step > 1 samples every step-th pixel (thumbnails)
function paint(ctx, f, combo, step) {
  const w = Math.floor(W / step), h = Math.floor(H / step);
  const lin = combo.map(hexLin);
  const img = ctx.createImageData(w, h), out = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * step) * W + x * step, o = (y * w + x) * 4, a = f.shade[i * 4 + 3];
    if (!a) continue;
    const id = f.ids[i], g = ID2G[id], asPatch = id === PATCH && state.patch;
    const src = id === PATCH && !state.patch ? f.ns : f.shade;   // patch off: use the shading with the patch painted out
    const sr = S2L[src[i * 4]], sg = S2L[src[i * 4 + 1]], sb = S2L[src[i * 4 + 2]];
    let R = sr, G = sg, B = sb;
    if (!asPatch) { const c = lin[g < 0 ? 0 : g]; R = sr / ALBEDO * c[0]; G = sg / ALBEDO * c[1]; B = sb / ALBEDO * c[2]; }
    out[o] = L2S[Math.min(4095, (R * 4095) | 0)]; out[o + 1] = L2S[Math.min(4095, (G * 4095) | 0)]; out[o + 2] = L2S[Math.min(4095, (B * 4095) | 0)]; out[o + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

// ---- UI
const cv = $('#cv'), cx = cv.getContext('2d');
function buildPieces() {
  const box = $('#pieces'); box.innerHTML = '';
  GROUPS.forEach(([name, note], gi) => {
    const b = document.createElement('button'); b.className = 'piece'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', state.sel === gi);
    b.innerHTML = `<span class="chip" style="background:${state.c[gi]}"></span><span class="t"><b>${name}</b><span>${colorName(state.c[gi])}</span></span>`;
    b.onclick = () => { state.sel = gi; buildPieces(); $('#picking').textContent = name.toLowerCase(); };
    box.appendChild(b);
  });
}
function buildSwatches() {
  const p = PALS[state.pal], box = $('#swatches'); box.innerHTML = '';
  sorted(p.colors).forEach(c => {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = c.h; b.title = `${c.n} ${c.h}`; b.setAttribute('aria-label', `${c.n} ${c.h}`);
    b.onclick = () => { state.c[state.sel] = c.h; changed(); };
    box.appendChild(b);
  });
  const n = BigInt(p.colors.length);
  $('#count').innerHTML = `<b>${p.colors.length}</b> colors, <b>3</b> pieces = <b>${(n ** 3n).toLocaleString('en-US')}</b> hoodies`;
}
function changed() { buildPieces(); writeHash(); render(); markWall(); }
function frameIndex() { return ((Math.round(state.angle) % STEPS) + STEPS) % STEPS; }
function render() { const f = frames[frameIndex()]; if (!f) return; paint(cx, f, state.c, 1); $('#loading').hidden = true; }

// ---- combo wall: twelve generated combos from the chosen color set, all turning with the main hoodie
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function combo(r) {
  const cols = PALS[state.pal].colors.map(c => c.h), t = Math.floor(r() * 3);
  const pick = not => { let c, g = 0; do { c = cols[Math.floor(r() * cols.length)]; } while (not.includes(c) && cols.length > not.length && ++g < 30); return c; };
  const a = pick([]), b = pick([a]), c = pick([a, b]);
  return t === 0 ? [a, b, b] : t === 1 ? [a, b, c] : [a, b, a];
}
const thumbs = [];
function buildWall() {
  const wall = $('#wall'); wall.innerHTML = ''; thumbs.length = 0;
  for (let i = 0; i < 12; i++) {
    const cb = combo(rng(state.seed * 1000 + i * 7919));
    const b = document.createElement('button'); b.className = 'card'; b.setAttribute('aria-label', 'Load this combo');
    const c = document.createElement('canvas'); c.width = Math.floor(W / 3); c.height = Math.floor(H / 3); b.appendChild(c);
    const cap = document.createElement('div'); cap.className = 'cap'; cap.innerHTML = cb.map(h => `<i style="background:${h}" title="${colorName(h)}"></i>`).join('') + '<span>body · sleeves · pocket</span>';
    b.onclick = () => { state.c = [...cb]; changed(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    b._combo = cb; b._ctx = c.getContext('2d'); wall.appendChild(b); thumbs.push(b);
  }
  markWall(); paintWall();
}
function markWall() { thumbs.forEach(b => b.classList.toggle('on', b._combo.join() === state.c.join())); }
function paintWall() { const f = frames[frameIndex()]; if (!f) return; thumbs.forEach(b => paint(b._ctx, f, b._combo, 3)); }

// ---- spin, drag, keys
let last = 0, wallT = 0;
function tick(t) {
  if (state.spin && !state.drag && loaded === STEPS) state.angle = (state.angle + (t - last) * 0.006) % STEPS;
  last = t;
  const fi = frameIndex(), key = state.c.join() + state.patch;
  if (tick.fi !== fi || tick.c !== key) { tick.fi = fi; tick.c = key; render(); if (t - wallT > 120) { paintWall(); wallT = t; } }
  requestAnimationFrame(tick);
}
cv.addEventListener('pointerdown', e => { state.drag = { x: e.clientX, a: state.angle }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (state.drag) state.angle = state.drag.a - (e.clientX - state.drag.x) / cv.clientWidth * STEPS * 1.1; });
['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { if (state.drag) { state.drag = null; paintWall(); } }));
cv.tabIndex = 0;
cv.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') state.angle -= 1; if (e.key === 'ArrowRight') state.angle += 1; });
$('#spin').onclick = e => { state.spin = !state.spin; e.currentTarget.setAttribute('aria-pressed', state.spin); };
const patchBtn = $('#patch'); if (patchBtn) patchBtn.onclick = e => { state.patch = !state.patch; e.currentTarget.setAttribute('aria-pressed', state.patch); e.currentTarget.textContent = state.patch ? 'Patch on' : 'Patch off'; writeHash(); render(); paintWall(); };
$('#shuffle').onclick = () => { state.c = combo(rng(Math.floor(Math.random() * 1e9))); changed(); };
$('#reset').onclick = () => { state.c = [...KICKS]; changed(); };
$('#rewall').onclick = () => { state.seed++; buildWall(); };
$('#palette').onchange = e => { state.pal = +e.target.value; buildSwatches(); buildWall(); };
function writeHash() { history.replaceState(null, '', '#c=' + state.c.map(h => h.slice(1)).join(',') + (state.patch ? '&p=1' : '')); }
function readHash() {
  const m = /c=([0-9a-f]{6}),([0-9a-f]{6}),([0-9a-f]{6})/i.exec(location.hash); if (m) state.c = [1, 2, 3].map(i => '#' + m[i].toLowerCase());
  // the patch is not offered in the page; the renders still carry it, so a link with &p=1 shows it
  if (/p=1/.test(location.hash)) { state.patch = true; const b = $('#patch'); if (b) { b.setAttribute('aria-pressed', 'true'); b.textContent = 'Patch on'; } }
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1600); }
$('#link').onclick = async () => { writeHash(); try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch (e) { toast('Copy the address bar'); } };
$('#save').onclick = () => {
  const o = document.createElement('canvas'); o.width = W; o.height = H; const x = o.getContext('2d');
  x.fillStyle = '#f6f5f2'; x.fillRect(0, 0, W, H); x.drawImage(cv, 0, 0);
  o.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'hoodie-' + state.c.map(h => h.slice(1)).join('-') + '.png'; a.click(); toast('Saved'); }, 'image/png');
};

(async function init() {
  try { PALS = await (await fetch('data/palettes.json')).json(); }
  catch (e) { $('#loading').textContent = 'Open this through a web server (see README)'; return; }
  readHash();
  const sel = $('#palette'); PALS.forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.label; sel.appendChild(o); });
  const hf = PALS.findIndex(p => p.code === 'HF09GD'); state.pal = hf >= 0 ? hf : 0; sel.value = state.pal;
  buildPieces(); buildSwatches();
  try { await loadFrame(0); } catch (e) { $('#loading').textContent = 'Could not load the hoodie images'; return; }
  render(); buildWall();
  requestAnimationFrame(tick);
  for (let i = 1; i < STEPS; i++) loadFrame(i).catch(() => {});
})();
