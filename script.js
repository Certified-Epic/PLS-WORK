<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* script.js — Fixed compactR bug + camera tilt, clouds, parallax, better glowing connectors,
   planets visible at load, cinematic zoom (planet ~45-50% screen), nodes on surface, junctions outside.
=======
/* script.js — zoom atmosphere, node fade-in, hologram on node hover,
   junctions shown only when hovering core, fixed title card UI
>>>>>>> parent of 59e789a (Update script.js)
=======
/* script.js — zoom atmosphere, node fade-in, hologram on node hover,
   junctions shown only when hovering core, fixed title card UI
>>>>>>> parent of 59e789a (Update script.js)
=======
/* script.js
   - Updated to:
     * apply planethover underlay to ALL tier planets on actual hover
     * place nodes on tier planet surface (compact) and expand to rings when focused
     * hologram under nodes (centered, slightly larger) that fades in on node hover
     * single title card DOM for node details (fades) — prevents double details
     * tier planets spaced slightly off-line (perpendicular offsets)
     * Electrolize font used by UI/title card
     * minor optimization & throttled hover sound
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* Updated script.js — bugfix for cachedGrad initialization + same features as before.
   Replace your existing script.js with this file.
>>>>>>> parent of 650bc8e (Update script.js)
*/

const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
function resizeCanvas(){
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
<<<<<<< HEAD
  // transforms are set inside draw via ctx.setTransform equivalents
=======
  ctx.setTransform(DPR,0,0,DPR,0,0);
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* ---- UI elements (already in your index.html) ---- */
=======
/* UI + DOM */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* UI + DOM */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* ---------- UI elements ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* UI */
>>>>>>> parent of 650bc8e (Update script.js)
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const gradToggle = document.getElementById('gradToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');
const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');
const tooltipHolo = document.getElementById('tooltipHolo');
const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

<<<<<<< HEAD
<<<<<<< HEAD
/* ---- theme + cached grad ---- */
=======
/* ---------- cachedGrad (fix) ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
let cachedGrad = { accent: '#00c8ff', gradEnabled: true };
=======
/* Cached gradient object MUST be declared before any function that references it */
let cachedGrad = null;

/* caching gradients for performance */
>>>>>>> parent of 650bc8e (Update script.js)
function buildCachedGradients(){
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff').trim();
  const gradEnabled = !!(gradToggle && gradToggle.checked);
  cachedGrad = { accent, gradEnabled };
}
<<<<<<< HEAD
function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); buildCachedGradients(); }
if(colorPicker) colorPicker.addEventListener('input', e => setAccent(e.target.value));
=======

/* Accent setter (calls buildCachedGradients safely) */
function setAccent(hex){ 
  document.documentElement.style.setProperty('--accent', hex);
  buildCachedGradients();
}
<<<<<<< HEAD
colorPicker.addEventListener('input', (e)=> setAccent(e.target.value));
>>>>>>> parent of 22ab30d (Update script.js)
=======

/* wire UI to functions */
colorPicker.addEventListener('input', (e) => setAccent(e.target.value));
>>>>>>> parent of 650bc8e (Update script.js)
setAccent(colorPicker ? colorPicker.value : '#00c8ff');
<<<<<<< HEAD
if(monoToggle) monoToggle.addEventListener('change', ()=> document.documentElement.style.setProperty('--mono', monoToggle.checked ? 1 : 0));
if(transRange) transRange.addEventListener('input', ()=> state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', buildCachedGradients);

<<<<<<< HEAD
<<<<<<< HEAD
/* ---- assets preload ---- */
=======

=======
>>>>>>> parent of 59e789a (Update script.js)
if(monoToggle) monoToggle.addEventListener('change', ()=>{
=======
monoToggle.addEventListener('change', () => {
>>>>>>> parent of 650bc8e (Update script.js)
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  if(mono) tooltipHolo.classList.add('grayscale'); else tooltipHolo.classList.remove('grayscale');
});

<<<<<<< HEAD
<<<<<<< HEAD
/* preload assets */
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
if(transRange) transRange.addEventListener('input', () => state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', () => buildCachedGradients());

/* ---------- assets preload ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
transRange.addEventListener('input', () => state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', () => buildCachedGradients());

/* assets */
>>>>>>> parent of 650bc8e (Update script.js)
const IMG_PATH = 'assets/';
const ASSETS = {
  center: 'center.png',
  planet: 'planet.png',
  planethover: 'planethover.png',
  tier2: 'tier2.png', tier3: 'tier3.png', tier4: 'tier4.png', tier5: 'tier5.png',
  node: 'node.png', lock: 'lock.png', pulse: 'pulse.png',
  junction: 'junction.png', hologram: 'achievementnodehologram.png', completedTier: 'completedplanettier.png'
};
const SOUNDS = { hover: 'hover.mp3', zoom: 'zoom.mp3', bg: 'background.mp3' };

const images = {};
const sounds = {};
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
function loadImage(k,src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{ images[k]=i; res(i); }; i.onerror=()=>{ console.warn('img fail', src); res(null); }; }); }
function loadAudio(k,src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.95); sounds[k]=a; res(a); }); }
=======
=======
>>>>>>> parent of 59e789a (Update script.js)
function loadImage(k,src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{images[k]=i;res(i)}; i.onerror=()=>{ console.warn('img fail',src); res(null); }; }); }
function loadAudio(k,src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); }); }
=======

function loadImage(k, src){ return new Promise(res=>{ const i = new Image(); i.src = src; i.onload = ()=>{ images[k]=i; res(i); }; i.onerror = ()=>{ console.warn('img failed', src); res(null); }; }); }
function loadAudio(k, src){ return new Promise(res=>{ const a = new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); }); }
>>>>>>> parent of 22ab30d (Update script.js)
=======
function loadImage(key, src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{images[key]=i;res(i)}; i.onerror=()=>{console.warn('img load fail',src); res(null);} }); }
function loadAudio(key, src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (key==='bg'?0.35:0.9); sounds[key]=a; res(a); }); }
>>>>>>> parent of 650bc8e (Update script.js)

>>>>>>> parent of 59e789a (Update script.js)
const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

<<<<<<< HEAD
<<<<<<< HEAD
/* ---- data ---- */
=======
/* ---------- data ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* data load */
>>>>>>> parent of 650bc8e (Update script.js)
let achievements = { planets: [] };
async function loadData(){
  try {
    const r = await fetch('./achievements.json');
    achievements = await r.json();
    // merge saved progress
    const saved = localStorage.getItem('progress');
    if(saved){
<<<<<<< HEAD
      try{
        const prog = JSON.parse(saved);
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
=======
      try {
        const prog = JSON.parse(saved);
<<<<<<< HEAD
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=>{
>>>>>>> parent of 22ab30d (Update script.js)
=======
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
>>>>>>> parent of 650bc8e (Update script.js)
          if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
            achievements.planets[i].tiers[j].achievements[k].status = a.status;
            achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
          }
        })));
<<<<<<< HEAD
      }catch(e){ console.warn('progress parse fail',e); }
    }
  }catch(e){
<<<<<<< HEAD
<<<<<<< HEAD
    console.warn('achievements.json load failed, creating demo', e);
=======
    console.warn('cannot load achievements.json, using demo', e);
>>>>>>> parent of 59e789a (Update script.js)
=======
    console.warn('cannot load achievements.json, using demo', e);
>>>>>>> parent of 59e789a (Update script.js)
=======
      } catch(e){ console.warn('progress parse fail', e); }
    }
  } catch(e){
<<<<<<< HEAD
    console.warn('achievements.json missing; using sample', e);
>>>>>>> parent of 22ab30d (Update script.js)
=======
    console.warn('achievements.json missing or parse error', e);
    // fallback quick demo
>>>>>>> parent of 650bc8e (Update script.js)
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted: null
        }))
      }))
    }))};
  }
}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* ---- state & layout ---- */
const state = {
  camera: { x:0, y:0, scale: 0.62, rotation: 0 }, // start zoomed-out but visible
  target: { x:0, y:0, scale: 0.62, rotation: 0 },
=======
/* state + layout */
const state = {
  camera:{ x:0, y:0, scale:0.55 },
  target:{ x:0, y:0, scale:0.55 },
>>>>>>> parent of 59e789a (Update script.js)
=======
/* state + layout */
const state = {
  camera:{ x:0, y:0, scale:0.55 },
  target:{ x:0, y:0, scale:0.55 },
>>>>>>> parent of 59e789a (Update script.js)
=======
/* ---------- state & layout constants ---------- */
const state = {
  camera:{x:0,y:0,scale:0.55},
  target:{x:0,y:0,scale:0.55},
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* state & layout */
const state = {
  camera: { x:0,y:0,scale:0.55 },
  target: { x:0,y:0,scale:0.55 },
>>>>>>> parent of 650bc8e (Update script.js)
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused: { core:null, tier:null },
  hovered: null,
  dragging: false,
  dragStart: null
};

<<<<<<< HEAD
<<<<<<< HEAD
/* Make planets visible but not cramped — similar to Warframe starchart spacing */
function getCoreRadius(){
  // Use a moderate spacing: fraction of smaller viewport dimension
  const base = Math.min(W, H);
  return clamp(Math.round(base * 0.30), 420, 1000); // ~30% of min viewport, clamped
}

/* sizes */
const PLANET_DRAW_SIZE = 220;   // world units for detailed planet draw
const TIER_DISPLAY_SIZE = 64;   // small tier icon when zoomed out
const ACH_ICON = 22;

/* visual thresholds */
const atmosphereStart = 1.9;
const atmosphereFull = 3.4;
const nodeShowStart = 1.6;
const nodeShowEnd = 3.0;

/* clouds (layers for parallax) */
const cloudLayers = [
  { radius: 260, speed: 0.015, alpha: 0.28, offset: 0.0 },
  { radius: 360, speed: 0.01, alpha: 0.20, offset: 1.2 },
  { radius: 520, speed: 0.006, alpha: 0.14, offset: 2.4 }
];

/* stars/nebula for depth */
const stars = []; for(let i=0;i<220;i++) stars.push({ x:(Math.random()*2-1)*2200, y:(Math.random()*2-1)*1400, r:Math.random()*1.8+0.2, speed: Math.random()*0.18+0.02 });
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*400, a:0.06 + Math.random()*0.12 });
=======
const CORE_RADIUS = 420;
const PLANET_SIZE = 100;
const PLANET_HOVER_SCALE = 1.6;
const TIER_BASE_OFFSET = 120;
const TIER_SPACING = 120;
const TIER_SIZE = 42;
const ACH_ICON = 18;

/* starfield + nebula */
const stars = [];
for(let i=0;i<260;i++) stars.push({ x: (Math.random()*2-1)*1800, y: (Math.random()*2-1)*1200, r: Math.random()*1.6+0.2, speed: Math.random()*0.22+0.02 });
const nebula = [];
for(let i=0;i<6;i++){
  nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r: 200 + Math.random()*400, a: 0.08 + Math.random()*0.12 });
}

<<<<<<< HEAD
<<<<<<< HEAD
/* stars/nebula */
const stars = []; for(let i=0;i<220;i++) stars.push({ x:(Math.random()*2-1)*1800, y:(Math.random()*2-1)*1200, r:Math.random()*1.6+0.2, speed: Math.random()*0.22+0.02 });
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*400, a:0.08 + Math.random()*0.12 });
>>>>>>> parent of 59e789a (Update script.js)
=======
const CORE_RADIUS = 420;
const PLANET_SIZE = 100;
const TIER_BASE_OFFSET = 120;
const TIER_SPACING = 120;
const TIER_SIZE = 44;
const ACH_ICON = 18;

/* extras for atmosphere & zoom */
const atmosphereStart = 2.2;   // scale where atmosphere starts appearing
const atmosphereFull = 4.2;    // scale where atmosphere fully opaque
const nodeShowStart = 1.8;     // scale where nodes begin to fade in
const nodeShowEnd = 3.8;       // fully visible at this scale

/* stars/nebula */
const stars = []; for(let i=0;i<220;i++) stars.push({ x:(Math.random()*2-1)*1800, y:(Math.random()*2-1)*1200, r:Math.random()*1.6+0.2, speed: Math.random()*0.22+0.02 });
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*400, a:0.08 + Math.random()*0.12 });
>>>>>>> parent of 59e789a (Update script.js)

/* helpers */
=======
/* ---------- helper funcs ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* helper functions */
>>>>>>> parent of 650bc8e (Update script.js)
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function playSound(k){ const s=sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

<<<<<<< HEAD
/* geometry helpers */
=======
/* layout math */
>>>>>>> parent of 650bc8e (Update script.js)
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
<<<<<<< HEAD
<<<<<<< HEAD
  // small deterministic offset for organic distribution
  const spread = (index % 5 - 2) * 0.08 * radius * 0.02;
  return { x: Math.cos(angle)*radius + Math.cos(angle+0.9)*spread, y: Math.sin(angle)*radius + Math.sin(angle+0.9)*spread, angle };
}
<<<<<<< HEAD

/* transform helpers:
   We'll use the following transform order in draw():
     ctx.translate(W/2, H/2)
     ctx.scale(state.camera.scale, state.camera.scale)
     ctx.rotate(state.camera.rotation)
     ctx.translate(state.camera.x, state.camera.y)
   So screenToWorld must invert that order.
*/
function screenToWorld(px,py){
  // 1) to camera space (before world scale & rotation): subtract center, then divide by scale
  const sx = (px - W/2) / state.camera.scale;
  const sy = (py - H/2) / state.camera.scale;
  // 2) rotate by -rotation
  const rot = -state.camera.rotation;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;
  // 3) subtract camera translation (world offset)
  return { x: rx - state.camera.x, y: ry - state.camera.y };
}

/* draw glowing directional connector (moving bright orb + faint trail) */
function drawGlowingConnector(from, to, t, accent){
  // soft base glow line
  ctx.save();
  ctx.lineWidth = 2.6 / Math.max(0.6, state.camera.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();

  // moving light + trailing particles
  const segCount = 10;
  for(let s=0;s<segCount;s++){
    const prog = ((t * 0.45) + s * (0.03)) % 1;
    const px = from.x + (to.x - from.x) * prog;
    const py = from.y + (to.y - from.y) * prog;
    const orb = 9 * (1 - s/segCount) / Math.max(0.6, state.camera.scale);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 * (1 - s/segCount);
    ctx.shadowBlur = 12 * (1 - s/segCount);
    ctx.shadowColor = accent;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(px, py, orb, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // thin bright center stroke
  ctx.save();
  ctx.lineWidth = 1.4 / Math.max(0.6, state.camera.scale);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.14;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();
}

/* cloud bands rendering around a world position (parallax) */
function drawCloudBands(centerX, centerY, time, scaleFactor){
  // scaleFactor influences size and alpha; time drives movement
  for(let i=0;i<cloudLayers.length;i++){
    const c = cloudLayers[i];
    const r = c.radius * (1 + scaleFactor * 0.28);
    const alpha = c.alpha * (0.7 + 0.6*scaleFactor);
    const angle = time * c.speed + c.offset;
    // soft elliptical band (using stroke of radial gradient)
    const grd = ctx.createRadialGradient(centerX, centerY, r*0.15, centerX, centerY, r);
    grd.addColorStop(0, `rgba(255,255,255,${alpha*0.03})`);
    grd.addColorStop(0.45, `rgba(255,255,255,${alpha*0.012})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(centerX, centerY);
    ctx.rotate(angle * 0.24);
    ctx.translate(-centerX, -centerY);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(centerX, centerY, r*1.2, r*0.46, angle*0.14, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

/* main draw loop */
let ttime = 0;
function draw(){
  const dt = 1/60;
  ttime += dt;

  // smooth camera & rotation
=======
  return { x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle };
}
<<<<<<< HEAD
=======
  return { x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle };
}
>>>>>>> parent of 59e789a (Update script.js)
=======

>>>>>>> parent of 22ab30d (Update script.js)
=======
>>>>>>> parent of 650bc8e (Update script.js)
function screenToWorld(px,py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x: (px - cx) / state.camera.scale, y: (py - cy) / state.camera.scale };
}

/* draw main */
let time = 0;
function draw(){
  const dt = 1/60;
<<<<<<< HEAD
  ttime += dt;

  // camera smoothing
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
  time += dt;
>>>>>>> parent of 650bc8e (Update script.js)
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);
  state.camera.rotation = lerp(state.camera.rotation, state.target.rotation, state.easing);

  // subtle auto-rotation (tilt) proportional to camera scale (small)
  const tiltTarget = (state.camera.scale - 0.6) * 0.012; // small tilt when zoomed in more
  state.target.rotation = clamp(tiltTarget, -0.06, 0.06);

  // prepare canvas: use transform order described in screenToWorld
  ctx.setTransform(1,0,0,1,0,0); // reset
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(state.camera.scale, state.camera.scale);
  ctx.rotate(state.camera.rotation);
  ctx.translate(state.camera.x, state.camera.y);

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  // background nebula and stars
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.04})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  });

  ctx.save(); ctx.globalAlpha = 0.92;
  stars.forEach(s=>{
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -3000) s.x = 3000;
  });
  ctx.restore();

  // orbital rings (soft) — many rings for scale but not intrusive
=======
  // nebula & stars
=======
  // nebula
>>>>>>> parent of 22ab30d (Update script.js)
=======
  // nebula & stars
  ctx.save();
>>>>>>> parent of 650bc8e (Update script.js)
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.07})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();

<<<<<<< HEAD
<<<<<<< HEAD
  // central dynamic rings fill the canvas (perspective top-down)
>>>>>>> parent of 59e789a (Update script.js)
=======
  // nebula & stars
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  });
  ctx.save();
  ctx.globalAlpha = 0.95;
  stars.forEach(s=>{
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -2000) s.x = 2000;
  });
  ctx.restore();

  // central dynamic rings fill the canvas (perspective top-down)
>>>>>>> parent of 59e789a (Update script.js)
  const maxR = Math.max(W,H) * 0.95;
  const accent = cachedGrad && cachedGrad.accent || '#00c8ff';
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
<<<<<<< HEAD
<<<<<<< HEAD
  for(let r=120; r < maxR; r += Math.round(Math.min(90, Math.max(56, maxR*0.02))) ){
    ctx.globalAlpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.16);
=======
  for(let r=80; r<maxR; r+=40){
=======
  // central animated orbits (fill canvas)
=======
  ctx.save();
  ctx.globalAlpha = 0.9;
  for(const s of stars){
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -2200) s.x = 2200;
  }
  ctx.restore();

  // dynamic central orbit rings
>>>>>>> parent of 650bc8e (Update script.js)
  const maxR = Math.max(W,H) * 0.9;
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
  const accent = (cachedGrad && cachedGrad.accent) || (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff');
  for(let r=80; r < maxR; r += 40){
<<<<<<< HEAD
>>>>>>> parent of 22ab30d (Update script.js)
    ctx.globalAlpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.18);
>>>>>>> parent of 59e789a (Update script.js)
=======
  for(let r=80; r<maxR; r+=40){
    ctx.globalAlpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.18);
>>>>>>> parent of 59e789a (Update script.js)
=======
    const alpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.18);
>>>>>>> parent of 650bc8e (Update script.js)
    ctx.strokeStyle = accent;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();

    // animate small moving pulses along each ring (cheap)
    const pulsesPerRing = Math.floor(1 + (r/300));
    for(let p=0;p<pulsesPerRing;p++){
      const prog = ((time*0.06) + p*0.32 + r*0.002) % 1;
      const ang = prog * Math.PI*2;
      const sx = Math.cos(ang) * r;
      const sy = Math.sin(ang) * r;
      ctx.globalAlpha = 0.6 * (0.4 + Math.sin(time*3 + r*0.1 + p)*0.6);
      ctx.beginPath();
      ctx.fillStyle = accent;
      ctx.arc(sx, sy, 1.4 + (r%3===0?0.8:0), 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();

<<<<<<< HEAD
<<<<<<< HEAD
  // center emblem (subtle)
  if(images.center){
    const cs = 140;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(images.center, -cs/2, -cs/2, cs, cs); ctx.restore();
  }

const total = achievements.planets.length || 5;
const coreRadius = getCoreRadius();
for(let i=0;i<total;i++){
  const planet = achievements.planets[i];
  const pos = planetPosition(i, total, coreRadius);
  const px = pos.x, py = pos.y;
  planet._world = { x:px, y:py, angle: pos.angle };


    // hover progress for core
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isCoreHover = state.hovered && state.hovered.type === 'core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isCoreHover ? 1 : 0, 0.12);

    // planethover underlay (subtle)
    if(images.planethover){
      const base = PLANET_DRAW_SIZE * 1.02;
      const s = 1 + planet._hover * 0.26;
      ctx.save(); ctx.globalAlpha = 0.26 + planet._hover*0.46; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // draw planet (size depends on camera scale for clarity)
    const drawSize = (state.camera.scale < 1.6) ? (TIER_DISPLAY_SIZE * (1 + planet._hover*0.16)) : (PLANET_DRAW_SIZE);
    const pImg = images[`tier${Math.min(5,i+1)}`] || images.planet || images.center;
    if(pImg){
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.drawImage(pImg, px - drawSize/2, py - drawSize/2, drawSize, drawSize);
      ctx.restore();
    } else {
      ctx.save(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px,py,drawSize/2,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    // label if slightly zoomed
    if(state.camera.scale > 0.9){
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Electrolize, Arial'; ctx.textAlign = 'center'; ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + drawSize/2 + 18); ctx.restore();
    }

    // small orbital ellipse for vibe
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = accent; ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
    ctx.beginPath(); ctx.ellipse(px,py, Math.max(40, drawSize*0.8), Math.max(12, drawSize*0.22), pos.angle*0.4, 0, Math.PI*2); ctx.stroke();
    ctx.restore();

    /* TIER ICONS and connectors */
    planet.tiers.forEach((tier, j) => {
      const dist = 120 + j * 180 + j * 10;
      const spread = (j % 3 - 1) * 0.16 * dist * 0.6;
      const tx = px + Math.cos(pos.angle) * dist + Math.cos(pos.angle+0.9) * spread;
      const ty = py + Math.sin(pos.angle) * dist + Math.sin(pos.angle+0.9) * spread;
      tier._pos = { x: tx, y: ty };

      // connector
      drawGlowingConnector({x:px,y:py}, {x:tx,y:ty}, ttime + i*0.11 + j*0.18, accent);

      // junction position outside
      const jx = tx + Math.cos(pos.angle) * 36;
      const jy = ty + Math.sin(pos.angle) * 36;
      tier._junction = { x: jx, y: jy, r: 16, index: j };

      // show junction only when hovering core
      const showJunctions = state.hovered && state.hovered.type === 'core' && state.hovered.index === i;
      if(showJunctions && images.junction){
        ctx.save(); ctx.globalAlpha = 0.98; ctx.drawImage(images.junction, jx - 14, jy - 14, 28, 28); ctx.restore();
      }

      // tier icon
      const tImg = images[`tier${Math.min(5,j+1)}`] || images.planet;
      ctx.save(); ctx.globalAlpha = 0.98;
      ctx.drawImage(tImg, tx - TIER_DISPLAY_SIZE/2, ty - TIER_DISPLAY_SIZE/2, TIER_DISPLAY_SIZE, TIER_DISPLAY_SIZE);
      ctx.restore();

      // completed overlay if all completed
=======
  // center image
  if(images.center) ctx.drawImage(images.center, -220/2, -220/2, 220, 220);

  // planets & tiers
  const total = achievements.planets.length || 5;
  for(let i=0;i<total;i++){
    const planet = achievements.planets[i];
    const pos = planetPosition(i, total, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = {x:px, y:py, angle: pos.angle};

    // hover animation for planet underlay
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isCoreHover = state.hovered?.type === 'core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isCoreHover?1:0, 0.14);
    if(images.planethover){
      const base = PLANET_SIZE * 1.6; const s = 1 + planet._hover*0.3;
      ctx.save(); ctx.globalAlpha = 0.35 + planet._hover*0.45; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // planet base
    const baseSize = PLANET_SIZE * (1 + planet._hover*0.06);
    const tierImg = images[`tier${Math.min(5,(planet.tier||1))}`] || images.planet || null;
    if(tierImg) ctx.drawImage(tierImg, px - baseSize/2, py - baseSize/2, baseSize, baseSize);
    else { ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(px,py,baseSize/2,0,Math.PI*2); ctx.fill(); }

    // satellite orbits for solar-system vibe
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = accent; ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
    for(let o=0;o<3;o++){ ctx.beginPath(); ctx.ellipse(px,py,40+o*18,14+o*8,pos.angle+o*0.18,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();

    // tiers with small perpendicular spread (not straight line)
    planet.tiers.forEach((tier,j) => {
      const angle = pos.angle;
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const perpMag = 24 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(angle), perpY = Math.cos(angle);
      const side = (j % 3) - 1;
      const offsetX = perpX * perpMag * side * 0.36;
      const offsetY = perpY * perpMag * side * 0.36;

      const tx = px + Math.cos(angle) * dist + offsetX;
      const ty = py + Math.sin(angle) * dist + offsetY;
      tier._pos = { x:tx, y:ty };

      const from = (j===0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx, y:ty};

      // connector line
      ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = accent; ctx.lineWidth = 2 / Math.max(0.6, state.camera.scale); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();

      // moving directional pulses (visual data transfer)
      for(let p=0;p<2;p++){
        const speed = 0.18 + p*0.08 + j*0.02;
        const prog = (time * speed + p * 0.3) % 1;
        const pxp = from.x + (to.x - from.x) * prog;
        const pyp = from.y + (to.y - from.y) * prog;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * (0.45 + Math.sin(time*4 + p)*0.12); ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(pxp, pyp, 6 + Math.sin(time*6 + p)*1.2, 0, Math.PI*2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.restore();
      }

      // junction icon: only visible when hovering core planet
      const jx = from.x + (to.x - from.x) * 0.62;
      const jy = from.y + (to.y - from.y) * 0.62;
      const jSize = 24;
      const showJunctions = (state.hovered && state.hovered.type === 'core' && state.hovered.index === i);
      if(showJunctions && images.junction) ctx.drawImage(images.junction, jx - jSize/2, jy - jSize/2, jSize, jSize);
      tier._junction = { x: jx, y: jy, r: 14, index: j };

      // planethover underlay for tier (only on actual hover)
      tier._hover = tier._hover===undefined?0:tier._hover;
      const isTierHover = state.hovered && state.hovered.type === 'tier' && state.hovered.core === i && state.hovered.tier === j;
      tier._hover = lerp(tier._hover, isTierHover ? 1 : 0, 0.14);
      if(images.planethover){
        const base = TIER_SIZE * 1.8;
        const s = 1 + tier._hover * 0.28;
        ctx.save(); ctx.globalAlpha = 0.35 + tier._hover*0.42; ctx.drawImage(images.planethover, tx - (base*s)/2, ty - (base*s)/2, base*s, base*s); ctx.restore();
      }

      // draw tier planet
      if(images[`tier${Math.min(5,j+1)}`] || images.planet) ctx.drawImage(images[`tier${Math.min(5,j+1)}`] || images.planet, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); }

      // tier label on zoom
      if(state.camera.scale > 0.9){
        ctx.save(); ctx.fillStyle='#fff'; ctx.font='12px Electrolize, Arial'; ctx.textAlign='center'; ctx.fillText(tier.tierName || `Tier ${j+1}`, tx, ty - TIER_SIZE/2 - 10); ctx.restore();
      }

      // completed overlay
>>>>>>> parent of 59e789a (Update script.js)
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){ ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE); ctx.restore(); }

<<<<<<< HEAD
      /* NODE LAYOUT — compact on tier; detailed on focused tier (planet surface) */
      const nodes = tier.achievements;
      const compactR = Math.max(TIER_DISPLAY_SIZE * 0.68, 18);
      const isFocusedTier = (state.focused.core === i && state.focused.tier === j);
      const vis = clamp((state.camera.scale - nodeShowStart) / (nodeShowEnd - nodeShowStart), 0, 1);

      if(isFocusedTier && state.camera.scale > 1.6){
        // draw detailed planet (so nodes appear on it): we'll draw a large planet centered at tx,ty with PLANET_DRAW_SIZE
        const drawPlanetSizeWorld = PLANET_DRAW_SIZE;
        const planetTexture = images[`tier${Math.min(5,j+1)}`] || images.planet || images.center;
        if(planetTexture){
          ctx.save(); ctx.globalAlpha = 0.98; ctx.drawImage(planetTexture, tx - drawPlanetSizeWorld/2, ty - drawPlanetSizeWorld/2, drawPlanetSizeWorld, drawPlanetSizeWorld); ctx.restore();
        }

        // clouds bands (parallax) — scaleFactor based on vis and camera
        const scaleFactor = clamp((state.camera.scale - 1.2) / 2.6, 0, 1);
        drawCloudBands(tx, ty, ttime, scaleFactor);

        // nodes via seeded polar meta
        const meta = tier._nodeMeta || [];
        const planetRadiusWorld = drawPlanetSizeWorld * 0.48;
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          const m = meta[n] || { theta: n*(Math.PI*2/nodes.length), rFrac: 0.72, tilt:0 };
          const theta = m.theta + (ttime*0.07)*( (n%2)?1:-1 ) + (i*0.03);
          const r = planetRadiusWorld * m.rFrac;
          const ax = tx + Math.cos(theta) * r;
          const ay = ty + Math.sin(theta) * r + m.tilt*8;
=======
      /* Node placement: compact on surface (small circle), expand into rings when focused.
         Node alpha is controlled by camera scale (fade-in as you approach).
      */
      const nodes = tier.achievements;
      const compactRadius = Math.max(TIER_SIZE * 0.9, 18);
=======
  // center image
  const centerImg = images.center;
  if(centerImg) ctx.drawImage(centerImg, -220/2, -220/2, 220, 220);

  // planets & tiers
  const total = (achievements.planets && achievements.planets.length) || 5;
  for(let i=0;i<total;i++){
    const planet = achievements.planets[i];
    const pos = planetPosition(i, total, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = { x:px, y:py, angle: pos.angle };

    // planethover underlay
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isHover = state.hovered?.type==='core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isHover?1:0, 0.14);
    if(images.planethover){
      const base = PLANET_SIZE * 1.6;
      const s = 1 + planet._hover * 0.28;
      const alpha = 0.35 + planet._hover*0.4;
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // base planet
    const baseSize = PLANET_SIZE * (1 + planet._hover*0.06);
    const tierImg = images[`tier${Math.min(5,(planet.tier||1))}`] || images.planet || null;
    if(tierImg) ctx.drawImage(tierImg, px - baseSize/2, py - baseSize/2, baseSize, baseSize);
    else { ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(px,py,baseSize/2,0,Math.PI*2); ctx.fill(); }

    // satellite orbits
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
    for(let o=0; o<3; o++){
      ctx.beginPath();
      ctx.ellipse(px, py, 40 + o*18, 14 + o*8, pos.angle + o*0.2, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();

    // tiers chain
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(pos.angle) * dist;
      const ty = py + Math.sin(pos.angle) * dist;
      tier._pos = {x:tx, y:ty};

      const from = (j === 0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx,y:ty};

      // base connector
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 / Math.max(0.6, state.camera.scale);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.restore();

      // animated pulses along connector
      const pulses = 2;
      for(let p=0;p<pulses;p++){
        const speed = 0.22 + p*0.08 + j*0.02;
        const baseProg = (time * speed + p * 0.3) % 1;
        const prog = baseProg;
        const pxp = from.x + (to.x - from.x) * prog;
        const pyp = from.y + (to.y - from.y) * prog;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (0.4 + Math.sin(time*4 + p)*0.15);
        ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(pxp, pyp, 6 + Math.sin(time*6 + p)*1.6, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // junction
      const jx = from.x + (to.x - from.x) * 0.62;
      const jy = from.y + (to.y - from.y) * 0.62;
      const jSize = 24;
      if(images.junction) ctx.drawImage(images.junction, jx - jSize/2, jy - jSize/2, jSize, jSize);
      tier._junction = { x: jx, y: jy, r: 14, fromIndex: j };

      // tier planet
      if(images[`tier${Math.min(5,j+1)}`] || images.planet){
        const tImg = images[`tier${Math.min(5,j+1)}`] || images.planet;
        ctx.drawImage(tImg, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      } else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); }

      // tier label when zoomed
      if(state.camera.scale > 0.9){
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(tier.tierName || `Tier ${j+1}`, tx, ty - TIER_SIZE/2 - 10);
        ctx.restore();
      }

      // completed overlay
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE); ctx.restore();
      }

      // achievements when focused
      if(state.focused.core === i && state.focused.tier === j){
        const achs = tier.achievements;
        const perRing = 10;
        const rings = Math.ceil(achs.length / perRing);
        let idx = 0;
        for(let ring=0; ring<rings; ring++){
          const count = Math.min(perRing, achs.length - ring*perRing);
          const ringR = 36 + ring * 48;
          for(let n=0; n<count; n++){
            const ang = (n / count) * Math.PI*2 + ring*0.12 + time*0.02;
            const ax = tx + Math.cos(ang) * ringR;
            const ay = ty + Math.sin(ang) * ringR;
            const a = achs[idx];

            // branch glow
            ctx.save(); ctx.globalAlpha = 0.12 + (a.status === 'available'?0.16:0.05); ctx.strokeStyle = accent; ctx.lineWidth = 1.6 / Math.max(0.6, state.camera.scale); ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();

            // node base
            const icon = (a.status === 'locked' ? images.lock : images.node);
            if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
            else { ctx.fillStyle = a.status==='locked'? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

            // pulse overlay ON TOP
            if(a.status === 'available' && images.pulse){
              ctx.save();
              const pScale = 1 + 0.16 * Math.sin(time*6 + idx);
              const psize = ACH_ICON + 8 * pScale;
              ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time*4 + idx);
              ctx.drawImage(images.pulse, ax - psize/2, ay - psize/2, psize, psize);
              ctx.restore();
            }

            // node label visible at tighter zoom
            if(state.camera.scale > 1.8){
              ctx.save();
              ctx.font = '11px Arial';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#fff';
              ctx.fillText(a.title || `Node ${idx+1}`, ax, ay + ACH_ICON + 12);
              ctx.restore();
            }

            // hologram fade (fade in/out when hovered)
            a._holo = a._holo===undefined?0:a._holo;
            if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===idx){
              a._holo = lerp(a._holo, 1, 0.16);
            } else {
              a._holo = lerp(a._holo, 0, 0.12);
            }
            if(a._holo > 0.02 && images.hologram){
              ctx.save();
              ctx.globalAlpha = a._holo * 0.95;
              const hs = 78 + 6 * Math.sin(time*3 + idx);
              ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2 - 10, hs, hs);
              ctx.fillStyle = `rgba(255,255,255,${0.95 * a._holo})`;
              ctx.font = `${12 + Math.floor(2*a._holo)}px Arial`;
              ctx.textAlign = 'center';
              wrapText(ctx, a.title || 'Achievement', ax, ay - 6, hs - 18, 14 * a._holo);
              ctx.fillStyle = `rgba(255,255,255,${0.75 * a._holo})`;
              ctx.font = `${10}px Arial`;
              wrapText(ctx, a.description || '', ax, ay + 8, hs - 18, 12 * a._holo);
              ctx.restore();
            }

            a._pos = { x: ax, y: ay, r: ACH_ICON*0.6 };
            idx++;
          }
        }
<<<<<<< HEAD
      } else {
        // compact: place nodes ON the tier planet circumference (so they lay on planet)
        const count = nodes.length;
        for(let n=0;n<count;n++){
          const ang = (n / count) * Math.PI*2 + ttime*0.01; // slight slow spin to avoid perfect static layout
          const ax = tx + Math.cos(ang) * compactRadius;
          const ay = ty + Math.sin(ang) * compactRadius;
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)

      // node visibility factor (0..1) based on camera scale
      const vis = clamp((state.camera.scale - nodeShowStart) / (nodeShowEnd - nodeShowStart), 0, 1);

      if(state.focused.core === i && state.focused.tier === j){
        // expanded rings (visible quicker)
        const perRing = 10; const rings = Math.ceil(nodes.length / perRing);
        let idx=0;
        for(let ring=0; ring<rings; ring++){
          const count = Math.min(perRing, nodes.length - ring*perRing);
          const ringR = 36 + ring * 48;
          for(let n=0;n<count;n++){
            const a = nodes[idx];
            const ang = (n / count)*Math.PI*2 + ring*0.12 + time*0.02;
            const ax = tx + Math.cos(ang) * ringR;
            const ay = ty + Math.sin(ang) * ringR;

            // branch glow
            ctx.save(); ctx.globalAlpha = 0.12 + (a.status==='available'?0.16:0.05); ctx.strokeStyle = accent; ctx.lineWidth = 1.6 / Math.max(0.6, state.camera.scale); ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();

            // node base
            const icon = (a.status==='locked' ? images.lock : images.node);
            if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
            else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

            // pulse overlay on top
            if(a.status==='available' && images.pulse){
              ctx.save(); const pScale = 1 + 0.16*Math.sin(time*6 + idx); const psize = ACH_ICON + 8*pScale; ctx.globalAlpha = (0.35 + 0.15*Math.sin(time*4 + idx)) * vis; ctx.drawImage(images.pulse, ax - psize/2, ay - psize/2, psize, psize); ctx.restore();
            }

            // node label when zoomed
            if(state.camera.scale > 1.8){
              ctx.save(); ctx.font='11px Electrolize, Arial'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.fillText(a.title || `Node ${idx+1}`, ax, ay + ACH_ICON + 12); ctx.restore();
            }

            // hologram fade under node only when hovering that node
            a._holo = a._holo === undefined ? 0 : a._holo;
            if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===idx) a._holo = lerp(a._holo, 1, 0.16); else a._holo = lerp(a._holo, 0, 0.12);
            if(a._holo > 0.02 && images.hologram){
              ctx.save(); ctx.globalAlpha = a._holo * 0.95; const hs = ACH_ICON*1.9; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
            }

            a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
            idx++;
          }
        }
      } else {
        // compact placement ON the tier planet surface — nodes appear slowly as we approach (vis factor)
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          const ang = (n / nodes.length) * Math.PI*2 + time*0.008; // slight rotation
          const ax = tx + Math.cos(ang) * compactRadius;
          const ay = ty + Math.sin(ang) * compactRadius;
>>>>>>> parent of 59e789a (Update script.js)

          // hologram under node when hovered
          a._holo = a._holo === undefined ? 0 : a._holo;
<<<<<<< HEAD
<<<<<<< HEAD
          if(state.hovered && state.hovered.type === 'achievement' && state.hovered.core === i && state.hovered.tier === j && state.hovered.ach === n){
            a._holo = lerp(a._holo, 1, 0.16);
          } else a._holo = lerp(a._holo, 0, 0.12);
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.98; const hs = ACH_ICON * 2.6 * (1 + a._holo*0.22); ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // node icon
          const icon = (a.status === 'locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); } ctx.restore();

          // label when zoomed
          if(state.camera.scale > 2.0){
            ctx.save(); ctx.font = '12px Electrolize, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(a.title || '', ax, ay + ACH_ICON + 12); ctx.restore();
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }
      } else {
        // compact: nodes sit on tier icon circumference
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          const ang = (n / Math.max(1, nodes.length)) * Math.PI*2 + (ttime*0.004) + (n*0.2);
          const ax = tx + Math.cos(ang) * compactR;
          const ay = ty + Math.sin(ang) * compactR;

          // hologram under node on hover
          a._holo = a._holo === undefined ? 0 : a._holo;
          if(state.hovered && state.hovered.type === 'achievement' && state.hovered.core === i && state.hovered.tier === j && state.hovered.ach === n){
            a._holo = lerp(a._holo, 1, 0.16);
          } else a._holo = lerp(a._holo, 0, 0.12);
=======
          if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===n) a._holo = lerp(a._holo, 1, 0.16); else a._holo = lerp(a._holo, 0, 0.12);
>>>>>>> parent of 59e789a (Update script.js)
=======
          if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===n) a._holo = lerp(a._holo, 1, 0.16); else a._holo = lerp(a._holo, 0, 0.12);
>>>>>>> parent of 59e789a (Update script.js)
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.95; const hs = ACH_ICON * 1.9; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

<<<<<<< HEAD
<<<<<<< HEAD
          // draw node with visibility alpha
          const icon = (a.status === 'locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); } ctx.restore();

          // small label when zoomed in somewhat
          if(state.camera.scale > 1.4){
            ctx.save(); ctx.globalAlpha = vis; ctx.font='11px Electrolize, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4); ctx.restore();
=======
          // node base (draw with alpha multiply)
=======
          const a = nodes[n];

          // node base
>>>>>>> parent of 22ab30d (Update script.js)
          const icon = (a.status==='locked' ? images.lock : images.node);
          if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
          else { ctx.fillStyle = a.status==='locked' ? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

          // small label beside node (small but readable when zoomed)
          if(state.camera.scale > 1.4){
<<<<<<< HEAD
            ctx.save(); ctx.globalAlpha = vis; ctx.font='11px Electrolize, Arial'; ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4); ctx.restore();
>>>>>>> parent of 59e789a (Update script.js)
=======
          // node base (draw with alpha multiply)
          const icon = (a.status==='locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); } ctx.restore();

          // small label beside node (only when reasonably zoomed)
          if(state.camera.scale > 1.4){
            ctx.save(); ctx.globalAlpha = vis; ctx.font='11px Electrolize, Arial'; ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4); ctx.restore();
>>>>>>> parent of 59e789a (Update script.js)
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }
      }
    }); // end tiers
  } // end planets

<<<<<<< HEAD
<<<<<<< HEAD
  ctx.restore(); // restore from world transform

  /* Atmosphere & cloud overlay at screen-level (simulates entering atmosphere). Render after world so it's on top */
  const s = state.camera.scale;
  const atmos = clamp((s - atmosphereStart) / (atmosphereFull - atmosphereStart), 0, 1);
  if(atmos > 0.002){
    // screen-space radial gradient
    const cx = W/2, cy = H/2;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W,H)*0.8);
    grd.addColorStop(0, `rgba(6,12,20,${0.08 * atmos})`);
    grd.addColorStop(0.6, `rgba(0,0,0,${0.0 * atmos})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
=======
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
            ctx.save(); ctx.font = '11px Electrolize, Arial'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
            ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4);
            ctx.restore();
          }

          // hologram under node when hovered
          a._holo = a._holo===undefined?0:a._holo;
          if(state.hovered && state.hovered.type === 'achievement' && state.hovered.core === i && state.hovered.tier === j && state.hovered.ach === n){
            a._holo = lerp(a._holo, 1, 0.18);
          } else {
            a._holo = lerp(a._holo, 0, 0.12);
          }
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.95;
            const hs = ACH_ICON * 1.8 + 6 * a._holo; // slightly larger than node
            ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // store pos
          a._pos = {x:ax, y:ay, r: ACH_ICON*0.6};
        } // end compact nodes
      } // end nodes handling
>>>>>>> parent of 22ab30d (Update script.js)
    }); // end tiers
  }); // end planets
=======
      }

    } // end tiers
  } // end planets
>>>>>>> parent of 650bc8e (Update script.js)

  ctx.restore();
<<<<<<< HEAD

<<<<<<< HEAD
  /* ATMOSPHERE: draw on top of canvas when zoomed into a planet/tier to give approach into atmosphere */
  const s = state.camera.scale;
  const atmosAmount = clamp((s - atmosphereStart) / (atmosphereFull - atmosphereStart), 0, 1);
  if(atmosAmount > 0.001){
    // vignette + radial cloud near center of viewport to simulate atmosphere entry
    const cx = W/2, cy = H/2;
    // subtle blue tint that increases with scale
    const grd = ctx.createRadialGradient(cx, cy, 60, cx, cy, Math.max(W,H) * 0.75);
    grd.addColorStop(0, `rgba(10,20,30,${0.08 * atmosAmount})`);
    grd.addColorStop(0.6, `rgba(0,0,0,${0.0 * atmosAmount})`);
    grd.addColorStop(1, `rgba(0,0,0,0)`);
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

<<<<<<< HEAD
<<<<<<< HEAD
    // lens glow center
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.09 * atmos; ctx.fillStyle = cachedGrad.accent || '#00c8ff'; ctx.beginPath(); ctx.arc(W/2, H/2, 160 + atmos * 260, 0, Math.PI*2); ctx.fill(); ctx.restore();
=======
=======
>>>>>>> parent of 59e789a (Update script.js)
    // growing lens glow at center (subtle)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08 * atmosAmount;
    ctx.fillStyle = cachedGrad.accent || '#00c8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 120 + atmosAmount * 220, 0, Math.PI*2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
  }

=======
>>>>>>> parent of 22ab30d (Update script.js)
  requestAnimationFrame(draw);
} // end draw

<<<<<<< HEAD
/* ---- interactions ---- */
let pointer = { x:0, y:0, down:false };
=======
/* ---------- interactions & hover logic ---------- */
let pointer = {x:0,y:0,down:false};
>>>>>>> parent of 22ab30d (Update script.js)
let lastHoverSound = 0;
=======
/* helpers used by draw & interactions */
function wrapText(c, text, x, y, maxWidth, lineHeight){
  const words = String(text).split(' ');
  let line = '';
  let curY = y;
  c.font = c.font || '12px Arial';
  for(let n=0;n<words.length;n++){
    const testLine = line + words[n] + ' ';
    const metrics = c.measureText(testLine);
    if(metrics.width > maxWidth && n > 0){
      c.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  c.fillText(line, x, curY);
}
>>>>>>> parent of 650bc8e (Update script.js)

let pointer = {x:0,y:0,down:false};
canvas.addEventListener('pointerdown', (e)=>{
  pointer.down = true;
  pointer.x = e.clientX; pointer.y = e.clientY;
  state.dragging = true;
  state.dragStart = {x:e.clientX,y:e.clientY, camx: state.target.x, camy: state.target.y};
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){} }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e)=>{
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(state.dragging && state.dragStart){
    // dragging must account for scale & rotation — we will move in world space ignoring rotation for simplicity (works for small tilts)
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    // apply inverse rotation to keep dragging intuitive
    const rot = -state.target.rotation;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    state.target.x = state.dragStart.camx + rx; state.target.y = state.dragStart.camy + ry;
    state.hovered = null; tooltip.style.display = 'none'; hideTitleCard();
=======
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy;
<<<<<<< HEAD
    state.hovered = null; hideTitleCard(); tooltip.style.display = 'none';
>>>>>>> parent of 59e789a (Update script.js)
=======
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy;
    state.hovered = null; hideTitleCard(); tooltip.style.display = 'none';
>>>>>>> parent of 59e789a (Update script.js)
=======
    state.hovered = null; hideTitleCard();
>>>>>>> parent of 22ab30d (Update script.js)
=======
    state.target.x = state.dragStart.camx + dx;
    state.target.y = state.dragStart.camy + dy;
    state.hovered = null; tooltip.style.display = 'none';
>>>>>>> parent of 650bc8e (Update script.js)
  } else {
    updateHover(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', (e)=>{
  pointer.down = false;
  state.dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  if(state.hovered){
    const h = state.hovered;
    if(h.type === 'core'){
<<<<<<< HEAD
      const p = achievements.planets[h.index]; const pos = p._world;
<<<<<<< HEAD
<<<<<<< HEAD
      const desiredScreenPx = Math.min(W, H) * 0.48;
      const worldPlanetSize = PLANET_DRAW_SIZE;
      const scale = desiredScreenPx / worldPlanetSize;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
      state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      const desiredScreenPx = Math.min(W, H) * 0.48;
      const scale = desiredScreenPx / PLANET_DRAW_SIZE;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
      state.focused.core = h.core; state.focused.tier = h.tier;
      playSound('zoom');
    } else if(h.type === 'junction'){
      const core = h.core, tIdx = h.tier;
=======
=======
      const p = achievements.planets[h.index];
      const pos = p._world;
>>>>>>> parent of 650bc8e (Update script.js)
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const core = h.core, tIdx = h.tier;
      const pos = achievements.planets[core].tiers[tIdx]._pos;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6;
      state.focused.core = core; state.focused.tier = tIdx;
      playSound('zoom');
    } else if(h.type === 'junction'){
<<<<<<< HEAD
      // only allow zoom if previous tier completed
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = h.core; state.focused.tier = h.tier;
      playSound('zoom');
    } else if(h.type === 'junction'){
      const core = h.core, tIdx = h.tier;
      // only allow zoom if previous tier completed
>>>>>>> parent of 59e789a (Update script.js)
=======
      const core = h.core, tIdx = h.tier;
>>>>>>> parent of 22ab30d (Update script.js)
      const prev = achievements.planets[core].tiers[tIdx];
      const all = prev.achievements.every(a=>a.status==='completed');
      if(all && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
<<<<<<< HEAD
<<<<<<< HEAD
        const desiredScreenPx = Math.min(W,H)*0.48;
        const scale = desiredScreenPx / PLANET_DRAW_SIZE;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
        state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete the achievements to unlock this junction.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
=======
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = core; state.focused.tier = tIdx+1;
=======
      const core = h.core, tIdx = h.tier;
      const prevTier = achievements.planets[core].tiers[tIdx];
      const allCompleted = prevTier.achievements.every(a => a.status === 'completed');
      if(allCompleted && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6;
        state.focused.core = core; state.focused.tier = tIdx+1;
>>>>>>> parent of 650bc8e (Update script.js)
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first to unlock the junction.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
<<<<<<< HEAD
<<<<<<< HEAD
      // show fixed title card (top-right)
>>>>>>> parent of 59e789a (Update script.js)
=======
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
      // show fixed title card (top-right)
>>>>>>> parent of 59e789a (Update script.js)
=======
      // show title card (also opens popup on double-click or mobile)
>>>>>>> parent of 22ab30d (Update script.js)
      showTitleCardFor(h);
=======
      openAchievementPopup(h.core, h.tier, h.ach);
>>>>>>> parent of 650bc8e (Update script.js)
    }
  }
});
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0016), 0.22, 6.0);
  playSound('zoom');
}, { passive:false });

/* hover detection uses screenToWorld that accounts for rotation */
=======
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0015), 0.2, 8.5);
  playSound('zoom');
}, { passive:false });

/* hover detection using instantaneous transform */
>>>>>>> parent of 59e789a (Update script.js)
=======
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0015), 0.2, 8.5);
  playSound('zoom');
}, { passive:false });

/* hover detection using instantaneous transform */
>>>>>>> parent of 59e789a (Update script.js)
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  outer:
  for(let i=0;i<achievements.planets.length;i++){
<<<<<<< HEAD
<<<<<<< HEAD
    const p = achievements.planets[i];
    const ppos = p._world;
    if(ppos && dist(w.x, w.y, ppos.x, ppos.y) < Math.max(36, PLANET_DRAW_SIZE*0.14)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<p.tiers.length;j++){
      const t = p.tiers[j];
      if(t._pos && dist(w.x, w.y, t._pos.x, t._pos.y) < Math.max(22, TIER_DISPLAY_SIZE*0.72)){
        found = { type:'tier', core:i, tier:j, pos: t._pos }; break;
=======
    const planet = achievements.planets[i];
    const ppos = planet._world;
    if(ppos && dist(w.x,w.y, ppos.x, ppos.y) < Math.max(28, PLANET_SIZE*0.45)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
=======
    const planet = achievements.planets[i];
    const ppos = planet._world;
    if(ppos && dist(w.x,w.y, ppos.x, ppos.y) < Math.max(28, PLANET_SIZE*0.45)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
>>>>>>> parent of 59e789a (Update script.js)
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      if(tier._pos && dist(w.x,w.y, tier._pos.x, tier._pos.y) < Math.max(14, TIER_SIZE*0.6)){
        found = { type:'tier', core:i, tier:j, pos: tier._pos }; break;
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0015), 0.2, 8.0);
  playSound('zoom');
},{ passive:false });

/* hover detection */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    const ppos = p._world;
    if(ppos && dist(w.x, w.y, ppos.x, ppos.y) < Math.max(22, PLANET_SIZE*0.45)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<p.tiers.length;j++){
      const t = p.tiers[j];
<<<<<<< HEAD
      if(t._pos && dist(w.x,w.y, t._pos.x, t._pos.y) < Math.max(14, TIER_SIZE*0.6)){
        found = { type:'tier', core:i, tier:j, pos:t._pos }; break;
>>>>>>> parent of 22ab30d (Update script.js)
=======
      if(t._pos && dist(w.x, w.y, t._pos.x, t._pos.y) < Math.max(16, TIER_SIZE*0.6)){
        found = { type:'tier', core:i, tier:j, pos: t._pos }; break;
>>>>>>> parent of 650bc8e (Update script.js)
      }
      if(t._junction && dist(w.x, w.y, t._junction.x, t._junction.y) < 18){
        found = { type:'junction', core:i, tier:j, pos: t._junction }; break;
      }
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      for(let k=0;k<t.achievements.length;k++){
        const a = t.achievements[k];
        if(a._pos && a._pos.alpha > 0.05 && dist(w.x, w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
=======
=======
>>>>>>> parent of 59e789a (Update script.js)
      // achievements detection (both compact & expanded)
      for(let k=0;k<tier.achievements.length;k++){
        const a = tier.achievements[k];
        if(a._pos && dist(w.x,w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6) && a._pos.alpha > 0.05){
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
      // achievements checks only when focused or even in compact (we support both)
      for(let k=0;k<t.achievements.length;k++){
        const a = t.achievements[k];
        if(a._pos && dist(w.x,w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
>>>>>>> parent of 22ab30d (Update script.js)
          found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
=======
      if(state.focused.core === i && state.focused.tier === j){
        for(let k=0;k<t.achievements.length;k++){
          const a = t.achievements[k];
          if(a._pos && dist(w.x, w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
            found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
          }
>>>>>>> parent of 650bc8e (Update script.js)
        }
        if(found) break;
      }
    }
    if(found) break;
  }

  if(found){
    state.hovered = found;
    showTooltipAt(sx, sy, found);
    if(!updateHover.lastSound || (Date.now() - updateHover.lastSound) > 300){ playSound('hover'); updateHover.lastSound = Date.now(); }
  } else {
    state.hovered = null;
    tooltip.style.display = 'none';
  }
}
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* Title card fixed top-right (on top of hologram). Click Open expands details */
=======
/* Title card (fixed on top-right) */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* Title card (fixed on top-right) */
>>>>>>> parent of 59e789a (Update script.js)
let hideC = null;
=======
/* ---------- Title card DOM control (single card) ---------- */
let titleCardHideTimer = null;
>>>>>>> parent of 22ab30d (Update script.js)
function showTitleCardFor(h){
  if(!h || h.type !== 'achievement') return;
  const a = achievements.planets[h.core].tiers[h.tier].achievements[h.ach];
  titleCardTitle.textContent = a.title || 'Achievement';
  titleCardDesc.textContent = a.description || '';
  // position near pointer / node but keep inside viewport
  const screenX = pointer.x; const screenY = pointer.y;
  const pad = 12;
  const tw = 320;
  let left = screenX + pad; let top = screenY + pad;
  if(left + tw > window.innerWidth - 12) left = screenX - tw - pad;
  if(top + 160 > window.innerHeight - 12) top = screenY - 160 - pad;
  titleCard.style.left = left + 'px'; titleCard.style.top = top + 'px';
  titleCard.style.display = 'block';
  // animate via class
  requestAnimationFrame(()=> titleCard.classList.add('show'));
<<<<<<< HEAD
  if(hideC) clearTimeout(hideC);
<<<<<<< HEAD
<<<<<<< HEAD
  hideC = setTimeout(()=> hideTitleCard(), 7000);
  titleCard._current = h;
=======
  hideC = setTimeout(()=> hideTitleCard(), 5500);
>>>>>>> parent of 59e789a (Update script.js)
=======
  hideC = setTimeout(()=> hideTitleCard(), 5500);
>>>>>>> parent of 59e789a (Update script.js)
=======
  // hide tooltip if exists
  tooltip.style.display = 'none';
  // clear existing hide timer and set auto-hide
  if(titleCardHideTimer) clearTimeout(titleCardHideTimer);
  titleCardHideTimer = setTimeout(()=> hideTitleCard(), 5000); // auto hide after 5s
>>>>>>> parent of 22ab30d (Update script.js)
}
function hideTitleCard(){
  if(!titleCard) return;
  titleCard.classList.remove('show');
  // small delay to allow transition then hide element
  setTimeout(()=> { if(titleCard) titleCard.style.display = 'none'; }, 200);
  if(titleCardHideTimer) { clearTimeout(titleCardHideTimer); titleCardHideTimer = null; }
}
<<<<<<< HEAD
<<<<<<< HEAD
openDetailsBtn?.addEventListener('click', ()=>{
  if(!titleCard._current) return;
  titleCardInner.classList.remove('collapsed'); titleCardInner.classList.add('expanded');
  const h = titleCard._current;
  const a = achievements.planets[h.core].tiers[h.tier].achievements[h.ach];
  titleCardTitle.textContent = a.title || 'Achievement';
  titleCardDesc.innerHTML = `<div style="opacity:.95">${a.description || ''}</div>
    <div style="margin-top:10px;font-size:13px">Status: <strong>${a.status}</strong></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
      ${a.status === 'available' ? `<button onclick="completeAchievement(${h.core},${h.tier},${h.ach})">Complete</button>` : ''}
      <button onclick="closeExpandedCard()">Close</button>
    </div>`;
});
closeCardBtn?.addEventListener('click', ()=> hideTitleCard() );
function closeExpandedCard(){ titleCardInner.classList.remove('expanded'); titleCardInner.classList.add('collapsed'); setTimeout(()=> hideTitleCard(), 600); }

/* tooltip for planets/tiers */
=======

<<<<<<< HEAD
/* tooltip (planet/tier/junction) placed near pointer but simple */
>>>>>>> parent of 59e789a (Update script.js)
=======

/* tooltip (planet/tier/junction) placed near pointer but simple */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* ---------- tooltip DOM for planets/tiers ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* tooltip */
>>>>>>> parent of 650bc8e (Update script.js)
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display = 'none'; return; }
  let title='', desc='';
  if(found.type === 'core'){ const p = achievements.planets[found.index]; title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom'; }
  else if(found.type === 'tier'){ const p = achievements.planets[found.core]; const t = p.tiers[found.tier]; title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`; }
  else if(found.type === 'junction'){ title = 'Junction'; desc = 'Travel to next tier (unlock required)'; }
  else if(found.type === 'achievement'){ const a = achievements.planets[found.core].tiers[found.tier].achievements[found.ach]; title = a.title || 'Achievement'; desc = a.description || ''; }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.88;margin-top:6px">${desc}</div>`;
  const pad = 12; let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 300;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 140 > window.innerHeight - 10) top = sy - 140 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* complete / popup / admin (same as before) */
=======
/* popup / complete */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* popup / complete */
>>>>>>> parent of 59e789a (Update script.js)
function openAchievementPopup(core,tier,ach){ const a = achievements.planets[core].tiers[tier].achievements[ach]; popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; }
=======
/* ---------- popup helper ---------- */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`;
  popup.style.display = 'block';
}
>>>>>>> parent of 22ab30d (Update script.js)
function closePopup(){ popup.style.display = 'none'; }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* admin simplified */
=======
/* admin snippets (unchanged) */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* admin snippets (unchanged) */
>>>>>>> parent of 59e789a (Update script.js)
=======
=======
/* popup & completion */
function openAchievementPopup(core,tier,ach){ const a = achievements.planets[core].tiers[tier].achievements[ach]; popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; }
function closePopup(){ popup.style.display = 'none'; }
>>>>>>> parent of 650bc8e (Update script.js)
window.completeAchievement = (core,tier,ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed'; a.dateCompleted = new Date().toISOString();
  localStorage.setItem('progress', JSON.stringify(achievements));
  popup.style.display = 'none';
  const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed');
  if(all && tier < achievements.planets[core].tiers.length - 1){
    achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status === 'locked') x.status = 'available'; });
  }
};

<<<<<<< HEAD
/* ---------- admin (kept simple) ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* admin (same) */
>>>>>>> parent of 650bc8e (Update script.js)
window.showAdminPanel = () => { adminPanel.style.display = 'block'; document.getElementById('adminLogin').style.display = 'block'; editContent.style.display = 'none'; }
window.hideAdminPanel = () => { adminPanel.style.display = 'none'; }
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if(pass === 'admin'){
    let html = '';
    achievements.planets.forEach((p,i)=> {
      html += `<h3>${escapeHtml(p.planetName||'Planet')}</h3>`;
      p.tiers.forEach((t,j)=> {
        html += `<h4>${escapeHtml(t.tierName||'Tier')}</h4>`;
        t.achievements.forEach((a,k)=> {
          html += `<div style="margin-bottom:6px;">
            <input style="width:45%;margin-right:6px" value="${escapeHtml(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)">
            <input style="width:45%" value="${escapeHtml(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)">
            <select onchange="editStatus(${i},${j},${k},this.value)">
              <option ${a.status==='locked'?'selected':''}>locked</option>
              <option ${a.status==='available'?'selected':''}>available</option>
              <option ${a.status==='completed'?'selected':''}>completed</option>
            </select>
          </div>`;
        });
      });
    });
    html += `<div style="margin-top:12px"><button onclick="downloadJson()">Download JSON</button><button onclick="bulkUnlock()">Bulk Unlock</button><button onclick="bulkReset()">Bulk Reset</button></div>`;
    editContent.innerHTML = html;
    document.getElementById('adminLogin').style.display = 'none';
    editContent.style.display = 'block';
  } else alert('Wrong password');
};
window.editTitle = (i,j,k,v) => { achievements.planets[i].tiers[j].achievements[k].title = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editDesc = (i,j,k,v) => { achievements.planets[i].tiers[j].achievements[k].description = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editStatus = (i,j,k,v) => {
  achievements.planets[i].tiers[j].achievements[k].status = v;
  achievements.planets[i].tiers[j].achievements[k].dateCompleted = v === 'completed' ? new Date().toISOString() : null;
  localStorage.setItem('progress', JSON.stringify(achievements));
};
window.downloadJson = () => { const blob = new Blob([JSON.stringify(achievements, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click(); };
window.bulkUnlock = () => { achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a=> a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = () => { achievements.planets.forEach(p => p.tiers.forEach((t,j) => t.achievements.forEach(a => { a.status = j===0? 'available':'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
/* ---- seed node positions on planet surface (for focused detailed view) ---- */
function seedNodeSurfacePositions(){
  achievements.planets.forEach((p,pi) => {
    p._nodeSeed = Math.random()*10000;
    p.tiers.forEach((t,ti) => {
      if(!t._nodeMeta) t._nodeMeta = [];
      t.achievements.forEach((a,ai) => {
        if(!t._nodeMeta[ai]){
          const theta = Math.random()*Math.PI*2;
          const rFrac = 0.56 + Math.random()*0.34;
          const tilt = (Math.random()-0.5) * 0.22;
          t._nodeMeta[ai] = { theta, rFrac, tilt };
        }
        a._pos = a._pos || { x:0, y:0, r:ACH_ICON*0.6, alpha:0 };
        a._holo = a._holo || 0;
      });
    });
  });
}

/* ---- init ---- */
=======
/* init */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* init */
>>>>>>> parent of 59e789a (Update script.js)
=======
/* ---------- init ---------- */
>>>>>>> parent of 22ab30d (Update script.js)
=======
/* init */
>>>>>>> parent of 650bc8e (Update script.js)
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  buildCachedGradients();
  tooltipHolo.src = 'assets/achievementnodehologram.png';
  if(monoToggle && monoToggle.checked) tooltipHolo.classList.add('grayscale');

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  // initialize placeholders positions for stable hit-testing
=======
  // initialise node placeholders & positions (stable layout)
>>>>>>> parent of 59e789a (Update script.js)
=======
  // initialise node placeholders & positions (stable layout)
>>>>>>> parent of 59e789a (Update script.js)
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=>{
    const pos = planetPosition(i, total, CORE_RADIUS);
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
<<<<<<< HEAD
<<<<<<< HEAD
    p.tiers.forEach((t,j) => {
      const dist = 120 + j * 180 + j*10;
      const spread = (j%3 - 1) * 0.16 * dist * 0.6;
      const tx = pos.x + Math.cos(pos.angle) * dist + Math.cos(pos.angle+0.9) * spread;
      const ty = pos.y + Math.sin(pos.angle) * dist + Math.sin(pos.angle+0.9) * spread;
      t._pos = { x:tx, y:ty, r: TIER_DISPLAY_SIZE*0.6 };
      t.achievements.forEach((a, idx)=>{ a._pos = a._pos || { x:tx, y:ty, r: ACH_ICON*0.6, alpha: 0 }; a._holo = a._holo || 0; });
=======
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
  // initialize positions for hit-tests and node placeholders
=======
  // initialize positions for hit-tests
>>>>>>> parent of 650bc8e (Update script.js)
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=> {
    const pos = planetPosition(i, total, CORE_RADIUS);
<<<<<<< HEAD
    p._world = {x: pos.x, y: pos.y, angle: pos.angle};
>>>>>>> parent of 22ab30d (Update script.js)
    p.tiers.forEach((t,j)=>{
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      // same perpendicular offset used in draw to ensure consistent hit positions
      const perpMag = 24 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(pos.angle); const perpY = Math.cos(pos.angle);
      const side = (j % 3) - 1; // -1,0,1
      const offsetX = perpX * perpMag * side * 0.35; const offsetY = perpY * perpMag * side * 0.35;
      const tx = pos.x + Math.cos(pos.angle)*dist + offsetX; const ty = pos.y + Math.sin(pos.angle)*dist + offsetY;
<<<<<<< HEAD
      t._pos = { x: tx, y: ty, r: TIER_SIZE*0.6 };
      t.achievements.forEach((a, idx) => { a._pos = a._pos || { x: tx, y: ty, r: ACH_ICON*0.6, alpha: 0 }; a._holo = a._holo || 0; });
<<<<<<< HEAD
>>>>>>> parent of 59e789a (Update script.js)
=======
>>>>>>> parent of 59e789a (Update script.js)
=======
      t._pos = {x:tx, y:ty, r: TIER_SIZE*0.6};
      t.achievements.forEach((a, idx)=> {
        // placeholder positions — will be updated in draw
        a._pos = a._pos || {x:tx, y:ty, r: ACH_ICON*0.6};
        a._holo = a._holo || 0;
      });
>>>>>>> parent of 22ab30d (Update script.js)
=======
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
    p.tiers.forEach((t,j)=> {
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = pos.x + Math.cos(pos.angle) * dist;
      const ty = pos.y + Math.sin(pos.angle) * dist;
      t._pos = { x: tx, y: ty, r: TIER_SIZE*0.6 };
      t.achievements.forEach((a, idx) => { a._pos = a._pos || {x:tx, y:ty, r: ACH_ICON*0.6}; a._holo = a._holo || 0; });
>>>>>>> parent of 650bc8e (Update script.js)
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

<<<<<<< HEAD
<<<<<<< HEAD
/* convenience */
<<<<<<< HEAD
<<<<<<< HEAD
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.62; state.focused.core = null; state.focused.tier = null; });
=======
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core=null; state.focused.tier=null; });
>>>>>>> parent of 59e789a (Update script.js)
=======
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core=null; state.focused.tier=null; });
>>>>>>> parent of 59e789a (Update script.js)
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); }});
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

// touch behavior (mobile)
canvas.addEventListener('touchend', (e)=>{
=======
/* ---------- convenience ---------- */
homeBtn.addEventListener('click', ()=>{ state.target.x=0; state.target.y=0; state.target.scale=0.55; state.focused.core=null; state.focused.tier=null; });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); } });
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });
=======
/* convenience & mobile */
homeBtn.addEventListener('click', ()=> { state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core = null; state.focused.tier = null; });
document.addEventListener('keydown', (e)=> { if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; }});
document.addEventListener('selectstart', (e)=> { if(state.dragging) e.preventDefault(); });
>>>>>>> parent of 650bc8e (Update script.js)

canvas.addEventListener('touchend', (e)=> {
>>>>>>> parent of 22ab30d (Update script.js)
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      const h = state.hovered;
      if(h.type === 'achievement') openAchievementPopup(h.core, h.tier, h.ach);
      else if(h.type === 'core'){ const p = achievements.planets[h.index]; const pos = p._world; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null; }
      else if(h.type === 'tier'){ const pos = achievements.planets[h.core].tiers[h.tier]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6; state.focused.core = h.core; state.focused.tier = h.tier; }
      else if(h.type === 'junction'){ const core = h.core, tIdx = h.tier; const prev = achievements.planets[core].tiers[tIdx]; const all = prev.achievements.every(a=>a.status==='completed'); if(all && achievements.planets[core].tiers[tIdx+1]){ const pos = achievements.planets[core].tiers[tIdx+1]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6; state.focused.core = core; state.focused.tier = tIdx+1; } else { popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; } }
    }
  }
}, { passive:true });

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
document.addEventListener('pointerdown', ()=> { if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* EOF */
=======
document.addEventListener('pointerdown', ()=>{ if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* END */
>>>>>>> parent of 59e789a (Update script.js)
=======
document.addEventListener('pointerdown', ()=>{ if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* END */
>>>>>>> parent of 59e789a (Update script.js)
=======
document.addEventListener('pointerdown', ()=> { if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* End of script.js */
>>>>>>> parent of 22ab30d (Update script.js)
=======
document.addEventListener('pointerdown', ()=>{
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){} }
}, { once:true });
>>>>>>> parent of 650bc8e (Update script.js)
