/* script.js
   - Updated to:
     * apply planethover underlay to ALL tier planets on actual hover
     * place nodes on tier planet surface (compact) and expand to rings when focused
     * hologram under nodes (centered, slightly larger) that fades in on node hover
     * single title card DOM for node details (fades) — prevents double details
     * tier planets spaced slightly off-line (perpendicular offsets)
     * Electrolize font used by UI/title card
     * minor optimization & throttled hover sound
*/

/* ---------- canvas init ---------- */
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
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ---------- UI elements ---------- */
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const gradToggle = document.getElementById('gradToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');

const tooltip = document.getElementById('tooltip');
const tooltipHolo = document.getElementById('tooltipHolo');
const tooltipContent = document.getElementById('tooltipContent');

const titleCard = document.getElementById('titleCard');
const titleCardTitle = document.getElementById('titleCardTitle');
const titleCardDesc = document.getElementById('titleCardDesc');

const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

/* ---------- cachedGrad (fix) ---------- */
let cachedGrad = { accent: '#00c8ff', gradEnabled: true };
function buildCachedGradients(){
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff').trim();
  const gradEnabled = !!(gradToggle && gradToggle.checked);
  cachedGrad = { accent, gradEnabled };
}

/* ---------- setAccent & UI wiring ---------- */
function setAccent(hex){
  document.documentElement.style.setProperty('--accent', hex);
  buildCachedGradients();
}
colorPicker.addEventListener('input', (e)=> setAccent(e.target.value));
setAccent(colorPicker ? colorPicker.value : '#00c8ff');

if(monoToggle) monoToggle.addEventListener('change', ()=>{
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  if(mono) tooltipHolo.classList.add('grayscale'); else tooltipHolo.classList.remove('grayscale');
});

if(transRange) transRange.addEventListener('input', () => state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', () => buildCachedGradients());

/* ---------- assets preload ---------- */
const IMG_PATH = 'assets/';
const ASSETS = {
  center:'center.png', planet:'planet.png', planethover:'planethover.png',
  tier2:'tier2.png', tier3:'tier3.png', tier4:'tier4.png', tier5:'tier5.png',
  node:'node.png', lock:'lock.png', pulse:'pulse.png',
  junction:'junction.png', hologram:'achievementnodehologram.png', completedTier:'completedplanettier.png'
};
const SOUNDS = { hover:'hover.mp3', zoom:'zoom.mp3', bg:'background.mp3' };

const images = {};
const sounds = {};

function loadImage(k, src){ return new Promise(res=>{ const i = new Image(); i.src = src; i.onload = ()=>{ images[k]=i; res(i); }; i.onerror = ()=>{ console.warn('img failed', src); res(null); }; }); }
function loadAudio(k, src){ return new Promise(res=>{ const a = new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); }); }

const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* ---------- data ---------- */
let achievements = { planets: [] };
async function loadData(){
  try {
    const r = await fetch('./achievements.json');
    achievements = await r.json();
    const saved = localStorage.getItem('progress');
    if(saved){
      try {
        const prog = JSON.parse(saved);
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=>{
          if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
            achievements.planets[i].tiers[j].achievements[k].status = a.status;
            achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
          }
        })));
      } catch(e){ console.warn('progress parse fail', e); }
    }
  } catch(e){
    console.warn('achievements.json missing; using sample', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* ---------- state & layout constants ---------- */
const state = {
  camera:{x:0,y:0,scale:0.55},
  target:{x:0,y:0,scale:0.55},
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused:{core:null, tier:null},
  hovered:null,
  dragging:false,
  dragStart:null
};

const CORE_RADIUS = 420;
const PLANET_SIZE = 92;
const PLANET_HOVER_SCALE = 1.5;
const TIER_BASE_OFFSET = 120;
const TIER_SPACING = 108;
const TIER_SIZE = 42;
const ACH_ICON = 18;

/* ---------- visuals: stars, nebula ---------- */
const stars = []; for(let i=0;i<220;i++) stars.push({ x:(Math.random()*2-1)*1600, y:(Math.random()*2-1)*1000, r:Math.random()*1.6+0.2, speed: Math.random()*0.22+0.02});
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*400, a:0.08 + Math.random()*0.12});

/* ---------- helper funcs ---------- */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{s.currentTime=0; s.play();}catch(e){} }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  return { x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle };
}

function screenToWorld(px,py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x:(px - cx)/state.camera.scale, y:(py - cy)/state.camera.scale };
}

/* ---------- drawing ---------- */
let ttime = 0;
function draw(){
  const dt = 1/60;
  ttime += dt;

  // camera smoothing
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2 + state.camera.x * state.camera.scale, H/2 + state.camera.y * state.camera.scale);
  ctx.scale(state.camera.scale, state.camera.scale);

  // nebula
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  });

  // stars
  ctx.save();
  ctx.globalAlpha = 0.95;
  stars.forEach(s=>{
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -2000) s.x = 2000;
  });
  ctx.restore();

  // central animated orbits (fill canvas)
  const maxR = Math.max(W,H) * 0.9;
  const accent = (cachedGrad && cachedGrad.accent) || '#00c8ff';
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
  for(let r=80; r < maxR; r += 40){
    ctx.globalAlpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.18);
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();

    // cheap animated specks
    const pulsesPerRing = Math.floor(1 + (r/300));
    for(let p=0;p<pulsesPerRing;p++){
      const prog = ((ttime*0.06) + p*0.32 + r*0.002) % 1;
      const ang = prog * Math.PI*2;
      const sx = Math.cos(ang) * r; const sy = Math.sin(ang) * r;
      ctx.globalAlpha = 0.6 * (0.4 + Math.sin(ttime*3 + r*0.1 + p)*0.6);
      ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(sx, sy, 1.4 + (r%3===0?0.8:0), 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();

  // center image
  if(images.center) ctx.drawImage(images.center, -220/2, -220/2, 220, 220);

  // planets & tiers
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((planet,i) => {
    const pos = planetPosition(i, total, CORE_RADIUS);
    const px = pos.x, py = pos.y; planet._world = {x:px,y:py, angle: pos.angle};

    // planethover underlay for core
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isCoreHover = state.hovered?.type==='core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isCoreHover?1:0, 0.14);
    if(images.planethover){
      const base = PLANET_SIZE * 1.6; const s = 1 + planet._hover*0.28;
      ctx.save(); ctx.globalAlpha = 0.35 + planet._hover*0.4; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // base planet draw (bigger)
    const baseSize = PLANET_SIZE * (1 + planet._hover*0.06);
    const tierImg = images[`tier${Math.min(5,(planet.tier||1))}`] || images.planet || null;
    if(tierImg) ctx.drawImage(tierImg, px - baseSize/2, py - baseSize/2, baseSize, baseSize);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px,py,baseSize/2,0,Math.PI*2); ctx.fill(); }

    // small satellite orbits for solar system vibe
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = accent; ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
    for(let o=0;o<3;o++){ ctx.beginPath(); ctx.ellipse(px,py,40+o*18,14+o*8,pos.angle+o*0.18,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();

    // tiers chain but with small perpendicular offset to avoid straight line
    planet.tiers.forEach((tier,j) => {
      // base outward vector
      const angle = pos.angle;
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;

      // perpendicular offset magnitude (alternating sign for spread)
      const perpMag = 24 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);
      // small deterministic offset to keep layout stable
      const side = (j % 3) - 1; // -1,0,1
      const offsetX = perpX * perpMag * side * 0.35;
      const offsetY = perpY * perpMag * side * 0.35;

      const tx = px + Math.cos(angle) * dist + offsetX;
      const ty = py + Math.sin(angle) * dist + offsetY;
      tier._pos = {x:tx, y:ty};

      // connector (from previous)
      const from = (j === 0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx,y:ty};

      // base connector line
      ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = accent; ctx.lineWidth = 2 / Math.max(0.6, state.camera.scale);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();

      // moving pulses along connector (direction from->to): trail effect using small circles
      for(let p=0;p<2;p++){
        const speed = 0.18 + p*0.08 + j*0.02;
        const prog = (ttime * speed + p * 0.3) % 1;
        const pxp = from.x + (to.x - from.x) * prog;
        const pyp = from.y + (to.y - from.y) * prog;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85 * (0.4 + Math.sin(ttime*4 + p)*0.15);
        ctx.beginPath(); ctx.fillStyle = accent; ctx.arc(pxp, pyp, 6 + Math.sin(ttime*6 + p)*1.6, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // junction icon (midpoint)
      const jx = from.x + (to.x - from.x) * 0.62;
      const jy = from.y + (to.y - from.y) * 0.62;
      const jSize = 24;
      if(images.junction) ctx.drawImage(images.junction, jx - jSize/2, jy - jSize/2, jSize, jSize);
      tier._junction = { x:jx, y:jy, r:14, index:j };

      // planethover underlay for tier planet when actually hovered
      const tierHoverKey = (state.hovered && state.hovered.type === 'tier' && state.hovered.core === i && state.hovered.tier === j);
      tier._hover = tier._hover === undefined ? 0 : tier._hover;
      tier._hover = lerp(tier._hover, tierHoverKey ? 1 : 0, 0.14);
      if(images.planethover){
        const base = TIER_SIZE * 1.8;
        const s = 1 + tier._hover * 0.28;
        ctx.save(); ctx.globalAlpha = 0.35 + tier._hover*0.42; ctx.drawImage(images.planethover, tx - (base*s)/2, ty - (base*s)/2, base*s, base*s); ctx.restore();
      }

      // tier planet draw
      const tImg = images[`tier${Math.min(5,j+1)}`] || images.planet || null;
      if(tImg) ctx.drawImage(tImg, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      else { ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); }

      // tier label when zoomed
      if(state.camera.scale > 0.9){
        ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '12px Electrolize, Arial'; ctx.textAlign = 'center';
        ctx.fillText(tier.tierName || `Tier ${j+1}`, tx, ty - TIER_SIZE/2 - 10); ctx.restore();
      }

      // completed overlay
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE); ctx.restore();
      }

      /* --- node placement logic ---
         compact mode: nodes placed around the SMALL circle ON the tier planet (so they appear "on" the planet)
         expanded mode: when focused into the tier, nodes expand into concentric rings around the tier planet
      */
      const nodes = tier.achievements;
      const compactRadius = Math.max( TIER_SIZE*0.9, 18 );
      if(state.focused.core === i && state.focused.tier === j){
        // expanded rings (same as before)
        const perRing = 10;
        const rings = Math.ceil(nodes.length / perRing);
        let idx = 0;
        for(let ring=0; ring<rings; ring++){
          const count = Math.min(perRing, nodes.length - ring*perRing);
          const ringR = 36 + ring * 48;
          for(let n=0;n<count;n++){
            const ang = (n / count)*Math.PI*2 + ring*0.12 + ttime*0.02;
            const ax = tx + Math.cos(ang) * ringR;
            const ay = ty + Math.sin(ang) * ringR;
            const a = nodes[idx];

            // branch glow
            ctx.save(); ctx.globalAlpha = 0.12 + (a.status==='available'?0.16:0.05); ctx.strokeStyle = accent; ctx.lineWidth = 1.6 / Math.max(0.6, state.camera.scale); ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();

            // icon
            const icon = (a.status==='locked' ? images.lock : images.node);
            if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
            else { ctx.fillStyle = a.status==='locked' ? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

            // pulse overlay on top
            if(a.status === 'available' && images.pulse){
              ctx.save();
              const pScale = 1 + 0.16*Math.sin(ttime*6 + idx);
              const psize = ACH_ICON + 8 * pScale;
              ctx.globalAlpha = 0.35 + 0.15 * Math.sin(ttime*4 + idx);
              ctx.drawImage(images.pulse, ax - psize/2, ay - psize/2, psize, psize);
              ctx.restore();
            }

            // node label when zoomed
            if(state.camera.scale > 1.8){
              ctx.save(); ctx.font = '11px Electrolize, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(a.title || `Node ${idx+1}`, ax, ay + ACH_ICON + 12); ctx.restore();
            }

            // hologram fade (under the node)
            a._holo = a._holo===undefined?0:a._holo;
            if(state.hovered && state.hovered.type === 'achievement' && state.hovered.core === i && state.hovered.tier === j && state.hovered.ach === idx){
              a._holo = lerp(a._holo, 1, 0.18);
            } else {
              a._holo = lerp(a._holo, 0, 0.12);
            }
            if(a._holo > 0.02 && images.hologram){
              ctx.save(); ctx.globalAlpha = a._holo * 0.95;
              const hs = 40 + 12 * a._holo; // same size as node but a bit bigger
              ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs);
              ctx.restore();
            }

            // save hit pos
            a._pos = {x:ax, y:ay, r: ACH_ICON*0.6};
            idx++;
          }
        }
      } else {
        // compact: place nodes ON the tier planet circumference (so they lay on planet)
        const count = nodes.length;
        for(let n=0;n<count;n++){
          const ang = (n / count) * Math.PI*2 + ttime*0.01; // slight slow spin to avoid perfect static layout
          const ax = tx + Math.cos(ang) * compactRadius;
          const ay = ty + Math.sin(ang) * compactRadius;
          const a = nodes[n];

          // node base
          const icon = (a.status==='locked' ? images.lock : images.node);
          if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
          else { ctx.fillStyle = a.status==='locked' ? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

          // small label beside node (small but readable when zoomed)
          if(state.camera.scale > 1.4){
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
    }); // end tiers
  }); // end planets

  ctx.restore();
  requestAnimationFrame(draw);
}

/* ---------- interactions & hover logic ---------- */
let pointer = {x:0,y:0,down:false};
let lastHoverSound = 0;

canvas.addEventListener('pointerdown', (e)=>{
  pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY;
  state.dragging = true;
  state.dragStart = {x:e.clientX,y:e.clientY, camx: state.target.x, camy: state.target.y};
  if(sounds.bg && sounds.bg.paused) try{ sounds.bg.loop = true; sounds.bg.play(); } catch(e){}
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e)=>{
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy;
    state.hovered = null; hideTitleCard();
  } else {
    updateHover(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointerup', (e)=>{
  pointer.down = false; state.dragging = false; canvas.releasePointerCapture?.(e.pointerId);
  if(state.hovered){
    const h = state.hovered;
    if(h.type === 'core'){
      const p = achievements.planets[h.index]; const pos = p._world;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = h.core; state.focused.tier = h.tier;
      playSound('zoom');
    } else if(h.type === 'junction'){
      // only allow zoom if previous tier completed
      const core = h.core, tIdx = h.tier;
      const prev = achievements.planets[core].tiers[tIdx];
      const all = prev.achievements.every(a=>a.status==='completed');
      if(all && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
      // show title card (also opens popup on double-click or mobile)
      showTitleCardFor(h);
    }
  }
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0015), 0.2, 8.0);
  playSound('zoom');
}, { passive:false });

/* hover detection logic using instantaneous camera (no easing) */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;

  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    const ppos = p._world;
    if(ppos && dist(w.x,w.y, ppos.x, ppos.y) < Math.max(28, PLANET_SIZE*0.45)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<p.tiers.length;j++){
      const t = p.tiers[j];
      if(t._pos && dist(w.x,w.y, t._pos.x, t._pos.y) < Math.max(14, TIER_SIZE*0.6)){
        found = { type:'tier', core:i, tier:j, pos:t._pos }; break;
      }
      if(t._junction && dist(w.x,w.y, t._junction.x, t._junction.y) < 18){
        found = { type:'junction', core:i, tier:j, pos:t._junction }; break;
      }
      // achievements checks only when focused or even in compact (we support both)
      for(let k=0;k<t.achievements.length;k++){
        const a = t.achievements[k];
        if(a._pos && dist(w.x,w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
          found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
        }
      }
      if(found) break;
    }
    if(found) break;
  }

  if(found){
    // ensure only one details element shown: titleCard for nodes; tooltip for planets/tiers/junctions
    state.hovered = found;
    if(found.type === 'achievement'){
      // hide tooltip, show titleCard
      tooltip.style.display = 'none';
      showTitleCardFor(found);
    } else {
      // hide titleCard if visible, show tooltip
      hideTitleCard();
      showTooltipAt(sx, sy, found);
    }
    const now = Date.now();
    if(!lastHoverSound || (now - lastHoverSound) > 300){ playSound('hover'); lastHoverSound = now; }
  } else {
    state.hovered = null; tooltip.style.display = 'none'; hideTitleCard();
  }
}

/* ---------- Title card DOM control (single card) ---------- */
let titleCardHideTimer = null;
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
  // hide tooltip if exists
  tooltip.style.display = 'none';
  // clear existing hide timer and set auto-hide
  if(titleCardHideTimer) clearTimeout(titleCardHideTimer);
  titleCardHideTimer = setTimeout(()=> hideTitleCard(), 5000); // auto hide after 5s
}
function hideTitleCard(){
  if(!titleCard) return;
  titleCard.classList.remove('show');
  // small delay to allow transition then hide element
  setTimeout(()=> { if(titleCard) titleCard.style.display = 'none'; }, 200);
  if(titleCardHideTimer) { clearTimeout(titleCardHideTimer); titleCardHideTimer = null; }
}

/* ---------- tooltip DOM for planets/tiers ---------- */
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720) { tooltip.style.display = 'none'; return; }
  let title = '', desc = '';
  if(found.type === 'core'){ const p = achievements.planets[found.index]; title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom'; }
  else if(found.type === 'tier'){ const t = achievements.planets[found.core].tiers[found.tier]; title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`; }
  else if(found.type === 'junction'){ title='Junction'; desc='Travel to next tier (unlock required)'; }
  tooltipContent.innerHTML = `<strong style="font-family:Electrolize,Arial">${title}</strong><div style="opacity:0.88;margin-top:6px">${desc}</div>`;
  const pad = 12; let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 320;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 140 > window.innerHeight - 10) top = sy - 140 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* ---------- popup helper ---------- */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`;
  popup.style.display = 'block';
}
function closePopup(){ popup.style.display = 'none'; }

window.completeAchievement = (core,tier,ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed'; a.dateCompleted = new Date().toISOString();
  localStorage.setItem('progress', JSON.stringify(achievements));
  popup.style.display = 'none';
  const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed');
  if(all && tier < achievements.planets[core].tiers.length - 1){
    achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status==='locked') x.status='available'; });
  }
};

/* ---------- admin (kept simple) ---------- */
window.showAdminPanel = () => { adminPanel.style.display = 'block'; document.getElementById('adminLogin').style.display = 'block'; editContent.style.display = 'none'; }
window.hideAdminPanel = () => { adminPanel.style.display = 'none'; }
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if(pass === 'admin'){
    let html = '';
    achievements.planets.forEach((p,i)=>{
      html += `<h3>${escapeHtml(p.planetName||'Planet')}</h3>`;
      p.tiers.forEach((t,j)=>{
        html += `<h4>${escapeHtml(t.tierName||'Tier')}</h4>`;
        t.achievements.forEach((a,k)=>{
          html += `<div style="margin-bottom:6px;"><input style="width:45%;margin-right:6px" value="${escapeHtml(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)"><input style="width:45%" value="${escapeHtml(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)"><select onchange="editStatus(${i},${j},${k},this.value)"><option ${a.status==='locked'?'selected':''}>locked</option><option ${a.status==='available'?'selected':''}>available</option><option ${a.status==='completed'?'selected':''}>completed</option></select></div>`;
        });
      });
    });
    html += `<div style="margin-top:12px"><button onclick="downloadJson()">Download JSON</button><button onclick="bulkUnlock()">Bulk Unlock</button><button onclick="bulkReset()">Bulk Reset</button></div>`;
    editContent.innerHTML = html;
    document.getElementById('adminLogin').style.display = 'none'; editContent.style.display = 'block';
  } else alert('Wrong password');
};
window.editTitle = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].title = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editDesc = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].description = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editStatus = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].status = v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v==='completed'?new Date().toISOString():null; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.downloadJson = ()=>{ const blob = new Blob([JSON.stringify(achievements, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click(); };
window.bulkUnlock = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0? 'available':'locked'; a.dateCompleted=null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* ---------- helpers ---------- */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* ---------- init ---------- */
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  buildCachedGradients();
  if(tooltipHolo) tooltipHolo.src = 'assets/achievementnodehologram.png';
  if(monoToggle && monoToggle.checked) tooltipHolo.classList.add('grayscale');

  // initialize positions for hit-tests and node placeholders
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=>{
    const pos = planetPosition(i, total, CORE_RADIUS);
    p._world = {x: pos.x, y: pos.y, angle: pos.angle};
    p.tiers.forEach((t,j)=>{
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      // same perpendicular offset used in draw to ensure consistent hit positions
      const perpMag = 24 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(pos.angle); const perpY = Math.cos(pos.angle);
      const side = (j % 3) - 1; // -1,0,1
      const offsetX = perpX * perpMag * side * 0.35; const offsetY = perpY * perpMag * side * 0.35;
      const tx = pos.x + Math.cos(pos.angle)*dist + offsetX; const ty = pos.y + Math.sin(pos.angle)*dist + offsetY;
      t._pos = {x:tx, y:ty, r: TIER_SIZE*0.6};
      t.achievements.forEach((a, idx)=> {
        // placeholder positions — will be updated in draw
        a._pos = a._pos || {x:tx, y:ty, r: ACH_ICON*0.6};
        a._holo = a._holo || 0;
      });
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

/* ---------- convenience ---------- */
homeBtn.addEventListener('click', ()=>{ state.target.x=0; state.target.y=0; state.target.scale=0.55; state.focused.core=null; state.focused.tier=null; });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); } });
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

canvas.addEventListener('touchend', (e)=> {
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      if(state.hovered.type === 'achievement') openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
      else if(state.hovered.type === 'core'){ const p = achievements.planets[state.hovered.index]; state.target.x = -p._world.x; state.target.y = -p._world.y; state.target.scale = 2.6; state.focused.core = state.hovered.index; state.focused.tier = null; }
      else if(state.hovered.type === 'tier'){ const pos = achievements.planets[state.hovered.core].tiers[state.hovered.tier]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.8; state.focused.core = state.hovered.core; state.focused.tier = state.hovered.tier; }
      else if(state.hovered.type === 'junction'){ const core = state.hovered.core; const tIdx = state.hovered.tier; const prev = achievements.planets[core].tiers[tIdx]; const all = prev.achievements.every(a=>a.status==='completed'); if(all && achievements.planets[core].tiers[tIdx+1]){ const pos = achievements.planets[core].tiers[tIdx+1]._pos; state.target.x=-pos.x; state.target.y=-pos.y; state.target.scale=5.8; state.focused.core=core; state.focused.tier=tIdx+1;} else { popup.innerHTML=`<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`; popup.style.display='block'; } }
    }
  }
}, { passive:true });

document.addEventListener('pointerdown', ()=> { if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* End of script.js */
