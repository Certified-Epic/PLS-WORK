// === Star Chart (Monochrome + Theme Picker + Optimized) ===

// Canvas & context
const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: false }); // opaque for perf
let W = innerWidth, H = innerHeight;
function resize(){
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
  buildStaticLayers();
}
addEventListener('resize', resize);

// Theme
const themeColorInput = document.getElementById('themeColor');
const themeGradientSelect = document.getElementById('themeGradient');
let theme = {
  base: '#8af3ff',
  gradient: 'none' // none | radial | linear | pulse
};
function setAccent(hex){
  theme.base = hex;
  document.documentElement.style.setProperty('--accent', hex);
  // derived alpha variants
  const rgb = hexToRgb(hex);
  const weak = `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`;
  const strong = `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`;
  document.documentElement.style.setProperty('--accent-weak', weak);
  document.documentElement.style.setProperty('--accent-strong', strong);
  buildCachedGradients();
}
themeColorInput.addEventListener('input', e => setAccent(e.target.value));
themeGradientSelect.addEventListener('change', e => { theme.gradient = e.target.value; buildStaticLayers(); });

// Assets
const assets = {
  center: loadImg('./assets/center.png'),
  planet: loadImg('./assets/planet.png'),
  planetHover: loadImg('./assets/planethover.png'),
  lock: loadImg('./assets/lock.png'),
  pulse: loadImg('./assets/pulse.png'),
  node: loadImg('./assets/node.png'),
  junction: loadImg('./assets/junction.png'),
  hologram: loadImg('./assets/achievementnodehologram.png'),
  tiers: [
    loadImg('./assets/tier2.png'),
    loadImg('./assets/tier3.png'),
    loadImg('./assets/tier4.png'),
    loadImg('./assets/tier5.png'),
  ],
  completedTier: loadImg('./assets/completedplanettier.png')
};
function loadImg(src){
  const img = new Image();
  img.src = src;
  return img;
}

// Sounds (optional)
const sounds = {
  hover: new Audio('./assets/hover.mp3'),
  zoom: new Audio('./assets/zoom.mp3'),
  background: new Audio('./assets/background.mp3'),
};
sounds.background.loop = true;
sounds.background.volume = 0.35;
sounds.background.play().catch(()=>{});

// Data
let achievements = { planets: [] };
fetch('./achievements.json').then(r => r.json()).then(data => {
  achievements = data;
  restoreProgress();
}).catch(()=>{
  // fallback minimal structure if missing
  achievements = {
    planets: [{
      planetName: 'Planet I',
      tiers: [{
        tierName: 'Tier 1',
        achievements: [{title:'Start', description:'Begin the journey', status:'available'}]
      }]
    }]
  };
});

function restoreProgress(){
  const saved = localStorage.getItem('progress');
  if (!saved) return;
  try{
    const progress = JSON.parse(saved);
    achievements.planets.forEach((p,i)=>{
      p.tiers.forEach((t,j)=>{
        t.achievements.forEach((a,k)=>{
          const src = (((progress||{}).planets||[])[i]||{});
          const tier = ((src.tiers||[])[j]||{});
          const ach = ((tier.achievements||[])[k]||{});
          if (ach.status) a.status = ach.status;
          if (ach.dateCompleted) a.dateCompleted = ach.dateCompleted;
        });
      });
    });
  }catch(e){}
}

// Camera
const camera = { x:0, y:0, scale:0.42 };
const target = { x:0, y:0, scale:0.42 };
const ease = 0.1;

document.getElementById('resetView').addEventListener('click', ()=>{
  target.x = 0; target.y = 0; target.scale = 0.42;
  focused = null;
});

// Layout
const coreRadiusBase = 180; // center image radius
const orbitGap = 220; // distance between orbits
const maxOrbits = 8;  // fill canvas
const planetSizeBase = 66;
const tierPlanetSize = 42;
const nodeSize = 18;
const holoScale = 1.35;
const junctionSize = 22;

// runtime state
let focused = null; // {planetIndex:number}
let hovered = null; // {type:'planet'|'node'|'junction', ...}
let mouse = {x:0,y:0};
let t = 0;

// Offscreen layers
let off = document.createElement('canvas');
let offCtx = off.getContext('2d');
function buildStaticLayers(){
  off.width = W; off.height = H;
  // paint star background & orbits centered at screen
  offCtx.clearRect(0,0,W,H);

  // static stars
  offCtx.fillStyle = 'white';
  for (let i=0;i<550;i++){
    const x = Math.random()*W, y = Math.random()*H;
    const s = Math.random()*1.7+0.2;
    offCtx.globalAlpha = Math.random()*0.6+0.2;
    offCtx.fillRect(x,y,s,s);
  }
  offCtx.globalAlpha = 1;

  // concentric core orbits (extend until canvas filled)
  const centerX = W/2, centerY = H/2;
  const maxR = Math.hypot(W, H);
  let r = coreRadiusBase;
  offCtx.lineWidth = 1;
  while(r < maxR){
    offCtx.beginPath();
    offCtx.strokeStyle = 'rgba(255,255,255,0.09)';
    offCtx.arc(centerX, centerY, r, 0, Math.PI*2);
    offCtx.stroke();
    r += orbitGap*0.75;
  }
}

// Theme gradient caches
let gradPulse, gradLinear, gradRadial;
function buildCachedGradients(){
  const rgb = hexToRgb(theme.base);
  gradPulse = ctx.createLinearGradient(0,0,200,0);
  gradPulse.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
  gradPulse.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.9)`);
  gradPulse.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

  gradLinear = ctx.createLinearGradient(0,0,W,0);
  gradLinear.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.2)`);
  gradLinear.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`);

  gradRadial = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.hypot(W,H)/2);
  gradRadial.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`);
  gradRadial.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
}
setAccent(theme.base); // initialize
buildStaticLayers();

// Utility
function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) } : {r:138,g:243,b:255};
}
function lerp(a,b,f){ return a+(b-a)*f; }
function screenToWorld(mx,my){
  const cx = (mx - W/2)/camera.scale - camera.x;
  const cy = (my - H/2)/camera.scale - camera.y;
  return {x:cx, y:cy};
}
function worldToScreen(wx,wy){
  return {
    x: (wx + camera.x)*camera.scale + W/2,
    y: (wy + camera.y)*camera.scale + H/2
  };
}

// Input
canvas.addEventListener('mousemove', (e)=>{
  mouse.x = e.clientX; mouse.y = e.clientY;
});
let dragging = false, dragStart = {x:0,y:0}, camStart={x:0,y:0};
canvas.addEventListener('mousedown', (e)=>{
  dragging = true;
  dragStart.x = e.clientX; dragStart.y = e.clientY;
  camStart.x = target.x; camStart.y = target.y;
});
addEventListener('mouseup', ()=> dragging=false);
addEventListener('mouseleave', ()=> dragging=false);
addEventListener('wheel', (e)=>{
  const delta = -e.deltaY * 0.001;
  target.scale = Math.max(0.25, Math.min(6.0, target.scale * (1+delta)));
});
addEventListener('keydown', (e)=>{
  if (e.key === 'Escape'){ focused = null; target.scale = 0.42; target.x=0; target.y=0; }
});

// Hover + click logic
canvas.addEventListener('click', ()=>{
  if (hovered){
    if (hovered.type === 'planet'){
      focusPlanet(hovered.planetIndex);
    } else if (hovered.type === 'junction'){
      // move to next planet (if available)
      const {planetIndex} = hovered;
      const p = achievements.planets[planetIndex];
      // permit if all tier nodes completed
      const done = p.tiers.every(t => t.achievements.every(a=>a.status==='completed'));
      if (done){
        const next = (planetIndex+1) % achievements.planets.length;
        focusPlanet(next);
      }
    } else if (hovered.type === 'node'){
      showDetail(hovered.planetIndex, hovered.tierIndex, hovered.nodeIndex);
    }
  }
});

canvas.addEventListener('mousemove', (e)=>{
  if (dragging){
    const dx = (e.clientX - dragStart.x)/target.scale;
    const dy = (e.clientY - dragStart.y)/target.scale;
    target.x = camStart.x + dx;
    target.y = camStart.y + dy;
  }
});

// Focus
function focusPlanet(idx){
  focused = { planetIndex: idx };
  const pos = getPlanetScreenWorld(idx);
  // zoom to ~60% of screen occupied by planet
  const planetPxSize = 0.6 * Math.min(W,H);
  const desiredScale = Math.min(6, Math.max(1.8, planetPxSize / planetSizeBase));
  target.scale = desiredScale;
  target.x = -pos.x;
  target.y = -pos.y;
  sounds.zoom.currentTime = 0;
  sounds.zoom.play().catch(()=>{});
}

// UI: hover card
const hoverCard = document.getElementById('hoverCard');
function showHoverCard(x,y, title, desc){
  hoverCard.textContent = title || '';
  hoverCard.style.left = x+'px';
  hoverCard.style.top = y+'px';
  if (!hoverCard.classList.contains('show')) hoverCard.classList.add('show');
}
function hideHoverCard(){
  hoverCard.classList.remove('show');
}

// Details modal
const modal = document.getElementById('detailModal');
const detailTitle = document.getElementById('detailTitle');
const detailDesc = document.getElementById('detailDesc');
const detailStatus = document.getElementById('detailStatus');
const detailDate = document.getElementById('detailDate');
const completeBtn = document.getElementById('completeBtn');
document.getElementById('closeDetail').addEventListener('click', ()=> modal.classList.add('hidden'));
function showDetail(pi,ti,ni){
  const a = achievements.planets[pi].tiers[ti].achievements[ni];
  modal.classList.remove('hidden');
  detailTitle.textContent = a.title || 'Achievement';
  detailDesc.textContent = a.description || '';
  detailStatus.textContent = `Status: ${a.status}`;
  detailDate.textContent = a.dateCompleted ? `Completed: ${new Date(a.dateCompleted).toLocaleString()}` : '';
  completeBtn.onclick = ()=>{
    a.status = 'completed';
    a.dateCompleted = new Date().toISOString();
    saveProgress();
    modal.classList.add('hidden');
  };
}

// Admin
const adminBtn = document.getElementById('adminButton');
const adminPanel = document.getElementById('adminPanel');
document.getElementById('closeAdmin').addEventListener('click', ()=> adminPanel.classList.add('hidden'));
adminBtn.addEventListener('click', ()=> adminPanel.classList.remove('hidden'));
document.getElementById('loginAdmin').addEventListener('click', ()=>{
  const pass = document.getElementById('adminPassword').value;
  if (pass!=='admin'){ alert('Wrong password'); return; }
  const wrap = document.getElementById('editContent');
  wrap.classList.remove('hidden');
  document.getElementById('adminLogin').classList.add('hidden');
  let html = '';
  achievements.planets.forEach((p,i)=>{
    html += `<h3>${p.planetName}</h3>`;
    p.tiers.forEach((t,j)=>{
      html += `<h4 style="margin:.25rem 0;">${t.tierName}</h4>`;
      t.achievements.forEach((a,k)=>{
        html += `<div style="display:grid;grid-template-columns: 1fr 2fr auto;gap:6px;align-items:center;margin:6px 0;">
          <input value="${a.title||''}" onchange="window.__editTitle(${i},${j},${k},this.value)" />
          <input value="${a.description||''}" onchange="window.__editDesc(${i},${j},${k},this.value)" />
          <select onchange="window.__editStatus(${i},${j},${k},this.value)">
            <option ${a.status==='locked'?'selected':''}>locked</option>
            <option ${a.status==='available'?'selected':''}>available</option>
            <option ${a.status==='completed'?'selected':''}>completed</option>
          </select>
        </div>`;
      });
    });
  });
  html += `<div style="display:flex; gap:8px; margin-top:8px;">
    <button onclick="window.__downloadJson()">Download JSON</button>
    <button onclick="window.__bulkUnlock()">Bulk Unlock All</button>
    <button onclick="window.__bulkReset()">Bulk Reset All</button>
  </div>`;
  wrap.innerHTML = html;
});
window.__editTitle=(i,j,k,v)=> achievements.planets[i].tiers[j].achievements[k].title=v;
window.__editDesc=(i,j,k,v)=> achievements.planets[i].tiers[j].achievements[k].description=v;
window.__editStatus=(i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].status=v; saveProgress(); };
window.__downloadJson=()=>{
  const blob = new Blob([JSON.stringify(achievements,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='achievements.json'; a.click();
};
window.__bulkUnlock=()=>{ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); saveProgress(); alert('All unlocked'); };
window.__bulkReset=()=>{
  achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0?'available':'locked'; a.dateCompleted=null; })));
  saveProgress(); alert('All reset');
};

function saveProgress(){
  localStorage.setItem('progress', JSON.stringify(achievements));
}

// Planet placement on multiple orbits (spaced, not linear)
function getPlanetCount(){ return achievements.planets?.length || 0; }
function getPlanetScreenWorld(idx){
  // place planets across several orbits in a spiral-ish distribution
  const total = Math.max(1, getPlanetCount());
  const orbitIndex = Math.floor(idx / 5); // up to 5 per orbit
  const within = idx % 5;
  const baseR = coreRadiusBase + orbitGap * (1 + orbitIndex);
  // jitter spacing using golden angle
  const golden = Math.PI*(3 - Math.sqrt(5));
  const angle = within * (Math.PI*2/5) + orbitIndex*golden + t*0.02*(orbitIndex%2?1:-1);
  const x = Math.cos(angle) * baseR;
  const y = Math.sin(angle) * baseR * 0.92; // slight ellipse for parallax
  return {x,y,r:baseR,angle};
}

// Node placement on planet surface
function projectNodesOnPlanet(cx,cy, planetRadiusPx, count){
  // returns array of {x,y} screen/world coords around surface (latitude rings)
  const pts=[];
  const rings = Math.max(1, Math.ceil(count/6));
  for (let r=0;r<rings;r++){
    const ringCount = Math.ceil(count / rings);
    const lat = (r+1)/(rings+1) * Math.PI; // avoid poles
    for (let i=0;i<ringCount;i++){
      const a = i/ringCount * Math.PI*2 + r*0.3;
      const rx = Math.cos(a)*Math.sin(lat);
      const ry = Math.sin(a)*Math.sin(lat)*0.84;
      const px = cx + rx*planetRadiusPx*0.78;
      const py = cy + ry*planetRadiusPx*0.78;
      pts.push({x:px, y:py});
      if (pts.length>=count) break;
    }
    if (pts.length>=count) break;
  }
  return pts;
}

// Animated path pulse
function drawGlowingPath(x1,y1,x2,y2, progress01){
  // base glow
  ctx.save();
  ctx.lineWidth = Math.max(1.5, 3/camera.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.shadowColor = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  // traveling pulse
  const seg = 120 / camera.scale; // length
  const dx = x2-x1, dy=y2-y1;
  const len = Math.hypot(dx,dy);
  const nx = dx/len, ny = dy/len;
  const start = progress01 * (len+seg) - seg;
  const a = Math.max(0, start);
  const b = Math.min(len, start+seg);
  if (b>a){
    ctx.lineWidth = Math.max(2, 4/camera.scale);
    ctx.strokeStyle = gradPulse || 'white';
    ctx.beginPath();
    ctx.moveTo(x1+nx*a, y1+ny*a);
    ctx.lineTo(x1+nx*b, y1+ny*b);
    ctx.stroke();
  }
  ctx.restore();
}

// Hover overlay scale
function drawPlanetWithHover(px,py, size, isHover){
  const s = size;
  // base planet
  drawImageCentered(assets.planet, px, py, s, s);
  // hover overlay (under, scaled)
  if (isHover){
    const hovS = s*1.15 + Math.sin(t*4)*2;
    drawImageCentered(assets.planetHover, px, py, hovS, hovS);
  }
}

// helpers
function drawImageCentered(img, x,y, w,h){
  ctx.drawImage(img, x-w/2, y-h/2, w,h);
}
function drawLabel(x,y, text, sizePx=12){
  ctx.save();
  ctx.font = `bold ${sizePx}px Electrolize, sans-serif`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Main loop
function frame(){
  requestAnimationFrame(frame);
  t += 0.016;

  // ease camera
  camera.x = lerp(camera.x, target.x, ease);
  camera.y = lerp(camera.y, target.y, ease);
  camera.scale = lerp(camera.scale, target.scale, ease);

  // clear
  ctx.clearRect(0,0,W,H);

  // background layers
  // optional gradient wash
  if (theme.gradient==='radial'){
    ctx.fillStyle = gradRadial;
    ctx.fillRect(0,0,W,H);
  } else if (theme.gradient==='linear'){
    ctx.fillStyle = gradLinear;
    ctx.fillRect(0,0,W,H);
  }
  // stars + core orbits
  ctx.drawImage(off, 0, 0);

  // camera transform
  ctx.save();
  ctx.translate(W/2 + camera.x*camera.scale, H/2 + camera.y*camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // center
  drawImageCentered(assets.center, 0, 0, planetSizeBase, planetSizeBase);

  hovered = null;
  hideHoverCard();

  // render planets on multiple orbits
  const n = getPlanetCount();
  for (let i=0;i<n;i++){
    const pos = getPlanetScreenWorld(i);
    const px = pos.x, py = pos.y;

    // orbit guide (only for this orbit)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1/camera.scale;
    ctx.arc(0, 0, pos.r, 0, Math.PI*2);
    ctx.stroke();

    // planet + junction (junction visible on hover)
    const sp = worldToScreen(px,py);
    const isHover = Math.hypot(mouse.x - sp.x, mouse.y - sp.y) < (planetSizeBase*0.6);
    drawPlanetWithHover(px, py, tierPlanetSize, isHover);

    // title
    const pName = achievements.planets[i]?.planetName || `Planet ${i+1}`;
    if (!focused) drawLabel(px, py + tierPlanetSize*0.8 + 14, pName, 12);

    // planet hover interactivity
    if (isHover){
      hovered = {type:'planet', planetIndex:i};
      showHoverCard(mouse.x, mouse.y, pName);
      // junction icon outside
      const jx = px + Math.cos(pos.angle)* (pos.r + 28);
      const jy = py + Math.sin(pos.angle)* (pos.r + 28);
      drawImageCentered(assets.junction, jx, jy, junctionSize, junctionSize);
      // animated path pulse from planet to junction
      drawGlowingPath(px, py, jx, jy, (t*0.55)%1);
    }

    // if focused on this planet, render nodes on surface
    if (focused && focused.planetIndex===i){
      // zoom-in flourish: aura ring
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 3/camera.scale;
      ctx.arc(px, py, tierPlanetSize*0.75, 0, Math.PI*2);
      ctx.stroke();

      // nodes only when sufficiently close
      if (camera.scale > 1.2){
        const tiers = achievements.planets[i]?.tiers || [];
        // Merge all achievements from tiers for surface placement (junction stays outside)
        const allAch = [];
        tiers.forEach((tObj,ti)=>{
          (tObj.achievements||[]).forEach((a,ni)=> allAch.push({a,ti,ni}));
        });
        const pts = projectNodesOnPlanet(px, py, tierPlanetSize*2.5, allAch.length || 1);

        allAch.forEach((entry, idx)=>{
          const {a,ti,ni} = entry;
          const p = pts[idx];
          // link line pulse (planet -> node)
          drawGlowingPath(px, py, p.x, p.y, (t*0.75 + idx*0.11)%1);

          // hologram underlay
          const holoW = nodeSize*holoScale, holoH = nodeSize*holoScale;
          drawImageCentered(assets.hologram, p.x, p.y, holoW, holoH);
          // node icon depending on status
          let img = assets.node;
          if (a.status==='locked') img = assets.lock;
          drawImageCentered(img, p.x, p.y, nodeSize, nodeSize);

          // pulsing for available
          if (a.status==='available'){
            const pul = nodeSize + Math.sin(t*4+idx)*3;
            ctx.globalAlpha = 0.5 + 0.5*Math.sin(t*3+idx);
            drawImageCentered(assets.pulse, p.x, p.y, pul, pul);
            ctx.globalAlpha = 1;
          }

          // small title next to node
          drawLabel(p.x, p.y - nodeSize*0.9, a.title||'Node', 11);

          // hover
          const sPt = worldToScreen(p.x, p.y);
          const over = Math.hypot(mouse.x - sPt.x, mouse.y - sPt.y) < nodeSize*0.85;
          if (over){
            hovered = {type:'node', planetIndex:i, tierIndex:ti, nodeIndex:ni};
            // show tiny hover card with title only (no hologram in card)
            showHoverCard(mouse.x, mouse.y, a.title||'Node', a.description||'');
          }
        });

        // show one junction to next planet (outside current orbit)
        const jx = px + Math.cos(pos.angle) * (tierPlanetSize*2.2 + 48);
        const jy = py + Math.sin(pos.angle) * (tierPlanetSize*2.2 + 48);
        drawImageCentered(assets.junction, jx, jy, junctionSize, junctionSize);
        drawGlowingPath(px, py, jx, jy, (t*0.65)%1);

        // tier labels on top (compact)
        tiers.forEach((tObj,ti)=>{
          drawLabel(px, py - tierPlanetSize*1.2 - ti*14, tObj.tierName || `Tier ${ti+1}`, 11);
        });
      }
    }
  }

  ctx.restore();

  // foreground gradient pulse
  if (theme.gradient==='pulse'){
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradRadial;
    ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
frame();

// Hover detection per-frame (for planets already done above). If nothing hovered, hide card.
setInterval(()=>{ if (!hovered) hideHoverCard(); }, 50);

// Helper: initial focus reset
resize();

// === End ===
