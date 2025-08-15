/* script.js
   - Cinematic zoom so planet fills ~45-50% of screen when focused
   - Planets spaced far apart (based on viewport size)
   - Achievements laid ON the planet surface and fade in as camera approaches
   - Junctions remain outside (only junctions outside)
   - Pulsing connectors drawn as glowing moving lights / trails
   - Hologram under hovered node; title card fixed top-right on top of hologram and expandable
   - No stray random middle circle
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

  // Recompute dynamic radius factor if you keep cached positions if necessary
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* UI elements */
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

if(monoToggle) monoToggle.addEventListener('change', ()=> {
  const mono = monoToggle.checked ? 1 : 0;
  document.documentElement.style.setProperty('--mono', mono);
});

if(transRange) transRange.addEventListener('input', ()=> state.easing = parseFloat(transRange.value) );
if(gradToggle) gradToggle.addEventListener('change', buildCachedGradients);

/* assets */
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
function loadImage(k,src){ return new Promise(res=>{ const i=new Image(); i.src=src; i.onload=()=>{ images[k]=i; res(i); }; i.onerror=()=>{ console.warn('img failed', src); res(null); }; }); }
function loadAudio(k,src){ return new Promise(res=>{ const a = new Audio(src); a.preload='auto'; a.volume = (k==='bg'?0.35:0.9); sounds[k]=a; res(a); }); }

const preload = [];
Object.keys(ASSETS).forEach(k => preload.push(loadImage(k, IMG_PATH + ASSETS[k])));
Object.keys(SOUNDS).forEach(k => preload.push(loadAudio(k, IMG_PATH + SOUNDS[k])));

/* load achievements */
let achievements = { planets: [] };
async function loadData(){
  try {
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
  } catch(e){
    console.warn('failed to load achievements.json — using demo data', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`, tiers: Array.from({length:5}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`, achievements: Array.from({length:6}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`, description:'Demo description', status: ti===0? 'available':'locked', dateCompleted:null
        }))
      }))
    }))};
  }
}

/* state & layout */
const state = {
  camera: { x:0, y:0, scale:0.5 }, // start zoomed out
  target: { x:0, y:0, scale:0.5 },
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused: { core:null, tier:null },
  hovered: null,
  dragging: false,
  dragStart: null
};

// dynamic spacing — computed from viewport
function getCoreRadius(){
  // make planets extremely spaced: ~35-45% of smaller viewport dimension
  return Math.max(600, Math.min(1400, Math.min(W,H) * 0.42));
}

const PLANET_DRAW_SIZE = 140; // base draw size when zoomed into a detailed planet (we will draw this large)
const TIER_DISPLAY_SIZE = 56;  // size for tier icons when zoomed out
const ACH_ICON = 20;

/* visual thresholds and atmosphere */
const atmosphereStart = 1.85;
const atmosphereFull = 3.6;
const nodeShowStart = 1.6;
const nodeShowEnd = 3.0;

/* stars / nebula for depth */
const stars = []; for(let i=0;i<200;i++) stars.push({ x:(Math.random()*2-1)*2200, y:(Math.random()*2-1)*1400, r:Math.random()*1.8+0.2, speed: Math.random()*0.18+0.02 });
const nebula = []; for(let i=0;i<6;i++) nebula.push({ x:(Math.random()*2-1)*1200, y:(Math.random()*2-1)*800, r:200 + Math.random()*400, a:0.06 + Math.random()*0.12 });

/* helpers */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{ s.currentTime = 0; s.play(); }catch(e){} }

function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  // add slight random phase offset for more organic distribution
  const offset = ((index % 3) - 1) * 0.06 * radius * 0.06;
  return { x: Math.cos(angle)*radius + Math.cos(angle+0.6)*offset, y: Math.sin(angle)*radius + Math.sin(angle+0.6)*offset, angle };
}

function screenToWorld(px,py){
  const cx = W/2 + state.camera.x * state.camera.scale;
  const cy = H/2 + state.camera.y * state.camera.scale;
  return { x:(px - cx)/state.camera.scale, y:(py - cy)/state.camera.scale };
}

/* prepare per-node surface positions so nodes sit ON the planet surface when zoomed.
   For each tier we generate polar coordinates for each achievement (theta, lat radius fraction).
*/
function seedNodeSurfacePositions(){
  achievements.planets.forEach((p,pi) => {
    p._nodeSeed = Math.random()*10000;
    p.tiers.forEach((t,ti) => {
      if(!t._nodeMeta) t._nodeMeta = [];
      t.achievements.forEach((a,ai) => {
        if(!t._nodeMeta[ai]){
          // uniform-ish distribution on disc, biased to surface radius
          const theta = Math.random() * Math.PI*2;
          const rFrac = 0.55 + Math.random()*0.35; // 0.55..0.9 of planet radius
          const tilt = (Math.random()-0.5) * 0.2;
          t._nodeMeta[ai] = { theta, rFrac, tilt };
        }
        a._pos = a._pos || { x:0, y:0, r:ACH_ICON*0.6, alpha:0 };
        a._holo = a._holo || 0;
      });
    });
  });
}

/* Glowing connective line draw helper — moving glow with a subtle trail */
function drawGlowingLine(from, to, t, accent){
  // main soft stroke
  ctx.save();
  ctx.lineWidth = 4 / Math.max(0.5, state.camera.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();

  // moving glow (single bright orb with trailing faint orbs)
  const segments = 8;
  for(let s=0;s<segments;s++){
    const prog = ( (t * 0.4) + s * (0.03) ) % 1;
    const px = from.x + (to.x - from.x) * prog;
    const py = from.y + (to.y - from.y) * prog;
    const orbSize = 8 * (1 - s/(segments)) * (1 + Math.sin(t*7+s)*0.08) / Math.max(0.6, state.camera.scale);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 * (1 - s/(segments));
    ctx.shadowBlur = 14 * (1 - s/(segments));
    ctx.shadowColor = accent;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(px, py, orbSize, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // center thin glow stroke
  ctx.save();
  ctx.lineWidth = 2 / Math.max(0.5, state.camera.scale);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.14;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();
}

/* main draw loop */
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

  // nebula
  nebula.forEach(n=>{
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `rgba(255,255,255,${n.a * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
  });

  // stars
  ctx.save(); ctx.globalAlpha = 0.9;
  stars.forEach(s=>{
    ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r);
    s.x -= s.speed * 12 * (state.camera.scale*0.8);
    if(s.x < -2800) s.x = 2800;
  });
  ctx.restore();

  // central dynamic orbital rings (soft, many rings to suggest scale) — avoid stray center circle artifacts
  const maxR = Math.max(W,H) * 0.95;
  const accent = cachedGrad && cachedGrad.accent || '#00c8ff';
  ctx.save();
  ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
  for(let r = 120; r < maxR; r += Math.round(Math.min(80, Math.max(48, maxR*0.02))) ){
    ctx.globalAlpha = 0.06 + Math.max(0, 0.2 - r/maxR*0.18);
    ctx.strokeStyle = accent;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  // optional subtle center emblem (draw small center image but not random circle)
  if(images.center){
    const cs = 140;
    ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.center, -cs/2, -cs/2, cs, cs); ctx.restore();
  }

  // planets: spaced widely using getCoreRadius()
  const total = achievements.planets.length || 5;
  const coreRadius = getCoreRadius();
  for(let i=0;i<total;i++){
    const planet = achievements.planets[i];
    const pos = planetPosition(i, total, coreRadius);
    const px = pos.x, py = pos.y;
    planet._world = { x: px, y: py, angle: pos.angle };

    // planethover underlay for core
    planet._hover = planet._hover===undefined?0:planet._hover;
    const isCoreHover = state.hovered && state.hovered.type === 'core' && state.hovered.index === i;
    planet._hover = lerp(planet._hover, isCoreHover ? 1 : 0, 0.12);
    if(images.planethover){
      const base = PLANET_DRAW_SIZE * 1.1;
      const s = 1 + planet._hover * 0.32;
      ctx.save(); ctx.globalAlpha = 0.28 + planet._hover*0.45; ctx.drawImage(images.planethover, px - (base*s)/2, py - (base*s)/2, base*s, base*s); ctx.restore();
    }

    // draw planet icon (small when zoomed out)
    const drawSize = (state.camera.scale < 1.6) ? (TIER_DISPLAY_SIZE * (1 + planet._hover*0.12)) : (PLANET_DRAW_SIZE * 0.9 * Math.min(1.0, 1 / state.camera.scale));
    const pImg = images[`tier${Math.min(5,i+1)}`] || images.planet;
    if(pImg) ctx.drawImage(pImg, px - drawSize/2, py - drawSize/2, drawSize, drawSize);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px,py,drawSize/2,0,Math.PI*2); ctx.fill(); }

    // label when slightly zoomed
    if(state.camera.scale > 0.9){
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Electrolize, Arial'; ctx.textAlign = 'center'; ctx.fillText(planet.planetName || `Planet ${i+1}`, px, py + drawSize/2 + 16); ctx.restore();
    }

    // satellite orbits (a few small ellipses)
    ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = accent; ctx.lineWidth = 1 / Math.max(0.6, state.camera.scale);
    ctx.beginPath(); ctx.ellipse(px,py, Math.max(48, drawSize*0.7), Math.max(14, drawSize*0.22), pos.angle*0.4, 0, Math.PI*2); ctx.stroke();
    ctx.restore();

    // tiers array around planet — place tier planets not in straight line but in spread
    planet.tiers.forEach((tier, j) => {
      // outward along planet angle but with spread
      const dist = 140 + j * 180 + j * 12 + Math.abs(Math.sin(j + i))*40;
      const spread = (j % 3 - 1) * 0.18 * dist;
      const tx = px + Math.cos(pos.angle) * dist + Math.cos(pos.angle + 1.2) * spread;
      const ty = py + Math.sin(pos.angle) * dist + Math.sin(pos.angle + 1.2) * spread;
      tier._pos = { x: tx, y: ty };

      // connector (draw glowing moving line)
      drawGlowingLine({x:px,y:py}, {x:tx,y:ty}, time + i*0.13 + j*0.18, accent);

      // junction location (outside near this tier)
      const jx = tx + Math.cos(pos.angle) * 36;
      const jy = ty + Math.sin(pos.angle) * 36;
      tier._junction = { x: jx, y: jy, r: 16, index: j };

      // junction icon only visible when hovering that *core* planet
      const showJunctions = state.hovered && state.hovered.type === 'core' && state.hovered.index === i;
      if(showJunctions && images.junction){
        ctx.save(); ctx.globalAlpha = 0.98; ctx.drawImage(images.junction, jx - 14, jy - 14, 28, 28); ctx.restore();
      }

      // tier planet icon drawn small
      const tImg = images[`tier${Math.min(5,j+1)}`] || images.planet;
      ctx.save(); ctx.globalAlpha = 0.98;
      ctx.drawImage(tImg, tx - TIER_DISPLAY_SIZE/2, ty - TIER_DISPLAY_SIZE/2, TIER_DISPLAY_SIZE, TIER_DISPLAY_SIZE);
      ctx.restore();

      // when fully zoomed into THIS tier, the surface becomes detailed (we will scale that later)
      const allCompleted = tier.achievements.every(a => a.status === 'completed');
      if(allCompleted && images.completedTier){
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(images.completedTier, tx - TIER_DISPLAY_SIZE/2, ty - TIER_DISPLAY_SIZE/2, TIER_DISPLAY_SIZE, TIER_DISPLAY_SIZE); ctx.restore();
      }

      /* NODE LAYOUT:
         - compact: nodes sit on tier planet surface (on top of planet)
         - focused: if this tier is the focused target, we show a detailed zoomed planet and place nodes on its surface using seeded polar coords
      */
      const nodes = tier.achievements;
      const compactR = Math.max(TIER_DISPLAY_SIZE * 0.7, 18);
      const isFocusedTier = (state.focused.core === i && state.focused.tier === j);
      const planetZoomingToThis = isFocusedTier && state.target.scale > 1.5;

      // node visibility factor (fade in with camera approach)
      const vis = clamp( (state.camera.scale - nodeShowStart) / (nodeShowEnd - nodeShowStart), 0, 1 );

      // focused detailed planet rendering: draw a larger planet texture centered at screen (WORLD -> SCREEN transform later) — but we'll simulate by drawing a large planet at world pos with PLANET_DRAW_SIZE scaled according to desiredZoomScale.
      if(isFocusedTier && state.camera.scale > 1.6){
        // compute the desired scale such that the planet covers ~45% of viewport
        const desiredScreenPx = Math.min(W, H) * 0.48;
        // the world draw size will be set to desiredScreenPx / state.camera.scale (because we draw into world space scaled by camera)
        // simpler: draw a big planet at size = desiredScreenPx / state.camera.scale * state.camera.scale? avoid double confusion:
        // we'll draw the planet in world units as drawPlanetSizeWorld = desiredScreenPx / state.camera.scale (so that after canvas scale it appears as desiredScreenPx)
        const drawPlanetSizeWorld = desiredScreenPx / state.camera.scale;
        const planetTexture = images[`tier${Math.min(5,j+1)}`] || images.planet || images.center;
        if(planetTexture){
          ctx.save();
          ctx.globalAlpha = 0.98;
          ctx.drawImage(planetTexture, tx - drawPlanetSizeWorld/2, ty - drawPlanetSizeWorld/2, drawPlanetSizeWorld, drawPlanetSizeWorld);
          ctx.restore();
        }

        // draw nodes ON planet surface using seeded polar meta
        const meta = tier._nodeMeta || [];
        const planetRadiusWorld = drawPlanetSizeWorld * 0.48; // nodes will sit within ~48% of draw radius
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          const m = meta[n] || { theta: n*(Math.PI*2/nodes.length), rFrac: 0.7, tilt:0 };
          const theta = m.theta + (time*0.07)*( (n%2)?1:-1 ) + (i*0.03);
          const r = planetRadiusWorld * m.rFrac;
          const ax = tx + Math.cos(theta) * r;
          const ay = ty + Math.sin(theta) * r + m.tilt*8;

          // draw hologram under node if hovered
          a._holo = a._holo === undefined ? 0 : a._holo;
          if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===n) a._holo = lerp(a._holo, 1, 0.16);
          else a._holo = lerp(a._holo, 0, 0.12);
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.98; const hs = ACH_ICON*2.4 * (1 + a._holo*0.22); ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // node icon (on top)
          const icon = (a.status==='locked' ? images.lock : images.node);
          ctx.save();
          ctx.globalAlpha = vis;
          if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON);
          else { ctx.fillStyle = a.status==='locked'? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay, ACH_ICON/2, 0, Math.PI*2); ctx.fill(); }
          ctx.restore();

          // small title (on zoom these are visible)
          if(state.camera.scale > 2.0){
            ctx.save(); ctx.font = '12px Electrolize, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(a.title || '', ax, ay + ACH_ICON + 12); ctx.restore();
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }

      } else {
        // compact mode: nodes on the tier icon circumference (laying on planet)
        for(let n=0;n<nodes.length;n++){
          const a = nodes[n];
          // small slow rotation to avoid perfect static placement
          const ang = (n / Math.max(1,nodes.length)) * Math.PI*2 + (time*0.004) + (n*0.2);
          const ax = tx + Math.cos(ang) * (compactR = compactR || Math.max(TIER_DISPLAY_SIZE*0.6, 18));
          const ay = ty + Math.sin(ang) * compactR;

          // hologram under node when hovered
          a._holo = a._holo === undefined ? 0 : a._holo;
          if(state.hovered && state.hovered.type==='achievement' && state.hovered.core===i && state.hovered.tier===j && state.hovered.ach===n) a._holo = lerp(a._holo, 1, 0.16);
          else a._holo = lerp(a._holo, 0, 0.12);
          if(a._holo > 0.02 && images.hologram){
            ctx.save(); ctx.globalAlpha = a._holo * 0.95; const hs = ACH_ICON*1.9; ctx.drawImage(images.hologram, ax - hs/2, ay - hs/2, hs, hs); ctx.restore();
          }

          // node draw with fade factor (vis)
          const icon = (a.status==='locked' ? images.lock : images.node);
          ctx.save(); ctx.globalAlpha = vis; if(icon) ctx.drawImage(icon, ax - ACH_ICON/2, ay - ACH_ICON/2, ACH_ICON, ACH_ICON); else { ctx.fillStyle = a.status==='locked'? '#333' : '#fff'; ctx.beginPath(); ctx.arc(ax,ay, ACH_ICON/2, 0, Math.PI*2); ctx.fill(); } ctx.restore();

          // inline small label when zoomed in enough
          if(state.camera.scale > 1.4){
            ctx.save(); ctx.globalAlpha = vis; ctx.font = '11px Electrolize, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(a.title || '', ax + ACH_ICON/2 + 6, ay + 4); ctx.restore();
          }

          a._pos = { x: ax, y: ay, r: ACH_ICON*0.6, alpha: vis };
        }
      }

    }); // end tiers loop
  } // end planets loop

  ctx.restore();

  // Atmosphere / approach vignette when zooming into a planet
  const s = state.camera.scale;
  const atmos = clamp( (s - atmosphereStart) / (atmosphereFull - atmosphereStart), 0, 1 );
  if(atmos > 0.002){
    // radial vignette / cloud wash
    const cx = W/2, cy = H/2;
    ctx.save();
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W,H)*0.8);
    grd.addColorStop(0, `rgba(10,16,24,${0.08 * atmos})`);
    grd.addColorStop(0.5, `rgba(0,0,0,${0.0 * atmos})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grd; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // lens glow at center
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.08 * atmos; ctx.fillStyle = cachedGrad.accent || '#00c8ff'; ctx.beginPath(); ctx.arc(W/2, H/2, 120 + atmos * 260, 0, Math.PI*2); ctx.fill(); ctx.restore();
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
  if(state.dragging && state.dragStart){
    const dx = (e.clientX - state.dragStart.x) / state.target.scale;
    const dy = (e.clientY - state.dragStart.y) / state.target.scale;
    state.target.x = state.dragStart.camx + dx; state.target.y = state.dragStart.camy + dy;
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
      // zoom to the core planet so core fills ~45% of screen
      const p = achievements.planets[h.index]; const pos = p._world;
      // compute desired scale: desired planet screen px relative to world draw size
      const desiredScreenPx = Math.min(W, H) * 0.48;
      const worldPlanetSize = PLANET_DRAW_SIZE; // we draw a big planet at this world size when zoomed to detailed
      const scale = desiredScreenPx / worldPlanetSize;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
      state.focused.core = h.index; state.focused.tier = null;
      playSound('zoom');
    } else if(h.type === 'tier'){
      // zoom to tier planet (detailed view of that tier's planet surface)
      const pos = achievements.planets[h.core].tiers[h.tier]._pos;
      const desiredScreenPx = Math.min(W, H) * 0.48;
      const worldPlanetSize = PLANET_DRAW_SIZE; // same large drawing size
      const scale = desiredScreenPx / worldPlanetSize;
      state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
      state.focused.core = h.core; state.focused.tier = h.tier;
      playSound('zoom');
    } else if(h.type === 'junction'){
      const core = h.core, tIdx = h.tier;
      // check prev tier completed
      const prev = achievements.planets[core].tiers[tIdx];
      const all = prev.achievements.every(a => a.status === 'completed');
      if(all && achievements.planets[core].tiers[tIdx+1]){
        const pos = achievements.planets[core].tiers[tIdx+1]._pos;
        const desiredScreenPx = Math.min(W, H) * 0.48;
        const scale = desiredScreenPx / PLANET_DRAW_SIZE;
        state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = scale;
        state.focused.core = core; state.focused.tier = tIdx+1;
        playSound('zoom');
      } else {
        popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete this tier's achievements to unlock the junction.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`;
        popup.style.display = 'block';
      }
    } else if(h.type === 'achievement'){
      // show title card for that node (fixed). hologram drawn under node separately
      showTitleCardFor(h);
    }
  }
});

canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  state.target.scale = clamp( state.target.scale + (-e.deltaY * 0.0018), 0.18, 6.0 );
  playSound('zoom');
}, { passive:false });

/* hover detection (instant world coords) */
function updateHover(sx, sy){
  const w = screenToWorld(sx, sy);
  let found = null;
  for(let i=0;i<achievements.planets.length;i++){
    const p = achievements.planets[i];
    const ppos = p._world;
    if(ppos && dist(w.x, w.y, ppos.x, ppos.y) < Math.max(36, PLANET_DRAW_SIZE*0.18)){
      found = { type:'core', index:i, pos: ppos }; break;
    }
    for(let j=0;j<p.tiers.length;j++){
      const t = p.tiers[j];
      if(t._pos && dist(w.x, w.y, t._pos.x, t._pos.y) < Math.max(22, TIER_DISPLAY_SIZE*0.72)){
        found = { type:'tier', core:i, tier:j, pos:t._pos }; break;
      }
      if(t._junction && dist(w.x, w.y, t._junction.x, t._junction.y) < 18){
        found = { type:'junction', core:i, tier:j, pos: t._junction }; break;
      }
      // achievements — only if their alpha visible
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

/* Title card (fixed top-right) — shows summary; click Open to expand into full details */
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
  // store current hover ref for later when pressing Open
  titleCard._current = h;
}
function hideTitleCard(){
  titleCard.classList.remove('show');
  titleCard.setAttribute('aria-hidden','true');
  setTimeout(()=> { titleCard.style.display = 'none'; }, 240);
  if(hideC){ clearTimeout(hideC); hideC = null; }
  titleCard._current = null;
}

/* title card open/close actions */
openDetailsBtn?.addEventListener('click', ()=>{
  if(!titleCard._current) return;
  // expand UI
  titleCardInner.classList.remove('collapsed'); titleCardInner.classList.add('expanded');
  // populate full details from the node
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
function closeExpandedCard(){
  titleCardInner.classList.remove('expanded'); titleCardInner.classList.add('collapsed');
  // small timeout then hide
  setTimeout(()=> hideTitleCard(), 600);
}

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

/* popup / complete flows */
function openAchievementPopup(core,tier,ach){ const a = achievements.planets[core].tiers[tier].achievements[ach]; popup.innerHTML = `<h2 style="margin:0 0 8px 0">${escapeHtml(a.title||'')}</h2><div style="opacity:0.9">${escapeHtml(a.description||'')}</div><div style="margin-top:12px">Status: <strong>${a.status}</strong></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center">${a.status === 'available' ? `<button onclick="completeAchievement(${core},${tier},${ach})">Complete</button>` : ''}<button onclick="closePopup()">Close</button></div>`; popup.style.display = 'block'; }
function closePopup(){ popup.style.display = 'none'; }
window.completeAchievement = (core,tier,ach) => { const a = achievements.planets[core].tiers[tier].achievements[ach]; a.status = 'completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); popup.style.display='none'; const all = achievements.planets[core].tiers[tier].achievements.every(x=>x.status==='completed'); if(all && tier < achievements.planets[core].tiers.length-1){ achievements.planets[core].tiers[tier+1].achievements.forEach(x=>{ if(x.status==='locked') x.status='available'; }); } };

/* admin helpers (unchanged) */
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

/* init sequence */
(async function init(){
  document.body.classList.add('loading');
  await Promise.all(preload);
  await loadData();
  seedNodeSurfacePositions();
  buildCachedGradients();

  // initialize meta placeholders
  const total = achievements.planets.length || 5;
  const coreRadius = getCoreRadius();
  achievements.planets.forEach((p,i) => {
    const pos = planetPosition(i, total, coreRadius);
    p._world = { x: pos.x, y: pos.y, angle: pos.angle };
    p.tiers.forEach((t,j) => {
      // create node meta if missing (seedNodeSurfacePositions handled most)
      if(!t._nodeMeta) t._nodeMeta = [];
      t.achievements.forEach((a, idx) => {
        a._pos = a._pos || { x: pos.x, y: pos.y, r: ACH_ICON*0.6, alpha: 0 };
        a._holo = a._holo || 0;
      });
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

/* convenience & mobile */
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.5; state.focused.core = null; state.focused.tier = null; });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); }});
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

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

document.addEventListener('pointerdown', ()=>{
  if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} }
}, { once:true });

/* End */
