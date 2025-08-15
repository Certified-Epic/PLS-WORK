/* Comprehensive updated script.js
   - central animated orbit rings (fill canvas)
   - moving directional data pulses along connectors
   - planethover underlay animated
   - tier chain outward like solar system
   - junctions only allow zoom if previous tier completed
   - achievement hologram overlay above node with fade and text
   - node labels, tier labels, gradient accent color
   - optimizations: conditional heavy draws and modest particle counts
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

/* UI */
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

function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); buildCachedGradients(); }
colorPicker.addEventListener('input', (e) => setAccent(e.target.value));
setAccent(colorPicker.value);

monoToggle.addEventListener('change', () => {
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  if(mono) tooltipHolo.classList.add('grayscale'); else tooltipHolo.classList.remove('grayscale');
});
transRange.addEventListener('input', () => state.easing = parseFloat(transRange.value));
gradToggle.addEventListener('change', () => buildCachedGradients());

/* assets */
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
function loadImage(key, src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{images[key]=i;res(i)}; i.onerror=()=>{console.warn('img load fail',src); res(null);} }); }
function loadAudio(key, src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (key==='bg'?0.35:0.9); sounds[key]=a; res(a); }); }

const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* data load */
let achievements = { planets: [] };
async function loadData(){
  try {
    const r = await fetch('./achievements.json');
    achievements = await r.json();
    // merge saved progress
    const saved = localStorage.getItem('progress');
    if(saved){
      try {
        const prog = JSON.parse(saved);
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
          if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
            achievements.planets[i].tiers[j].achievements[k].status = a.status;
            achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
          }
        })));
      } catch(e){ console.warn('progress parse fail', e); }
    }
  } catch(e){
    console.warn('achievements.json missing or parse error', e);
    // fallback quick demo
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted: null
        }))
      }))
    }))};
  }
}

/* state & layout */
const state = {
  camera: { x:0,y:0,scale:0.55 },
  target: { x:0,y:0,scale:0.55 },
  easing: parseFloat(transRange.value) || 0.12,
  focused: { core:null, tier:null },
  hovered: null,
  dragging: false,
  dragStart: null
};

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

/* caching gradients for performance */
let cachedGrad = null;
function buildCachedGradients(){
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff').trim();
  const gradEnabled = gradToggle.checked;
  // simple two-stop gradient
  cachedGrad = { accent, gradEnabled };
}

/* helper functions */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function playSound(k){ const s=sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

/* layout math */
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  return { x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle };
}
function screenToWorld(px,py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x: (px - cx) / state.camera.scale, y: (py - cy) / state.camera.scale };
}

/* draw main */
let time = 0;
function draw(){
  const dt = 1/60;
  time += dt;
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(W/2 + state.camera.x * state.camera.scale, H/2 + state.camera.y * state.camera.scale);
  ctx.scale(state.camera.scale, state.camera.scale);

  // nebula blobs (subtle)
  ctx.save();
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.07})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();

  // stars
  ctx.save();
  ctx.globalAlpha = 0.9;
  for(const s of stars){
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -2200) s.x = 2200;
  }
  ctx.restore();

  // dynamic central orbit rings that fill until beyond canvas diagonal
  const maxR = Math.max(W,H) * 0.9;
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
  const accent = (cachedGrad && cachedGrad.accent) || getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  for(let r=80; r < maxR; r += 40){
    const alpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.18);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.stroke();

    // animate small moving pulses along each ring occasionally (very cheap)
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

  // center image
  const centerImg = images.center;
  if(centerImg) ctx.drawImage(centerImg, -220/2, -220/2, 220, 220);

  // planets
  const total = (achievements.planets && achievements.planets.length) || 5;
  for(let i=0;i<total;i++){
    const planet = achievements.planets[i];
    const pos = planetPosition(i, total, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = { x:px, y:py, angle: pos.angle };

    // planethover underlay (animated)
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isHover = state.hovered?.type==='core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isHover?1:0, 0.14);
    if(images.planethover){
      const base = PLANET_SIZE * 1.6;
      const s = 1 + planet._hover * 0.28;
      const alpha = 0.35 + planet._hover*0.4;
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // base planet (bigger)
    const baseSize = PLANET_SIZE * (1 + planet._hover*0.06);
    const tierImg = images[`tier${Math.min(5,(planet.tier||1))}`] || images.planet || null;
    if(tierImg) ctx.drawImage(tierImg, px - baseSize/2, py - baseSize/2, baseSize, baseSize);
    else { ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(px,py,baseSize/2,0,Math.PI*2); ctx.fill(); }

    // label if zoomed a bit
    if(state.camera.scale > 0.9){
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + baseSize/2 + 16);
      ctx.restore();
    }

    // draw small "satellite orbits" around the planet to give a solar system vibe
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

    // tiers arranged outward along planet angle (chain)
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(pos.angle) * dist;
      const ty = py + Math.sin(pos.angle) * dist;
      tier._pos = {x:tx, y:ty};

      // draw connector line from previous (planet or previous tier)
      const from = (j === 0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx,y:ty};
      // base line
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 / Math.max(0.6, state.camera.scale);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.restore();

      // moving pulses along the connector (directional: from -> to)
      const segLen = Math.hypot(to.x-from.x, to.y-from.y);
      const pulses = 2;
      for(let p=0;p<pulses;p++){
        const speed = 0.22 + p*0.08 + j*0.02;
        const baseProg = (time * speed + p * 0.3) % 1;
        // make pulses move only when progress or when near focused
        const prog = baseProg;
        const pxp = from.x + (to.x - from.x) * prog;
        const pyp = from.y + (to.y - from.y) * prog;
        // create gradient glow for trail
        const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        if(cachedGrad && cachedGrad.gradEnabled){
          g.addColorStop(Math.max(0, prog-0.04), 'rgba(255,255,255,0)');
          g.addColorStop(prog, accent);
          g.addColorStop(Math.min(1, prog+0.06), 'rgba(255,255,255,0)');
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (0.4 + Math.sin(time*4 + p)*0.15);
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(pxp, pyp, 6 + Math.sin(time*6 + p)*1.6, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // junction icon mid-segment
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

      // tier label (appear when zoomed)
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

      // draw achievements around tier when focused
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

            // node label near node
            if(state.camera.scale > 1.8){
              ctx.save();
              ctx.font = '11px Arial';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#fff';
              ctx.fillText(a.title || `Node ${idx+1}`, ax, ay + ACH_ICON + 12);
              ctx.restore();
            }

            // hologram overlay alpha stored per node for fade
            a._holo = a._holo===undefined?0:a._holo;
            if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===idx){
              a._holo = lerp(a._holo, 1, 0.16);
            } else {
              a._holo = lerp(a._holo, 0, 0.12);
            }
            // draw hologram overlay above node if alpha > small threshold
            if(a._holo > 0.02 && images.hologram){
              ctx.save();
              ctx.globalAlpha = a._holo * 0.95;
              const hs = 78 + 6 * Math.sin(time*3 + idx);
              ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2 - 10, hs, hs);
              // hologram text (rendered on top)
              ctx.fillStyle = `rgba(255,255,255,${0.95 * a._holo})`;
              ctx.font = `${12 + Math.floor(2*a._holo)}px Arial`;
              ctx.textAlign = 'center';
              wrapText(ctx, a.title || 'Achievement', ax, ay - 6, hs - 18, 14 * a._holo);
              ctx.fillStyle = `rgba(255,255,255,${0.75 * a._holo})`;
              ctx.font = `${10}px Arial`;
              wrapText(ctx, a.description || '', ax, ay + 8, hs - 18, 12 * a._holo);
              ctx.restore();
            }

            // save for hit detection
            a._pos = { x: ax, y: ay, r: ACH_ICON*0.6 };
            idx++;
          }
        }
      }
    } // end tiers
  } // end planets

  ctx.restore();
  requestAnimationFrame(draw);
}

/* tooltip & interaction helpers */
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
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx;
    state.target.y = state.dragStart.camy + dy;
    state.hovered = null; tooltip.style.display = 'none';
  } else {
    updateHover(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', (e)=>{
  pointer.down = false;
  state.dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  // click action
  if(state.hovered){
    const h = state.hovered;
    if(h.type === 'core'){
      const p = achievements.planets[h.index];
      const pos = p._world;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      const core = h.core, tIdx = h.tier;
      const pos = achievements.planets[core].tiers[tIdx]._pos;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6;
      state.focused.core = core; state.focused.tier = tIdx;
      playSound('zoom');
    } else if(h.type === 'junction'){
      // only zoom if previous tier all completed
      const core = h.core, tIdx = h.tier;
      const prevTier = achievements.planets[core].tiers[tIdx];
      const allCompleted = prevTier.achievements.every(a => a.status === 'completed');
      if(allCompleted && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6;
        state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        // show small popup hint (use DOM popup)
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first to unlock the junction.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
      openAchievementPopup(h.core, h.tier, h.ach);
    }
  }
});
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0015), 0.2, 8.0);
  playSound('zoom');
},{ passive:false });

/* hover detection using instantaneous transform */
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
      if(t._pos && dist(w.x, w.y, t._pos.x, t._pos.y) < Math.max(16, TIER_SIZE*0.6)){
        found = { type:'tier', core:i, tier:j, pos: t._pos }; break;
      }
      // junction
      if(t._junction && dist(w.x, w.y, t._junction.x, t._junction.y) < 18){
        found = { type:'junction', core:i, tier:j, pos: t._junction }; break;
      }
      // achievements only when focused
      if(state.focused.core === i && state.focused.tier === j){
        for(let k=0;k<t.achievements.length;k++){
          const a = t.achievements[k];
          if(a._pos && dist(w.x, w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
            found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
          }
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
    // if hovering an achievement, track hovered index on that achievement to trigger hologram fade
    if(found.type === 'achievement'){
      // set hovered flag; node._holo is handled in draw loop via a._holo transitions
    }
  } else {
    state.hovered = null;
    tooltip.style.display = 'none';
  }
}
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* tooltip DOM */
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display = 'none'; return; }
  let title='', desc='';
  if(found.type === 'core'){
    const p = achievements.planets[found.index];
    title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom';
  } else if(found.type === 'tier'){
    const p = achievements.planets[found.core]; const t = p.tiers[found.tier];
    title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`;
  } else if(found.type === 'junction'){
    title = 'Junction'; desc = 'Travel to next tier (unlock required)';
  } else if(found.type === 'achievement'){
    const a = achievements.planets[found.core].tiers[found.tier].achievements[found.ach];
    title = a.title || 'Achievement'; desc = a.description || '';
  }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.88;margin-top:6px">${desc}</div>`;
  const pad = 12; let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 300;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 140 > window.innerHeight - 10) top = sy - 140 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* popup */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2>
    <div style="opacity:0.9">${escapeHtml(a.description||'')}</div>
    <div style="margin-top:12px">Status: <strong>${a.status}</strong></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
      ${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}
      <button onclick="closePopup()">Close</button>
    </div>`;
  popup.style.display = 'block';
}
function closePopup(){ popup.style.display = 'none'; }

/* complete */
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

/* admin functions (kept similar) */
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
    html += `<div style="margin-top:12px"><button onclick="downloadJson()">Download JSON</button>
      <button onclick="bulkUnlock()">Bulk Unlock</button><button onclick="bulkReset()">Bulk Reset</button></div>`;
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
window.downloadJson = () => {
  const blob = new Blob([JSON.stringify(achievements, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click();
};
window.bulkUnlock = () => { achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a=> a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = () => { achievements.planets.forEach(p => p.tiers.forEach((t,j) => t.achievements.forEach(a => { a.status = j===0? 'available':'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* init */
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  buildCachedGradients();
  tooltipHolo.src = 'assets/achievementnodehologram.png';
  if(monoToggle.checked) tooltipHolo.classList.add('grayscale');

  // initialize positions for hit-tests
  const total = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=> {
    const pos = planetPosition(i, total, CORE_RADIUS);
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
    p.tiers.forEach((t,j)=> {
      const dist = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = pos.x + Math.cos(pos.angle) * dist;
      const ty = pos.y + Math.sin(pos.angle) * dist;
      t._pos = { x: tx, y: ty, r: TIER_SIZE*0.6 };
      // init achievement positions to prevent undefined
      t.achievements.forEach((a, idx) => a._pos = a._pos || {x:tx, y:ty, r: ACH_ICON*0.6}, a._holo = a._holo || 0);
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

/* convenience & mobile */
homeBtn.addEventListener('click', ()=> { state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core = null; state.focused.tier = null; });
document.addEventListener('keydown', (e)=> { if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; }});
document.addEventListener('selectstart', (e)=> { if(state.dragging) e.preventDefault(); });

/* touchend for mobile: detect tap and act like pointerup */
canvas.addEventListener('touchend', (e)=> {
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      // act like click
      const h = state.hovered;
      if(h.type === 'achievement') openAchievementPopup(h.core, h.tier, h.ach);
      else if(h.type === 'core'){
        const p = achievements.planets[h.index]; const pos = p._world;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.6; state.focused.core = h.index; state.focused.tier = null;
      } else if(h.type === 'tier'){
        const pos = achievements.planets[h.core].tiers[h.tier]._pos;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6; state.focused.core = h.core; state.focused.tier = h.tier;
      } else if(h.type === 'junction'){
        const core = h.core, tIdx = h.tier;
        const prev = achievements.planets[core].tiers[tIdx];
        const all = prev.achievements.every(a=>a.status==='completed');
        if(all && achievements.planets[core].tiers[tIdx+1]){
          const pos = achievements.planets[core].tiers[tIdx+1]._pos;
          state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.6; state.focused.core = core; state.focused.tier = tIdx+1;
        } else {
          popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
          popup.style.display = 'block';
        }
      }
    }
  }
}, { passive:true });

/* ensure bg audio playable after user gesture */
document.addEventListener('pointerdown', ()=>{
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){} }
}, { once:true });

/* End of file */
