const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d');
let width, height;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

const colors = {
  background: 'black',
  stars: 'white',
  line: 'white',
  text: 'white',
  glow: 'white',
  pulse: 'rgba(255,255,255,0.5)',
  ring: 'white'
  // Customize here: change values to hex or rgba for different themes, e.g., text: '#00ff00' for green
};

const assets = {
  planet: new Image(),
  lock: new Image(),
  pulse: new Image(),
  node: new Image(),
  junction: new Image(),
  hologram: new Image(),
};
assets.planet.src = './assets/planet.png';
assets.lock.src = './assets/lock.png';
assets.pulse.src = './assets/pulse.png';
assets.node.src = './assets/node.png';
assets.junction.src = './assets/junction.png';
assets.hologram.src = './assets/achievementnodehologram.png';

const sounds = {
  hover: new Audio('./assets/hover.mp3'),
  zoom: new Audio('./assets/zoom.mp3'),
  background: new Audio('./assets/background.mp3'),
};
sounds.background.loop = true;
sounds.background.volume = 0.5;
sounds.background.play();

let achievements = {};
fetch('./achievements.json')
  .then(response => response.json())
  .then(data => {
    achievements = data;
    const saved = localStorage.getItem('progress');
    if (saved) {
      const progress = JSON.parse(saved);
      progress.planets.forEach((p, i) => {
        p.tiers.forEach((t, j) => {
          t.achievements.forEach((a, k) => {
            achievements.planets[i].tiers[j].achievements[k].status = a.status;
            achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted;
          });
        });
      });
    }
  });

// Camera and focus
let camera = { x: 0, y: 0, scale: 0.25 };
let targetCamera = { x: 0, y: 0, scale: 0.25 };
let easing = 0.08;
let focusedCore = null; // planet index in root ring
let focusedPlanet = null; // tier index if focused deeper (optional for legacy logic)
let hovered = null;

// Layout constants (wider spacing)
const coreRadius = 1400; // wider planet distribution
const tierRadius = 240;  // larger local orbit radius for tiers
const planetSizeBase = 64; // base (world units) when zoomed out
const tierSize = 34;
const achievementSize = 12;

// Starfield
let starParticles = [];
for (let i = 0; i < 400; i++) {
  starParticles.push({
    x: Math.random() * 6000 - 3000,
    y: Math.random() * 6000 - 3000,
    size: Math.random() * 2 + 1,
    speed: Math.random() * 0.5 + 0.5,
  });
}

let time = 0;

// UI elements
const hoverCard = document.getElementById('hoverCard');
const titleCard = document.getElementById('titleCard');
const titleCardText = document.getElementById('titleCardText');
const titleCardBody = document.getElementById('titleCardBody');
const expandTitleCardBtn = document.getElementById('expandTitleCard');
const sidePanel = document.getElementById('sidePanel');
const closeSidePanelBtn = document.getElementById('closeSidePanel');

if (expandTitleCardBtn) {
  expandTitleCardBtn.addEventListener('click', () => {
    const isOpen = titleCardBody.style.display !== 'none';
    titleCardBody.style.display = isOpen ? 'none' : 'block';
    // simple expand/collapse animation via opacity
    titleCardBody.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 200, easing: 'ease-out' });
  });
}
if (closeSidePanelBtn) {
  closeSidePanelBtn.addEventListener('click', () => {
    sidePanel.style.display = 'none';
  });
}

function drawGlowingLine(x1, y1, x2, y2, widthPx, dashLength, gapLength, offset) {
  ctx.save();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = widthPx / camera.scale;
  ctx.setLineDash([dashLength / camera.scale, gapLength / camera.scale]);
  ctx.lineDashOffset = -offset / camera.scale;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 8 / camera.scale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function draw() {
  time += 0.016;

  camera.x += (targetCamera.x - camera.x) * easing;
  camera.y += (targetCamera.y - camera.y) * easing;
  camera.scale += (targetCamera.scale - camera.scale) * easing;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + camera.x * camera.scale, height / 2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // Starfield
  ctx.fillStyle = colors.stars;
  for (let p of starParticles) {
    ctx.globalAlpha = 0.5;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    p.x -= p.speed * 0.6;
    if (p.x < -3200) p.x = 3200;
  }
  ctx.globalAlpha = 1;

  // No central image/circle (as requested)

  if (achievements.planets) {
    const planetCount = achievements.planets.length;

    // Precompute planet positions on a wide ring
    const planetPositions = achievements.planets.map((planet, i) => {
      const angle = i * (Math.PI * 2 / planetCount);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;
      return { px, py, angle };
    });

    // Inter-planet connections with animated glowing lines
    for (let i = 0; i < planetCount; i++) {
      const a = planetPositions[i];
      const b = planetPositions[(i + 1) % planetCount];
      drawGlowingLine(a.px, a.py, b.px, b.py, 3, 24, 40, time * 120);
    }

    achievements.planets.forEach((planet, i) => {
      const { px, py } = planetPositions[i];

      // Planet render size: if zoomed-in, keep planet at ~48% of screen
      const targetScreenFraction = 0.48; // 48%
      const desiredWorldSize = (targetScreenFraction * Math.min(width, height)) / camera.scale;
      const planetSize = camera.scale > 2.5 ? desiredWorldSize : planetSizeBase;

      // Planet
      ctx.drawImage(assets.planet, px - planetSize / 2, py - planetSize / 2, planetSize, planetSize);

      // Hover ring
      if (hovered && hovered.type === 'core' && hovered.index === i) {
        ctx.strokeStyle = colors.ring;
        ctx.shadowColor = colors.glow;
        ctx.shadowBlur = 5;
        let ringAlpha = 0.5 + Math.sin(time * 2) * 0.3;
        ctx.globalAlpha = ringAlpha;
        ctx.beginPath();
        ctx.arc(px, py, planetSize / 2 + 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, planetSize / 2 + 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // Labels only when reasonably close
      if (camera.scale > 0.5) {
        ctx.fillStyle = colors.text;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(planet.planetName, px, py + planetSize / 2 + 18);
      }

      // Junction icon visibility: only when hovering a planet
      if (hovered && hovered.type === 'core' && hovered.index === i) {
        // Place a single junction icon just outside the planet edge at a fixed heading
        const jAngle = -Math.PI / 4;
        const jx = px + Math.cos(jAngle) * (planetSize / 2 + 28);
        const jy = py + Math.sin(jAngle) * (planetSize / 2 + 28);
        ctx.drawImage(assets.junction, jx - 10, jy - 10, 20, 20);
      }

      // When zoomed sufficiently into a planet, reveal its surface nodes gradually
      const reveal = Math.max(0, Math.min(1, (camera.scale - 2.6) / 2.0));
      if (reveal > 0) {
        // Distribute tiers and achievements across the planet surface
        const nodeRadius = Math.max(planetSize * 0.25, 80); // inner radius for nodes
        const ringCount = planet.tiers.length;
        planet.tiers.forEach((tier, j) => {
          const ringFrac = (j + 1) / (ringCount + 1);
          const ringR = ringFrac * (planetSize * 0.45);

          // Glowing moving ring lines to suggest atmosphere entry
          drawGlowingLine(px - ringR, py, px + ringR, py, 2, 18, 28, time * 90 + j * 10);

          const numAch = Math.max(1, tier.achievements.length);
          for (let k = 0; k < numAch; k++) {
            const a = tier.achievements[k];
            const aAngle = (k / numAch) * Math.PI * 2 + j * 0.2;
            const ax = px + Math.cos(aAngle) * ringR;
            const ay = py + Math.sin(aAngle) * ringR;

            // Reveal by scale and alpha based on 'reveal'
            const nodeAlpha = 0.2 + 0.8 * reveal;
            const nodeSize = achievementSize * (0.6 + 0.8 * reveal);

            // Connection glow pulse toward node (moving)
            const t = (Math.sin(time * 2 + k) + 1) / 2;
            const hx = px + (ax - px) * t;
            const hy = py + (ay - py) * t;
            ctx.fillStyle = colors.pulse;
            ctx.globalAlpha = 0.4 * reveal;
            ctx.beginPath();
            ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Draw node icon (locked/available/completed)
            if (a.status === 'locked') {
              ctx.globalAlpha = nodeAlpha;
              ctx.drawImage(assets.lock, ax - nodeSize / 2, ay - nodeSize / 2, nodeSize, nodeSize);
              ctx.globalAlpha = 1;
            } else {
              ctx.globalAlpha = nodeAlpha;
              ctx.drawImage(assets.node, ax - nodeSize / 2, ay - nodeSize / 2, nodeSize, nodeSize);
              ctx.globalAlpha = 1;
              // subtle pulse halo
              const pulseSize = nodeSize + Math.sin(time * 2) * 2 * reveal;
              ctx.globalAlpha = 0.5 * reveal;
              ctx.drawImage(assets.pulse, ax - pulseSize / 2, ay - pulseSize / 2, pulseSize, pulseSize);
              ctx.globalAlpha = 1;
            }

            // Hologram overlay when hovered achievement node (center it on node)
            if (hovered && hovered.type === 'achievement' && hovered.core === i && hovered.tier === j && hovered.ach === k) {
              const hologramSize = Math.max(60, planetSize * 0.18);
              ctx.globalAlpha = 0.9;
              ctx.drawImage(assets.hologram, ax - hologramSize / 2, ay - hologramSize / 2, hologramSize, hologramSize);
              ctx.globalAlpha = 1;
            }
          }
        });
      }
    });
  }

  ctx.restore();
  requestAnimationFrame(draw);
}
draw();

// Interactions
let isDragging = false;
let startX, startY;
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX - targetCamera.x * targetCamera.scale;
  startY = e.clientY - targetCamera.y * targetCamera.scale;
});

canvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    targetCamera.x = (e.clientX - startX) / targetCamera.scale;
    targetCamera.y = (e.clientY - startY) / targetCamera.scale;
  }

  // Hover detection (top-down perspective math)
  const mx = (e.clientX - width / 2) / camera.scale - camera.x;
  const my = (e.clientY - height / 2) / camera.scale - camera.y;
  hovered = null;
  let hoveredSound = false;
  if (achievements.planets) {
    const planetCount = achievements.planets.length;
    for (let i = 0; i < planetCount; i++) {
      const angle = i * (Math.PI * 2 / planetCount);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;

      // Planet size consistent with draw logic
      const targetScreenFraction = 0.48;
      const desiredWorldSize = (targetScreenFraction * Math.min(width, height)) / camera.scale;
      const planetSize = camera.scale > 2.5 ? desiredWorldSize : planetSizeBase;

      if (Math.hypot(mx - px, my - py) < planetSize / 2) {
        hovered = { type: 'core', index: i };
        hoveredSound = true;
      }

      // When zoomed into this planet, check achievement node hover
      const reveal = Math.max(0, Math.min(1, (camera.scale - 2.6) / 2.0));
      if (reveal > 0) {
        const ringCount = achievements.planets[i].tiers.length;
        for (let j = 0; j < ringCount; j++) {
          const ringFrac = (j + 1) / (ringCount + 1);
          const ringR = ringFrac * (planetSize * 0.45);
          const numAch = Math.max(1, achievements.planets[i].tiers[j].achievements.length);
          for (let k = 0; k < numAch; k++) {
            const aAngle = (k / numAch) * Math.PI * 2 + j * 0.2;
            const ax = px + Math.cos(aAngle) * ringR;
            const ay = py + Math.sin(aAngle) * ringR;
            const nodeSize = achievementSize * (0.6 + 0.8 * reveal);
            if (Math.hypot(mx - ax, my - ay) < nodeSize / 2 + 6) {
              hovered = { type: 'achievement', core: i, tier: j, ach: k };
              hoveredSound = true;
            }
          }
        }
      }
    }
  }
  if (hoveredSound) sounds.hover.play();

  // Hover card content and fixed position (top, not following cursor)
  if (hovered) {
    if (hovered.type === 'core') {
      const p = achievements.planets[hovered.index];
      hoverCard.innerHTML = `<strong>${p.planetName}</strong><div style="opacity:0.6">Hover to see junction indicator</div>`;
    } else if (hovered.type === 'achievement') {
      const { core, tier, ach } = hovered;
      const a = achievements.planets[core].tiers[tier].achievements[ach];
      hoverCard.innerHTML = `<strong>${a.title}</strong><div style="opacity:0.75">${a.status}</div>`;
      // Title card above hologram
      titleCard.style.display = 'block';
      titleCardText.textContent = a.title;
      titleCardBody.innerHTML = `<div>${a.description}</div>`;
    }
    hoverCard.style.display = 'block';
    hoverCard.style.left = '50%';
    hoverCard.style.top = '10%';
  } else {
    hoverCard.style.display = 'none';
    titleCard.style.display = 'none';
  }
});

canvas.addEventListener('mouseup', (e) => {
  isDragging = false;
  if (hovered) {
    if (hovered.type === 'core') {
      const i = hovered.index;
      const angle = i * (Math.PI * 2 / achievements.planets.length);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;
      targetCamera.x = -px;
      targetCamera.y = -py;
      // Zoom such that planet occupies about 48% of the screen
      const desiredScale = 3.2; // base ramp-in
      targetCamera.scale = desiredScale;
      focusedCore = i;
      focusedPlanet = null;
      sounds.zoom.play();
    } else if (hovered.type === 'achievement') {
      const { core, tier, ach } = hovered;
      const a = achievements.planets[core].tiers[tier].achievements[ach];
      const content = `
        <h2>${a.title}</h2>
        <p>${a.description}</p>
        <p>Status: ${a.status}</p>
        ${a.status === 'available' ? `<button onclick="completeAchievement(${core}, ${tier}, ${ach})">Complete</button>` : ''}
      `;
      document.getElementById('achievementPopup').innerHTML = content;
      document.getElementById('achievementPopup').style.display = 'block';
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  const delta = -e.deltaY / 1000;
  targetCamera.scale = Math.max(0.1, Math.min(8, targetCamera.scale + delta));
  sounds.zoom.play();
});

// Touch support
let touchStartX, touchStartY, touchDist;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    isDragging = true;
    startX = e.touches[0].clientX - targetCamera.x * targetCamera.scale;
    startY = e.touches[0].clientY - targetCamera.y * targetCamera.scale;
  } else if (e.touches.length === 2) {
    touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }
});

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && isDragging) {
    targetCamera.x = (e.touches[0].clientX - startX) / targetCamera.scale;
    targetCamera.y = (e.touches[0].clientY - startY) / targetCamera.scale;
  } else if (e.touches.length === 2) {
    const newDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const delta = (newDist - touchDist) / 1000;
    targetCamera.scale = Math.max(0.1, Math.min(8, targetCamera.scale + delta));
    touchDist = newDist;
    sounds.zoom.play();
  }
});

canvas.addEventListener('touchend', (e) => {
  isDragging = false;
});

// Complete achievement
window.completeAchievement = (core, tier, ach) => {
  const a = achievements.planets[core].tiers[tier].achievements[ach];
  a.status = 'completed';
  a.dateCompleted = new Date().toISOString();
  document.getElementById('achievementPopup').style.display = 'none';
  localStorage.setItem('progress', JSON.stringify(achievements));
  const allCompleted = achievements.planets[core].tiers[tier].achievements.every(a => a.status === 'completed');
  if (allCompleted && tier < achievements.planets[core].tiers.length - 1) {
    achievements.planets[core].tiers[tier + 1].achievements.forEach(a => {
      if (a.status === 'locked') a.status = 'available';
    });
  }
};

// Admin panel (unchanged)
const adminPanel = document.getElementById('adminPanel');
const editContent = document.getElementById('editContent');
window.showAdminPanel = () => {
  adminPanel.style.display = 'block';
};
window.loginAdmin = () => {
  const pass = document.getElementById('adminPassword').value;
  if (pass === 'admin') {  // Change password here
    let html = '';
    achievements.planets.forEach((p, i) => {
      html += `<h2>${p.planetName}</h2>`;
      p.tiers.forEach((t, j) => {
        html += `<h3>${t.tierName}</h3>`;
        t.achievements.forEach((a, k) => {
          html += `
            <div>
              <input type="text" value="${a.title}" oninput="editTitle(${i},${j},${k},this.value)">
              <input type="text" value="${a.description}" oninput="editDesc(${i},${j},${k},this.value)">
              <select onchange="editStatus(${i},${j},${k},this.value)">
                <option ${a.status === 'locked' ? 'selected' : ''}>locked</option>
                <option ${a.status === 'available' ? 'selected' : ''}>available</option>
                <option ${a.status === 'completed' ? 'selected' : ''}>completed</option>
              </select>
            </div>
          `;
        });
      });
    });
    html += '<button onclick="downloadJson()">Download JSON</button><button onclick="bulkUnlock()">Bulk Unlock All</button><button onclick="bulkReset()">Bulk Reset All</button>';
    editContent.innerHTML = html;
    document.getElementById('adminPassword').style.display = 'none';
    editContent.style.display = 'block';
  } else {
    alert('Wrong password');
  }
};
window.editTitle = (i, j, k, value) => { achievements.planets[i].tiers[j].achievements[k].title = value; };
window.editDesc = (i, j, k, value) => { achievements.planets[i].tiers[j].achievements[k].description = value; };
window.editStatus = (i, j, k, value) => {
  achievements.planets[i].tiers[j].achievements[k].status = value;
  achievements.planets[i].tiers[j].achievements[k].dateCompleted = value === 'completed' ? new Date().toISOString() : null;
};
window.downloadJson = () => {
  const blob = new Blob([JSON.stringify(achievements, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'achievements.json';
  a.click();
};
window.bulkUnlock = () => {
  achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a => a.status = 'available')));
  alert('All unlocked');
};
window.bulkReset = () => {
  achievements.planets.forEach(p => p.tiers.forEach((t, j) => t.achievements.forEach(a => {
    a.status = j === 0 ? 'available' : 'locked';
    a.dateCompleted = null;
  })));
  alert('All reset');
};

// Close side panel if needed (click outside or button)
document.addEventListener('click', (e) => {
  const panelEl = document.getElementById('sidePanel');
  if (panelEl && !panelEl.contains(e.target) && !canvas.contains(e.target)) {
    panelEl.style.display = 'none';
  }
});
