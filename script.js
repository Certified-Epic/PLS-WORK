/* star-chart core
   - expects assets in ./assets/
   - assets used:
     center.png, planet.png, planethover.png, tier2..tier5.png,
     node.png, lock.png, pulse.png, junction.png,
     achievementnodehologram.png, completedplanettier.png
     hover.mp3, zoom.mp3, background.mp3
   - achievements.json in project root (same format used previously)
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

/* THEME UI */
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const homeBtn = document.getElementById('homeBtn');
const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');
const tooltipHolo = document.getElementById('tooltipHolo');
const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

function setAccent(hex){
  document.documentElement.style.setProperty('--accent', hex);
}
colorPicker.addEventListener('input', (e) => setAccent(e.target.value));
setAccent(colorPicker.value);

monoToggle.addEventListener('change', () => {
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  if(mono) tooltipHolo.classList.add('grayscale'); else tooltipHolo.classList.remove('grayscale');
});

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
const SOUNDS = {
  hover: 'hover.mp3',
  zoom: 'zoom.mp3',
  bg: 'background.mp3'
};

const images = {};
const sounds = {};
function loadImage(key, src){ return new Promise((res, rej) => {
  const i = new Image();
  i.src = src;
  i.onload = () => { images[key]=i; res(i); };
  i.onerror = rej;
});}
function loadAudio(key, src){ return new Promise((res) => {
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = (key === 'bg' ? 0.35 : 0.9);
  sounds[key] = a;
  // don't auto-play bg; will play after user interaction
  res(a);
});}

const preloadPromises = [];
Object.keys(ASSETS).forEach(k => preloadPromises.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preloadPromises.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* Achievements/data */
let achievements = { planets: [] };
async function loadData(){
  try{
    const res = await fetch('./achievements.json');
    achievements = await res.json();
    // apply saved progress if present
    const saved = localStorage.getItem('progress');
    if(saved){
      try{
        const progress = JSON.parse(saved);
        // naive merge: keep structure and override statuses
        progress.planets?.forEach((p,i)=>{
          p.tiers?.forEach((t,j) => {
            t.achievements?.forEach((a,k) => {
              if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
                achievements.planets[i].tiers[j].achievements[k].status = a.status;
                achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
              }
            });
          });
        });
      } catch(e){ console.warn('progress parse error', e); }
    }
  }catch(e){
    console.warn('No achievements.json found or parse failed:', e);
    // fallback demo if none provided
    achievements = {
      planets: Array.from({length:5}).map((_,pi)=>({
        planetName: `Planet ${pi+1}`,
        tiers: Array.from({length:3}).map((__,ti)=>({
          tierName: `Tier ${ti+1}`, achievements: Array.from({length:5}).map((___,ai)=>({
            title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo achievement', status: ti===0? 'available':'locked', dateCompleted:null
          }))
        }))
      }))
    };
  }
}

/* camera / state */
const state = {
  camera: { x:0,y:0,scale:0.55 },
  target: { x:0,y:0,scale:0.55 },
  easing: 0.12,
  focused: { core:null, tier:null }, // core index and tier index when zoomed inside
  hovered: null, // {type:'core'|'tier'|'achievement'|'junction', core, tier, ach, pos:{x,y}}
  dragging: false,
  dragStart: null
};

/* layout constants (feel free to tweak) */
const CORE_RADIUS = 420; // distance of core planets from center
const PLANET_SIZE = 86; // base planet draw size
const PLANET_HOVER_SCALE = 1.55;
const TIER_RADIUS = 160; // radius around planet where tier nodes sit
const TIER_SIZE = 40;
const ACHIEVEMENT_RING_STEP = 48; // spacing for achievement rings
const ACHIEVEMENT_ICON = 18;

/* starfield particles for background */
const stars = [];
for(let i=0;i<220;i++){
  stars.push({
    x: (Math.random()*2-1)*1500,
    y: (Math.random()*2-1)*900,
    r: Math.random()*1.5+0.2,
    speed: Math.random()*0.2+0.05
  });
}

/* helpers */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function playSound(k){
  const s = sounds[k];
  if(!s) return;
  try{ s.currentTime = 0; s.play(); } catch(e){}
}

/* compute positions for planets */
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2; // start top
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  return {x,y,angle};
}

/* pointer to world coords */
function screenToWorld(px, py){
  const cw = W/2 + state.camera.x * state.camera.scale;
  const ch = H/2 + state.camera.y * state.camera.scale;
  const wx = (px - cw) / state.camera.scale;
  const wy = (py - ch) / state.camera.scale;
  return {x:wx,y:wy};
}

/* draw loop */
let ttime = 0;
function drawLoop(ts){
  const dt = 0.016;
  ttime += dt;
  // smooth camera
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  // clear
  ctx.clearRect(0,0,W,H);

  // to world transform
  ctx.save();
  ctx.translate(W/2 + state.camera.x * state.camera.scale, H/2 + state.camera.y * state.camera.scale);
  ctx.scale(state.camera.scale, state.camera.scale);

  // starfield
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00c8ff';
  ctx.save();
  for(const s of stars){
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -1800) s.x = 1800;
  }
  ctx.restore();

  // center
  const centerImg = images.center;
  const centerSize = 220;
  if(centerImg) ctx.drawImage(centerImg, -centerSize/2, -centerSize/2, centerSize, centerSize);

  // planets
  const totals = achievements.planets.length || 5;
  achievements.planets.forEach((planet,i) => {
    const pos = planetPosition(i, totals, CORE_RADIUS);
    const px = pos.x, py = pos.y;

    // rings per planet (subtle)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.2 / state.camera.scale;
    ctx.beginPath();
    ctx.arc(px, py, TIER_RADIUS + 10, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    // planet hover scaling
    let pScale = 1;
    if(state.hovered?.type === 'core' && state.hovered.index === i) pScale = PLANET_HOVER_SCALE;
    // also slightly scale if camera is focused on it
    if(state.focused.core === i) pScale = lerp(pScale, 1.08, 0.08);

    const drawSize = PLANET_SIZE * pScale;
    const isHover = state.hovered?.type === 'core' && state.hovered.index === i;

    // choose tier image if available
    const tierImg = images[`tier${Math.min(5, (planet.tier || 1))}`] || images.planet || null;
    const basePlanetImg = (isHover && images.planethover) ? images.planethover : (tierImg || images.planet);

    if(basePlanetImg) ctx.drawImage(basePlanetImg, px - drawSize/2, py - drawSize/2, drawSize, drawSize);
    else {
      // fallback draw
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(px,py,drawSize/2,0,Math.PI*2); ctx.fill();
    }

    // label when zoomed enough
    if(state.camera.scale > 0.9){
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + drawSize/2 + 14);
    }

    // draw tiers (as smaller planets around core planet)
    planet.tiers.forEach((tier, j) => {
      const tCount = planet.tiers.length;
      const tAngle = (j / tCount) * Math.PI*2 - Math.PI/2;
      const tx = px + Math.cos(tAngle) * (TIER_RADIUS + (j*8));
      const ty = py + Math.sin(tAngle) * (TIER_RADIUS + (j*8));

      // connecting path
      ctx.save();
      ctx.lineWidth = 2 / state.camera.scale;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      // tier image (if completed overlay)
      const tierImgDraw = images[`tier${Math.min(5,j+1)}`] || images.planet;
      ctx.drawImage(tierImgDraw, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);

      // completed overlay
      const allCompleted = tier.achievements.every(a=>a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(images.completedTier, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
        ctx.restore();
      }

      // junction placed outside tier (if not last tier)
      if(j < planet.tiers.length - 1 && images.junction){
        const jx = px + Math.cos(tAngle) * (TIER_RADIUS + 56);
        const jy = py + Math.sin(tAngle) * (TIER_RADIUS + 56);
        ctx.drawImage(images.junction, jx-10, jy-10, 20, 20);
      }

      // when focused on a specific planet.tier, draw achievement nodes as concentric levels
      if(state.focused.core === i && state.focused.tier === j){
        const numAch = tier.achievements.length;
        // determine number of rings needed: fill rings with up to 10 nodes per ring
        const perRing = 10;
        const rings = Math.ceil(numAch / perRing);
        let idx = 0;
        for(let ring = 0; ring < rings; ring++){
          const nodesInRing = Math.min(perRing, numAch - (ring*perRing));
          const ringRadius = 28 + ring * ACHIEVEMENT_RING_STEP;
          for(let n=0;n<nodesInRing;n++){
            const aAngle = (n / nodesInRing) * Math.PI*2 + (ring * 0.18) + (ttime * 0.02);
            const ax = tx + Math.cos(aAngle) * ringRadius;
            const ay = ty + Math.sin(aAngle) * ringRadius;
            const a = tier.achievements[idx];
            // branch glow
            ctx.save();
            ctx.globalAlpha = 0.12 + (a.status === 'available' ? 0.18 : 0.05);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.4 / state.camera.scale;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            ctx.restore();

            // pulsing for available
            if(a.status === 'available' && images.pulse){
              const pulseSize = ACHIEVEMENT_ICON + 6 + Math.sin(ttime*6 + idx) * 3;
              ctx.globalAlpha = 0.25 + 0.25 * Math.sin(ttime*4 + idx);
              ctx.drawImage(images.pulse, ax - pulseSize/2, ay - pulseSize/2, pulseSize, pulseSize);
              ctx.globalAlpha = 1;
            }

            // draw node icons
            const icon = (a.status === 'locked' ? images.lock : images.node);
            if(icon) ctx.drawImage(icon, ax - ACHIEVEMENT_ICON/2, ay - ACHIEVEMENT_ICON/2, ACHIEVEMENT_ICON, ACHIEVEMENT_ICON);
            else {
              ctx.fillStyle = a.status === 'locked' ? '#333' : '#eee';
              ctx.beginPath(); ctx.arc(ax,ay,ACHIEVEMENT_ICON/2,0,Math.PI*2); ctx.fill();
            }

            // store world pos for interaction
            a._pos = {x: ax, y: ay, r: ACHIEVEMENT_ICON};
            idx++;
          }
        }
      }
      // store tier world pos for interaction
      tier._pos = {x: tx, y: ty, r: TIER_SIZE};
    });

    // store planet pos for interaction
    planet._pos = {x: px, y: py, r: PLANET_SIZE * pScale * 0.5};
  });

  ctx.restore();

  // draw tooltip if hovering (dom positioned)
  if(state.hovered){
    // DOM tooltip is positioned via pointer event listeners; nothing to draw here
    tooltip.style.display = 'flex';
  } else {
    tooltip.style.display = 'none';
  }

  // update camera interpolation
  requestAnimationFrame(drawLoop);
}

/* interactions - pointer unified */
let pointer = {x:0,y:0,down:false};

function updateHover(mx,my){
  // determine world coords based on current camera (use instantaneous camera for hit tests)
  const w = screenToWorld(mx,my);
  const found = { type:null };
  // iterate planets
  const totals = achievements.planets.length || 5;
  for(let i=0;i<achievements.planets.length;i++){
    const planet = achievements.planets[i];
    const ppos = planet._pos;
    if(!ppos) continue;
    if(distance(w.x,w.y, ppos.x, ppos.y) < Math.max(18, ppos.r + 6)){
      found.type = 'core'; found.index = i; found.pos = ppos; break;
    }
    // tiers
    for(let j=0;j<planet.tiers.length;j++){
      const tier = planet.tiers[j];
      if(!tier._pos) continue;
      if(distance(w.x,w.y, tier._pos.x, tier._pos.y) < Math.max(14, tier._pos.r+6)){
        found.type = 'tier'; found.core = i; found.tier = j; found.pos = tier._pos; break;
      }
      // achievements only if focused
      if(state.focused.core === i && state.focused.tier === j){
        for(let k=0;k<tier.achievements.length;k++){
          const a = tier.achievements[k];
          if(!a._pos) continue;
          if(distance(w.x,w.y, a._pos.x, a._pos.y) < Math.max(10, a._pos.r+4)){
            found.type = 'achievement'; found.core=i; found.tier=j; found.ach=k; found.pos = a._pos; break;
          }
        }
        if(found.type) break;
      }
    }
    if(found.type) break;
  }

  // set state.hovered and update tooltip
  if(found.type){
    state.hovered = found;
    showTooltipAt(pointer.x, pointer.y, found);
    // play hover sound (throttle)
    if(!updateHover.lastSound || (Date.now() - updateHover.lastSound) > 300){
      playSound('hover'); updateHover.lastSound = Date.now();
    }
  } else {
    state.hovered = null;
  }
}

function distance(x,y,x2,y2){ return Math.hypot(x-x2,y-y2); }

/* tooltip population and positioning */
function showTooltipAt(sx, sy, found){
  if(!found) { tooltip.style.display='none'; return; }
  let title='', desc='';
  if(found.type==='core'){
    const p = achievements.planets[found.index];
    title = p.planetName || `Planet ${found.index+1}`;
    desc = p.short || `Click to zoom into ${title}`;
  } else if(found.type==='tier'){
    const p = achievements.planets[found.core];
    const t = p.tiers[found.tier];
    title = t.tierName || `Tier ${found.tier+1}`;
    desc = `${t.achievements.length} nodes`;
  } else if(found.type==='achievement'){
    const a = achievements.planets[found.core].tiers[found.tier].achievements[found.ach];
    title = a.title || 'Achievement';
    desc = a.description || '';
  } else {
    tooltip.style.display='none'; return;
  }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.85;margin-top:6px">${desc}</div>`;
  // position tooltip near screen point but keep inside viewport
  const pad = 12;
  let left = sx + pad;
  let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 260;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 120 > window.innerHeight - 10) top = sy - 120 - pad;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

/* pointer events */
canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  pointer.x = e.clientX; pointer.y = e.clientY;
  // start dragging
  state.dragging = true;
  state.dragStart = {x: e.clientX, y: e.clientY, camx: state.target.x, camy: state.target.y};
  // if audio background isn't playing attempt play on interaction
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.play(); } catch(e){} }
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx;
    state.target.y = state.dragStart.camy + dy;
  } else {
    updateHover(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointerup', (e) => {
  pointer.down = false;
  state.dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  // if there was a hover target on click, handle
  if(state.hovered){
    if(state.hovered.type === 'core'){
      const i = state.hovered.index;
      // zoom to core
      const cam = { x: -achievements.planets[i]._pos.x, y: -achievements.planets[i]._pos.y, scale: 2.2 };
      state.target.x = cam.x; state.target.y = cam.y; state.target.scale = cam.scale;
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
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.001;
  state.target.scale = clamp(state.target.scale + delta, 0.2, 8.0);
  playSound('zoom');
}, { passive:false });

/* popup for achievement details */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  const html = `
    <h2 style="margin:0 0 8px 0">${a.title}</h2>
    <div style="opacity:0.9">${a.description || ''}</div>
    <div style="margin-top:12px">Status: <strong>${a.status}</strong></div>
    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
      ${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}
      <button onclick="closePopup()">Close</button>
    </div>
  `;
  popup.innerHTML = html;
  popup.style.display = 'block';
}
function closePopup(){ popup.style.display = 'none'; }

/* complete achievement */
window.completeAchievement = (core,tier,ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed'; a.dateCompleted = new Date().toISOString();
  localStorage.setItem('progress', JSON.stringify(achievements));
  popup.style.display = 'none';
  // unlock next tier achievements if this completes whole tier
  const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status === 'completed');
  if(all && tier < achievements.planets[core].tiers.length - 1){
    achievements.planets[core].tiers[tier+1].achievements.forEach(x=>{
      if(x.status === 'locked') x.status = 'available';
    });
  }
};

/* admin panel (simple) */
window.showAdminPanel = () => { adminPanel.style.display = 'block'; document.getElementById('adminLogin').style.display = 'block'; editContent.style.display = 'none'; }
window.hideAdminPanel = () => { adminPanel.style.display = 'none'; }
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if(pass === 'admin'){
    // show editing UI
    let html = '';
    achievements.planets.forEach((p,i) => {
      html += `<h3>${p.planetName||'Planet'}</h3>`;
      p.tiers.forEach((t,j) => {
        html += `<h4>${t.tierName||'Tier'}</h4>`;
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
window.bulkUnlock = () => {
  achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a=> a.status='available')));
  localStorage.setItem('progress', JSON.stringify(achievements));
  alert('All unlocked');
};
window.bulkReset = () => {
  achievements.planets.forEach(p => p.tiers.forEach((t,j) => t.achievements.forEach(a => { a.status = j===0? 'available':'locked'; a.dateCompleted = null; })));
  localStorage.setItem('progress', JSON.stringify(achievements));
  alert('All reset');
};

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* init after preload */
(async function init(){
  await Promise.all(preloadPromises);
  await loadData();

  // make sure hologram image used in tooltip is set
  tooltipHolo.src = 'assets/achievementnodehologram.png';
  if(monoToggle.checked) tooltipHolo.classList.add('grayscale');

  // compute positions initially by running one draw frame and compute planet._pos after images available
  // we run one temporary draw just to initialize positions
  drawLoop();

  // small helper to find initial planet._pos (we set after one small timeout)
  setTimeout(()=> {
    // ensure every planet/tier has _pos for hit detection: run same logic as draw but without drawing images
    const totals = achievements.planets.length || 5;
    achievements.planets.forEach((planet,i) => {
      const pos = planetPosition(i, totals, CORE_RADIUS);
      const px = pos.x, py = pos.y;
      planet._pos = {x:px,y:py,r:PLANET_SIZE*0.6};
      planet.tiers.forEach((tier,j) => {
        const tCount = planet.tiers.length;
        const tAngle = (j / tCount) * Math.PI*2 - Math.PI/2;
        const tx = px + Math.cos(tAngle) * (TIER_RADIUS + (j*8));
        const ty = py + Math.sin(tAngle) * (TIER_RADIUS + (j*8));
        tier._pos = {x:tx,y:ty,r:TIER_SIZE*0.6};
      });
    });
  }, 60);

  // start main loop
  requestAnimationFrame(drawLoop);
})();

/* utility - reset view to home */
homeBtn.addEventListener('click', ()=> {
  state.target.x = 0; state.target.y = 0; state.target.scale = 0.55;
  state.focused.core = null; state.focused.tier = null;
});

/* small convenience: close popup on click outside */
document.addEventListener('keydown', (e)=> {
  if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; }
});

/* small safety: stop text selection while dragging */
document.addEventListener('selectstart', (e)=> { if(state.dragging) e.preventDefault(); });

/* finalize: attempt play background after user gesture */
document.addEventListener('pointerdown', () => { if(sounds.bg && sounds.bg.paused) { try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });
