// script.js (clean foundation)
(() => {
  const canvas = document.getElementById('starChart');
  const ctx = canvas.getContext('2d');
  let W, H, DPR; function resize(){ DPR = Math.max(1, window.devicePixelRatio||1); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.floor(W*DPR); canvas.height = Math.floor(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); } window.addEventListener('resize', resize); resize();

  // UI
  const adminBtn = document.getElementById('adminBtn'), adminPanel = document.getElementById('adminPanel'), jsonEditor = document.getElementById('jsonEditor');
  const reloadBtn = document.getElementById('reloadBtn'), saveBtn = document.getElementById('saveBtn');
  const lineModeBtn = document.getElementById('lineModeBtn'), dragModeBtn = document.getElementById('dragModeBtn'), downloadBtn = document.getElementById('downloadBtn');
  const titleCard = document.getElementById('titleCard'), tcTitle = document.getElementById('tc-title'), tcSub = document.getElementById('tc-sub');
  const detailCard = document.getElementById('detailCard'), detailTitle = document.getElementById('detailTitle'), detailDesc = document.getElementById('detailDesc'), detailRoadmap = document.getElementById('detailRoadmap'), detailTips = document.getElementById('detailTips');

  // Data
  let ACH = null, CONN = null, ASSETS = 'assets/';
  const CONFIG = { CORE_COUNT:5, CORE_RADIUS:420, CORE_SIZE:140, TIER_STEP:140, ZOOM_INIT:0.38 };

  // Camera
  let cam = { x:0, y:0, scale: CONFIG.ZOOM_INIT }, targetCam = {...cam}, easing = 0.14;
  let focused = { core:null, tier:null }, hover=null;
  let adminMode=false, lineMode=false, dragMode=false, pendingLine=null, dragTarget=null;

  async function loadFiles(){ ACH = await fetch('achievements.json').then(r=>r.json()).catch(()=>({planets:[]})); CONN = await fetch('connections.json').then(r=>r.json()).catch(()=>([])); normalize(); jsonEditor.value = JSON.stringify(ACH,null,2); }
  function normalize(){ if(!ACH.planets) ACH.planets=[]; const coreNames=['Physical','Cerebral','Creative','Social','Moral']; for(let i=0;i<CONFIG.CORE_COUNT;i++){ if(!ACH.planets[i]) ACH.planets[i]={id:'core_'+(i+1),name:coreNames[i],x:null,y:null,size:CONFIG.CORE_SIZE,tiers:[]}; const core=ACH.planets[i]; const angle=i*(Math.PI*2/CONFIG.CORE_COUNT)-Math.PI/2; if(core.x===null) core.x=Math.cos(angle)*CONFIG.CORE_RADIUS; if(core.y===null) core.y=Math.sin(angle)*CONFIG.CORE_RADIUS; for(let t=0;t<5;t++){ if(!core.tiers[t]) core.tiers[t]={id:core.id+'_t'+(t+1),name:'T'+(t+1),orbit:(core.size/2)+(t+1)*CONFIG.TIER_STEP,angle:angle+(t*0.12),size:96,description:'',nodes:[]}; const tier=core.tiers[t]; tier.x=core.x+Math.cos(tier.angle)*tier.orbit; tier.y=core.y+Math.sin(tier.angle)*tier.orbit; } } }

  // caches
  let starCache=null, orbitCache=null;
  function buildCaches(){ starCache=document.createElement('canvas'); starCache.width=Math.floor(W*DPR); starCache.height=Math.floor(H*DPR); const sctx=starCache.getContext('2d'); sctx.scale(DPR,DPR); sctx.fillStyle='#000'; sctx.fillRect(0,0,W,H); for(let i=0;i<240;i++){ sctx.fillStyle='rgba(255,255,255,'+(0.1+Math.random()*0.9)+')'; sctx.fillRect(Math.random()*W,Math.random()*H,Math.random()*1.8+0.2,Math.random()*1.8+0.2); } orbitCache=document.createElement('canvas'); orbitCache.width=Math.floor(W*DPR); orbitCache.height=Math.floor(H*DPR); const octx=orbitCache.getContext('2d'); octx.scale(DPR,DPR); octx.clearRect(0,0,W,H); const rings=[220,360,520,700,900]; for(let r of rings){ octx.beginPath(); octx.strokeStyle='rgba(255,255,255,0.03)'; octx.lineWidth=1; octx.arc(W/2,H/2,r,0,Math.PI*2); octx.stroke(); } }

  function worldToScreen(wx,wy){ const cx=W/2 + cam.x*cam.scale, cy=H/2 + cam.y*cam.scale; return { x: cx + wx*cam.scale, y: cy + wy*cam.scale }; }
  function screenToWorld(sx,sy){ const cx=W/2 + cam.x*cam.scale, cy=H/2 + cam.y*cam.scale; return { x: (sx-cx)/cam.scale, y: (sy-cy)/cam.scale }; }
  function lerp(a,b,t){return a+(b-a)*t} function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

  function drawGlowLine(sx,sy,tx,ty,opts={style:'curved'}){
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#00ffc3';
    const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent2')||'#00aaff';
    ctx.save();
    const grad = ctx.createLinearGradient(sx,sy,tx,ty);
    grad.addColorStop(0, 'rgba(0,0,0,0.06)'); grad.addColorStop(0.6, accent); grad.addColorStop(1, accent2);
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.globalAlpha=0.12; ctx.strokeStyle=grad; ctx.lineWidth=10; ctx.beginPath();
    if(opts.style==='curved'){ const cp = controlPoint(sx,sy,tx,ty,0.22); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(cp.x,cp.y,tx,ty); } else { ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); }
    ctx.stroke();
    ctx.globalAlpha=0.4; ctx.lineWidth=4; ctx.beginPath();
    if(opts.style==='curved'){ const cp = controlPoint(sx,sy,tx,ty,0.18); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(cp.x,cp.y,tx,ty); } else { ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); }
    ctx.stroke();
    ctx.globalAlpha=1; ctx.lineWidth=1.2; ctx.beginPath();
    if(opts.style==='curved'){ const cp = controlPoint(sx,sy,tx,ty,0.18); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(cp.x,cp.y,tx,ty); } else { ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); }
    ctx.stroke();
    // bright spot
    const t = (performance.now()/1200) % 1; let bx,by; if(opts.style==='curved'){ const cp=controlPoint(sx,sy,tx,ty,0.18); const qx = (1-t)*(1-t)*sx + 2*(1-t)*t*cp.x + t*t*tx; const qy = (1-t)*(1-t)*sy + 2*(1-t)*t*cp.y + t*t*ty; bx=qx; by=qy; } else { bx = sx + (tx-sx)*t; by = sy + (ty-sy)*t; }
    ctx.globalCompositeOperation='lighter'; const g = ctx.createRadialGradient(bx,by,0,bx,by,18); g.addColorStop(0, accent2); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bx,by,18,0,Math.PI*2); ctx.fill(); ctx.globalCompositeOperation='source-over';
    ctx.restore();
  }
  function controlPoint(x1,y1,x2,y2,str=0.22){ const mx=(x1+x2)/2,my=(y1+y2)/2; const dx=x2-x1, dy=y2-y1; const d=Math.hypot(dx,dy)||1; const px=-dy/d, py=dx/d; const off=Math.min(d*str,420); return { x: mx + px*off, y: my + py*off }; }

  // main draw loop
  let last = performance.now();
  function draw(now){
    const dt = now - last; last = now;
    cam.x = lerp(cam.x, targetCam.x, 0.12); cam.y = lerp(cam.y, targetCam.y, 0.12); cam.scale = lerp(cam.scale, targetCam.scale, 0.12);
    ctx.clearRect(0,0,W,H); if(starCache) ctx.drawImage(starCache,0,0,W,H); if(orbitCache) ctx.drawImage(orbitCache,0,0,W,H);
    ctx.save(); ctx.translate(W/2 + cam.x*cam.scale, H/2 + cam.y*cam.scale); ctx.scale(cam.scale, cam.scale);
    ACH.planets.forEach((core,ci)=>{
      ctx.save(); ctx.fillStyle='#0f1720'; ctx.beginPath(); ctx.arc(core.x,core.y,core.size/2,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.stroke(); ctx.restore();
      core.tiers.forEach((tier,ti)=>{
        tier.x = core.x + Math.cos(tier.angle)*tier.orbit; tier.y = core.y + Math.sin(tier.angle)*tier.orbit;
        const sp = worldToScreen(core.x,core.y), tp = worldToScreen(tier.x,tier.y);
        drawGlowLine(sp.x,sp.y,tp.x,tp.y,{style:'curved'});
        ctx.save(); ctx.fillStyle='#11131a'; ctx.beginPath(); ctx.arc(tier.x,tier.y,tier.size/2,0,Math.PI*2); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.stroke(); ctx.restore();
        const showNodes = cam.scale >= 1.1 && focused.core===ci;
        if(showNodes){
          tier.nodes.forEach((node,ni)=>{ const nx = tier.x + Math.cos(node.angle)*node.rad, ny = tier.y + Math.sin(node.angle)*node.rad; if(hover && hover.type==='node' && hover.core===ci && hover.tier===ti && hover.node===ni){ ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle='rgba(0,255,200,0.12)'; ctx.beginPath(); ctx.arc(nx,ny,18,0,Math.PI*2); ctx.fill(); ctx.restore(); } ctx.save(); ctx.fillStyle = node.status==='locked' ? 'rgba(255,255,255,0.25)' : '#fff'; ctx.beginPath(); ctx.arc(nx,ny,6,0,Math.PI*2); ctx.fill(); ctx.restore(); });
        }
      });
    });
    CONN.forEach(c=>{ const a = findEntity(c.from), b = findEntity(c.to); if(!a||!b) return; const s = worldToScreen(a.x,a.y), t = worldToScreen(b.x,b.y); drawGlowLine(s.x,s.y,t.x,t.y,{style:c.style||'curved'}); });
    ctx.restore();
    if(hover){ const screen = worldToScreen(hover.wx,hover.wy); titleCard.style.left = (screen.x+12)+'px'; titleCard.style.top=(screen.y-36)+'px'; tcTitle.textContent=hover.label; tcSub.textContent=hover.sub||''; titleCard.style.display='flex'; } else titleCard.style.display='none';
    requestAnimationFrame(draw);
  }

  // helpers: world/screen, findEntity, hover, picking, events (omitted here for brevity in generation)
  function worldToScreen(wx,wy){ const cx=W/2 + cam.x*cam.scale, cy=H/2 + cam.y*cam.scale; return { x: cx + wx*cam.scale, y: cy + wy*cam.scale }; }
  function screenToWorld(sx,sy){ const cx=W/2 + cam.x*cam.scale, cy=H/2 + cam.y*cam.scale; return { x: (sx-cx)/cam.scale, y: (sy-cy)/cam.scale }; }
  function findEntity(id){ for(let ci=0; ci<ACH.planets.length; ci++){ const core=ACH.planets[ci]; if(core.id===id) return {x:core.x,y:core.y}; for(let ti=0; ti<core.tiers.length; ti++){ const tier=core.tiers[ti]; if(tier.id===id) return {x:tier.x,y:tier.y}; for(let ni=0; ni<tier.nodes.length; ni++){ const node=tier.nodes[ni]; if(node.id===id) return {x: tier.x+Math.cos(node.angle)*node.rad, y: tier.y+Math.sin(node.angle)*node.rad}; } } } return null; }

  // (hover/picking/drag/line/save handlers) simple versions
  canvas.addEventListener('pointermove',(e)=>{ const r=canvas.getBoundingClientRect(); const sx=e.clientX-r.left, sy=e.clientY-r.top; const w=screenToWorld(sx,sy); hover=null; for(let ci=0; ci<ACH.planets.length; ci++){ const core=ACH.planets[ci]; if(Math.hypot(w.x-core.x,w.y-core.y) < core.size/2){ hover={type:'core', core:ci, label:core.name, wx:core.x, wy:core.y}; break; } for(let ti=0; ti<core.tiers.length; ti++){ const tier=core.tiers[ti]; if(Math.hypot(w.x-tier.x,w.y-tier.y) < tier.size/2){ hover={type:'tier', core:ci, tier:ti, label:tier.name, wx:tier.x, wy:tier.y}; break; } if(focused.core===ci){ for(let ni=0; ni<tier.nodes.length; ni++){ const node=tier.nodes[ni]; const nx=tier.x+Math.cos(node.angle)*node.rad, ny=tier.y+Math.sin(node.angle)*node.rad; if(Math.hypot(w.x-nx,w.y-ny) < 10){ hover={type:'node', core:ci, tier:ti, node:ni, label:node.title, wx:nx, wy:ny, sub: node.description.slice(0,60)}; break; } } } if(hover) break; } if(hover) break; } });

  canvas.addEventListener('click',(e)=>{ const r=canvas.getBoundingClientRect(); const sx=e.clientX-r.left, sy=e.clientY-r.top; const pick = hover; if(lineMode){ if(pick){ if(!pendingLine) pendingLine = pick; else{ CONN.push({from: pendingLine.type==='node' ? ACH.planets[pendingLine.core].tiers[pendingLine.tier].nodes[pendingLine.node].id : pendingLine.type==='tier'? ACH.planets[pendingLine.core].tiers[pendingLine.tier].id : ACH.planets[pendingLine.core].id, to: pick.type==='node' ? ACH.planets[pick.core].tiers[pick.tier].nodes[pick.node].id : pick.type==='tier'? ACH.planets[pick.core].tiers[pick.tier].id : ACH.planets[pick.core].id, type:'junction', style:'curved' }); pendingLine=null; jsonEditor.value = JSON.stringify(ACH,null,2); } } return; } if(pick && pick.type==='core'){ focused.core = pick.core; focused.tier=null; targetCam.x = -pick.wx; targetCam.y = -pick.wy; targetCam.scale=1.6; } else if(pick && pick.type==='tier'){ focused.core = pick.core; focused.tier = pick.tier; targetCam.x = -pick.wx; targetCam.y = -pick.wy; targetCam.scale=2.6; } else if(pick && pick.type==='node'){ const node = ACH.planets[pick.core].tiers[pick.tier].nodes[pick.node]; detailTitle.textContent = node.title; detailDesc.textContent = node.description; detailRoadmap.innerHTML = '<strong>Roadmap:</strong><br>'+node.roadmap.map((s,i)=>`<div>${i+1}. ${s}</div>`).join(''); detailTips.innerHTML = '<strong>Tips:</strong><br>'+node.tips.map(t=>`<div>• ${t}</div>`).join(''); detailCard.style.display='block'; } else { focused.core=null; focused.tier=null; targetCam={x:0,y:0,scale:CONFIG.ZOOM_INIT}; detailCard.style.display='none'; } });

  // buttons
  adminBtn.addEventListener('click', ()=>{ adminMode=!adminMode; adminPanel.style.display = adminMode ? 'flex' : 'none'; });
  lineModeBtn.addEventListener('click', ()=>{ lineMode=!lineMode; lineModeBtn.textContent = 'Line Mode ' + (lineMode?'ON':'OFF'); pendingLine=null; });
  dragModeBtn.addEventListener('click', ()=>{ dragMode=!dragMode; dragModeBtn.textContent = 'Drag Mode ' + (dragMode?'ON':'OFF'); });
  reloadBtn.addEventListener('click', ()=>{ loadFiles(); });
  saveBtn.addEventListener('click', ()=>{ try{ ACH = JSON.parse(jsonEditor.value); normalize(); alert('Saved to editor'); }catch(e){ alert('Invalid JSON'); } });
  downloadBtn.addEventListener('click', ()=>{ const aBlob = new Blob([JSON.stringify(ACH,null,2)],{type:'application/json'}); const url = URL.createObjectURL(aBlob); const a=document.createElement('a'); a.href=url; a.download='achievements.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); });

  // init
  loadFiles().then(()=>{ buildCaches(); requestAnimationFrame(draw); });
  window.addEventListener('resize', ()=>{ resize(); buildCaches(); });
})();