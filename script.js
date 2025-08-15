/* script.js */
/* script.js — zoom atmosphere, node fade-in, hologram on node hover,
   junctions shown only when hovering core, fixed title card UI
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

/* preload assets */
const IMG_PATH = 'assets/';
const ASSETS = {
  planet:'planet.png', planethover:'planethover.png',
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
  camera:{ x:0, y:0, scale:0.55 },
  target:{ x:0, y:0, scale:0.55 },
  easing: parseFloat(transRange ? transRange.value : 0.12) || 0.12,
  focused:{ core:null, tier:null },
  hovered:null,
  dragging:false,
  dragStart:null
};

const CORE_RADIUS = 800;
const PLANET_SIZE = 100;
const TIER_BASE_OFFSET = 0;
const TIER_SPACING = 0;
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

/* helpers */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
function playSound(k){ const s = sounds[k]; if(!s) return; try{ s.currentTime=0; s.play(); }catch(e){} }

function planetPosition(index, total, radius){
  const angle = index * (Math.PI*2/total) - Math.PI/2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle };
}

/* draw functions */
let time = 0;
function draw(delta){
  time += delta / 16;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // camera lerp
  state.camera.x = lerp(state.camera.x, state.target.x, state.easing);
  state.camera.y = lerp(state.camera.y, state.target.y, state.easing);
  state.camera.scale = lerp(state.camera.scale, state.target.scale, state.easing);

  // transform
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.scale(state.camera.scale, state.camera.scale);
  ctx.translate(state.camera.x, state.camera.y);

  // background stars/nebula
  ctx.globalAlpha = 0.5;
  nebula.forEach(n => {
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    grad.addColorStop(0, 'rgba(100,200,255,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
    ctx.fill();
  });
  stars.forEach(s => {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // draw planets
  achievements.planets.forEach((p, i) => {
    ctx.save();
    ctx.translate(p._world.x, p._world.y);
    const isHovered = state.hovered && state.hovered.type === 'core' && state.hovered.index === i;
    const planetImg = isHovered ? images.planethover : images.planet;
    ctx.drawImage(planetImg, -PLANET_SIZE/2, -PLANET_SIZE/2, PLANET_SIZE, PLANET_SIZE);

    // atmosphere if zoomed
    if (state.camera.scale > atmosphereStart && state.focused.core === i) {
      const atmAlpha = clamp((state.camera.scale - atmosphereStart) / (atmosphereFull - atmosphereStart), 0, 1) * 0.3;
      ctx.fillStyle = `rgba(0,200,255,${atmAlpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, PLANET_SIZE/2 + 20, 0, Math.PI*2);
      ctx.fill();
    }

    // show junction icon when hovering planet
    if (isHovered) {
      ctx.drawImage(images.junction, -20, -20, 40, 40);
    }

    ctx.restore();
  });

  // draw connections as glowing moving lines
  achievements.planets.forEach((p, i) => {
    const next = achievements.planets[(i+1) % achievements.planets.length];
    if (next) {
      ctx.beginPath();
      ctx.moveTo(p._world.x, p._world.y);
      ctx.lineTo(next._world.x, next._world.y);
      ctx.lineWidth = 4 / state.camera.scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.stroke();

      // glow
      ctx.lineWidth = 8 / state.camera.scale;
      ctx.strokeStyle = 'rgba(0,200,255,0.1)';
      ctx.stroke();

      // pulsing
      ctx.setLineDash([5, 15]);
      ctx.lineDashOffset = -time % 20;
      ctx.lineWidth = 2 / state.camera.scale;
      ctx.strokeStyle = var(--accent);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // draw tiers and achievements on planet surface when zoomed
  if (state.focused.core !== null) {
    const focusedPlanet = achievements.planets[state.focused.core];
    const planetX = focusedPlanet._world.x;
    const planetY = focusedPlanet._world.y;
    const nodeAlpha = clamp((state.camera.scale - nodeShowStart) / (nodeShowEnd - nodeShowStart), 0, 1);

    focusedPlanet.tiers.forEach((t, j) => {
      // position on planet surface
      const angle = (j / focusedPlanet.tiers.length) * Math.PI * 2;
      const tx = planetX + Math.cos(angle) * (PLANET_SIZE / 2 - 10);
      const ty = planetY + Math.sin(angle) * (PLANET_SIZE / 2 - 10);
      t._pos = { x: tx, y: ty, r: TIER_SIZE * 0.6 };

      ctx.save();
      ctx.translate(tx, ty);
      ctx.globalAlpha = nodeAlpha;
      // draw tier image or something
      const tierImg = images[`tier${j+2}`] || images.tier2;
      ctx.drawImage(tierImg, -TIER_SIZE/2, -TIER_SIZE/2, TIER_SIZE, TIER_SIZE);
      ctx.restore();

      // achievements on tier (but since on surface, spread around)
      t.achievements.forEach((a, k) => {
        const achAngle = angle + (k - t.achievements.length / 2) * (Math.PI / 12);
        const achDist = PLANET_SIZE / 2 - 20;
        const ax = planetX + Math.cos(achAngle) * achDist;
        const ay = planetY + Math.sin(achAngle) * achDist;
        a._pos = { x: ax, y: ay, r: ACH_ICON * 0.6, alpha: nodeAlpha };

        ctx.save();
        ctx.translate(ax, ay);
        ctx.globalAlpha = nodeAlpha;
        if (a.status === 'locked') {
          ctx.drawImage(images.lock, -ACH_ICON/2, -ACH_ICON/2, ACH_ICON, ACH_ICON);
        } else {
          ctx.drawImage(images.node, -ACH_ICON/2, -ACH_ICON/2, ACH_ICON, ACH_ICON);
        }

        // hologram if hovered
        const isHoveredAch = state.hovered && state.hovered.type === 'achievement' && state.hovered.ach === k && state.hovered.tier === j && state.hovered.core === state.focused.core;
        if (isHoveredAch) {
          ctx.drawImage(images.hologram, -30, -30, 60, 60);
        }

        ctx.restore();
      });
    });

    // junctions outside
    focusedPlanet.tiers.forEach((t, j) => {
      if (j < focusedPlanet.tiers.length - 1) {
        const nextT = focusedPlanet.tiers[j+1];
        const jx = (t._pos.x + nextT._pos.x) / 2 + 50; // offset out
        const jy = (t._pos.y + nextT._pos.y) / 2;
        ctx.save();
        ctx.translate(jx, jy);
        ctx.drawImage(images.junction, -20, -20, 40, 40);
        ctx.restore();
      }
    });
  }

  ctx.restore();
  requestAnimationFrame(draw);
}

// other functions like updateHover, openAchievementPopup, etc. remain similar, with adjustments for new positions

// admin functions remain the same

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
      // positions will be recomputed dynamically when zoomed
      t._pos = { x: 0, y: 0, r: TIER_SIZE*0.6 };
      t.achievements.forEach((a, idx) => { a._pos = a._pos || { x: 0, y: 0, r: ACH_ICON*0.6, alpha: 0 }; a._holo = a._holo || 0; });
    });
  });

  document.body.classList.remove('loading');
  requestAnimationFrame(draw);
})();

// adjust zoom levels for planet to fill ~50% screen
// in click handlers, state.target.scale = 4.5 for planet zoom

/* convenience */
homeBtn.addEventListener('click', ()=>{ state.target.x = 0; state.target.y = 0; state.target.scale = 0.55; state.focused.core=null; state.focused.tier=null; });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ popup.style.display='none'; adminPanel.style.display='none'; hideTitleCard(); }});
document.addEventListener('selectstart', (e)=>{ if(state.dragging) e.preventDefault(); });

canvas.addEventListener('touchend', (e)=>{
  if(window.innerWidth <= 720){
    const t = e.changedTouches[0];
    updateHover(t.clientX, t.clientY);
    if(state.hovered){
      if(state.hovered.type === 'achievement') openAchievementPopup(state.hovered.core, state.hovered.tier, state.hovered.ach);
      else if(state.hovered.type === 'core'){ const p = achievements.planets[state.hovered.index]; state.target.x = -p._world.x; state.target.y = -p._world.y; state.target.scale = 4.5; state.focused.core = state.hovered.index; state.focused.tier = null; }
      else if(state.hovered.type === 'tier'){ const pos = achievements.planets[state.hovered.core].tiers[state.hovered.tier]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 6.0; state.focused.core = state.hovered.core; state.focused.tier = state.hovered.tier; }
      else if(state.hovered.type === 'junction'){ const core = state.hovered.core; const tIdx = state.hovered.tier; const prev = achievements.planets[core].tiers[tIdx]; const all = prev.achievements.every(a=>a.status==='completed'); if(all && achievements.planets[core].tiers[tIdx+1]){ const pos = achievements.planets[core].tiers[tIdx+1]._pos; state.target.x = -pos.x; state.target.y = -pos.y; state.target.scale = 6.0; state.focused.core = core; state.focused.tier = tIdx+1; } else { popup.innerHTML = `<strong>Tier Locked</strong><div style="opacity:0.85;margin-top:8px">Complete all achievements in this tier first.</div><div style="margin-top:10px"><button onclick="closePopup()">Close</button></div>`; popup.style.display='block'; } }
    }
  }
}, { passive:true });

document.addEventListener('pointerdown', ()=>{ if(sounds.bg && sounds.bg.paused){ try{ sounds.bg.loop = true; sounds.bg.play(); }catch(e){} } }, { once:true });

/* END */
