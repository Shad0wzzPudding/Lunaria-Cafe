import React, { useRef, useEffect, useCallback } from 'react';
import { useGame } from '@/lib/gameState.jsx';

const CAFE_W = 740;
const CAFE_H = 500;

export const FURNITURE_CATALOG = {
  baner:              { file: '01_baner.png',              w: 40,  h: 60,  sittable: false },
  bar_counter1:       { file: '02_bar_counter1.png',       w: 160, h: 70,  sittable: false },
  bar_counter2:       { file: '03_bar_counter2 .png',      w: 160, h: 70,  sittable: false },
  barrel:             { file: '04_barrel.png',             w: 35,  h: 45,  sittable: false },
  bench:              { file: '05_bench.png',              w: 120, h: 50,  sittable: true,  seatDx: 0, seatDy: 10 },
  bookcase_small:     { file: '06_bookcase_small.png',     w: 70,  h: 90,  sittable: false },
  cabinet:            { file: '07_cabinet.png',            w: 70,  h: 80,  sittable: false },
  candle:             { file: '08_candle.png',             w: 25,  h: 30,  sittable: false },
  chair:              { file: '09_chair.png',              w: 40,  h: 45,  sittable: true,  seatDx: 0, seatDy: 10 },
  chair2:             { file: '10_chair.png',              w: 40,  h: 45,  sittable: true,  seatDx: 0, seatDy: 10 },
  chair_blue:         { file: '11_chair_blue.png',         w: 40,  h: 45,  sittable: true,  seatDx: 0, seatDy: 10 },
  chair_red:          { file: '12_chair_red.png',          w: 40,  h: 45,  sittable: true,  seatDx: 0, seatDy: 10 },
  crate:              { file: '13_crate.png',              w: 40,  h: 40,  sittable: false },
  dresser:            { file: '14_dresser.png',            w: 70,  h: 60,  sittable: false },
  fireplace:          { file: '15_fireplace.png',          w: 100, h: 80,  sittable: false },
  lantern:            { file: '16_lantern.png',            w: 30,  h: 40,  sittable: false },
  long_table:         { file: '17_long_table.png',         w: 120, h: 60,  sittable: false },
  nightstand:         { file: '18_nightstand.png',         w: 45,  h: 50,  sittable: false },
  painting:           { file: '19_painting.png',           w: 50,  h: 40,  sittable: false },
  plant_big:          { file: '20_plant_big.png',          w: 40,  h: 50,  sittable: false },
  plant_blue:         { file: '21_plant_blue.png',         w: 35,  h: 45,  sittable: false },
  plant_small:        { file: '22_plant_small.png',        w: 30,  h: 40,  sittable: false },
  red_carpet:         { file: '23_red_carpet .png',        w: 120, h: 70,  sittable: false },
  sofa_blue:          { file: '24_sofa_blue.png',          w: 110, h: 60,  sittable: true,  seatDx: 0, seatDy: 15 },
  sofa_red:           { file: '25_sofa_red.png',           w: 110, h: 60,  sittable: true,  seatDx: 0, seatDy: 15 },
  table_long:         { file: '26_table_long.png',         w: 130, h: 90,  sittable: false },
  table_round:        { file: '27_table_round.png',        w: 90,  h: 90,  sittable: false },
  table_square:       { file: '28_table_square.png',       w: 80,  h: 80,  sittable: false },
  table_square_plant: { file: '29_table_square_plant.png', w: 80,  h: 80,  sittable: false },
  wardrobe:           { file: '30_wardrobe.png',           w: 60,  h: 80,  sittable: false },
};

export const FURNITURE_SIZES = Object.fromEntries(
  Object.entries(FURNITURE_CATALOG).map(([k, v]) => [k, { w: v.w, h: v.h }])
);

function findFurnitureAt(furniture, x, y) {
  for (let i = furniture.length - 1; i >= 0; i--) {
    const f = furniture[i];
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f;
  }
  return null;
}

const COLORS = { rabbit: '#e8ddd0', rabbitEar: '#d4c4b0', customer: '#6b7db3' };

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

export function getCustomerDrawPos(customer, furniture) {
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

export default function CafeCanvas() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const bgImages = useRef({ day: null, night: null });
  const furnitureImages = useRef({});
  const { state, dispatch } = useGame();

  useEffect(() => {
    const day = new Image(); day.src = '/C_Daylight.png';
    day.onload = () => { bgImages.current.day = day; };
    const night = new Image(); night.src = '/C_Nightfall.png';
    night.onload = () => { bgImages.current.night = night; };
  }, []);

  useEffect(() => {
    Object.entries(FURNITURE_CATALOG).forEach(([type, info]) => {
      const img = new Image();
      img.src = `/assets/decoration/${info.file}`;
      img.onload = () => { furnitureImages.current[type] = img; };
    });
  }, []);

  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CAFE_W, CAFE_H);

    const bg = bgImages.current[state.cafe.timeOfDay ?? 'night'];
    if (bg) { ctx.drawImage(bg, 0, 0, CAFE_W, CAFE_H); }
    else { ctx.fillStyle = '#1a1833'; ctx.fillRect(0, 0, CAFE_W, CAFE_H); }

    // Y-sorted draw list for depth
    const drawList = [
      ...state.cafe.furniture.map(f => ({ kind: 'furniture', data: f, sortY: f.y + f.h })),
      ...state.npcs.rabbits.map(r => ({ kind: 'rabbit', data: r, sortY: r.y + 20 })),
      ...state.npcs.customers.map(c => {
        const pos = getCustomerDrawPos(c, state.cafe.furniture);
        return { kind: 'customer', data: c, sortY: pos.y + 20 };
      }),
    ];
    drawList.sort((a, b) => a.sortY - b.sortY);

    for (const item of drawList) {
      if (item.kind === 'furniture') {
        const { type, x, y, w, h } = item.data;
        const img = furnitureImages.current[type];
        if (img) {
          ctx.drawImage(img, x, y, w, h);
        } else {
          ctx.fillStyle = 'rgba(100,80,60,0.7)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(200,180,140,0.5)';
          ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(type, x + w / 2, y + h / 2 + 3);
        }
      } else if (item.kind === 'customer') {
        drawCustomer(ctx, item.data, time, state.cafe.furniture);
      } else if (item.kind === 'rabbit') {
        drawRabbit(ctx, item.data, time);
      }
    }

    drawParticles(ctx, time);

    if (state.attention.chaosLevel >= 2) {
      ctx.fillStyle = `rgba(140,100,200,${0.02 + state.attention.chaosLevel * 0.01})`;
      ctx.fillRect(0, 0, CAFE_W, CAFE_H);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [state.cafe.furniture, state.npcs.rabbits, state.npcs.customers, state.attention.chaosLevel, state.cafe.timeOfDay]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

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

    const type = state.cafe.placeFurnitureType || 'plant_big';
    const size = FURNITURE_SIZES[type] ?? { w: 60, h: 60 };
    dispatch({
      type: 'ADD_FURNITURE',
      payload: {
        id: `furn-${Date.now()}`, type,
        x: Math.max(0, Math.min(CAFE_W - size.w, x - size.w / 2)),
        y: Math.max(50, Math.min(CAFE_H - size.h, y - size.h / 2)),
        w: size.w, h: size.h,
      },
    });
  };

  return (
    <canvas
      ref={canvasRef} width={CAFE_W} height={CAFE_H}
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