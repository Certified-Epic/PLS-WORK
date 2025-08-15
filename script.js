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

const assets = {
  center: new Image(),
  planet: new Image(),
  lock: new Image(),
  pulse: new Image(),
  node: new Image(),
  junction: new Image(),
};
assets.center.src = './assets/center.png';
assets.planet.src = './assets/planet.png';
assets.lock.src = './assets/lock.png';
assets.pulse.src = './assets/pulse.png';
assets.node.src = './assets/node.png';
assets.junction.src = './assets/junction.png';

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

let camera = { x: 0, y: 0, scale: 0.5 };
let targetCamera = { x: 0, y: 0, scale: 0.5 };
let easing = 0.1;
let focusedCore = null;
let focusedPlanet = null;
let hovered = null;

const coreRadius = 500;
const tierRadius = 150;
const planetSize = 50;
const tierSize = 30;
const achievementSize = 10;

let starParticles = [];
for (let i = 0; i < 200; i++) {
  starParticles.push({
    x: Math.random() * 2000 - 1000,
    y: Math.random() * 2000 - 1000,
    size: Math.random() * 2 + 1,
    speed: Math.random() * 0.5 + 0.5,
  });
}

let time = 0;

function draw() {
  time += 0.016;

  camera.x += (targetCamera.x - camera.x) * easing;
  camera.y += (targetCamera.y - camera.y) * easing;
  camera.scale += (targetCamera.scale - camera.scale) * easing;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + camera.x * camera.scale, height / 2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // Starfield
  ctx.fillStyle = 'white';
  for (let p of starParticles) {
    ctx.globalAlpha = 0.5;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    p.x -= p.speed * 0.1;
    if (p.x < -1000) p.x = 1000;
  }
  ctx.globalAlpha = 1;

  // Central image
  ctx.drawImage(assets.center, -50, -50, 100, 100);

  if (achievements.planets) {
    achievements.planets.forEach((planet, i) => {
      const angle = i * (Math.PI * 2 / 5);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;

      // Orbital rings for core
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1 / camera.scale;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(px, py, tierRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, tierRadius + 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Core planet
      ctx.drawImage(assets.planet, px - planetSize / 2, py - planetSize / 2, planetSize, planetSize);

      // Label
      if (camera.scale > 0.5) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(planet.planetName, px, py + planetSize / 2 + 10);
      }

      // Tier planets
      planet.tiers.forEach((tier, j) => {
        const tangle = j * (Math.PI * 2 / 5); // Static
        const tx = px + Math.cos(tangle) * tierRadius;
        const ty = py + Math.sin(tangle) * tierRadius;

        // Connecting path with glow
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2 / camera.scale;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Tier planet
        ctx.drawImage(assets.planet, tx - tierSize / 2, ty - tierSize / 2, tierSize, tierSize);

        // Label
        if (camera.scale > 1) {
          ctx.fillText(tier.tierName, tx, ty + tierSize / 2 + 10);
        }

        // Achievements if focused
        if (focusedCore === i && focusedPlanet === j) {
          const numAch = tier.achievements.length;
          tier.achievements.forEach((ach, k) => {
            const aangle = k * (Math.PI * 2 / numAch);
            const ax = tx + Math.cos(aangle) * 50;
            const ay = ty + Math.sin(aangle) * 50;

            // Branch with glow
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 5;
            ctx.strokeStyle = 'white';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Data pulse
            const pulsePos = (Math.sin(time + k) + 1) / 2;
            const pulseX = tx + (ax - tx) * pulsePos;
            const pulseY = ty + (ay - ty) * pulsePos;
            ctx.globalAlpha = 0.5 + Math.sin(time + k) * 0.5;
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Achievement node
            if (ach.status === 'locked') {
              ctx.drawImage(assets.lock, ax - achievementSize / 2, ay - achievementSize / 2, achievementSize, achievementSize);
            } else if (ach.status === 'available') {
              ctx.drawImage(assets.node, ax - achievementSize / 2, ay - achievementSize / 2, achievementSize, achievementSize);
              const pulseSize = achievementSize + Math.sin(time * 2) * 2;
              ctx.globalAlpha = 0.5 + Math.sin(time * 2) * 0.5;
              ctx.drawImage(assets.pulse, ax - pulseSize / 2, ay - pulseSize / 2, pulseSize, pulseSize);
              ctx.globalAlpha = 1;
            } else {
              ctx.drawImage(assets.node, ax - achievementSize / 2, ay - achievementSize / 2, achievementSize, achievementSize);
            }
          });
        }

        // Junction (placeholder on edge)
        if (j < planet.tiers.length - 1) {
          const jangle = (j + 0.5) * (Math.PI * 2 / 5);
          const jx = px + Math.cos(jangle) * (tierRadius + 10);
          const jy = py + Math.sin(jangle) * (tierRadius + 10);
          ctx.drawImage(assets.junction, jx - 5, jy - 5, 10, 10);
        }
      });
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

  // Hover
  const mx = (e.clientX - width / 2) / camera.scale - camera.x;
  const my = (e.clientY - height / 2) / camera.scale - camera.y;
  hovered = null;
  let hoveredSound = false;
  if (achievements.planets) {
    achievements.planets.forEach((planet, i) => {
      const angle = i * (Math.PI * 2 / 5);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;
      if (Math.hypot(mx - px, my - py) < planetSize / 2) {
        hovered = { type: 'core', index: i };
        hoveredSound = true;
      }
      planet.tiers.forEach((tier, j) => {
        const tangle = j * (Math.PI * 2 / 5);
        const tx = px + Math.cos(tangle) * tierRadius;
        const ty = py + Math.sin(tangle) * tierRadius;
        if (Math.hypot(mx - tx, my - ty) < tierSize / 2) {
          hovered = { type: 'tier', core: i, tier: j };
          hoveredSound = true;
        }
        if (focusedCore === i && focusedPlanet === j) {
          tier.achievements.forEach((ach, k) => {
            const aangle = k * (Math.PI * 2 / tier.achievements.length);
            const ax = tx + Math.cos(aangle) * 50;
            const ay = ty + Math.sin(aangle) * 50;
            if (Math.hypot(mx - ax, my - ay) < achievementSize / 2) {
              hovered = { type: 'achievement', core: i, tier: j, ach: k };
              hoveredSound = true;
            }
          });
        }
      });
    });
  }
  if (hoveredSound) sounds.hover.play();
});

canvas.addEventListener('mouseup', (e) => {
  isDragging = false;
  if (hovered) {
    if (hovered.type === 'core') {
      const i = hovered.index;
      const angle = i * (Math.PI * 2 / 5);
      targetCamera.x = -Math.cos(angle) * coreRadius;
      targetCamera.y = -Math.sin(angle) * coreRadius;
      targetCamera.scale = 2;
      focusedCore = i;
      focusedPlanet = null;
      sounds.zoom.play();
    } else if (hovered.type === 'tier') {
      const i = hovered.core;
      const j = hovered.tier;
      const angle = i * (Math.PI * 2 / 5);
      const px = Math.cos(angle) * coreRadius;
      const py = Math.sin(angle) * coreRadius;
      const tangle = j * (Math.PI * 2 / 5);
      const tx = px + Math.cos(tangle) * tierRadius;
      const ty = py + Math.sin(tangle) * tierRadius;
      targetCamera.x = -tx;
      targetCamera.y = -ty;
      targetCamera.scale = 5;
      focusedCore = i;
      focusedPlanet = j;
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
      document.getElementById('popup').innerHTML = content;
      document.getElementById('popup').style.display = 'block';
    }
  }
});

canvas.addEventListener('wheel', (e) => {
  const delta = -e.deltaY / 1000;
  targetCamera.scale = Math.max(0.1, Math.min(10, targetCamera.scale + delta));
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
    targetCamera.scale = Math.max(0.1, Math.min(10, targetCamera.scale + delta));
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
  document.getElementById('popup').style.display = 'none';
  localStorage.setItem('progress', JSON.stringify(achievements));
  const allCompleted = achievements.planets[core].tiers[tier].achievements.every(a => a.status === 'completed');
  if (allCompleted && tier < achievements.planets[core].tiers.length - 1) {
    achievements.planets[core].tiers[tier + 1].achievements.forEach(a => {
      if (a.status === 'locked') a.status = 'available';
    });
  }
};

// Admin panel
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
