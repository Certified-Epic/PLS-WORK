/* Animated pulses, node labels, gradient theme, hologram overlay details.
   Place assets in ./assets/
*/

const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
function resize(){
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
resize();

/* UI */
const accentA = document.getElementById('accentA');
const accentB = document.getElementById('accentB');
const gradientPreview = document.getElementById('gradientPreview');
const monoToggle = document.getElementById('monoToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');
const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');
const tooltipHolo = document.getElementById('tooltipHolo');
const popup = document.getElementById('popup');

function setGradientPreview(){
  const a = accentA.value; const b = accentB.value;
  gradientPreview.style.background = `linear-gradient(135deg, ${a}, ${b})`;
  document.documentElement.style.setProperty('--accentA', a);
  document.documentElement.style.setProperty('--accentB', b);
}
accentA.addEventListener('input', setGradientPreview);
accentB.addEventListener('input', setGradientPreview);
setGradientPreview();

monoToggle.addEventListener('change', () => {
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
  tooltipHolo.classList.toggle('grayscale', mono);
});

transRange.addEventListener('input', () => state.easing = parseFloat(transRange.value));
const DEFAULT_EASING = parseFloat(transRange.value);

/* assets */
const IMG_PATH = 'assets/';
const ASSETS = {
  center: 'center.png',
  planet: 'planet.png',
  planethover: 'planethover.png',
  tier2: 'tier2.png', tier3: 'tier3.png', tier4: 'tier4.png', tier5: 'tier5.png',
  node: 'node.png', lock: 'lock.png', pulse: 'pulse.png', junction: 'junction.png',
  hologram: 'achievementnodehologram.png', completedTier: 'completedplanettier.png'
};
const SOUNDS = { hover: 'hover.mp3', zoom: 'zoom.mp3', bg: 'background.mp3' };

const images = {}, sounds = {};
function loadImage(k, src){ return new Promise(res => { const i = new Image(); i.src = src; i.onload = () => { images[k]=i; res(i); }; i.onerror = () => { console.warn('img',src,'failed'); res(null); }; });}
function loadAudio(k, src){ return new Promise(res => { const a = new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); });}

const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* data */
let achievements = { planets: [] };
async function loadData(){
  try {
    const r = await fetch('./achievements.json'); achievements = await r.json();
    const saved = localStorage.getItem('progress');
    if(saved){
      const progress = JSON.parse(saved);
      progress.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
        if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]) {
          achievements.planets[i].tiers[j].achievements[k].status = a.status;
          achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
        }
      })));
    }
  } catch(e) {
    console.warn('No achievements.json; using demo', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`,
      tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`,
        achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo how to get', status: ti===0? 'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* state */
const state = {
  camera:{x:0,y:0,scale:0.55}, target:{x:0,y:0,scale:0.55}, easing: DEFAULT_EASING,
  focused:{core:null,tier:null}, hovered:null, dragging:false, dragStart:null
};

/* layout */
const CORE_RADIUS = 420;
const PLANET_SIZE = 96;
const PLANET_HOVER_SCALE = 1.35;
const TIER_BASE_OFFSET = 120;
const TIER_SPACING = 130;
const TIER_SIZE = 44;
const NODE_ICON = 18;

/* cosmetic particles & shapes */
const stars = [];
for(let i=0;i<260;i++) stars.push({x:(Math.random()*2-1)*1900,y:(Math.random()*2-1)*1200,r:Math.random()*1.6+0.2});

/* helpers */
const lerp = (a,b,t)=> a + (b-a)*t;
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
const d = (x1,y1,x2,y2)=> Math.hypot(x1-x2,y1-y2);
function play(k){ const s=sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

/* deterministic jitter */
function jitter(seed, index, scale=1){ const v = Math.sin((seed + index) * 12.9898) * 43758.5453; return ((v - Math.floor(v)) * 2 - 1) * scale; }

/* layout helpers */
function planetPos(index, total, radius){ const angle = index * (Math.PI*2/total) - Math.PI/2; return {x: Math.cos(angle)*radius, y: Math.sin(angle)*radius, angle}; }
function screenToWorld(px,py){
  const tilt = 0.62;
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x: (px - cx) / state.camera.scale, y: (py - cy) / (state.camera.scale * tilt) };
}

/* connection pulse data */
const connectionPulses = []; // filled per connection for animation

/* prepare connections for pulses (call after positions computed) */
function prepareConnectionPulses(){
  connectionPulses.length = 0;
  achievements.planets.forEach((planet,i)=>{
    planet.tiers.forEach((tier,j)=>{
      const from = (j===0) ? planet._world : planet.tiers[j-1]._pos;
      const to = tier._pos;
      if(!from || !to) return;
      // pulses: 2 per connection, random speed offset
      connectionPulses.push({ core:i, tier:j, from, to, pulses:2, speed:0.25 + (j*0.05), offset: (i+j)*0.17 });
    });
  });
}

/* draw loop */
let time = 0;
function draw(){
  const dt = 1/60;
  time += dt;
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  ctx.clearRect(0,0,W,H);
  ctx.save();

  const tilt = 0.62;
  ctx.translate(W/2 + state.camera.x * state.camera.scale, H/2 + state.camera.y * state.camera.scale);
  ctx.scale(state.camera.scale, state.camera.scale * tilt);

  // stars
  ctx.save();
  for(const s of stars){ ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.restore();

  // central tilted orbits - static ellipses to fill canvas
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 1.0 / state.camera.scale;
  const maxR = Math.max(W,H) * 1.2;
  for(let r=100; r<maxR; r+=44){
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r*0.38, 0, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
  }
  ctx.restore();

  // central glow radial
  ctx.save();
  const grd = ctx.createRadialGradient(0,0,40, 0,0,650);
  grd.addColorStop(0, 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(-2000,-2000,4000,4000);
  ctx.restore();

  // center image
  if(images.center) ctx.drawImage(images.center, -260/2, -260/2, 260, 260);

  // planets
  const total = achievements.planets.length || 5;
  const colorA = accentA.value; const colorB = accentB.value;
  achievements.planets.forEach((planet,i)=>{
    const pos = planetPos(i, total, CORE_RADIUS);
    const px = pos.x + jitter(13.37,i,24);
    const py = pos.y + jitter(99.1,i,12);
    planet._world = {x:px, y:py, angle: pos.angle};

    // draw base planet hover underlay
    const isCoreHover = state.hovered?.type === 'core' && state.hovered.index === i;
    planet._hover = planet._hover ?? 0; planet._hover = lerp(planet._hover, isCoreHover?1:0, 0.12);
    if(images.planethover){
      const scale = 1.7 + 0.2 * planet._hover;
      ctx.save(); ctx.globalAlpha = 0.55 * (0.5 + 0.5*planet._hover); ctx.drawImage(images.planethover, px - PLANET_SIZE*scale/2, py - PLANET_SIZE*scale/2, PLANET_SIZE*scale, PLANET_SIZE*scale); ctx.restore();
    }

    // draw planet main
    const size = PLANET_SIZE * (1 + 0.03*planet._hover);
    const tImg = images[`tier${Math.min(5,planet.tier||1)}`] || images.planet;
    if(tImg) ctx.drawImage(tImg, px - size/2, py - size/2, size, size);
    else { ctx.save(); ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(px,py,size/2,0,Math.PI*2); ctx.fill(); ctx.restore(); }

    // label (always small)
    if(state.camera.scale > 0.9){
      ctx.save(); ctx.scale(1,1/tilt); ctx.fillStyle='#fff'; ctx.font='bold 13px Arial'; ctx.textAlign='center'; ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + size/2 + 14*(1/tilt)); ctx.restore();
    }

    // tiers placed like a mini solar-system around the planet (but outward chain still maintained)
    const baseAngle = pos.angle;
    planet.tiers.forEach((tier,j)=>{
      // scatter angle slightly for a natural feel
      const angle = baseAngle + jitter(2.71, i*7 + j, 0.18) + j*0.03;
      // radial distance from planet increases with tier index
      const offset = TIER_BASE_OFFSET + j * TIER_SPACING;
      // but we also place tiers slightly around the planet like moons orbiting
      const tx = px + Math.cos(angle) * offset;
      const ty = py + Math.sin(angle) * offset;
      tier._pos = { x: tx, y: ty };

      // draw glowing multi-stroke link (white) from previous to this
      const from = (j===0) ? {x:px,y:py} : planet.tiers[j-1]._pos;
      const to = {x:tx,y:ty};

      // gradient for connection
      const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      grad.addColorStop(0, colorA);
      grad.addColorStop(1, colorB);

      // soft outer
      ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 8 / state.camera.scale; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();
      // inner gradient stroke
      ctx.save(); ctx.strokeStyle = grad; ctx.globalAlpha = 0.16; ctx.lineWidth = 3.6 / state.camera.scale; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();
      // crisp center line
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.0 / state.camera.scale; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();

      // junction icon at ~62%
      if(images.junction){
        const jx = from.x + (to.x - from.x)*0.62; const jy = from.y + (to.y - from.y)*0.62;
        const jsize = 22; ctx.drawImage(images.junction, jx - jsize/2, jy - jsize/2, jsize, jsize);
        tier._junction = tier._junction || {x:jx,y:jy,r:jsize/2};
        // store active only if previous tier completed
        const prevAll = (j===0) ? true : planet.tiers[j-1].achievements.every(a => a.status === 'completed');
        tier._junction.active = prevAll;
      }

      // draw tier planet (small)
      const timg = images[`tier${Math.min(5,j+1)}`] || images.planet;
      if(timg) ctx.drawImage(timg, tx - TIER_SIZE/2, ty - TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      else { ctx.save(); ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(tx,ty,TIER_SIZE/2,0,Math.PI*2); ctx.fill(); ctx.restore(); }

      // tier label on top when zoomed
      if(state.camera.scale > 1.1 || (state.focused.core===i && state.focused.tier===j)){
        ctx.save(); ctx.scale(1,1/tilt); ctx.fillStyle='#fff'; ctx.font='12px Arial'; ctx.textAlign='center'; ctx.fillText(tier.tierName || `Tier ${j+1}`, tx, ty - (TIER_SIZE/2 + 10)*(1/tilt)); ctx.restore();
      }

      // achievements drawn clearly when tier focused
      if(state.focused.core===i && state.focused.tier===j){
        const num = tier.achievements.length;
        const ringR = Math.max(44, 32 + Math.floor(num/8) * 24);
        for(let k=0;k<num;k++){
          const a = tier.achievements[k];
          const aAngle = (k / num) * Math.PI*2 + (k * 0.08);
          const ax = tx + Math.cos(aAngle) * ringR;
          const ay = ty + Math.sin(aAngle) * ringR;

          // branch: glowing white lines (static)
          ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 6 / state.camera.scale; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();
          ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2.0 / state.camera.scale; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();

          // draw node base
          const icon = (a.status === 'locked') ? images.lock : images.node;
          if(icon) ctx.drawImage(icon, ax - NODE_ICON/2, ay - NODE_ICON/2, NODE_ICON, NODE_ICON);
          else { ctx.save(); ctx.fillStyle = a.status==='locked'?'#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,NODE_ICON/2,0,Math.PI*2); ctx.fill(); ctx.restore(); }

          // overlay hologram image with fade/alpha and text on top if hovered
          a._holo = a._holo ?? 0;
          const isNodeHover = state.hovered?.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===k;
          a._holo = lerp(a._holo, isNodeHover?1:0, 0.12);
          if(images.hologram && a._holo > 0.02){
            const holoSize = NODE_ICON * 3.6;
            ctx.save();
            ctx.globalAlpha = clamp(0.18 + 0.8*a._holo, 0, 0.95);
            ctx.drawImage(images.hologram, ax - holoSize/2, ay - holoSize/2, holoSize, holoSize);
            // draw title + how-to text on hologram (simple)
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `${10 + Math.floor(4*a._holo)}px Arial`;
            ctx.textAlign = 'center';
            const lines = [a.title || 'Achievement', a.description || 'How to get: ...'];
            ctx.scale(1,1); // text orientation handled by tilt compensation when needed
            ctx.fillText(lines[0], ax, ay - 4);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = `${9 + Math.floor(3*a._holo)}px Arial`;
            ctx.fillText(lines[1], ax, ay + 10);
            ctx.restore();
          }

          // pulse overlay ON TOP - animated traveling pulse from tier center to node (small local pulses)
          if(a.status === 'available'){
            const phase = (time * (0.6 + (k%3)*0.08) + k*0.1) % 1;
            const px = tx + (ax - tx) * phase;
            const py = ty + (ay - ty) * phase;
            const pulseSize = NODE_ICON + 6 * (0.6 + 0.4*Math.sin(time*6 + k));
            ctx.save();
            ctx.globalCompositeOperation='lighter';
            const g = ctx.createRadialGradient(px,py,0,px,py,pulseSize);
            g.addColorStop(0, colorA);
            g.addColorStop(0.6, colorB);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.globalAlpha = 0.55;
            ctx.beginPath(); ctx.arc(px,py,pulseSize,0,Math.PI*2); ctx.fill();
            ctx.globalCompositeOperation='source-over';
            ctx.restore();
          }

          // labels for nodes (show when zoomed or hovered)
          if(state.camera.scale > 3.6 || isNodeHover){
            ctx.save(); ctx.scale(1,1/tilt); ctx.fillStyle = '#fff'; ctx.font = '11px Arial'; ctx.textAlign='center'; ctx.fillText(a.title || `Node ${k+1}`, ax, ay - (NODE_ICON + 8)*(1/tilt)); ctx.restore();
          }

          a._pos = {x: ax, y: ay, r: NODE_ICON*0.75};
        } // end nodes loop
      } // focused tier
    }); // tier loop
  }); // planet loop

  // moving pulses on planet-to-tier and tier-to-tier connections (global pulses)
  connectionPulses.forEach(conn => {
    const from = conn.from, to = conn.to;
    // draw several moving pulses
    for(let p=0;p<conn.pulses;p++){
      const speed = conn.speed;
      const phase = (time * speed + (p/conn.pulses) + conn.offset) % 1;
      // only draw pulse if junction path is active (check underlying tier._junction.active)
      const tier = achievements.planets[conn.core].tiers[conn.tier];
      const allowed = conn.tier === 0 ? true : achievements.planets[conn.core].tiers[conn.tier-1].achievements.every(a=>a.status==='completed');
      if(!allowed) continue;
      const x = from.x + (to.x - from.x) * phase;
      const y = from.y + (to.y - from.y) * phase;
      const radius = 6 + 3*Math.sin(time*8 + p);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x,y,0,x,y,radius*3.2);
      g.addColorStop(0, accentA.value);
      g.addColorStop(0.5, accentB.value);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  });

  ctx.restore(); // restore transform
  requestAnimationFrame(draw);
}

/* prepare pulses after we calculate positions */
function buildConnections(){
  connectionPulses.length = 0;
  achievements.planets.forEach((planet,i)=>{
    planet.tiers.forEach((tier,j)=>{
      const from = (j===0) ? planet._world : planet.tiers[j-1]._pos;
      const to = tier._pos;
      if(from && to){
        connectionPulses.push({ core:i, tier:j, from, to, pulses: 2 + Math.floor(j/2), speed: 0.25 + j*0.05, offset: (i*0.13 + j*0.07) });
      }
    });
  });
}

/* interactions */
let pointer = {x:0,y:0,down:false};
canvas.addEventListener('pointerdown', (e)=> {
  pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY;
  state.dragging=true; state.dragStart={x:e.clientX,y:e.clientY,camx:state.target.x,camy:state.target.y};
  if(sounds.bg && sounds.bg.paused) try{ sounds.bg.loop=true; sounds.bg.play(); } catch(e){}
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e)=> {
  pointer.x=e.clientX; pointer.y=e.clientY;
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx;
    state.target.y = state.dragStart.camy + dy;
    state.hovered = null; tooltip.style.display='none';
  } else updateHover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', (e)=> {
  pointer.down=false; state.dragging=false; canvas.releasePointerCapture?.(e.pointerId);
  if(state.hovered){
    const h = state.hovered;
    if(h.type==='core'){
      const p = achievements.planets[h.index]._world;
      state.target.x = -p.x; state.target.y = -p.y; state.target.scale = 2.8; state.focused.core = h.index; state.focused.tier = null; play('zoom');
    } else if(h.type==='tier'){
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      // zoom larger so nodes are clearly visible
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 6.0; state.focused.core = h.core; state.focused.tier = h.tier; play('zoom');
    } else if(h.type==='junction'){
      // only zoom to next tier if junction is active (previous tier completed)
      const t = achievements.planets[h.core].tiers[h.tier];
      if(t._junction && t._junction.active){
        const next = h.tier + 1;
        if(achievements.planets[h.core].tiers[next]){
          const pos = achievements.planets[h.core].tiers[next]._pos;
          state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 6.0; state.focused.core = h.core; state.focused.tier = next; play('zoom');
        }
      } else {
        // maybe show tooltip or locked feedback
      }
    } else if(h.type==='achievement'){
      openAchievementPopup(h.core,h.tier,h.ach);
    }
  }
});

canvas.addEventListener('wheel', (e)=> {
  e.preventDefault();
  const delta = -e.deltaY * 0.0015;
  state.target.scale = clamp(state.target.scale + delta, 0.2, 10.0);
  play('zoom');
}, { passive:false });

/* hover detection accounts for tilt */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    if(p._world && d(w.x, w.y, p._world.x, p._world.y) < Math.max(22, PLANET_SIZE*0.45 + 8)){ found = {type:'core', index:i}; break; }
    for(let j=0;j<p.tiers.length;j++){
      const tier = p.tiers[j];
      if(tier._pos && d(w.x, w.y, tier._pos.x, tier._pos.y) < Math.max(14, TIER_SIZE*0.6 + 8)){ found = {type:'tier', core:i, tier:j}; break; }
      if(tier._junction && d(w.x, w.y, tier._junction.x, tier._junction.y) < Math.max(18, tier._junction.r + 8)){ found = {type:'junction', core:i, tier:j}; break; }
      if(state.focused.core===i && state.focused.tier===j){
        for(let k=0;k<tier.achievements.length;k++){
          const a = tier.achievements[k];
          if(a._pos && d(w.x, w.y, a._pos.x, a._pos.y) < Math.max(10, a._pos.r + 6)){ found = {type:'achievement', core:i, tier:j, ach:k}; break; }
        }
        if(found) break;
      }
    }
    if(found) break;
  }
  if(found){
    state.hovered = found; showTooltip(sx, sy, found);
    if(!updateHover.last || (Date.now() - updateHover.last) > 300){ play('hover'); updateHover.last = Date.now(); }
  } else { state.hovered = null; tooltip.style.display='none'; }
}

/* tooltip */
function showTooltip(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display='none'; return; }
  let title='', desc='';
  if(found.type==='core'){ const p=achievements.planets[found.index]; title=p.planetName||`Planet ${found.index+1}`; desc=p.short||'Click to zoom'; }
  else if(found.type==='tier'){ const p=achievements.planets[found.core]; const t=p.tiers[found.tier]; title=t.tierName||`Tier ${found.tier+1}`; desc=`${t.achievements.length} nodes`; }
  else if(found.type==='junction'){ title='Junction'; desc = found && achievements.planets[found.core].tiers[found.tier]._junction?.active ? 'Travel to next tier' : 'Locked (complete previous tier)'; }
  else if(found.type==='achievement'){ const a=achievements.planets[found.core].tiers[found.tier].achievements[found.ach]; title=a.title||'Achievement'; desc=a.description||''; }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.85;margin-top:6px">${desc}</div>`;
  const pad=12; let left=sx+pad, top=sy+pad; const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 280;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 120 > window.innerHeight - 10) top = sy - 120 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* popup */
function openAchievementPopup(core,tier,ach){
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  const html = `<h2 style="margin:0 0 8px 0">${escape(a.title||'')}</h2><div style="opacity:0.9">${escape(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status==='available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`;
  popup.innerHTML = html; popup.style.display='block';
}
function closePopup(){ popup.style.display='none'; }

/* complete */
window.completeAchievement = (core,tier,ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed'; a.dateCompleted = new Date().toISOString();
  localStorage.setItem('progress', JSON.stringify(achievements));
  popup.style.display='none';
  const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed');
  if(all && tier < achievements.planets[core].tiers.length - 1){
    achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status==='locked') x.status='available'; });
  }
};

/* admin (kept) */
window.showAdminPanel = ()=> { document.getElementById('adminPanel').style.display='block'; document.getElementById('adminLogin').style.display='block'; document.getElementById('editContent').style.display='none'; }
window.hideAdminPanel = ()=> { document.getElementById('adminPanel').style.display='none'; }
window.loginAdmin = ()=>{
  const pass = document.getElementById('adminPassword').value;
  if(pass==='admin'){
    let html=''; achievements.planets.forEach((p,i)=>{ html+=`<h3>${escape(p.planetName||'Planet')}</h3>`; p.tiers.forEach((t,j)=>{ html+=`<h4>${escape(t.tierName||'Tier')}</h4>`; t.achievements.forEach((a,k)=>{ html+=`<div style="margin-bottom:6px;"><input style="width:45%;margin-right:6px" value="${escape(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)"><input style="width:45%" value="${escape(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)"><select onchange="editStatus(${i},${j},${k},this.value)"><option ${a.status==='locked'?'selected':''}>locked</option><option ${a.status==='available'?'selected':''}>available</option><option ${a.status==='completed'?'selected':''}>completed</option></select></div>`; }); }); });
    html += `<div style="margin-top:12px"><button onclick="downloadJson()">Download JSON</button><button onclick="bulkUnlock()">Bulk Unlock</button><button onclick="bulkReset()">Bulk Reset</button></div>`;
    document.getElementById('editContent').innerHTML = html; document.getElementById('adminLogin').style.display='none'; document.getElementById('editContent').style.display='block';
  } else alert('Wrong password');
};
window.editTitle=(i,j,k,v)=>{achievements.planets[i].tiers[j].achievements[k].title=v; localStorage.setItem('progress', JSON.stringify(achievements));};
window.editDesc=(i,j,k,v)=>{achievements.planets[i].tiers[j].achievements[k].description=v; localStorage.setItem('progress', JSON.stringify(achievements));};
window.editStatus=(i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].status=v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v==='completed'? new Date().toISOString():null; localStorage.setItem('progress', JSON.stringify(achievements));};
window.downloadJson=()=>{ const blob=new Blob([JSON.stringify(achievements,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='achievements.json'; a.click(); };
window.bulkUnlock=()=>{ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked');};
window.bulkReset=()=>{ achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0? 'available':'locked'; a.dateCompleted=null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* util */
function escape(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

/* init */
(async function init(){
  await Promise.all(preload);
  await loadData();

  tooltipHolo.src = IMG_PATH + ASSETS.hologram;
  tooltipHolo.classList.toggle('grayscale', monoToggle.checked);

  // compute static positions
  const tot = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=>{
    const pos = planetPos(i, tot, CORE_RADIUS);
    const px = pos.x + jitter(13.37,i,24), py = pos.y + jitter(99.1,i,12);
    p._world = {x:px,y:py,angle:pos.angle};
    p.tiers.forEach((t,j)=> {
      const angle = pos.angle + jitter(2.71, i*7 + j, 0.18) + j*0.03;
      const offset = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(angle) * offset, ty = py + Math.sin(angle) * offset;
      t._pos = {x:tx,y:ty};
    });
  });

  // build moving connection pulses dataset
  buildConnections();

  // start draw
  requestAnimationFrame(draw);
})();

/* buildConnections wrapper */
function buildConnections(){
  connectionPulses.length = 0;
  achievements.planets.forEach((planet,i)=>{
    planet.tiers.forEach((tier,j)=>{
      const from = (j===0)? planet._world : planet.tiers[j-1]._pos;
      const to = tier._pos;
      if(from && to) connectionPulses.push({ core:i, tier:j, from, to, pulses: 2 + Math.floor(j/2), speed: 0.22 + j*0.06, offset: (i*0.11 + j*0.05) });
    });
  });
}

/* hover & pointer helpers */
canvas.addEventListener('pointerdown', e=> {
  pointer.down=true; pointer.x=e.clientX; pointer.y=e.clientY;
  state.dragging=true; state.dragStart={x:e.clientX,y:e.clientY,camx:state.target.x,camy:state.target.y};
  if(sounds.bg && sounds.bg.paused) try{ sounds.bg.loop=true; sounds.bg.play(); }catch(e){}
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e=> {
  pointer.x=e.clientX; pointer.y=e.clientY;
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy; state.hovered = null; tooltip.style.display='none';
  } else updateHover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e=> {
  pointer.down=false; state.dragging=false; canvas.releasePointerCapture?.(e.pointerId);
  if(state.hovered){
    const h=state.hovered;
    if(h.type==='core'){ const p = achievements.planets[h.index]._world; state.target.x = -p.x; state.target.y = -p.y; state.target.scale=2.8; state.focused.core=h.index; state.focused.tier=null; play('zoom'); }
    else if(h.type==='tier'){ const pos = achievements.planets[h.core].tiers[h.tier]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale=6.0; state.focused.core=h.core; state.focused.tier=h.tier; play('zoom'); }
    else if(h.type==='junction'){ const t = achievements.planets[h.core].tiers[h.tier]; if(t._junction && t._junction.active){ const next=h.tier+1; if(achievements.planets[h.core].tiers[next]){ const pos = achievements.planets[h.core].tiers[next]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 6.0; state.focused.core=h.core; state.focused.tier=next; play('zoom'); } } }
    else if(h.type==='achievement'){ openAchievementPopup(h.core,h.tier,h.ach); }
  }
});
canvas.addEventListener('wheel', e=> { e.preventDefault(); const delta=-e.deltaY * 0.0015; state.target.scale = clamp(state.target.scale + delta, 0.2, 10.0); play('zoom'); }, { passive:false });

function updateHover(sx,sy){
  const w = screenToWorld(sx,sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    if(p._world && d(w.x,w.y,p._world.x,p._world.y) < Math.max(22, PLANET_SIZE*0.45 + 8)){ found = {type:'core', index:i}; break; }
    for(let j=0;j<p.tiers.length;j++){
      const tier = p.tiers[j];
      if(tier._pos && d(w.x,w.y,tier._pos.x,tier._pos.y) < Math.max(14, TIER_SIZE*0.6 + 8)){ found = {type:'tier', core:i, tier:j}; break; }
      if(tier._junction && d(w.x,w.y,tier._junction.x,tier._junction.y) < Math.max(18, tier._junction.r + 8)){ found = {type:'junction', core:i, tier:j}; break; }
      if(state.focused.core===i && state.focused.tier===j){
        for(let k=0;k<tier.achievements.length;k++){
          const a = tier.achievements[k];
          if(a._pos && d(w.x,w.y,a._pos.x,a._pos.y) < Math.max(10, a._pos.r + 6)){ found = {type:'achievement', core:i, tier:j, ach:k}; break; }
        }
        if(found) break;
      }
    }
    if(found) break;
  }
  if(found){ state.hovered = found; showTooltip(sx,sy,found); if(!updateHover.last || (Date.now()-updateHover.last)>300){ play('hover'); updateHover.last = Date.now(); } }
  else { state.hovered = null; tooltip.style.display='none'; }
}

function showTooltip(sx,sy,found){
  if(window.innerWidth<=720){ tooltip.style.display='none'; return; }
  let title='', desc='';
  if(found.type==='core'){ const p=achievements.planets[found.index]; title=p.planetName||`Planet ${found.index+1}`; desc=p.short||'Click to zoom'; }
  else if(found.type==='tier'){ const p=achievements.planets[found.core]; const t=p.tiers[found.tier]; title=t.tierName||`Tier ${found.tier+1}`; desc=`${t.achievements.length} nodes`; }
  else if(found.type==='junction'){ title='Junction'; desc = achievements.planets[found.core].tiers[found.tier]._junction?.active ? 'Travel to next tier' : 'Locked (complete previous tier)'; }
  else if(found.type==='achievement'){ const a=achievements.planets[found.core].tiers[found.tier].achievements[found.ach]; title=a.title||'Achievement'; desc=a.description||''; }
  tooltipContent.innerHTML = `<strong>${title}</strong><div style="opacity:0.85;margin-top:6px">${desc}</div>`;
  const pad=12; let left=sx+pad; let top=sy+pad; const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w'))||280;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 120 > window.innerHeight - 10) top = sy - 120 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display='flex';
}

/* final small helpers and init */
homeBtn.addEventListener('click', ()=> { state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core=null; state.focused.tier=null; });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'){ popup.style.display='none'; document.getElementById('adminPanel').style.display='none'; }});
document.addEventListener('selectstart',(e)=>{ if(state.dragging) e.preventDefault(); });
document.addEventListener('pointerdown', ()=>{ if(sounds.bg && sounds.bg.paused) try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} }, { once:true });

(async function boot(){
  await Promise.all(preload);
  await loadData();
  tooltipHolo.src = IMG_PATH + ASSETS.hologram;
  tooltipHolo.classList.toggle('grayscale', monoToggle.checked);

  // compute static positions and connections
  const tot = achievements.planets.length || 5;
  achievements.planets.forEach((p,i)=>{
    const pos = planetPos(i, tot, CORE_RADIUS);
    const px = pos.x + jitter(13.37,i,24), py = pos.y + jitter(99.1,i,12);
    p._world = {x:px,y:py,angle:pos.angle};
    p.tiers.forEach((t,j)=> {
      const angle = pos.angle + jitter(2.71, i*7 + j, 0.18) + j*0.03;
      const offset = TIER_BASE_OFFSET + j * TIER_SPACING;
      const tx = px + Math.cos(angle) * offset, ty = py + Math.sin(angle) * offset;
      t._pos = {x:tx,y:ty};
    });
  });

  buildConnections();
  requestAnimationFrame(draw);
})();
