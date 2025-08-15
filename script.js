/* Updated star-chart:
   - planethover drawn as underlay glow and animated
   - central orbit rings only around center
   - tier planets in outward chain along planet direction
   - pulse overlay drawn above nodes
   - moving data-transfer pulses along junction lines
   - color theme + transition control
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

/* UI elements */
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');
const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');
const tooltipHolo = document.getElementById('tooltipHolo');
const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); }
colorPicker.addEventListener('input', (e) => setAccent(e.target.value));
setAccent(colorPicker.value);

monoToggle.addEventListener('change', () => {
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  if(mono) tooltipHolo.classList.add('grayscale'); else tooltipHolo.classList.remove('grayscale');
});

/* transition (easing) control */
transRange.addEventListener('input', (e) => {
  state.easing = parseFloat(e.target.value);
});
const DEFAULT_EASING = parseFloat(transRange.value);

/* ASSET PRELOAD */
const IMG_PATH = 'assets/';
const ASSETS = {
  center: 'center.png',
  planet: 'planet.png',
  planethover: 'planethover.png',
  tier2: 'tier2.png',
  tier3: 'tier3.png',
  tier4: 'tier4.png',
  tier5: 'tier5.png',
  node: 'node.png',
  lock: 'lock.png',
  pulse: 'pulse.png',
  junction: 'junction.png',
  hologram: 'achievementnodehologram.png',
  completedTier: 'completedplanettier.png'
};
const SOUNDS = { hover: 'hover.mp3', zoom: 'zoom.mp3', bg: 'background.mp3' };

const images = {};
const sounds = {};
function loadImage(key, src){ return new Promise((res, rej) => {
  const i = new Image();
  i.src = src;
  i.onload = () => { images[key]=i; res(i); };
  i.onerror = () => { console.warn('Image failed:', src); res(null); };
});}
function loadAudio(key, src){ return new Promise((res) => {
  const a = new Audio(src); a.preload='auto'; a.volume=(key==='bg'?0.35:0.9); sounds[key]=a; res(a);
});}

const preloadPromises = [];
Object.keys(ASSETS).forEach(k => preloadPromises.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preloadPromises.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* data */
let achievements = { planets: [] };
async function loadData(){
  try{
    const res = await fetch('./achievements.json');
    achievements = await res.json();
    const saved = localStorage.getItem('progress');
    if(saved){
      const progress = JSON.parse(saved);
      progress.planets?.forEach((p,i) => {
        p.tiers?.forEach((t,j) => {
          t.achievements?.forEach((a,k) => {
            if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
              achievements.planets[i].tiers[j].achievements[k].status = a.status;
              achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
            }
          });
        });
      });
    }
  }catch(e){
    console.warn('No achievements.json or parse error:', e);
    // fallback demo
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName: `Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`T${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo', status: ti===0?'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* state & layout */
const state = {
  camera: { x:0,y:0,scale:0.55 },
  target: { x:0,y:0,scale:0.55 },
  easing: DEFAULT_EASING,
  focused: { core:null, tier:null },
  hovered: null,
  dragging: false,
  dragStart: null
};

const CORE_RADIUS = 420;
const PLANET_SIZE = 86;
const PLANET_HOVER_SCALE = 1.5;
const TIER_BASE_OFFSET = 120;   // distance from planet center to first tier
const TIER_SPACING = 110;      // additional spacing between tiers (each tier farther out)
const TIER_SIZE = 40;
const ACH_ICON = 18;

/* stars */
const stars = [];
for(let i=0;i<240;i++) stars.push({
  x: (Math.random()*2-1)*1600,
  y: (Math.random()*2-1)*1000,
  r: Math.random()*1.6+0.2,
  speed: Math.random()*0.18+0.03
});

/* utility */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

/* layout math for core planet and outward tier chain */
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  return { x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle };
}

function screenToWorld(px, py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x: (px - cx) / state.camera.scale, y: (py - cy) / state.camera.scale };
}

/* draw */
let time = 0;
function drawLoop(){
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

  // starfield (simple)
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c8ff';
  ctx.save();
  for(const s of stars){
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 10 * (state.camera.scale*0.9);
    if(s.x < -1900) s.x = 1900;
  }
  ctx.restore();

  // central orbit rings only around center
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2 / state.camera.scale;
  const orbitRadii = [120, 240, 360, 480];
  orbitRadii.forEach(r => {
    ctx.beginPath();
    ctx.arc(0,0, r, 0, Math.PI*2);
    ctx.stroke();
  });
  ctx.restore();

  // center image
  const centerImg = images.center;
  const centerSize = 220;
  if(centerImg) ctx.drawImage(centerImg, -centerSize/2, -centerSize/2, centerSize, centerSize);

  // planets and outward tier chain
  const totalPlanets = (achievements.planets && achievements.planets.length) || 5;
  achievements.planets.forEach((planet,i) => {
    const pos = planetPosition(i, totalPlanets, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = {x:px, y:py, angle: pos.angle};

    // planet hover underlay (planethover) - animate scale when hovered
    const isHoveredCore = state.hovered?.type === 'core' && state.hovered.index === i;
    planet._hoverAnim = planet._hoverAnim === undefined ? 0 : planet._hoverAnim;
    planet._hoverAnim = lerp(planet._hoverAnim, isHoveredCore ? 1 : 0, 0.12);

    if(images.planethover){
      const hoverScale = 1 + (0.25 * planet._hoverAnim);
      const hoverSize = PLANET_SIZE * 1.7 * hoverScale;
      ctx.save();
      ctx.globalAlpha = 0.55 * (0.6 + planet._hoverAnim*0.4);
      // draw underlay (so it sits beneath base planet)
      ctx.drawImage(images.planethover, px - hoverSize/2, py - hoverSize/2, hoverSize, hoverSize);
      ctx.restore();
    }

    // base planet
    const drawScale = 1 + (0.05 * planet._hoverAnim);
    const drawSize = PLANET_SIZE * drawScale;
    const tierImg = images[`tier${Math.min(5, (planet.tier || 1))}`] || images.planet || null;
    const baseImg = tierImg || images.planet;
    if(baseImg) ctx.drawImage(baseImg, px - drawSize/2, py - drawSize/2, drawSize, drawSize);
    else {
      ctx.save();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(px, py, drawSize/2,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // label if zoomed
    if(state.camera.scale > 0.9){
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + drawSize/2 + 14);
    }

    // build outward chain: for each tier j place at px + cos(angle)*(offset + j*spacing)
    const angle = pos.angle;
    planet.tiers.forEach((tier,j) => {
      const offset = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(angle) * offset;
      const ty = py + Math.sin(angle) * offset;
      tier._pos = {x: tx, y: ty};

      // draw connector from previous link: if j === 0 draw a short connector from planet to tier1; else connector between tier j-1 and j
      const from = (j === 0) ? {x: px, y: py} : planet.tiers[j-1]._pos;
      const to = {x: tx, y: ty};

      // draw glowing path
      ctx.save();
      // subtle base line
      ctx.lineWidth = 1.6 / state.camera.scale;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.restore();

      // animated data pulses moving along the line
      const segLen = Math.hypot(to.x - from.x, to.y - from.y);
      const numPulses = 2; // pulses per connection
      for(let p=0;p<numPulses;p++){
        const speed = 0.35 + p*0.12;
        const phase = (time * speed + p * 0.5) % 1;
        const pxp = from.x + (to.x - from.x) * phase;
        const pyp = from.y + (to.y - from.y) * phase;
        ctx.save();
        const grd = ctx.createRadialGradient(pxp, pyp, 0, pxp, pyp, 18);
        grd.addColorStop(0, accent);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(pxp, pyp, 8 + Math.sin(time*6 + p)*1.5, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // draw junction icon (midpoint near outer edge of segment)
      if(images.junction){
        const jx = from.x + (to.x - from.x) * 0.62;
        const jy = from.y + (to.y - from.y) * 0.62;
        const jSize = 22;
        ctx.drawImage(images.junction, jx - jSize/2, jy - jSize/2, jSize, jSize);
        // store junction for hit detection
        if(!tier._junction) tier._junction = {x:jx, y:jy, r: jSize/2};
      }

      // draw tier planet
      if(images[`tier${Math.min(5,j+1)}`] || images.planet){
        const tImg = images[`tier${Math.min(5,j+1)}`] || images.planet;
        ctx.drawImage(tImg, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      } else {
        ctx.save(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); ctx.restore();
      }

      // completed overlay
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE); ctx.restore();
      }

      // if focused on this tier, draw achievements rings around this tier planet
      if(state.focused.core === i && state.focused.tier === j){
        const numA = tier.achievements.length;
        const perRing = 10;
        const rings = Math.ceil(numA / perRing);
        let idx = 0;
        for(let ring=0; ring<rings; ring++){
          const ringCount = Math.min(perRing, numA - ring*perRing);
          const ringRadius = 36 + ring * 46;
          for(let n=0; n<ringCount; n++){
            const aAngle = (n / ringCount) * Math.PI*2 + (ring*0.14) + (time*0.02);
            const ax = tx + Math.cos(aAngle) * ringRadius;
            const ay = ty + Math.sin(aAngle) * ringRadius;
            const a = tier.achievements[idx];

            // branch with faint glow
            ctx.save();
            ctx.globalAlpha = 0.12 + (a.status === 'available'?0.16:0.04);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.4 / state.camera.scale;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            ctx.restore();

            // draw node icon (base)
            const iconImg = (a.status === 'locked' ? images.lock : images.node);
            if(iconImg) ctx.drawImage(iconImg, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
            else { ctx.save(); ctx.fillStyle = a.status === 'locked' ? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); ctx.restore(); }

            // draw pulse overlay ON TOP *after* node (so it's visible above)
            if(a.status === 'available' && images.pulse){
              ctx.save();
              const pulseScale = 1.0 + 0.15 * Math.sin(time*6 + idx);
              const pulseSize = ACH_ICON + 8 * pulseScale;
              ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time*4 + idx);
              ctx.drawImage(images.pulse, ax - pulseSize/2, ay - pulseSize/2, pulseSize, pulseSize);
              ctx.restore();
            }

            // store world coords for interaction
            a._pos = {x: ax, y: ay, r: ACH_ICON * 0.6};
            idx++;
          }
        }
      }

      // store tier interaction pos
      tier._pos = {x: tx, y: ty, r: TIER_SIZE * 0.6};
    });

    // planet interaction pos
    planet._pos = {x: px, y: py, r: PLANET_SIZE * 0.45};
  });

  ctx.restore();

  // tooltip DOM handled in pointer handlers
  requestAnimationFrame(drawLoop);
}

/* interactions */
let pointer = {x:0,y:0,down:false};

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  pointer.x = e.clientX; pointer.y = e.clientY;
  state.dragging = true;
  state.dragStart = {x:e.clientX, y:e.clientY, camx: state.target.x, camy: state.target.y};
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} }
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx;
    state.target.y = state.dragStart.camy + dy;
    // during drag don't show hover
    state.hovered = null;
    tooltip.style.display = 'none';
  } else {
    // hover detection
    updateHover(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointerup', (e) => {
  pointer.down = false;
  state.dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  // if click on hovered target, trigger action
  if(state.hovered){
    if(state.hovered.type === 'core'){
      const i = state.hovered.index;
      const p = achievements.planets[i];
      const pos = p._world;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.2;
      state.focused.core = i; state.focused.tier = null;
      playSound('zoom');
    } else if(state.hovered.type === 'tier'){
      const core = state.hovered.core; const tierIdx = state.hovered.tier;
      const pos = achievements.planets[core].tiers[tierIdx]._pos;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.4;
      state.focused.core = core; state.focused.tier = tierIdx;
      playSound('zoom');
    } else if(state.hovered.type === 'achievement'){
      openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
    } else if(state.hovered.type === 'junction'){
      // clicking junction zooms to next tier (if exists)
      const core = state.hovered.core; const tierIdx = state.hovered.tier;
      const nextIdx = tierIdx + 1;
      if(achievements.planets[core].tiers[nextIdx]){
        const pos = achievements.planets[core].tiers[nextIdx]._pos;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.4;
        state.focused.core = core; state.focused.tier = nextIdx;
        playSound('zoom');
      }
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.0015;
  state.target.scale = clamp(state.target.scale + delta, 0.2, 8.0);
  playSound('zoom');
}, { passive:false });

/* hover detection (uses instantaneous camera transform without easing for accurate hit tests) */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const planet = achievements.planets[i];
    const ppos = planet._pos || planet._world;
    if(ppos && distance(w.x, w.y, ppos.x, ppos.y) < Math.max(16, ppos.r + 6)){
      found = { type: 'core', index: i, pos: ppos };
      break;
    }
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      if(tier._pos && distance(w.x, w.y, tier._pos.x, tier._pos.y) < Math.max(12, tier._pos.r + 6)){
        found = { type: 'tier', core: i, tier: j, pos: tier._pos };
        break;
      }
      // junction hit
      if(tier._junction && distance(w.x, w.y, tier._junction.x, tier._junction.y) < Math.max(18, tier._junction.r + 6)){
        found = { type: 'junction', core: i, tier: j, pos: tier._junction };
        break;
      }
      // achievements only when focused on this tier
      if(state.focused.core === i && state.focused.tier === j){
        for(let k=0;k<tier.achievements.length;k++){
          const a = tier.achievements[k];
          if(a._pos && distance(w.x, w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
            found = { type: 'achievement', core: i, tier: j, ach: k, pos: a._pos };
            break;
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
  } else {
    state.hovered = null;
    tooltip.style.display = 'none';
  }
}

function distance(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* Tooltip DOM */
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display = 'none'; return; } // hide on small screens
  let title='', desc='';
  if(found.type === 'core'){
    const p = achievements.planets[found.index];
    title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom into this planet';
  } else if(found.type === 'tier'){
    const p = achievements.planets[found.core]; const t = p.tiers[found.tier];
    title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`;
  } else if(found.type === 'achievement'){
    const a = achievements.planets[found.core].tiers[found.tier].achievements[found.ach];
    title = a.title || 'Achievement'; desc = a.description || '';
  } else if(found.type === 'junction'){
    title = 'Junction'; desc = 'Travel to next tier';
  }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.85;margin-top:6px">${desc}</div>`;
  const pad = 12;
  let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 260;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 120 > window.innerHeight - 10) top = sy - 120 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* popup */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  const html = `
    <h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2>
    <div style="opacity:0.9">${escapeHtml(a.description||'')}</div>
    <div style="margin-top:12px">Status: <strong>${a.status}</strong></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
      ${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}
      <button onclick="closePopup()">Close</button>
    </div>
  `;
  popup.innerHTML = html; popup.style.display = 'block';
}
function closePopup(){ popup.style.display = 'none'; }

/* complete achievement */
window.completeAchievement = (core,tier,ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed'; a.dateCompleted = new Date().toISOString();
  localStorage.setItem('progress', JSON.stringify(achievements));
  popup.style.display = 'none';
  const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status === 'completed');
  if(all && tier < achievements.planets[core].tiers.length - 1){
    achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status === 'locked') x.status = 'available'; });
  }
};

/* admin */
window.showAdminPanel = () => { adminPanel.style.display = 'block'; document.getElementById('adminLogin').style.display = 'block'; editContent.style.display = 'none'; }
window.hideAdminPanel = () => { adminPanel.style.display = 'none'; }
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if(pass === 'admin'){
    let html = '';
    achievements.planets.forEach((p,i) => {
      html += `<h3>${escapeHtml(p.planetName||'Planet')}</h3>`;
      p.tiers.forEach((t,j) => {
        html += `<h4>${escapeHtml(t.tierName||'Tier')}</h4>`;
        t.achievements.forEach((a,k) => {
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click();
};
window.bulkUnlock = () => { achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a=> a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = () => { achievements.planets.forEach(p => p.tiers.forEach((t,j) => t.achievements.forEach(a => { a.status = j===0? 'available':'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* init */
(async function init(){
  await Promise.all(preloadPromises);
  await loadData();

  tooltipHolo.src = 'assets/achievementnodehologram.png';
  if(monoToggle.checked) tooltipHolo.classList.add('grayscale');

  // compute initial _pos for planets & tiers for hit detection
  const totals = achievements.planets.length || 5;
  achievements.planets.forEach((planet,i) => {
    const pos = planetPosition(i, totals, CORE_RADIUS);
    const px = pos.x, py = pos.y;
    planet._world = {x:px, y:py, angle: pos.angle};
    planet.tiers.forEach((tier,j) => {
      const offset = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(pos.angle) * offset;
      const ty = py + Math.sin(pos.angle) * offset;
      tier._pos = {x:tx, y:ty, r: TIER_SIZE*0.6};
    });
  });

  // start draw
  requestAnimationFrame(drawLoop);
})();

/* convenience */
homeBtn.addEventListener('click', ()=> {
  state.target.x = 0; state.target.y = 0; state.target.scale = 0.55;
  state.focused.core = null; state.focused.tier = null;
});

document.addEventListener('keydown', (e)=> {
  if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; }
});
document.addEventListener('selectstart', (e)=> { if(state.dragging) e.preventDefault(); });

/* touch: on small screens open popup for hovered element when tapping */
canvas.addEventListener('touchend', (e) => {
  if(window.innerWidth <= 720){
    const touch = e.changedTouches[0];
    updateHover(touch.clientX, touch.clientY);
    if(state.hovered){
      if(state.hovered.type === 'achievement') openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
      else if(state.hovered.type === 'tier' || state.hovered.type === 'core') {
        // zoom in on tap
        const h = state.hovered;
        if(h.type === 'core'){
          const p = achievements.planets[h.index];
          const pos = p._world;
          state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 2.2; state.focused.core = h.index; state.focused.tier = null;
        } else {
          const pos = achievements.planets[h.core].tiers[h.tier]._pos;
          state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.4; state.focused.core = h.core; state.focused.tier = h.tier;
        }
      } else if(state.hovered.type === 'junction'){
        // zoom to next tier
        const core = state.hovered.core; const next = state.hovered.tier + 1;
        if(achievements.planets[core].tiers[next]){
          const pos = achievements.planets[core].tiers[next]._pos;
          state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 5.4; state.focused.core = core; state.focused.tier = next;
        }
      }
    }
  }
}, { passive:true });

/* ensure background audio play after first gesture */
document.addEventListener('pointerdown', () => { if(sounds.bg && sounds.bg.paused) { try{ sounds.bg.loop = true; sounds.bg.play(); } catch(e){} } }, { once:true });

/* END */
