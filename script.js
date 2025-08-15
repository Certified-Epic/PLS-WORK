/* script.js — Fixed compactR bug + camera tilt, clouds, parallax, better glowing connectors,
   planets visible at load, cinematic zoom (planet ~45-50% screen), nodes on surface, junctions outside.
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
  // transforms are set inside draw via ctx.setTransform equivalents
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ---- UI elements (already in your index.html) ---- */
const colorPicker = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const gradToggle = document.getElementById('gradToggle');
const transRange = document.getElementById('transRange');
const homeBtn = document.getElementById('homeBtn');

const tooltip = document.getElementById('tooltip');
const tooltipContent = document.getElementById('tooltipContent');

const titleCard = document.getElementById('titleCard');
const titleCardInner = document.getElementById('titleCardInner');
const titleCardTitle = document.getElementById('titleCardTitle');
const titleCardDesc = document.getElementById('titleCardDesc');
const openDetailsBtn = document.getElementById('openDetailsBtn');
const closeCardBtn = document.getElementById('closeCardBtn');

const popup = document.getElementById('popup');
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');

/* ---- theme + cached grad ---- */
let cachedGrad = { accent: '#00c8ff', gradEnabled: true };
function buildCachedGradients(){
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff').trim();
  const gradEnabled = !!(gradToggle && gradToggle.checked);
  cachedGrad = { accent, gradEnabled };
}
function setAccent(hex){ document.documentElement.style.setProperty('--accent', hex); buildCachedGradients(); }
if(colorPicker) colorPicker.addEventListener('input', e => setAccent(e.target.value));
setAccent(colorPicker ? colorPicker.value : '#00c8ff');
if(monoToggle) monoToggle.addEventListener('change', ()=> document.documentElement.style.setProperty('--mono', monoToggle.checked ? 1 : 0));
if(transRange) transRange.addEventListener('input', ()=> state.easing = parseFloat(transRange.value));
if(gradToggle) gradToggle.addEventListener('change', buildCachedGradients);

/* ---- assets preload ---- */
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
function loadImage(k,src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{ images[k]=i; res(i); }; i.onerror=()=>{ console.warn('img fail', src); res(null); }; }); }
function loadAudio(k,src){ return new Promise(res=>{ const a=new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.95); sounds[k]=a; res(a); }); }
const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* ---- data ---- */
let achievements = { planets: [] };
async function loadData(){
  try{
    const r = await fetch('./achievements.json');
    achievements = await r.json();
    const saved = localStorage.getItem('progress');
    if(saved){
      try{
        const prog = JSON.parse(saved);
        prog.planets?.forEach((p,i)=> p.tiers?.forEach((t,j)=> t.achievements?.forEach((a,k)=> {
          if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
            achievements.planets[i].tiers[j].achievements[k].status = a.status;
            achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
          }
        })));
      }catch(e){ console.warn('progress parse fail',e); }
    }
  }catch(e){
    console.warn('achievements.json load failed, creating demo', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* ---- state & layout ---- */
const state = {
  camera: { x:0, y:0, scale: 0.62, rotation: 0 }, // start zoomed-out but visible
  target: { x:0, y:0, scale: 0.62, rotation: 0 },
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused: { core:null, tier:null },
  hovered: null,
  dragging: false,
  dragStart: null
};

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

/* helpers */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{ s.currentTime = 0; s.play(); }catch(e){} }

/* geometry helpers */
function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  // small deterministic offset for organic distribution
  const spread = (index % 5 - 2) * 0.08 * radius * 0.02;
  return { x: Math.cos(angle)*radius + Math.cos(angle+0.9)*spread, y: Math.sin(angle)*radius + Math.sin(angle+0.9)*spread, angle };
}

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
  const maxR = Math.max(W,H) * 0.95;
  const accent = cachedGrad && cachedGrad.accent || '#00c8ff';
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
  for(let r=120; r < maxR; r += Math.round(Math.min(90, Math.max(56, maxR*0.02))) ){
    ctx.globalAlpha = 0.06 + Math.max(0, 0.18 - r/maxR*0.16);
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

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
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_DISPLAY_SIZE/2, ty - TIER_DISPLAY_SIZE/2, TIER_DISPLAY_SIZE, TIER_DISPLAY_SIZE); ctx.restore();
      }

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

          // hologram under node when hovered
          a._holo = a._holo === undefined ? 0 : a._holo;
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
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.95; const hs = ACH_ICON * 1.9; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // draw node with visibility alpha
          const icon = (a.status === 'locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333':'#fff'; ctx.beginPath(); ctx.arc(ax,ay,ACH_ICON/2,0,Math.PI*2); ctx.fill(); } ctx.restore();

          // small label when zoomed in somewhat
          if(state.camera.scale > 1.4){
            ctx.save(); ctx.globalAlpha = vis; ctx.font='11px Electrolize, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4); ctx.restore();
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }
      }
    }); // end tiers
  } // end planets

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
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // lens glow center
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.09 * atmos; ctx.fillStyle = cachedGrad.accent || '#00c8ff'; ctx.beginPath(); ctx.arc(W/2, H/2, 160 + atmos * 260, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }

  requestAnimationFrame(draw);
} // end draw

/* ---- interactions ---- */
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
  if(state.dragging && state.dragStart){
    // dragging must account for scale & rotation — we will move in world space ignoring rotation for simplicity (works for small tilts)
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    // apply inverse rotation to keep dragging intuitive
    const rot = -state.target.rotation;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    state.target.x = state.dragStart.camx + rx; state.target.y = state.dragStart.camy + ry;
    state.hovered = null; tooltip.style.display = 'none'; hideTitleCard();
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
      const prev = achievements.planets[core].tiers[tIdx];
      const all = prev.achievements.every(a=>a.status==='completed');
      if(all && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
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
      showTitleCardFor(h);
    }
  }
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  state.target.scale = clamp(state.target.scale + (-e.deltaY * 0.0016), 0.22, 6.0);
  playSound('zoom');
}, { passive:false });

/* hover detection uses screenToWorld that accounts for rotation */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  outer:
  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    const ppos = p._world;
    if(ppos && dist(w.x, w.y, ppos.x, ppos.y) < Math.max(36, PLANET_DRAW_SIZE*0.14)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<p.tiers.length;j++){
      const t = p.tiers[j];
      if(t._pos && dist(w.x, w.y, t._pos.x, t._pos.y) < Math.max(22, TIER_DISPLAY_SIZE*0.72)){
        found = { type:'tier', core:i, tier:j, pos: t._pos }; break;
      }
      if(t._junction && dist(w.x, w.y, t._junction.x, t._junction.y) < 18){
        found = { type:'junction', core:i, tier:j, pos: t._junction }; break;
      }
      for(let k=0;k<t.achievements.length;k++){
        const a = t.achievements[k];
        if(a._pos && a._pos.alpha > 0.05 && dist(w.x, w.y, a._pos.x, a._pos.y) < Math.max(8, a._pos.r + 6)){
          found = { type:'achievement', core:i, tier:j, ach:k, pos: a._pos }; break;
        }
      }
      if(found) break;
    }
    if(found) break;
  }

  if(found){
    state.hovered = found;
    if(found.type === 'achievement'){ tooltip.style.display = 'none'; showTitleCardFor(found); }
    else { hideTitleCard(); showTooltipAt(sx, sy, found); }
    const now = Date.now();
    if(!lastHoverSound || (now - lastHoverSound) > 300){ playSound('hover'); lastHoverSound = now; }
  } else {
    state.hovered = null; tooltip.style.display = 'none'; hideTitleCard();
  }
}

/* Title card fixed top-right (on top of hologram). Click Open expands details */
let hideC = null;
function showTitleCardFor(h){
  if(!h || h.type !== 'achievement') return;
  const a = achievements.planets[h.core].tiers[h.tier].achievements[h.ach];
  titleCardTitle.textContent = a.title || 'Achievement';
  titleCardDesc.textContent = a.description || '';
  titleCard.style.display = 'block';
  titleCard.classList.add('show');
  titleCardInner.classList.remove('expanded'); titleCardInner.classList.add('collapsed');
  titleCard.setAttribute('aria-hidden','false');
  if(hideC) clearTimeout(hideC);
  hideC = setTimeout(()=> hideTitleCard(), 7000);
  titleCard._current = h;
}
function hideTitleCard(){
  titleCard.classList.remove('show');
  titleCard.setAttribute('aria-hidden','true');
  setTimeout(()=> { titleCard.style.display = 'none'; }, 240);
  if(hideC){ clearTimeout(hideC); hideC = null; }
  titleCard._current = null;
}
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
function showTooltipAt(sx, sy, found){
  if(window.innerWidth <= 720){ tooltip.style.display = 'none'; return; }
  let title='', desc='';
  if(found.type === 'core'){ const p = achievements.planets[found.index]; title = p.planetName || `Planet ${found.index+1}`; desc = p.short || 'Click to zoom'; }
  else if(found.type === 'tier'){ const t = achievements.planets[found.core].tiers[found.tier]; title = t.tierName || `Tier ${found.tier+1}`; desc = `${t.achievements.length} nodes`; }
  else if(found.type === 'junction'){ title='Junction'; desc='Travel to next tier (unlock required)'; }
  tooltipContent.innerHTML = `<strong style="font-family:Electrolize, Arial">${title}</strong><div style="opacity:0.88;margin-top:6px">${desc}</div>`;
  const pad = 12; let left = sx + pad; let top = sy + pad;
  const tw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tooltip-w')) || 320;
  if(left + tw > window.innerWidth - 10) left = sx - tw - pad;
  if(top + 140 > window.innerHeight - 10) top = sy - 140 - pad;
  tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px'; tooltip.style.display = 'flex';
}

/* complete / popup / admin (same as before) */
function openAchievementPopup(core,tier,ach){ const a = achievements.planets[core].tiers[tier].achievements[ach]; popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; }
function closePopup(){ popup.style.display = 'none'; }
window.completeAchievement = (core,tier,ach) => { const a = achievements.planets[core].tiers[tier].achievements[ach]; a.status='completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); popup.style.display='none'; const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed'); if(all && tier < achievements.planets[core].tiers.length-1){ achievements.planets[core].tiers[tier+1].achievements.forEach(x=> { if(x.status==='locked') x.status='available'; }); } };

/* admin simplified */
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

/* helpers */
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

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
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  seedNodeSurfacePositions();
  buildCachedGradients();

  // initialize placeholders positions for stable hit-testing
  const total = achievements.planets.length || 5;
  const coreRadius = getCoreRadius();
  achievements.planets.forEach((p,i) => {
    const pos = planetPosition(i, total, coreRadius);
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
    p.tiers.forEach((t,j) => {
      const dist = 120 + j * 180 + j*10;
      const spread = (j%3 - 1) * 0.16 * dist * 0.6;
      const tx = pos.x + Math.cos(pos.angle) * dist + Math.cos(pos.angle+0.9) * spread;
      const ty = pos.y + Math.sin(pos.angle) * dist + Math.sin(pos.angle+0.9) * spread;
      t._pos = { x:tx, y:ty, r: TIER_DISPLAY_SIZE*0.6 };
      t.achievements.forEach((a, idx)=>{ a._pos = a._pos || { x:tx, y:ty, r: ACH_ICON*0.6, alpha: 0 }; a._holo = a._holo || 0; });
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

/* convenience */
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.62; state.focused.core = null; state.focused.tier = null; });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); }});
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

// touch behavior (mobile)
canvas.addEventListener('touchend', (e)=>{
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      if(state.hovered.type === 'achievement') openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
      else if(state.hovered.type === 'core'){ const p = achievements.planets[state.hovered.index]; const pos = p._world; const desired = Math.min(W,H)*0.48; const scale = desired / PLANET_DRAW_SIZE; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale; state.focused.core = state.hovered.index; state.focused.tier = null; }
      else if(state.hovered.type === 'tier'){ const pos = achievements.planets[state.hovered.core].tiers[state.hovered.tier]._pos; const scale = Math.min(W,H)*0.48 / PLANET_DRAW_SIZE; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale; state.focused.core = state.hovered.core; state.focused.tier = state.hovered.tier; }
    }
  }
}, { passive:true });

document.addEventListener('pointerdown', ()=> { if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* EOF */
