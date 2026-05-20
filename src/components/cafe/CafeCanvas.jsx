import React, { useRef, useEffect, useCallback } from 'react';
import { useGame } from '@/lib/gameState.jsx';

const CAFE_W = 740;
const CAFE_H = 500;

const FURNITURE_SIZES = {
  plant: { w: 32, h: 32 },
  table: { w: 80, h: 50 },
  shelf: { w: 80, h: 100 },
  window: { w: 80, h: 45 },
  fireplace: { w: 60, h: 50 },
  counter: { w: 160, h: 50 },
  brewing: { w: 50, h: 45 },
};

function findFurnitureAt(furniture, x, y) {
  for (let i = furniture.length - 1; i >= 0; i -= 1) {
    const f = furniture[i];
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
      return f;
    }
  }
  return null;
}

const COLORS = {
  floor: '#1a1833',
  floorTile: '#201e40',
  wall: '#14122a',
  wallAccent: '#2a2650',
  counter: '#5c4a3a',
  counterTop: '#8b7355',
  table: '#4a3c2e',
  tableTop: '#6b5740',
  brewing: '#3a4a5c',
  brewGlow: '#cc7ada',
  shelf: '#3a2e22',
  plant: '#2d5a3a',
  plantPot: '#5c4a3a',
  window: '#1a2a4a',
  windowGlow: '#3a5a8a',
  moonlight: 'rgba(140, 170, 220, 0.08)',
  fireplace: '#5a3a1a',
  fireGlow: '#e8a040',
  rabbit: '#e8ddd0',
  rabbitEar: '#d4c4b0',
  customer: '#6b7db3',
  particle: 'rgba(200, 180, 255, 0.5)',
  warmLight: 'rgba(230, 190, 100, 0.06)',
};

function drawFloor(ctx) {
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, CAFE_W, CAFE_H);
  // Tile pattern
  ctx.fillStyle = COLORS.floorTile;
  for (let x = 0; x < CAFE_W; x += 40) {
    for (let y = 50; y < CAFE_H; y += 40) {
      if ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0) {
        ctx.fillRect(x, y, 40, 40);
      }
    }
  }
}

function drawWalls(ctx) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, CAFE_W, 55);
  ctx.fillStyle = COLORS.wallAccent;
  ctx.fillRect(0, 50, CAFE_W, 5);
}

function drawFurniture(ctx, item, time) {
  const { type, x, y, w, h } = item;
  
  switch (type) {
    case 'counter':
      ctx.fillStyle = COLORS.counter;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COLORS.counterTop;
      ctx.fillRect(x, y, w, 8);
      // Items on counter
      ctx.fillStyle = '#e8a040';
      ctx.beginPath(); ctx.arc(x + 30, y + 4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8bc5a0';
      ctx.beginPath(); ctx.arc(x + 80, y + 4, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'table':
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 3, y + 3, w, h);
      ctx.fillStyle = COLORS.table;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COLORS.tableTop;
      ctx.fillRect(x + 2, y + 2, w - 4, 6);
      // Cup on table
      ctx.fillStyle = '#d4c4b0';
      ctx.fillRect(x + w/2 - 4, y + 4, 8, 6);
      break;
    case 'brewing':
      ctx.fillStyle = COLORS.brewing;
      ctx.fillRect(x, y, w, h);
      // Glow bubble
      const glowAlpha = 0.3 + Math.sin(time * 0.003) * 0.2;
      ctx.fillStyle = `rgba(204, 122, 218, ${glowAlpha})`;
      ctx.beginPath(); ctx.arc(x + w/2, y + 15, 8, 0, Math.PI * 2); ctx.fill();
      // Steam
      ctx.fillStyle = `rgba(200, 180, 255, ${0.2 + Math.sin(time * 0.005) * 0.15})`;
      ctx.beginPath();
      ctx.arc(x + w/2, y - 5 + Math.sin(time * 0.002) * 3, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'shelf':
      ctx.fillStyle = COLORS.shelf;
      ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#6b5740';
        ctx.fillRect(x, y + i * 32, w, 3);
        ctx.fillStyle = ['#cc7ada', '#7ec8a0', '#e8a040'][i];
        ctx.fillRect(x + 8, y + i * 32 + 6, 10, 14);
        ctx.fillRect(x + 24, y + i * 32 + 8, 10, 12);
      }
      break;
    case 'plant':
      ctx.fillStyle = COLORS.plantPot;
      ctx.fillRect(x + 4, y + 14, 24, 18);
      ctx.fillStyle = COLORS.plant;
      ctx.beginPath(); ctx.arc(x + 16, y + 10, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a8a5a';
      ctx.beginPath(); ctx.arc(x + 12, y + 6, 6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'window':
      ctx.fillStyle = COLORS.window;
      ctx.fillRect(x, y, w, h);
      // Moonlight through window
      ctx.fillStyle = COLORS.windowGlow;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      // Rain effect
      ctx.fillStyle = 'rgba(140, 170, 220, 0.3)';
      for (let i = 0; i < 5; i++) {
        const rx = x + 8 + (i * 14);
        const ry = y + 6 + ((time * 0.05 + i * 7) % (h - 12));
        ctx.fillRect(rx, ry, 1, 4);
      }
      // Frame
      ctx.strokeStyle = '#4a4070';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath(); ctx.moveTo(x + w/2, y); ctx.lineTo(x + w/2, y + h); ctx.stroke();
      break;
    case 'fireplace':
      ctx.fillStyle = COLORS.fireplace;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#3a2a12';
      ctx.fillRect(x + 8, y + 12, w - 16, h - 12);
      // Fire
      const fireFlicker = Math.sin(time * 0.01) * 3;
      ctx.fillStyle = COLORS.fireGlow;
      ctx.beginPath(); ctx.arc(x + w/2, y + 28 + fireFlicker, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0d060';
      ctx.beginPath(); ctx.arc(x + w/2, y + 25 + fireFlicker, 6, 0, Math.PI * 2); ctx.fill();
      // Warm glow
      const grad = ctx.createRadialGradient(x + w/2, y + h, 5, x + w/2, y + h, 80);
      grad.addColorStop(0, 'rgba(230, 190, 100, 0.12)');
      grad.addColorStop(1, 'rgba(230, 190, 100, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 60, y, w + 120, 120);
      break;
  }
}

function drawRabbit(ctx, rabbit, time) {
  const { x, y, mood } = rabbit;
  const bobY = Math.sin(time * 0.003 + x) * 2;
  
  // Body
  ctx.fillStyle = COLORS.rabbit;
  ctx.beginPath(); ctx.ellipse(x, y + bobY, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.beginPath(); ctx.arc(x, y - 8 + bobY, 7, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.fillStyle = COLORS.rabbitEar;
  ctx.beginPath(); ctx.ellipse(x - 4, y - 18 + bobY, 3, 8, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, y - 18 + bobY, 3, 8, 0.2, 0, Math.PI * 2); ctx.fill();
  // Inner ears
  ctx.fillStyle = '#d4a0b0';
  ctx.beginPath(); ctx.ellipse(x - 4, y - 17 + bobY, 1.5, 4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, y - 17 + bobY, 1.5, 4, 0.2, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#2a2040';
  ctx.beginPath(); ctx.arc(x - 3, y - 9 + bobY, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 3, y - 9 + bobY, 1.5, 0, Math.PI * 2); ctx.fill();
  // Blush
  if (mood === 'happy') {
    ctx.fillStyle = 'rgba(220, 140, 140, 0.4)';
    ctx.beginPath(); ctx.arc(x - 6, y - 6 + bobY, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 6 + bobY, 2, 0, Math.PI * 2); ctx.fill();
  }
  if (mood === 'sleepy') {
    ctx.fillStyle = '#eee';
    ctx.font = '8px sans-serif';
    ctx.fillText('z', x + 10, y - 18 + bobY + Math.sin(time * 0.002) * 3);
    ctx.fillText('z', x + 15, y - 22 + bobY + Math.sin(time * 0.002 + 1) * 3);
  }
}

function drawCustomer(ctx, customer, time) {
  const { x, y, color, emoji } = customer;
  const bobY = Math.sin(time * 0.002 + x * 0.1) * 1;
  
  // Body
  ctx.fillStyle = color || COLORS.customer;
  ctx.beginPath(); ctx.ellipse(x, y + bobY, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.beginPath(); ctx.arc(x, y - 12 + bobY, 8, 0, Math.PI * 2); ctx.fill();
  // Face
  if (emoji) {
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(emoji, x, y - 8 + bobY);
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

function drawAmbientLight(ctx, time) {
  // Moonlight from windows
  const windows = [{ x: 220, y: 10 }, { x: 540, y: 10 }];
  windows.forEach(w => {
    const grad = ctx.createRadialGradient(w.x, w.y + 30, 5, w.x, w.y + 80, 100);
    grad.addColorStop(0, 'rgba(140, 170, 220, 0.08)');
    grad.addColorStop(1, 'rgba(140, 170, 220, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(w.x - 100, w.y, 200, 180);
  });
  
  // Overall warm ambient
  const grad2 = ctx.createRadialGradient(CAFE_W/2, CAFE_H/2, 50, CAFE_W/2, CAFE_H/2, 400);
  grad2.addColorStop(0, 'rgba(230, 190, 100, 0.03)');
  grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, CAFE_W, CAFE_H);
}

export default function CafeCanvas() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const { state, dispatch } = useGame();
  
  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CAFE_W, CAFE_H);
  
  //change from draw layer to png bg.
  const bgImages = useRef({ day: null, night: null });

  useEffect(() => {
  const day = new Image();
  day.src = '/C_Daylight.png';
  day.onload = () => { bgImages.current.day = day; };

  const night = new Image();
  night.src = '/C_Nightfall.png';
  night.onload = () => { bgImages.current.night = night; };
}, []);
    
    // Furniture
    state.cafe.furniture.forEach(f => drawFurniture(ctx, f, time));
    
    // Rabbits
    state.npcs.rabbits.forEach(r => drawRabbit(ctx, r, time));
    
    // Customers (during focus phase)
    state.npcs.customers.forEach(c => drawCustomer(ctx, c, time));
    
    // Particles
    drawParticles(ctx, time);
    
    // Chaos overlay
    if (state.attention.chaosLevel >= 2) {
      ctx.fillStyle = `rgba(140, 100, 200, ${0.02 + state.attention.chaosLevel * 0.01})`;
      ctx.fillRect(0, 0, CAFE_W, CAFE_H);
    }
    
    animRef.current = requestAnimationFrame(draw);
 }, [state.cafe.furniture, state.npcs.rabbits, state.npcs.customers, state.attention.chaosLevel, state.cafe.timeOfDay]);
  
  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  // Rabbit wandering
  useEffect(() => {
    const interval = setInterval(() => {
      state.npcs.rabbits.forEach(r => {
        const newX = Math.max(40, Math.min(CAFE_W - 40, r.x + (Math.random() - 0.5) * 30));
        const newY = Math.max(80, Math.min(CAFE_H - 40, r.y + (Math.random() - 0.5) * 30));
        dispatch({ type: 'UPDATE_RABBIT', payload: { id: r.id, x: newX, y: newY } });
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [state.npcs.rabbits, dispatch]);
  
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

    const type = state.cafe.placeFurnitureType || 'plant';
    const size = FURNITURE_SIZES[type] ?? FURNITURE_SIZES.plant;

    dispatch({
      type: 'ADD_FURNITURE',
      payload: {
        id: `furn-${Date.now()}`,
        type,
        x: Math.max(0, Math.min(CAFE_W - size.w, x - size.w / 2)),
        y: Math.max(50, Math.min(CAFE_H - size.h, y - size.h / 2)),
        w: size.w,
        h: size.h,
      },
    });
  };

  return (
    <canvas
      ref={canvasRef}
      width={CAFE_W}
      height={CAFE_H}
      onClick={handleCanvasClick}
      className={`rounded-xl border shadow-2xl ${
        state.cafe.decorateMode
          ? state.cafe.decorateTool === 'remove'
            ? 'border-destructive cursor-pointer ring-2 ring-destructive/40'
            : 'border-primary cursor-crosshair ring-2 ring-primary/40'
          : 'border-border/50'
      }`}
      style={{ imageRendering: 'pixelated', maxWidth: '100%' }}
    />
  );
}