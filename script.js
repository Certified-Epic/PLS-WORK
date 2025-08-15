/* script.js — revised: improved zoom, planet spacing, node bloom, hologram on-node, better moving pulses,
   titleCard expansion, junction visibility only when core hovered, and dynamic zoom to make focused planet cover ~45-50% screen.
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
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* UI + DOM */
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const gradToggle = document.getElementById('gradToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');

const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');

const titleCard = document.getElementById('titleCard');
const titleCardTitle = document.getElementById('titleCardTitle');
const titleCardDesc = document.getElementById('titleCardDesc');
const expandDetailsBtn = document.getElementById('expandDetailsBtn');
const expansion = document.getElementById('expandedDetails');
const expTitle = document.getElementById('expTitle');
const expDesc = document.getElementById('expDesc');

const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

/* cached gradient */
let cachedGrad = { accent: '#00c8ff', gradEnabled: true };
function buildCachedGradients(){
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff').trim();
  const gradEnabled = !!(gradToggle && gradToggle.checked);
  cachedGrad = { accent, gradEnabled };
}

/* set accent & listeners */
function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); buildCachedGradients(); }
colorPicker.addEventListener('input', (e)=> setAccent(e.target.value));
setAccent(colorPicker ? colorPicker.value : '#00c8ff');

if(monoToggle) monoToggle.addEventListener('change', ()=>{
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
});
if(transRange) transRange.addEventListener('input', ()=> state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', buildCachedGradients);

/* preload assets - keep paths same as your structure */
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
function loadImage(k,src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{images[k]=i;res(i)}; i.onerror=()=>{ console.warn('img fail',src); res(null); }; }); }
function loadAudio(k,src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); }); }

const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* load achievements */
let achievements = { planets: [] };
async function loadData(){
  try{
    const r = await fetch('./achievements.json');
    achievements = await r.json();
    const saved = localStorage.getItem('progress');
    if(saved){
      const prog = JSON.parse(saved);
      prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
        if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
          achievements.planets[i].tiers[j].achievements[k].status = a.status;
          achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
        }
      })));
    }
  }catch(e){
    console.warn('cannot load achievements.json, using demo', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* state + layout */
const state = {
  camera:{ x:0, y:0, scale:0.45 },
  target:{ x:0, y:0, scale:0.45 },
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused:{ core:null, tier:null },
  hovered:null,
  dragging:false,
  dragStart:null
};

/* layout tuning */
const CORE_RADIUS = 900;      // increased spacing between planets
const PLANET_SIZE = 160;      // base large core planet size
const TIER_BASE_OFFSET = 180;
const TIER_SPACING = 140;
const TIER_SIZE = 72;
const ACH_ICON = 22;

/* extras for atmosphere & zoom */
const atmosphereStart = 1.8;   // scale where atmosphere starts appearing
const atmosphereFull = 4.0;    // scale where atmosphere fully opaque
const nodeShowStart = 1.2;     // scale where nodes begin to fade in
const nodeShowEnd = 3.2;       // fully visible at this scale

/* stars/nebula */
const stars = []; for(let i=0;i<240;i++) stars.push({ x:(Math.random()*2-1)*2600, y:(Math.random()*2-1)*1800, r:Math.random()*1.6+0.2, speed: Math.random()*0.28+0.02 });
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*480, a:0.06 + Math.random()*0.18 });

/* helpers */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

/* world/screen transforms */
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  // small radial jitter to avoid perfect circle layout but keep spacing big
  const jitter = 0.08 * radius * (Math.sin(index*1.7) * 0.08);
  return { x: Math.cos(angle)*(radius + jitter), y: Math.sin(angle)*(radius + jitter), angle };
}
function screenToWorld(px,py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x:(px - cx)/state.camera.scale, y:(py - cy)/state.camera.scale };
}

/* compute an appropriate camera scale so that objectSize (in world px) becomes target fraction (0..1) of screen min dimension */
function computeScaleToCoverFraction(objectSize, fraction){
  const minScreen = Math.min(W,H);
  // We want objectSize * scale = fraction * minScreen  => scale = (fraction*minScreen)/objectSize
  const scale = (fraction * minScreen) / Math.max(1, objectSize);
  // clamp to reasonable bounds
  return clamp(scale, 0.18, 8.5);
}

/* DRAW LOOP */
let time = 0;
function draw(){
  const dt = 1/60;
  time += dt;
  // camera smoothing
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2 + state.camera.x * state.camera.scale, H/2 + state.camera.y * state.camera.scale);
  ctx.scale(state.camera.scale, state.camera.scale);

  // nebula (soft)
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  });

  // stars
  ctx.save();
  ctx.globalAlpha = 0.95;
  stars.forEach(s=>{
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 10 * (state.camera.scale*0.7);
    if(s.x < -3200) s.x = 3200;
  });
  ctx.restore();

  const accent = cachedGrad && cachedGrad.accent || '#00c8ff';

  // central ornament: small center image only (removed random giant circle)
  if(images.center){
    const size = 160;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.drawImage(images.center, -size/2, -size/2, size, size);
    ctx.restore();
  }

  // planets & tiers
  const total = achievements.planets.length || 5;
  for(let i=0;i<total;i++){
    const planet = achievements.planets[i];
    const pos = planetPosition(i, total, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = {x:px, y:py, angle: pos.angle};

    // hover animation
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isCoreHover = state.hovered?.type === 'core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isCoreHover?1:0, 0.14);

    // core planet base
    const baseSize = PLANET_SIZE * (1 + planet._hover*0.06);
    const tierImg = images[`tier${Math.min(5,(planet.tier||1))}`] || images.planet || null;
    if(tierImg) ctx.drawImage(tierImg, px - baseSize/2, py - baseSize/2, baseSize, baseSize);
    else { ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(px,py,baseSize/2,0,Math.PI*2); ctx.fill(); }

    // soft orbital perspective rings (sparse so planets feel distant)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1 / Math.max(0.5, state.camera.scale);
    for(let r=80; r<2000; r+=220){
      ctx.beginPath(); ctx.ellipse(px,py,r, r*0.28, pos.angle + 0.02*r/400,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();

    // tiers
    planet.tiers.forEach((tier,j) => {
      const angle = pos.angle;
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const perpMag = 28 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(angle), perpY = Math.cos(angle);
      const side = (j % 3) - 1;
      const offsetX = perpX * perpMag * side * 0.36;
      const offsetY = perpY * perpMag * side * 0.36;

      const tx = px + Math.cos(angle) * dist + offsetX;
      const ty = py + Math.sin(angle) * dist + offsetY;
      tier._pos = { x:tx, y:ty };

      const from = (j===0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx, y:ty};

      // connector: draw glowing moving streaks along path (not just dots)
      ctx.save();
      ctx.lineWidth = 2.2 / Math.max(0.5, state.camera.scale);
      ctx.lineCap = 'round';
      // faint base line
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = accent;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();

      // moving streaks (two layers with slightly different speeds)
      for(let sLayer = 0; sLayer < 2; sLayer++){
        const speed = 0.45 + sLayer*0.18 + j*0.02;
        const segmentCount = 6 + sLayer*3;
        for(let seg=0; seg<segmentCount; seg++){
          const tProg = ((time*(0.25+0.06*sLayer)) + (seg/segmentCount) + j*0.03) % 1;
          const pxp = from.x + (to.x - from.x) * tProg;
          const pyp = from.y + (to.y - from.y) * tProg;
          const segLen = 10 + sLayer*6;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.18 + 0.28 * (1 - Math.abs(0.5 - (tProg*2 - Math.floor(tProg*2)))); // soft bloom
          // draw short line perpendicular-ish to create streak impression
          const angleSeg = Math.atan2(to.y-from.y, to.x-from.x);
          const ox = Math.cos(angleSeg) * segLen;
          const oy = Math.sin(angleSeg) * segLen;
          ctx.strokeStyle = accent;
          ctx.beginPath();
          ctx.moveTo(pxp - ox*0.18, pyp - oy*0.18);
          ctx.lineTo(pxp + ox*0.12, pyp + oy*0.12);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();

      // junction icon: only visible when hovering core planet
      const jx = from.x + (to.x - from.x) * 0.62;
      const jy = from.y + (to.y - from.y) * 0.62;
      const jSize = 28;
      const showJunctions = (state.hovered && state.hovered.type === 'core' && state.hovered.index === i);
      if(showJunctions && images.junction) ctx.drawImage(images.junction, jx - jSize/2, jy - jSize/2, jSize, jSize);
      tier._junction = { x: jx, y: jy, r: jSize*0.5, index: j };

      // tier visual hover underlay
      tier._hover = tier._hover===undefined?0:tier._hover;
      const isTierHover = state.hovered && state.hovered.type === 'tier' && state.hovered.core === i && state.hovered.tier === j;
      tier._hover = lerp(tier._hover, isTierHover ? 1 : 0, 0.14);
      if(images.planethover){
        const base = TIER_SIZE * 2.2;
        const s = 1 + tier._hover * 0.28;
        ctx.save(); ctx.globalAlpha = 0.28 + tier._hover*0.46; ctx.drawImage(images.planethover, tx - (base*s)/2, ty - (base*s)/2, base*s, base*s); ctx.restore();
      }

      // draw tier planet
      if(images[`tier${Math.min(5,j+1)}`] || images.planet) ctx.drawImage(images[`tier${Math.min(5,j+1)}`] || images.planet, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); }

      // tier label on zoom
      if(state.camera.scale > 0.9){
        ctx.save(); ctx.fillStyle='#fff'; ctx.font='12px Electrolize, Arial'; ctx.textAlign='center'; ctx.fillText(tier.tierName || `Tier ${j+1}`, tx, ty - TIER_SIZE/2 - 12); ctx.restore();
      }

      // completed overlay
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){ ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE); ctx.restore(); }

      /* Node placement logic:
         - compact on surface (small circle), expand into rings when focused.
         - alpha controlled by camera scale and fade timing.
      */
      const nodes = tier.achievements;
      const compactRadius = Math.max(TIER_SIZE * 0.92, 22);

      // node visibility factor (0..1) based on camera scale
      const vis = clamp((state.camera.scale - nodeShowStart) / (nodeShowEnd - nodeShowStart), 0, 1);

      if(state.focused.core === i && state.focused.tier === j){
        // expanded rings with stronger visibility
        const perRing = 10; const rings = Math.ceil(nodes.length / perRing);
        let idx=0;
        for(let ring=0; ring<rings; ring++){
          const count = Math.min(perRing, nodes.length - ring*perRing);
          const ringR = 42 + ring * 56;
          for(let n=0;n<count;n++){
            const a = nodes[idx];
            const ang = (n / count)*Math.PI*2 + ring*0.06 + time*0.02;
            const ax = tx + Math.cos(ang) * ringR;
            const ay = ty + Math.sin(ang) * ringR;

            // branch glow (thin)
            ctx.save(); ctx.globalAlpha = 0.12 + (a.status==='available'?0.2:0.06); ctx.strokeStyle = accent; ctx.lineWidth = 1.4 / Math.max(0.5, state.camera.scale); ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();

            // node base
            const icon = (a.status==='locked' ? images.lock : images.node);
            if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
            else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); }

            // pulse overlay on top (soft)
            if(a.status==='available' && images.pulse){
              ctx.save(); const pScale = 1 + 0.18*Math.sin(time*6 + idx); const psize = ACH_ICON + 8*pScale; ctx.globalAlpha = (0.32 + 0.18*Math.sin(time*4 + idx)) * (0.6 + 0.4*vis); ctx.drawImage(images.pulse, ax - psize/2, ay - psize/2, psize, psize); ctx.restore();
            }

            // node label when zoomed
            if(state.camera.scale > 1.8){
              ctx.save(); ctx.font='12px Electrolize, Arial'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.fillText(a.title || `Node ${idx+1}`, ax, ay + ACH_ICON + 14); ctx.restore();
            }

            // hologram fade under node only when hovering that node (drawn at node center)
            a._holo = a._holo === undefined ? 0 : a._holo;
            if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===idx) a._holo = lerp(a._holo, 1, 0.18); else a._holo = lerp(a._holo, 0, 0.12);
            if(a._holo > 0.02 && images.hologram){
              ctx.save(); ctx.globalAlpha = a._holo * 0.98; const hs = ACH_ICON*2.6; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
            }

            a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: Math.min(1, vis + 0.15) };
            idx++;
          }
        }
      } else {
        // compact nodes on the tier surface — nodes slowly show with vis factor
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          const ang = (n / nodes.length) * Math.PI*2 + time*0.008; // gentle rotation
          const ax = tx + Math.cos(ang) * compactRadius;
          const ay = ty + Math.sin(ang) * compactRadius;

          // draw hologram under node if hovered
          a._holo = a._holo === undefined ? 0 : a._holo;
          if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===n) a._holo = lerp(a._holo, 1, 0.18); else a._holo = lerp(a._holo, 0, 0.12);
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.98; const hs = ACH_ICON*2.2; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // node base (draw with alpha multiply)
          const icon = (a.status==='locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); } ctx.restore();

          // small label beside node (only when reasonably zoomed)
          if(state.camera.scale > 1.4){
            ctx.save(); ctx.globalAlpha = vis; ctx.font='11px Electrolize, Arial'; ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 8, ay + 4); ctx.restore();
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }
      }

    }); // end tiers
  } // end planets

  ctx.restore();

  /* ATMOSPHERE: draw on top of canvas when zoomed into a planet/tier to give approach into atmosphere */
  const s = state.camera.scale;
  const atmosAmount = clamp((s - atmosphereStart) / (atmosphereFull - atmosphereStart), 0, 1);
  if(atmosAmount > 0.001){
    // radial cloud near center of viewport to simulate atmospheric entry — uses screen coordinates now
    const cx = W/2, cy = H/2;
    const grd = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W,H) * 0.75);
    grd.addColorStop(0, `rgba(10,20,30,${0.12 * atmosAmount})`);
    grd.addColorStop(0.5, `rgba(0,0,0,${0.0 * atmosAmount})`);
    grd.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grd;
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // lens glow center
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 * atmosAmount;
    ctx.fillStyle = cachedGrad.accent || '#00c8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 120 + atmosAmount * 300, 0, Math.PI*2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

/* ---------- interactions ---------- */
let pointer = { x:0, y:0, down:false };
let lastHoverSound = 0;

canvas.addEventListener('pointerdown', (e)=>{
  pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY;
  state.dragging = true;
  state.dragStart = { x:e.clientX, y:e.clientY, camx: state.target.x, camy: state.target.y };
  if(sounds.bg && sounds.bg.paused) try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){}
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e)=>{
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(state.dragging && state.dragStart && Math.hypot(e.clientX-state.dragStart.x, e.clientY-state.dragStart.y) > 6){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy;
    state.hovered = null; hideTitleCard(); tooltip.style.display = 'none';
  } else {
    updateHover(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointerup', (e)=>{
  pointer.down = false; state.dragging = false; canvas.releasePointerCapture?.(e.pointerId);
  if(state.hovered){
    const h = state.hovered;
    if(h.type === 'core'){
      const p = achievements.planets[h.index];
      const pos = p._world;
      // compute zoom so core planet fills ~48% of screen
      const coreWorldSize = PLANET_SIZE * (1 + (p._hover||0)*0.06);
      const scaleTo = computeScaleToCoverFraction(coreWorldSize, 0.48);
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo;
      state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      // compute zoom so tier planet fills ~50% of screen
      const tierWorldSize = TIER_SIZE * (1 + (achievements.planets[h.core].tiers[h.tier]._hover||0)*0.06);
      const scaleTo = computeScaleToCoverFraction(tierWorldSize, 0.5);
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo;
      state.focused.core = h.core; state.focused.tier = h.tier;
      playSound('zoom');
    } else if(h.type === 'junction'){
      const core = h.core, tIdx = h.tier;
      // only allow zoom if previous tier completed
      const prev = achievements.planets[core].tiers[tIdx];
      const all = prev.achievements.every(a => a.status === 'completed');
      if(all && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
        const nextSize = TIER_SIZE;
        const scaleTo = computeScaleToCoverFraction(nextSize, 0.5);
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo;
        state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
      // show fixed title card (top-right)
      showTitleCardFor(h);
    }
  }
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0016), 0.18, 8.5);
  playSound('zoom');
}, { passive:false });

/* hover detection using instantaneous transform */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const planet = achievements.planets[i];
    const ppos = planet._world;
    if(ppos && dist(w.x,w.y, ppos.x, ppos.y) < Math.max(36, PLANET_SIZE*0.45)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      if(tier._pos && dist(w.x,w.y, tier._pos.x, tier._pos.y) < Math.max(18, TIER_SIZE*0.55)){
        found = { type:'tier', core:i, tier:j, pos: tier._pos }; break;
      }
      if(tier._junction && dist(w.x,w.y, tier._junction.x, tier._junction.y) < (tier._junction.r || 18)){
        // junction hover only when core is hovered (we still detect to show proper tooltip state)
        found = { type:'junction', core:i, tier:j, pos: tier._junction }; break;
      }
      // achievements detection (both compact & expanded)
      for(let k=0;k<tier.achievements.length;k++){
        const a = tier.achievements[k];
        if(a._pos && dist(w.x,w.y, a._pos.x, a._pos.y) < Math.max(10, a._pos.r + 6) && a._pos.alpha > 0.05){
          found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
        }
      }
      if(found) break;
    }
    if(found) break;
  }

  if(found){
    state.hovered = found;
    // single source of details:
    if(found.type === 'achievement'){ tooltip.style.display = 'none'; showTitleCardFor(found); }
    else { hideTitleCard(); showTooltipAt(sx, sy, found); }
    const now = Date.now();
    if(!lastHoverSound || (now - lastHoverSound) > 300){ playSound('hover'); lastHoverSound = now; }
  } else {
    state.hovered = null; tooltip.style.display = 'none'; hideTitleCard();
  }
}

/* Title card (fixed on top-right) */
let hideC = null;
function showTitleCardFor(h){
  if(!h || h.type !== 'achievement') return;
  const a = achievements.planets[h.core].tiers[h.tier].achievements[h.ach];
  titleCardTitle.textContent = a.title || 'Achievement';
  titleCardDesc.textContent = a.description || '';
  // expanded panel ready data
  expTitle.textContent = a.title || '';
  expDesc.textContent = a.description || '';

  titleCard.style.display = 'flex';
  requestAnimationFrame(()=> titleCard.classList.add('show'));
  if(hideC) clearTimeout(hideC);
  hideC = setTimeout(()=> hideTitleCard(), 5500);
}
function hideTitleCard(){
  titleCard.classList.remove('show');
  setTimeout(()=> titleCard.style.display = 'none', 220);
  if(hideC){ clearTimeout(hideC); hideC = null; }
}

/* tooltip (planet/tier/junction) placed near pointer but simple; excludes hologram image */
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display = 'none'; return; }
  let title='', desc='';
  if(found.type === 'core'){ const p = achievements.planets[found.index]; title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom'; }
  else if(found.type === 'tier'){ const t = achievements.planets[found.core].tiers[found.tier]; title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`; }
  else if(found.type === 'junction'){ title='Junction'; desc='Click to travel to the next tier (unlock required)'; }
  tooltipContent.innerHTML = `<strong style="font-family:Electrolize, Arial">${title}</strong><div style="opacity:0.88;margin-top:6px">${desc}</div>`;
  const pad = 12; let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 320;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 140 > window.innerHeight - 10) top = sy - 140 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* popup / complete */
function openAchievementPopup(core,tier,ach){ const a = achievements.planets[core].tiers[tier].achievements[ach]; popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; }
function closePopup(){ popup.style.display = 'none'; }
window.completeAchievement = (core,tier,ach) => { const a = achievements.planets[core].tiers[tier].achievements[ach]; a.status='completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); popup.style.display='none'; const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed'); if(all && tier < achievements.planets[core].tiers.length-1){ achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status==='locked') x.status='available'; }); } };

/* admin snippets (unchanged) */
window.showAdminPanel = () => { adminPanel.style.display = 'block'; document.getElementById('adminLogin').style.display = 'block'; editContent.style.display = 'none'; }
window.hideAdminPanel = () => { adminPanel.style.display = 'none'; }
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if(pass === 'admin'){
    let html = '';
    achievements.planets.forEach((p,i)=>{ html += `<h3>${escapeHtml(p.planetName||'Planet')}</h3>`; p.tiers.forEach((t,j)=>{ html += `<h4>${escapeHtml(t.tierName||'Tier')}</h4>`; t.achievements.forEach((a,k)=>{ html += `<div style="margin-bottom:6px;"><input style="width:45%;margin-right:6px" value="${escapeHtml(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)"><input style="width:45%" value="${escapeHtml(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)"><select onchange="editStatus(${i},${j},${k},this.value)"><option ${a.status==='locked'?'selected':''}>locked</option><option ${a.status==='available'?'selected':''}>available</option><option ${a.status==='completed'?'selected':''}>completed</option></select></div>`; }); }); });
    html += `<div style="margin-top:12px"><button onclick="downloadJson()">Download JSON</button><button onclick="bulkUnlock()">Bulk Unlock</button><button onclick="bulkReset()">Bulk Reset</button></div>`;
    editContent.innerHTML = html; document.getElementById('adminLogin').style.display = 'none'; editContent.style.display = 'block';
  } else alert('Wrong password');
};
window.editTitle = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].title = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editDesc = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].description = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editStatus = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].status = v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v==='completed'?new Date().toISOString():null; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.downloadJson = ()=>{ const blob = new Blob([JSON.stringify(achievements, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='achievements.json'; a.click(); };
window.bulkUnlock = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0? 'available' : 'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* Title card expansion handlers */
expandDetailsBtn?.addEventListener('click', ()=>{
  if(!expansion.classList.contains('expanded')){
    expansion.classList.add('expanded');
    expansion.style.display = 'block';
  } else {
    closeExpanded();
  }
});
function closeExpanded(){
  expansion.classList.remove('expanded');
  expansion.style.display = 'none';
}

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* init */
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  buildCachedGradients();

  // initialise node placeholders & positions (stable layout)
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=>{
    const pos = planetPosition(i, total, CORE_RADIUS);
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
    p.tiers.forEach((t,j)=>{
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const perpMag = 28 + (j % 2 === 0 ? j*6 : j*8);
      const perpX = -Math.sin(pos.angle); const perpY = Math.cos(pos.angle);
      const side = (j % 3) - 1;
      const offsetX = perpX * perpMag * side * 0.36;
      const offsetY = perpY * perpMag * side * 0.36;
      const tx = pos.x + Math.cos(pos.angle)*dist + offsetX; const ty = pos.y + Math.sin(pos.angle)*dist + offsetY;
      t._pos = { x: tx, y: ty, r: TIER_SIZE*0.6 };
      t.achievements.forEach((a, idx) => { a._pos = a._pos || { x: tx, y: ty, r: ACH_ICON*0.6, alpha: 0 }; a._holo = a._holo || 0; });
    });
  });

  document.body.classList.remove('loading');

  // initial camera center & scale
  state.camera = { x:0, y:0, scale:0.45 };
  state.target = { x:0, y:0, scale:0.45 };

  requestAnimationFrame(draw);
})();

/* convenience */
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.45; state.focused.core=null; state.focused.tier=null; hideTitleCard(); tooltip.style.display='none'; });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); closeExpanded(); }});
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

canvas.addEventListener('touchend', (e)=>{
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      if(state.hovered.type === 'achievement') openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
      else if(state.hovered.type === 'core'){ const p = achievements.planets[state.hovered.index]; const pos = p._world; const coreWorldSize = PLANET_SIZE * (1 + (p._hover||0)*0.06); const scaleTo = computeScaleToCoverFraction(coreWorldSize, 0.48); state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo; state.focused.core = state.hovered.index; state.focused.tier = null; }
      else if(state.hovered.type === 'tier'){ const pos = achievements.planets[state.hovered.core].tiers[state.hovered.tier]._pos; const tierWorldSize = TIER_SIZE; const scaleTo = computeScaleToCoverFraction(tierWorldSize, 0.5); state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo; state.focused.core = state.hovered.core; state.focused.tier = state.hovered.tier; }
      else if(state.hovered.type === 'junction'){ const core = state.hovered.core; const tIdx = state.hovered.tier; const prev = achievements.planets[core].tiers[tIdx]; const all = prev.achievements.every(a=>a.status==='completed'); if(all && achievements.planets[core].tiers[tIdx+1]){ const pos = achievements.planets[core].tiers[tIdx+1]._pos; const scaleTo = computeScaleToCoverFraction(TIER_SIZE, 0.5); state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scaleTo; state.focused.core = core; state.focused.tier = tIdx+1; } else { popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`; popup.style.display='block'; } }
    }
  }
}, { passive:true });

document.addEventListener('pointerdown', ()=>{ if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* END */
