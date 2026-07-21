import { useRef, useEffect, useCallback } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { RotateCcw, RotateCw, Check, X } from 'lucide-react';
import { FURNITURE_CATALOG, FURNITURE_SIZES } from '@/lib/cafe/furnitureCatalog.js';
import {
  CAFE_W,
  CAFE_H,
  WALKABLE_ZONES,
  isInsideWalkableZone,
  collidesWithFurniture,
  randomWalkablePoint,
  findNearestValidSpot,
} from '@/lib/cafe/spatial.js';

const DEBUG_COLLISION = false;
const DEBUG_WALKABLE = false;

function findFurnitureAt(furniture, x, y) {
  for (let i = furniture.length - 1; i >= 0; i--) {
    const f = furniture[i];

    const rotation = (f.rotation ?? 0) % 180 !== 0;

    const w = rotation ? f.h : f.w;
    const h = rotation ? f.w : f.h;

    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;

    const left = cx - w / 2;
    const top = cy - h / 2;

    if (
      x >= left &&
      x <= left + w &&
      y >= top &&
      y <= top + h
    ) {
      return f;
    }
  }

  return null;
}


const COLORS = { rabbit: '#e8ddd0', rabbitEar: '#d4c4b0', customer: '#6b7db3', cat: '#c9b89a', catStripe: '#a89070', catInner: '#e8c4b0' };

function drawGhost(ctx, e, time) {
  if (e.alpha <= 0) return;
  const floatY = e.y + Math.sin(time * 0.0012 + e.phase) * 7;

  ctx.save();
  ctx.globalAlpha = e.alpha * 0.85;

  // Body: dome top + wavy 3-bump bottom
  ctx.fillStyle = '#dce8ff';
  ctx.beginPath();
  ctx.moveTo(e.x - 12, floatY + 8);
  ctx.lineTo(e.x - 12, floatY);
  ctx.arc(e.x, floatY, 12, Math.PI, 0);          // clockwise left→top→right
  ctx.lineTo(e.x + 12, floatY + 8);
  ctx.quadraticCurveTo(e.x + 8,  floatY + 14, e.x + 4,  floatY + 8);
  ctx.quadraticCurveTo(e.x,      floatY + 14, e.x - 4,  floatY + 8);
  ctx.quadraticCurveTo(e.x - 8,  floatY + 14, e.x - 12, floatY + 8);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2a2040';
  ctx.beginPath(); ctx.arc(e.x - 4, floatY - 3, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(e.x + 4, floatY - 3, 2.2, 0, Math.PI * 2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.arc(e.x - 3,   floatY - 4, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(e.x + 4.8, floatY - 4, 0.8, 0, Math.PI * 2); ctx.fill();
  // Mouth
  ctx.fillStyle = '#2a2040';
  ctx.beginPath(); ctx.arc(e.x, floatY + 2, 1.5, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawMist(ctx, e, time, lowPerf = false) {
  if (e.alpha <= 0) return;
  const swayX = e.x + Math.sin(time * 0.0004 + e.phase) * 60;
  const swayY = e.y + Math.sin(time * 0.0003 + e.phase * 1.3) * 10;

  ctx.save();
  if (!lowPerf) ctx.filter = 'blur(4px)';
  ctx.globalAlpha = e.alpha * 0.65;
  ctx.fillStyle = '#6b2fa0';

  const puffs = [
    { dx:   0, dy:  0, rx: 30, ry: 14 },
    { dx: -24, dy:  6, rx: 22, ry: 11 },
    { dx:  26, dy:  5, rx: 22, ry: 11 },
    { dx: -12, dy: -9, rx: 18, ry:  9 },
    { dx:  14, dy: -8, rx: 16, ry:  9 },
  ];
  for (const p of puffs) {
    ctx.beginPath();
    ctx.ellipse(swayX + p.dx, swayY + p.dy, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFire(ctx, e, time, lowPerf = false) {
  if (e.alpha <= 0) return;
  const { x, y } = e;
  const flicker  = Math.sin(time * 0.018 + x * 0.1) * 3;
  const flicker2 = Math.sin(time * 0.025 + x * 0.07) * 2;

  ctx.save();
  ctx.globalAlpha = e.alpha;

  // Base glow (skipped in perf mode)
  if (!lowPerf) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 28);
    glow.addColorStop(0, 'rgba(255,140,40,0.35)');
    glow.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.fill();
  }

  // Outer flame — orange
  ctx.fillStyle = 'rgba(255,100,30,0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 2);
  ctx.quadraticCurveTo(x - 10 + flicker,      y - 8, x + flicker,      y - 22);
  ctx.quadraticCurveTo(x + 10 + flicker,      y - 8, x + 8,            y + 2);
  ctx.closePath(); ctx.fill();

  // Mid flame — yellow
  ctx.fillStyle = 'rgba(255,210,60,0.9)';
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 2);
  ctx.quadraticCurveTo(x - 6 + flicker2,      y - 5, x + flicker2,     y - 14);
  ctx.quadraticCurveTo(x + 6 + flicker2,      y - 5, x + 5,            y + 2);
  ctx.closePath(); ctx.fill();

  // Inner core — white-yellow
  ctx.fillStyle = 'rgba(255,255,210,0.95)';
  ctx.beginPath();
  ctx.moveTo(x - 2.5, y + 2);
  ctx.quadraticCurveTo(x + flicker2 * 0.3,    y - 4, x + flicker2 * 0.3, y - 8);
  ctx.quadraticCurveTo(x + 3,                  y - 4, x + 2.5,            y + 2);
  ctx.closePath(); ctx.fill();

  ctx.restore();
}

function drawRabbit(ctx, rabbit, time) {
  const { x, y, mood } = rabbit;
  const bobY = Math.sin(time * 0.003 + x) * 2;
  ctx.fillStyle = COLORS.rabbit;
  ctx.beginPath(); ctx.ellipse(x, y + bobY, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 8 + bobY, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d4c4b0';
  ctx.beginPath(); ctx.ellipse(x - 4, y - 18 + bobY, 3, 8, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, y - 18 + bobY, 3, 8, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d4a0b0';
  ctx.beginPath(); ctx.ellipse(x - 4, y - 17 + bobY, 1.5, 4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, y - 17 + bobY, 1.5, 4, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2040';
  ctx.beginPath(); ctx.arc(x - 3, y - 9 + bobY, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 3, y - 9 + bobY, 1.5, 0, Math.PI * 2); ctx.fill();
  if (mood === 'happy') {
    ctx.fillStyle = 'rgba(220, 140, 140, 0.4)';
    ctx.beginPath(); ctx.arc(x - 6, y - 6 + bobY, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 6 + bobY, 2, 0, Math.PI * 2); ctx.fill();
  }
  if (mood === 'sleepy') {
    ctx.fillStyle = '#eee'; ctx.font = '8px sans-serif';
    ctx.fillText('z', x + 10, y - 18 + bobY + Math.sin(time * 0.002) * 3);
    ctx.fillText('z', x + 15, y - 22 + bobY + Math.sin(time * 0.002 + 1) * 3);
  }
}

function drawCat(ctx, cat, time) {
  const { x, y, mood } = cat;
  // Cats move less — use a slower, smaller bob
  const bobY = Math.sin(time * 0.0015 + x * 0.5) * 1.5;

  // Body (slightly rounder/larger than rabbit body)
  ctx.fillStyle = COLORS.cat;
  ctx.beginPath(); ctx.ellipse(x, y + bobY, 11, 9, 0, 0, Math.PI * 2); ctx.fill();

  // Stripe on body
  ctx.fillStyle = COLORS.catStripe;
  ctx.beginPath(); ctx.ellipse(x - 2, y + bobY - 1, 2.5, 5, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 3, y + bobY, 2, 4.5, -0.15, 0, Math.PI * 2); ctx.fill();

  // Head
  ctx.fillStyle = COLORS.cat;
  ctx.beginPath(); ctx.arc(x, y - 9 + bobY, 8, 0, Math.PI * 2); ctx.fill();

  // Pointy ears (triangles)
  ctx.fillStyle = COLORS.cat;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 14 + bobY);
  ctx.lineTo(x - 12, y - 22 + bobY);
  ctx.lineTo(x - 2, y - 18 + bobY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 7, y - 14 + bobY);
  ctx.lineTo(x + 12, y - 22 + bobY);
  ctx.lineTo(x + 2, y - 18 + bobY);
  ctx.closePath(); ctx.fill();

  // Inner ear
  ctx.fillStyle = COLORS.catInner;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 15 + bobY);
  ctx.lineTo(x - 10.5, y - 21 + bobY);
  ctx.lineTo(x - 3, y - 18 + bobY);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 7, y - 15 + bobY);
  ctx.lineTo(x + 10.5, y - 21 + bobY);
  ctx.lineTo(x + 3, y - 18 + bobY);
  ctx.closePath(); ctx.fill();

  // Eyes
  ctx.fillStyle = '#2a2040';
  if (mood === 'lazy') {
    // Half-closed eyes (slits)
    ctx.fillRect(x - 5, y - 11 + bobY, 3, 1.5);
    ctx.fillRect(x + 2, y - 11 + bobY, 3, 1.5);
  } else {
    ctx.beginPath(); ctx.arc(x - 3, y - 11 + bobY, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y - 11 + bobY, 2, 0, Math.PI * 2); ctx.fill();
    // Eye shine for curious
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x - 2.2, y - 11.8 + bobY, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.8, y - 11.8 + bobY, 0.8, 0, Math.PI * 2); ctx.fill();
  }

  // Tiny nose
  ctx.fillStyle = '#d4829a';
  ctx.beginPath(); ctx.arc(x, y - 8 + bobY, 1.2, 0, Math.PI * 2); ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(200,190,180,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x - 2, y - 8 + bobY); ctx.lineTo(x - 14, y - 9 + bobY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 2, y - 7 + bobY); ctx.lineTo(x - 14, y - 6.5 + bobY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y - 8 + bobY); ctx.lineTo(x + 14, y - 9 + bobY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y - 7 + bobY); ctx.lineTo(x + 14, y - 6.5 + bobY); ctx.stroke();

  // Tail (curved arc)
  ctx.strokeStyle = COLORS.cat;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 5 + bobY);
  ctx.quadraticCurveTo(x + 22, y + 2 + bobY, x + 18, y - 6 + bobY);
  ctx.stroke();

  // Mood indicator
  if (mood === 'lazy') {
    ctx.fillStyle = '#c8d8f0'; ctx.font = '8px sans-serif';
    ctx.fillText('z', x + 16, y - 18 + bobY + Math.sin(time * 0.002) * 3);
    ctx.fillText('z', x + 20, y - 23 + bobY + Math.sin(time * 0.002 + 1) * 3);
  }
  if (mood === 'curious') {
    ctx.fillStyle = 'rgba(220,200,255,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', x, y - 28 + bobY + Math.sin(time * 0.003) * 2);
  }
}
  function getCustomerDrawPos(customer, furniture) {
    if (customer.seatedAt) {
      const seat = furniture.find(f => f.id === customer.seatedAt);
    if (seat) {
      const cat = FURNITURE_CATALOG[seat.type];
      return { x: seat.x + seat.w / 2 + (cat?.seatDx ?? 0), y: seat.y + seat.h / 2 + (cat?.seatDy ?? 0), seated: true };
    }
  }
  return { x: customer.x, y: customer.y, seated: false };
}

function drawCustomer(ctx, customer, time, furniture) {
  const { color, emoji } = customer;
  const { x, y, seated } = getCustomerDrawPos(customer, furniture);
  const bobY = seated ? 0 : Math.sin(time * 0.002 + x * 0.1) * 1;
  ctx.fillStyle = color || COLORS.customer;
  ctx.beginPath(); ctx.ellipse(x, y + bobY, 9, seated ? 8 : 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - (seated ? 8 : 12) + bobY, 8, 0, Math.PI * 2); ctx.fill();
  if (emoji) {
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(emoji, x, y - (seated ? 4 : 8) + bobY);
  }
}

function drawAmbientLights(ctx, furniture, time, dim = 1, lowPerf = false) {
  for (const f of furniture) {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;

    if (f.type === 'fireplace') {
      const flicker = (0.22 + Math.sin(time * 0.01 + f.x) * 0.05) * dim;
      if (lowPerf) {
        ctx.save();
        ctx.globalAlpha = flicker * 0.55;
        ctx.fillStyle = 'rgba(255,140,40,1)';
        ctx.beginPath(); ctx.arc(cx, cy + 10, 75, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const outer = ctx.createRadialGradient(cx,cy + 10,10,cx,cy + 10,220);
        outer.addColorStop(0, `rgba(255,180,80,${flicker})`);
        outer.addColorStop(0.35, `rgba(255,120,40,${flicker * 0.7})`);
        outer.addColorStop(0.7, `rgba(255,80,20,${flicker * 0.25})`);
        outer.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = outer;
        ctx.fillRect(cx - 220,cy - 120,440,440);
        const core = ctx.createRadialGradient(cx,cy + 18,0,cx,cy + 18,70);
        core.addColorStop(0, `rgba(255,240,180,${0.45 * dim})`);
        core.addColorStop(0.4, `rgba(255,180,80,${0.2 * dim})`);
        core.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = core;
        ctx.fillRect(cx - 70,cy - 50,140,140);
      }
    }

    if (f.type === 'lantern') {
      const pulse = (0.14 + Math.sin(time * 0.004 + f.x * 0.1) * 0.03) * dim;
      if (lowPerf) {
        ctx.save();
        ctx.globalAlpha = pulse * 0.9;
        ctx.fillStyle = 'rgba(255,210,100,1)';
        ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,140);
        grad.addColorStop(0, `rgba(255,230,140,${pulse})`);
        grad.addColorStop(0.25, `rgba(255,190,90,${pulse * 0.7})`);
        grad.addColorStop(0.6, `rgba(255,140,40,${pulse * 0.3})`);
        grad.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - 140,cy - 140,280,280);
      }
    }
  }
}

function drawParticles(ctx, time) {
  for (let i = 0; i < 15; i++) {
    const px = (Math.sin(time * 0.001 + i * 2.3) * 0.5 + 0.5) * CAFE_W;
    const py = (Math.cos(time * 0.0008 + i * 1.7) * 0.5 + 0.5) * CAFE_H;
    const alpha = 0.15 + Math.sin(time * 0.003 + i) * 0.1;
    const size = 1.5 + Math.sin(time * 0.004 + i * 0.5) * 0.8;
    ctx.fillStyle = `rgba(200, 180, 255, ${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill();
  }
}

// Flood-fill from all 4 corners at the target draw size to erase the black void
// surrounding the cafe art, making those areas transparent so the exterior
// background in CafeView shows through.
function buildMaskedBg(img) {
  const off = document.createElement('canvas');
  off.width = CAFE_W;
  off.height = CAFE_H;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(img, 0, 0, CAFE_W, CAFE_H);
  const imageData = offCtx.getImageData(0, 0, CAFE_W, CAFE_H);
  const d = imageData.data;
  const seen = new Uint8Array(CAFE_W * CAFE_H);
  const stack = [
    // top-left 2×2
    0, 1, CAFE_W, CAFE_W + 1,
    // top-right 2×2
    CAFE_W - 2, CAFE_W - 1, 2 * CAFE_W - 2, 2 * CAFE_W - 1,
    // bottom-left 2×2
    (CAFE_H - 2) * CAFE_W, (CAFE_H - 2) * CAFE_W + 1, (CAFE_H - 1) * CAFE_W, (CAFE_H - 1) * CAFE_W + 1,
    // bottom-right 2×2
    CAFE_H * CAFE_W - CAFE_W - 2, CAFE_H * CAFE_W - CAFE_W - 1, CAFE_H * CAFE_W - 2, CAFE_H * CAFE_W - 1,
  ];
  stack.forEach(s => { seen[s] = 1; });
  while (stack.length > 0) {
    const i = stack.pop();
    const b = i * 4;
    if (d[b] > 8 || d[b + 1] > 8 || d[b + 2] > 8) continue;
    d[b + 3] = 0;
    const x = i % CAFE_W;
    const y = (i / CAFE_W) | 0;
    if (x > 0          && !seen[i - 1])      { seen[i - 1]      = 1; stack.push(i - 1); }
    if (x < CAFE_W - 1 && !seen[i + 1])      { seen[i + 1]      = 1; stack.push(i + 1); }
    if (y > 0          && !seen[i - CAFE_W])  { seen[i - CAFE_W]  = 1; stack.push(i - CAFE_W); }
    if (y < CAFE_H - 1 && !seen[i + CAFE_W]) { seen[i + CAFE_W] = 1; stack.push(i + CAFE_W); }
  }
  offCtx.putImageData(imageData, 0, 0);
  return off;
}

export default function CafeCanvas({ frozen = false }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const bgImages = useRef({ day: null, night: null });
  const furnitureImages = useRef({});
  const frozenRef = useRef(frozen);
  const chaosEntitiesRef = useRef(null);
  const lastDrawTimeRef = useRef(0);
  const sortedFurnitureRef = useRef([]);
  const { state, dispatch } = useGame();
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);
  useEffect(() => {
    sortedFurnitureRef.current = [...state.cafe.furniture].sort(
      (a, b) => (a.y + a.h) - (b.y + b.h)
    );
  }, [state.cafe.furniture]);

  // HiDPI: size the backing store to physical pixels so the scene renders crisp
  // on Retina/high-DPR displays instead of being stretched (and blurred) by the
  // browser. The logical coordinate system stays CAFE_W×CAFE_H, so all draw calls
  // and hit-testing below are unchanged. Cap DPR to bound the buffer size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(CAFE_W * dpr);
      canvas.height = Math.round(CAFE_H * dpr);
      canvas.style.width = `${CAFE_W}px`;
      canvas.style.height = `${CAFE_H}px`;
    };
    applyDpr();
    // Re-apply if the window moves to a monitor with a different DPR.
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.('change', applyDpr);
    return () => mq.removeEventListener?.('change', applyDpr);
  }, []);

  useEffect(() => {
    const day = new Image(); day.src = '/assets/background/C_Daylight.png';
    day.onload = () => { bgImages.current.day = buildMaskedBg(day); };
    const night = new Image(); night.src = '/assets/background/C_Nightfall.png';
    night.onload = () => { bgImages.current.night = buildMaskedBg(night); };
  }, []);

  useEffect(() => {
    Object.entries(FURNITURE_CATALOG).forEach(([type, info]) => {
      const img = new Image();
      img.src = `/assets/decoration/${info.file}`;
      img.onload = () => { furnitureImages.current[type] = img; };
      if (info.nightFile) {
      const nightImg = new Image();
      nightImg.src = `/assets/decoration/${info.nightFile}`;
      nightImg.onload = () => { furnitureImages.current[`${type}_night`] = nightImg; };
    }
    });
  }, []);

  const draw = useCallback(function drawFrame(time) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;
    const perfMode = s.settings.performanceMode;

    // 30fps cap in performance mode
    if (perfMode && time - lastDrawTimeRef.current < 33.3) {
      animRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    lastDrawTimeRef.current = time;

    const ctx = canvas.getContext('2d');
    // Map the logical CAFE_W×CAFE_H space onto the DPR-scaled backing store.
    const dpr = canvas.width / CAFE_W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CAFE_W, CAFE_H);

    const bg = bgImages.current[s.cafe.timeOfDay ?? 'night'];
    if (bg) { ctx.drawImage(bg, 0, 0, CAFE_W, CAFE_H); }
    else { ctx.fillStyle = '#1a1833'; ctx.fillRect(0, 0, CAFE_W, CAFE_H); }

    // =========================
    // Draw Furniture First
    // =========================

    const sortedFurniture = perfMode
      ? sortedFurnitureRef.current
      : [...s.cafe.furniture].sort((a, b) => (a.y + a.h) - (b.y + b.h));

    for (const furn of sortedFurniture) {

      const { type, x, y, w, h, rotation } = furn;

      const isNight = s.cafe.timeOfDay === 'night';
      const catalog = FURNITURE_CATALOG[type];
      const img = (isNight && catalog?.nightFile)
        ? (furnitureImages.current[`${type}_night`] ?? furnitureImages.current[type])
        : furnitureImages.current[type];

      const rad = ((rotation ?? 0) * Math.PI) / 180;

      const cx = x + w / 2;
      const cy = y + h / 2;

      ctx.save();

      ctx.translate(cx, cy);
      ctx.rotate(rad);

      if (img) {
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = 'rgba(100,80,60,0.7)';
        ctx.fillRect(-w / 2, -h / 2, w, h);

        ctx.strokeStyle = 'rgba(200,180,140,0.5)';
        ctx.lineWidth = 1;

        ctx.strokeRect(-w / 2, -h / 2, w, h);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';

        ctx.fillText(type, 0, 3);
      }

      ctx.restore();

      // Debug collision
      if (DEBUG_COLLISION) {

        ctx.save();

        ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        ctx.lineWidth = 2;

        const rotated = (rotation ?? 0) % 180 !== 0;

        const debugW = rotated ? h : w;
        const debugH = rotated ? w : h;

        ctx.strokeRect(
          cx - debugW / 2,
          cy - debugH / 2,
          debugW,
          debugH
        );

        ctx.restore();
      }
    }

    // =========================
    // Draw AmbientLight
    // =========================
    if (s.cafe.timeOfDay === 'night') {
      const mistAlphaEarly = chaosEntitiesRef.current
        ? chaosEntitiesRef.current.mists.reduce((sum, e) => sum + e.alpha, 0) / Math.max(1, chaosEntitiesRef.current.mists.length)
        : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      drawAmbientLights(ctx, s.cafe.furniture, time, 1 - mistAlphaEarly * 0.65, perfMode);
      ctx.restore();
    }

    // =========================
    // Debug: Walkable Zone
    // =========================
    if (DEBUG_WALKABLE) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.9)';
      ctx.fillStyle = 'rgba(0, 255, 100, 0.12)';
      ctx.lineWidth = 2;
      for (const z of WALKABLE_ZONES) {
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeRect(z.x, z.y, z.w, z.h);
      }
      ctx.restore();
    }

    // =========================
    // Draw Rabbits
    // =========================

    for (const rabbit of s.npcs.rabbits) {
      drawRabbit(ctx, rabbit, time);
    }

    // =========================
    // Draw Cats
    // =========================

    for (const cat of s.npcs.cats) {
      drawCat(ctx, cat, time);
    }

    // =========================
    // Draw Customers
    // =========================

    for (const customer of s.npcs.customers) {
      drawCustomer(ctx, customer, time, s.cafe.furniture);
    }

    // =========================
    // Draw Chaos Entities
    // =========================
    if (!chaosEntitiesRef.current) {
      chaosEntitiesRef.current = {
        ghosts: [], ghostsAbove: false,
        mists:  [], mistsAbove:  false,
        fires:  [], firesAbove:  false,
      };
    }
    const entities    = chaosEntitiesRef.current;
    const chaosLevel  = s.attention.chaosLevel;
    const sessionActive = s.focus.status === 'active' || s.focus.status === 'paused';
    const FADE = 1 / 120;
    const mk   = () => ({ ...randomWalkablePoint(), alpha: 0, phase: Math.random() * Math.PI * 2 });
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Respawn with fresh count + positions when threshold is crossed from below
    const ghostsAbove = sessionActive && chaosLevel >= 1;
    const firesAbove  = sessionActive && chaosLevel >= 2;
    const mistsAbove  = sessionActive && chaosLevel >= 3;

    if (ghostsAbove && !entities.ghostsAbove) entities.ghosts = Array.from({ length: rand(1, 5) }, mk);
    if (firesAbove  && !entities.firesAbove)  entities.fires  = Array.from({ length: rand(1, 5) }, mk);
    if (mistsAbove  && !entities.mistsAbove)  entities.mists  = Array.from({ length: rand(2, 5) }, mk);

    entities.ghostsAbove = ghostsAbove;
    entities.mistsAbove  = mistsAbove;
    entities.firesAbove  = firesAbove;

    // Update fire alpha and draw BEFORE mist layers (fire goes behind mist)
    for (const e of entities.fires) {
      if (!sessionActive) e.alpha = 0;
      else e.alpha = chaosLevel >= 2 ? Math.min(1, e.alpha + FADE) : Math.max(0, e.alpha - FADE);
      drawFire(ctx, e, time, perfMode);
    }

    for (const e of entities.ghosts) {
      if (!sessionActive) e.alpha = 0;
      else e.alpha = chaosLevel >= 1 ? Math.min(1, e.alpha + FADE) : Math.max(0, e.alpha - FADE);
      drawGhost(ctx, e, time);
    }
    for (const e of entities.mists) {
      if (!sessionActive) e.alpha = 0;
      else e.alpha = chaosLevel >= 3 ? Math.min(1, e.alpha + FADE) : Math.max(0, e.alpha - FADE);
    }

    // Silent Hill-style mist atmosphere — multi-layer, driven by average mist alpha
    const mistAlpha = entities.mists.reduce((sum, e) => sum + e.alpha, 0) / Math.max(1, entities.mists.length);
    if (mistAlpha > 0) {
      ctx.save();

      // Layer 1: Pixelated ground fog — discrete horizontal bands rising from the floor
      const BAND = 8;
      const fogBottom = CAFE_H;
      const fogTop    = CAFE_H * 0.15;
      const bands     = Math.ceil((fogBottom - fogTop) / BAND);
      for (let i = 0; i < bands; i++) {
        const t = i / bands; // 0 = bottom, 1 = top
        const opacity = mistAlpha * 0.82 * Math.pow(1 - t, 2.2);
        if (opacity < 0.01) continue;
        ctx.fillStyle = `rgba(30,8,70,${opacity})`;
        ctx.fillRect(0, fogBottom - (i + 1) * BAND, CAFE_W, BAND);
      }

      // Layer 2: Oppressive dark purple pressing down from above
      const topDark = ctx.createLinearGradient(0, 0, 0, CAFE_H * 0.55);
      topDark.addColorStop(0, `rgba(10,3,40,${mistAlpha * 0.55})`);
      topDark.addColorStop(1, `rgba(10,3,40,0)`);
      ctx.fillStyle = topDark;
      ctx.fillRect(0, 0, CAFE_W, CAFE_H);

      // Layer 3: Crushing edge vignette — near-black at corners
      const vign = ctx.createRadialGradient(CAFE_W / 2, CAFE_H / 2, CAFE_H * 0.18, CAFE_W / 2, CAFE_H / 2, CAFE_W * 0.72);
      vign.addColorStop(0,   `rgba(8,0,25,0)`);
      vign.addColorStop(0.55,`rgba(8,0,25,${mistAlpha * 0.40})`);
      vign.addColorStop(1,   `rgba(4,0,15,${mistAlpha * 0.78})`);
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, CAFE_W, CAFE_H);

      // Layer 4: Animated floor wisps drifting through the walkable zone (skipped in performance mode)
      if (!perfMode) {
        const floorY = CAFE_H * 0.73;
        for (let i = 0; i < 6; i++) {
          const wx = ((Math.sin(time * 0.00018 + i * 1.9) * 0.5 + 0.5) * CAFE_W * 1.3) - CAFE_W * 0.15;
          const wy = floorY + Math.sin(time * 0.00025 + i * 0.8) * 18;
          const rw = 160 + Math.sin(time * 0.0003 + i * 1.1) * 55;
          const rh = 28  + Math.sin(time * 0.00035 + i * 0.6) * 10;
          const wa = mistAlpha * (0.28 + Math.sin(time * 0.0004 + i * 2.3) * 0.10);
          const wisp = ctx.createRadialGradient(wx, wy, 0, wx, wy, rw);
          wisp.addColorStop(0, `rgba(90,40,160,${wa})`);
          wisp.addColorStop(1, `rgba(90,40,160,0)`);
          ctx.fillStyle = wisp;
          ctx.beginPath();
          ctx.ellipse(wx, wy, rw, rh, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    for (const e of entities.mists) {
      drawMist(ctx, e, time, perfMode);
    }

    // Draw pending furniture ghost
    const pf = s.cafe.pendingFurniture;
    if (pf) {
      const img = furnitureImages.current[pf.type];
      const rad = ((pf.rotation ?? 0) * Math.PI) / 180;
      const cx = pf.x + pf.w / 2;
      const cy = pf.y + pf.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(time * 0.005) * 0.15;
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      if (img) {
        ctx.drawImage(img, -pf.w / 2, -pf.h / 2, pf.w, pf.h);
      } else {
        ctx.fillStyle = 'rgba(100,80,60,0.7)';
        ctx.fillRect(-pf.w / 2, -pf.h / 2, pf.w, pf.h);
      }
      ctx.restore();
      // Pulsing outline
      ctx.save();
      ctx.globalAlpha = 0.7 + Math.sin(time * 0.005) * 0.3;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.strokeRect(-pf.w / 2 - 2, -pf.h / 2 - 2, pf.w + 4, pf.h + 4);
      ctx.restore();
    }

    if (!perfMode) drawParticles(ctx, time);

    if (!frozenRef.current) animRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    if (!frozen) animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw, frozen]);

  useEffect(() => {
  if (frozen) return;
  const interval = setInterval(() => {

    state.npcs.rabbits.forEach((r) => {

      const radius = 12;

      // If already stuck, nudge to the nearest open spot
      const currentlyStuck =
        !isInsideWalkableZone(r.x, r.y) ||
        collidesWithFurniture(r.x, r.y, radius, state.cafe.furniture);

      if (currentlyStuck) {
        const safe = findNearestValidSpot(r.x, r.y, radius, state.cafe.furniture);
        if (safe) dispatch({ type: 'UPDATE_RABBIT', payload: { id: r.id, x: safe.x, y: safe.y } });
        return;
      }

      const moveX = (Math.random() - 0.5) * 30;
      const moveY = (Math.random() - 0.5) * 30;
      const newX = r.x + moveX;
      const newY = r.y + moveY;

      const blocked =
        !isInsideWalkableZone(newX, newY) ||
        collidesWithFurniture(newX, newY, radius, state.cafe.furniture);

      if (!blocked) {
        dispatch({ type: 'UPDATE_RABBIT', payload: { id: r.id, x: newX, y: newY } });
      }

    });

  }, 2000);

  return () => clearInterval(interval);

}, [frozen, state.npcs.rabbits, state.cafe.furniture, dispatch]);

  // ── Cat movement (every 4 s; shorter steps — cats are lazier) ──────────────
  useEffect(() => {
  if (frozen) return;
  const interval = setInterval(() => {

    state.npcs.cats.forEach((c) => {
      // Cat collision radius (slightly larger than rabbit)
      const radius = 14;

      // If already stuck, nudge to the nearest open spot
      const currentlyStuck =
        !isInsideWalkableZone(c.x, c.y) ||
        collidesWithFurniture(c.x, c.y, radius, state.cafe.furniture);

      if (currentlyStuck) {
        const safe = findNearestValidSpot(c.x, c.y, radius, state.cafe.furniture);
        if (safe) dispatch({ type: 'UPDATE_CAT', payload: { id: c.id, x: safe.x, y: safe.y } });
        return;
      }

      // Cats take smaller, less frequent steps
      const moveX = (Math.random() - 0.5) * 20;
      const moveY = (Math.random() - 0.5) * 20;
      const newX = c.x + moveX;
      const newY = c.y + moveY;

      const blocked =
        !isInsideWalkableZone(newX, newY) ||
        collidesWithFurniture(newX, newY, radius, state.cafe.furniture);

      if (!blocked) {
        dispatch({ type: 'UPDATE_CAT', payload: { id: c.id, x: newX, y: newY } });
      }

    });

  }, 4000);

  return () => clearInterval(interval);

}, [frozen, state.npcs.cats, state.cafe.furniture, dispatch]);

  // Respawn any pet that is outside the walkable zone to the entrance.
  // Runs on mount and whenever a pet is added or removed.
  // Deps intentionally use .length: this repositions NPCs only when one is
  // added/removed — depending on the arrays would re-run every movement tick.
  useEffect(() => {
    const entranceX = () => 290 + Math.random() * 160;
    const entranceY = () => 390 + Math.random() * 40; // stays within lower zone (y 385–433)

    state.npcs.rabbits.forEach((r) => {
      if (!isInsideWalkableZone(r.x, r.y)) {
        dispatch({ type: 'UPDATE_RABBIT', payload: { id: r.id, x: entranceX(), y: entranceY() } });
      }
    });

    state.npcs.cats.forEach((c) => {
      if (!isInsideWalkableZone(c.x, c.y)) {
        dispatch({ type: 'UPDATE_CAT', payload: { id: c.id, x: entranceX(), y: entranceY() } });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.npcs.rabbits.length, state.npcs.cats.length, dispatch]);

  const handleCanvasClick = (event) => {
    if (!state.cafe.decorateMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CAFE_W / rect.width;
    const scaleY = CAFE_H / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    if (state.cafe.decorateTool === 'remove') {
      const hit = findFurnitureAt(state.cafe.furniture, x, y);
      if (hit) dispatch({ type: 'REMOVE_FURNITURE', payload: hit.id });
      return;
    }

    // If there's already a pending furniture, clicking again cancels it first
    if (state.cafe.pendingFurniture) {
      dispatch({ type: 'SET_PENDING_FURNITURE', payload: null });
      return;
    }
    const type = state.cafe.placeFurnitureType || 'plant_big';
    const rotation = 0; // always start pending at 0°; user rotates via overlay
    const baseSize = FURNITURE_SIZES[type] ?? { w: 60, h: 60 };
    dispatch({
      type: 'SET_PENDING_FURNITURE',
      payload: {
        id: `furn-${Date.now()}`, type, rotation,
        baseW: baseSize.w, baseH: baseSize.h,
        x: Math.max(0, Math.min(CAFE_W - baseSize.w, x - baseSize.w / 2)),
        y: Math.max(50, Math.min(CAFE_H - baseSize.h, y - baseSize.h / 2)),
        w: baseSize.w, h: baseSize.h,
      },
    });
  };

  // Convert canvas coords to screen coords for the floating UI
  const getOverlayStyle = () => {
    const pf = state.cafe.pendingFurniture;
    if (!pf || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width / CAFE_W;
    const scaleY = rect.height / CAFE_H;
    const screenCx = rect.left + (pf.x + pf.w / 2) * scaleX;
    const screenCy = rect.top + (pf.y) * scaleY;
    return { left: screenCx, top: screenCy };
  };

  const overlayStyle = getOverlayStyle();
  const pf = state.cafe.pendingFurniture;

  return (
    <div className="relative inline-block" style={{ maxWidth: '100%' }}>
      <canvas
        ref={canvasRef} width={CAFE_W} height={CAFE_H}
        onClick={handleCanvasClick}
        className={`rounded-xl border shadow-2xl block ${
          state.cafe.decorateMode
            ? state.cafe.decorateTool === 'remove'
              ? 'border-destructive cursor-pointer ring-2 ring-destructive/40'
              : 'border-primary cursor-crosshair ring-2 ring-primary/40'
            : 'border-border/50'
        }`}
        style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
      />

      {pf && overlayStyle && (
        <div
          className="fixed z-50 flex flex-col items-center gap-1.5 pointer-events-auto"
          style={{
            left: overlayStyle.left,
            top: overlayStyle.top,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          {/* Rotate + degree display row */}
          <div className="flex items-center gap-1 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg px-2 py-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => dispatch({ type: 'ROTATE_PENDING_FURNITURE', payload: -90 })}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <span className="font-pixel text-[10px] text-primary min-w-[2.5rem] text-center">
              {pf.rotation ?? 0}°
            </span>

            <button
              type="button"
              onClick={() => dispatch({ type: 'ROTATE_PENDING_FURNITURE', payload: 90 })}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-border/50 mx-1" />

            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_PENDING_FURNITURE', payload: null })}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
              const price = FURNITURE_CATALOG[pf.type]?.price ?? 0;
              dispatch({
                type: 'BUY_AND_PLACE_FURNITURE',
                payload: {
                  price,
                  item: {
                    id: pf.id, type: pf.type,
                    x: pf.x, y: pf.y,
                    w: pf.w, h: pf.h,
                    rotation: pf.rotation ?? 0,
                  },
                },
              });
            }}
            
              className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/20 hover:bg-primary/40 border border-primary/40 transition-colors text-primary"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Arrow pointing down to the furniture */}
          <div className="w-2 h-2 bg-card/95 border-r border-b border-border/50 rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}