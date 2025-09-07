/*
  Word Constellations — minimalistic, glowing, physics-inspired visualization.
  - Users type words to spawn nodes with random mass, velocity, and drift forces.
  - Nodes attract each other softly; edges are curved glowing arcs with orbit accents.
  - Trails persist with subtle fade for cinematic motion blur.
*/

const canvas = document.getElementById('universe');
const ctx = canvas.getContext('2d');

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const STATE = {
  width: 0,
  height: 0,
  nodes: [],
  links: [],
  lastTime: 0,
  noiseSeed: Math.random() * 1000,
};

function resize() {
  STATE.width = window.innerWidth;
  STATE.height = window.innerHeight;
  canvas.width = Math.floor(STATE.width * DPR);
  canvas.height = Math.floor(STATE.height * DPR);
  canvas.style.width = STATE.width + 'px';
  canvas.style.height = STATE.height + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener('resize', resize);
resize();

// Utilities
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const length = (x, y) => Math.hypot(x, y);

// Simple coherent noise via rotating hash
function noise2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + STATE.noiseSeed) * 43758.5453;
  return s - Math.floor(s);
}

// Node model
class Node {
  constructor(text, x, y) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.mass = rand(0.6, 1.6);
    this.radius = 8 + this.mass * 3.5;
    this.hue = rand(215, 235);
    this.trail = [];
    this.angle = rand(0, Math.PI * 2);
    this.angularVel = rand(0.02, 0.08);
    this.turbulencePhase = rand(0, Math.PI * 2);
    this.inConstellation = false;
    
    // Orbital motion properties
    this.orbitCenterX = x + rand(-200, 200);
    this.orbitCenterY = y + rand(-200, 200);
    this.orbitRadius = rand(120, 300);
    this.orbitSpeed = rand(0.3, 1.2);
    this.orbitDirection = rand(-1, 1) > 0 ? 1 : -1;
    this.orbitPhase = rand(0, Math.PI * 2);
    
    // Secondary orbital motion (smaller, faster)
    this.secondaryCenterX = this.orbitCenterX + rand(-80, 80);
    this.secondaryCenterY = this.orbitCenterY + rand(-80, 80);
    this.secondaryRadius = rand(60, 150);
    this.secondarySpeed = rand(0.8, 2.5);
    this.secondaryDirection = rand(-1, 1) > 0 ? 1 : -1;
    this.secondaryPhase = rand(0, Math.PI * 2);
  }
}

// Physics params
const PHYS = {
  globalDrag: 0.98,
  softAttract: 2.0e-2,
  minLinkDistance: 48,
  maxLinkDistance: 320,
  curveBend: 0.16,
  trailKeep: 40,
  trailFade: 0.06,
  orbitFreq: 0.6,
  orbitAmp: 6,
  noiseStrength: 0.3,
  turbulenceFreq: 0.003,
  repulsionStrength: 5.0e-2,
  repulsionDistance: 24,
  angularVelocity: 0.02,
  constellationDistance: 120,
  orbitDrift: 0.1,
  centerDrift: 0.05,
};

function createNode(text, x = rand(80, STATE.width - 80), y = rand(80, STATE.height - 80)) {
  const node = new Node(text, x, y);
  STATE.nodes.push(node);
}

// Build links each frame based on proximity (lightweight n^2 pass)
function rebuildLinks() {
  const nodes = STATE.nodes;
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      // Only create links when nodes are in constellation range
      if (d < PHYS.constellationDistance) {
        links.push({ i, j, d });
      }
    }
  }
  STATE.links = links;
}

function step(dt) {
  const nodes = STATE.nodes;
  if (nodes.length === 0) return;

  // Reset constellation status
  for (const node of nodes) {
    node.inConstellation = false;
  }

  // Soft pairwise attraction and repulsion
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;
      let dist = Math.sqrt(distSq) + 1e-6;
      
      // Check if nodes are in constellation distance
      if (dist < PHYS.constellationDistance) {
        a.inConstellation = true;
        b.inConstellation = true;
      }
      
      if (dist < PHYS.maxLinkDistance * 1.25) {
        // Attraction at medium distances
        if (dist > PHYS.minLinkDistance) {
          const strength = PHYS.softAttract / distSq;
          const nx = dx / dist;
          const ny = dy / dist;
          const fx = nx * strength;
          const fy = ny * strength;
          a.vx += fx * dt * b.mass;
          a.vy += fy * dt * b.mass;
          b.vx -= fx * dt * a.mass;
          b.vy -= fy * dt * a.mass;
        }
        // Repulsion at close distances
        else if (dist < PHYS.repulsionDistance) {
          const strength = PHYS.repulsionStrength / (distSq + 1e-6);
          const nx = dx / dist;
          const ny = dy / dist;
          const fx = nx * strength;
          const fy = ny * strength;
          a.vx -= fx * dt * b.mass;
          a.vy -= fy * dt * b.mass;
          b.vx += fx * dt * a.mass;
          b.vy += fy * dt * a.mass;
        }
      }
    }
  }

  // Orbital motion system
  for (const n of nodes) {
    const time = performance.now() * 0.001;
    
    // Drift orbital centers slightly
    n.orbitCenterX += (noise2(n.orbitCenterX * 0.01, time * 0.1) - 0.5) * PHYS.centerDrift * dt;
    n.orbitCenterY += (noise2(n.orbitCenterY * 0.01, time * 0.1) - 0.5) * PHYS.centerDrift * dt;
    n.secondaryCenterX += (noise2(n.secondaryCenterX * 0.01, time * 0.15) - 0.5) * PHYS.centerDrift * dt;
    n.secondaryCenterY += (noise2(n.secondaryCenterY * 0.01, time * 0.15) - 0.5) * PHYS.centerDrift * dt;
    
    // Update orbital phases
    n.orbitPhase += n.orbitSpeed * n.orbitDirection * dt;
    n.secondaryPhase += n.secondarySpeed * n.secondaryDirection * dt;
    
    // Calculate primary orbital position
    const primaryX = n.orbitCenterX + Math.cos(n.orbitPhase) * n.orbitRadius;
    const primaryY = n.orbitCenterY + Math.sin(n.orbitPhase) * n.orbitRadius;
    
    // Calculate secondary orbital position (relative to primary)
    const secondaryX = n.secondaryCenterX + Math.cos(n.secondaryPhase) * n.secondaryRadius;
    const secondaryY = n.secondaryCenterY + Math.sin(n.secondaryPhase) * n.secondaryRadius;
    
    // Blend primary and secondary orbits
    const blendFactor = 0.7;
    const targetX = primaryX * blendFactor + secondaryX * (1 - blendFactor);
    const targetY = primaryY * blendFactor + secondaryY * (1 - blendFactor);
    
    // Smooth movement towards target position
    const moveSpeed = 2.0;
    n.x += (targetX - n.x) * moveSpeed * dt;
    n.y += (targetY - n.y) * moveSpeed * dt;
    
    // Add subtle noise for organic variation
    const noiseX = (noise2(n.x * 0.01, time * 0.2) - 0.5) * PHYS.noiseStrength;
    const noiseY = (noise2(n.y * 0.01, time * 0.2) - 0.5) * PHYS.noiseStrength;
    n.x += noiseX * dt;
    n.y += noiseY * dt;
    
    // Update angular rotation
    n.angle += n.angularVel * dt;
    n.angularVel += (rand(-0.001, 0.001) - n.angularVel * 0.1) * dt;

    // Soft wrap
    if (n.x < -40) { 
      n.x = STATE.width + 40; 
      n.orbitCenterX = n.x + rand(-200, 200);
    }
    if (n.x > STATE.width + 40) { 
      n.x = -40; 
      n.orbitCenterX = n.x + rand(-200, 200);
    }
    if (n.y < -40) { 
      n.y = STATE.height + 40; 
      n.orbitCenterY = n.y + rand(-200, 200);
    }
    if (n.y > STATE.height + 40) { 
      n.y = -40; 
      n.orbitCenterY = n.y + rand(-200, 200);
    }

    // trails
    n.trail.push({ x: n.x, y: n.y, t: performance.now() });
    if (n.trail.length > PHYS.trailKeep) n.trail.shift();
  }

  rebuildLinks();
}

function drawBackground() {
  // Faint persistent trails layer
  ctx.fillStyle = 'rgba(2, 3, 9, 0.28)';
  ctx.fillRect(0, 0, STATE.width, STATE.height);

  // Large vignette glow
  const g = ctx.createRadialGradient(
    STATE.width * 0.6,
    STATE.height * 0.25,
    0,
    STATE.width * 0.5,
    STATE.height * 0.7,
    Math.max(STATE.width, STATE.height)
  );
  g.addColorStop(0, 'rgba(30, 42, 85, 0.05)');
  g.addColorStop(1, 'rgba(5, 7, 12, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STATE.width, STATE.height);
}

function drawLinks(time) {
  const nodes = STATE.nodes;
  const links = STATE.links;
  for (const L of links) {
    const a = nodes[L.i];
    const b = nodes[L.j];
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);

    const bendDir = Math.sign(noise2(mx * 0.01, my * 0.01) - 0.5) || 1;
    const nx = -dy / (d || 1);
    const ny = dx / (d || 1);
    const curve = PHYS.curveBend * Math.min(1, (d - PHYS.minLinkDistance) / (PHYS.maxLinkDistance - PHYS.minLinkDistance));
    const cx = mx + nx * bendDir * d * curve;
    const cy = my + ny * bendDir * d * curve;

    const alpha = clamp(1 - (d - PHYS.minLinkDistance) / (PHYS.maxLinkDistance - PHYS.minLinkDistance), 0.05, 0.9);
    const hue = (a.hue + b.hue) * 0.5;

    // Outer glow
    ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${alpha * 0.12})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();

    // Core line
    ctx.strokeStyle = `hsla(${hue}, 90%, 75%, ${alpha * 0.7})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();

    // Orbit accents near midpoint
    const t = time * 0.001;
    const ang = t * PHYS.orbitFreq + (L.i * 0.7 + L.j * 1.3);
    const orbitR = PHYS.orbitAmp * (0.5 + 0.5 * Math.sin(t * 0.33 + L.d * 0.02));
    const ox = mx + Math.cos(ang) * orbitR;
    const oy = my + Math.sin(ang) * orbitR;
    ctx.fillStyle = `hsla(${hue}, 100%, 85%, ${alpha * 0.9})`;
    ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${alpha * 0.6})`;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawNodes(time) {
  for (const n of STATE.nodes) {
    // trail
    if (n.trail.length > 1) {
      for (let i = 1; i < n.trail.length; i++) {
        const p0 = n.trail[i - 1];
        const p1 = n.trail[i];
        const t = i / n.trail.length;
        const alpha = (t * 0.6) * (1 - PHYS.trailFade) + 0.05;
        ctx.strokeStyle = `hsla(${n.hue}, 90%, ${65 - t * 20}%, ${alpha})`;
        ctx.lineWidth = lerp(0.2, 1.0, t);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // glow
    ctx.shadowColor = `hsla(${n.hue}, 100%, 70%, 0.6)`;
    ctx.shadowBlur = 12;
    ctx.fillStyle = `hsla(${n.hue}, 100%, 86%, 0.95)`;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // text - only show when in constellation
    if (n.inConstellation) {
      ctx.font = '600 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(230, 238, 255, 0.95)';
      ctx.shadowColor = `hsla(${n.hue}, 100%, 60%, 0.8)`;
      ctx.shadowBlur = 10;
      ctx.fillText(n.text, n.x, n.y - n.radius * 0.9);
      ctx.shadowBlur = 0;
    }
  }
}

function frame(t) {
  const time = t || 0;
  const dt = STATE.lastTime ? clamp((time - STATE.lastTime) / 1000, 0, 0.033) : 0.016;
  STATE.lastTime = time;

  drawBackground();
  step(dt);
  drawLinks(time);
  drawNodes(time);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Input handling
const form = document.getElementById('word-form');
const input = document.getElementById('word-input');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = (input.value || '').trim();
  if (!text) return;
  const x = rand(STATE.width * 0.3, STATE.width * 0.7);
  const y = rand(STATE.height * 0.3, STATE.height * 0.7);
  createNode(text, x, y);
  input.value = '';
});

// No starter nodes - only user-typed words will appear


