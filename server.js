'use strict';
/* ============================================================
 * AVATAR TU TIEN - server (Node.js + WebSocket)
 * The gioi chibi tu tien: quang truong giao luu, linh dien
 * trong linh thao, shop, chat bong bong, luu du lieu.
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'players.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server: httpServer });

/* ---------------- Cau hinh ---------------- */
const TICK_MS = 100;
const PLAYER_SPEED = 220;
const PLAZA = { w: 1600, h: 1200 };
const FARM = { w: 1200, h: 900 };
const PLOT_POS = [[380, 420], [600, 420], [820, 420], [380, 640], [600, 640], [820, 640]];
const CROPS = {
  linhthao: { name: 'Linh Thảo', seedPrice: 10, sellPrice: 26, grow: 90, xp: 12, c1: '#7dff9b', c2: '#2fae5f' },
  tuvanhoa: { name: 'Tử Vân Hoa', seedPrice: 35, sellPrice: 95, grow: 240, xp: 35, c1: '#d9a2ff', c2: '#8b4dff' },
  linhchi:  { name: 'Thiên Niên Linh Chi', seedPrice: 120, sellPrice: 340, grow: 600, xp: 110, c1: '#ffd76a', c2: '#ff8b2e' },
};
const HATS = {
  none:     { name: 'Không đội', price: 0 },
  nonla:    { name: 'Nón Lá', price: 150 },
  tramvan:  { name: 'Trâm Vân', price: 400 },
  kimquan:  { name: 'Kim Quan', price: 1000 },
};
const COLORS = ['#5b8cff', '#ff7d9c', '#7ddf8a', '#c9a2ff', '#ffd76a', '#ff9d5c'];
const xpNeed = (l) => Math.floor(100 * Math.pow(l, 1.5));
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cleanName = (s) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Vô Danh';

/* ---------------- DB ---------------- */
let db = {};
function loadDB() { try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = {}; } }
function saveDB() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { console.error('[db]', e.message); } }
function persistPlayer(p) {
  db[p.name] = { level: p.level, xp: p.xp, gold: p.gold, seeds: p.seeds, produce: p.produce, plots: p.plots, look: p.look, hats: p.hats, x: Math.round(p.x), y: Math.round(p.y) };
}

/* ---------------- State ---------------- */
let nextId = 1;
const players = new Map();
const farmOf = (name) => 'farm_' + name;

function newPlots() { return PLOT_POS.map(() => ({ crop: null })); }
function createPlayer(id, name) {
  const p = { id, name, mapId: 'plaza', x: 800, y: 650, dir: 0, moving: false,
    level: 1, xp: 0, gold: 100, seeds: { linhthao: 3 }, produce: {},
    plots: newPlots(), look: { color: COLORS[0], hat: 'none' }, hats: ['none'],
    lastX: 800, lastY: 650, lastMoveT: Date.now(), lastChat: 0, chatMsg: '', chatT: 0, ws: null };
  const s = db[name];
  if (s) {
    p.level = s.level || 1; p.xp = s.xp || 0; p.gold = s.gold ?? 100;
    p.seeds = s.seeds || {}; p.produce = s.produce || {};
    p.plots = (s.plots && s.plots.length === 6) ? s.plots : newPlots();
    p.look = s.look || p.look; p.hats = s.hats || ['none'];
    p.x = clamp(s.x || 800, 0, PLAZA.w); p.y = clamp(s.y || 650, 0, PLAZA.h);
    p.lastX = p.x; p.lastY = p.y;
  }
  return p;
}
function plotReady(pl) {
  if (!pl.crop) return false;
  const c = CROPS[pl.crop.id];
  const need = c.grow * (pl.crop.watered ? 0.6 : 1);
  return (Date.now() / 1000 - pl.crop.plantedAt) >= need;
}
function plotProgress(pl) {
  if (!pl.crop) return 0;
  const c = CROPS[pl.crop.id];
  const need = c.grow * (pl.crop.watered ? 0.6 : 1);
  return Math.min(1, (Date.now() / 1000 - pl.crop.plantedAt) / need);
}
function gainXp(p, amount) {
  p.xp += amount;
  let need = xpNeed(p.level);
  while (p.xp >= need) { p.xp -= need; p.level++; need = xpNeed(p.level); }
}
function farmState(p) {
  return p.plots.map((pl, i) => ({ i, crop: pl.crop ? pl.crop.id : null, ready: plotReady(pl), prog: +plotProgress(pl).toFixed(2), watered: !!(pl.crop && pl.crop.watered) }));
}
function sendFarm(p) { sendTo(p.id, { t: 'farm', plots: farmState(p), seeds: p.seeds, produce: p.produce, gold: p.gold, level: p.level, xp: Math.round(p.xp), xpNeed: xpNeed(p.level), look: p.look, hats: p.hats }); }

/* ---------------- Net ---------------- */
function sendTo(id, obj) { const p = players.get(id); if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(obj)); }
function broadcastMap(mapId, obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (p.mapId !== mapId || id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
  }
}
function nameTaken(name) { for (const [, p] of players) if (p.name === name) return true; return false; }

wss.on('connection', (ws) => {
  const id = nextId++;
  let player = null;

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      if (player) return;
      const name = cleanName(m.name);
      if (nameTaken(name)) { ws.send(JSON.stringify({ t: 'nameTaken' })); ws.close(); return; }
      const isNew = !db[name];
      player = createPlayer(id, name);
      player.ws = ws;
      players.set(id, player);
      sendTo(id, { t: 'welcome', id, crops: CROPS, hats: HATS, colors: COLORS, isNew,
        plots: PLOT_POS, plaza: PLAZA, farm: FARM });
      sendFarm(player);
      broadcastMap('plaza', { t: 'chat', sys: true, msg: `${player.name} đã đến Quảng Trường Linh Giới${isNew ? '' : ' (chào mừng trở lại)'}` });
      return;
    }
    if (!player) return;
    const now = Date.now();
    const bounds = player.mapId === 'plaza' ? PLAZA : FARM;
    if (m.t === 'move') {
      const nx = clamp(Number(m.x) || player.x, 0, bounds.w);
      const ny = clamp(Number(m.y) || player.y, 0, bounds.h);
      const dt = Math.max(0.02, (now - player.lastMoveT) / 1000);
      const maxD = PLAYER_SPEED * dt * 1.6 + 30;
      const d = dist(player.lastX, player.lastY, nx, ny);
      let fx = nx, fy = ny;
      if (d > maxD) { const r = maxD / d; fx = player.lastX + (nx - player.lastX) * r; fy = player.lastY + (ny - player.lastY) * r; }
      player.x = fx; player.y = fy; player.lastX = fx; player.lastY = fy; player.lastMoveT = now;
      player.dir = Number(m.dir) || 0; player.moving = !!m.moving;
    }
    else if (m.t === 'chat') {
      if (now - player.lastChat < 700) return;
      player.lastChat = now;
      const msg = String(m.msg || '').slice(0, 80).replace(/[<>&"]/g, '');
      if (!msg.trim()) return;
      player.chatMsg = msg; player.chatT = now;
      broadcastMap(player.mapId, { t: 'chat', id, name: player.name, msg });
    }
    else if (m.t === 'gotoFarm') {
      player.mapId = farmOf(player.name); player.x = 600; player.y = 780; player.lastX = 600; player.lastY = 780;
      sendTo(id, { t: 'mapchange', mapId: player.mapId });
      sendFarm(player);
    }
    else if (m.t === 'gotoPlaza') {
      player.mapId = 'plaza'; player.x = 800; player.y = 650; player.lastX = 800; player.lastY = 650;
      sendTo(id, { t: 'mapchange', mapId: player.mapId });
    }
    else if (m.t === 'plant') {
      const pl = player.plots[m.plot], c = CROPS[m.crop];
      if (!pl || pl.crop || !c) return;
      if ((player.seeds[m.crop] || 0) <= 0) { sendTo(id, { t: 'notice', msg: 'Hết hạt giống!' }); return; }
      if (dist(player.x, player.y, PLOT_POS[m.plot][0], PLOT_POS[m.plot][1]) > 220) { sendTo(id, { t: 'notice', msg: 'Hãy đứng gần ô đất!' }); return; }
      player.seeds[m.crop]--;
      pl.crop = { id: m.crop, plantedAt: Date.now() / 1000, watered: false };
      sendFarm(player);
    }
    else if (m.t === 'water') {
      const pl = player.plots[m.plot];
      if (!pl || !pl.crop || pl.crop.watered || plotReady(pl)) return;
      pl.crop.watered = true;
      sendTo(id, { t: 'notice', msg: 'Đã tưới linh tuyền! Cây lớn nhanh hơn.' });
      sendFarm(player);
    }
    else if (m.t === 'harvest') {
      const pl = player.plots[m.plot];
      if (!pl || !pl.crop || !plotReady(pl)) return;
      const c = CROPS[pl.crop.id];
      player.produce[pl.crop.id] = (player.produce[pl.crop.id] || 0) + 1;
      gainXp(player, c.xp);
      pl.crop = null;
      sendTo(id, { t: 'notice', msg: `Thu hoạch ${c.name}! +${c.xp} tu vi` });
      sendFarm(player);
    }
    else if (m.t === 'buySeed') {
      const c = CROPS[m.crop];
      if (!c) return;
      if (player.gold < c.seedPrice) { sendTo(id, { t: 'notice', msg: 'Không đủ linh thạch!' }); return; }
      player.gold -= c.seedPrice;
      player.seeds[m.crop] = (player.seeds[m.crop] || 0) + 1;
      sendFarm(player);
    }
    else if (m.t === 'sellProduce') {
      let earned = 0;
      for (const cid in player.produce) {
        const n = player.produce[cid] || 0;
        if (n > 0 && CROPS[cid]) { earned += n * CROPS[cid].sellPrice; player.produce[cid] = 0; }
      }
      if (earned <= 0) { sendTo(id, { t: 'notice', msg: 'Không có gì để bán!' }); return; }
      player.gold += earned;
      sendTo(id, { t: 'notice', msg: `Đã bán! +${earned} linh thạch` });
      sendFarm(player);
    }
    else if (m.t === 'buyHat') {
      const h = HATS[m.hat];
      if (!h || !m.hat || m.hat === 'none') return;
      if (player.hats.includes(m.hat)) return;
      if (player.gold < h.price) { sendTo(id, { t: 'notice', msg: 'Không đủ linh thạch!' }); return; }
      player.gold -= h.price;
      player.hats.push(m.hat);
      player.look.hat = m.hat;
      sendFarm(player);
    }
    else if (m.t === 'setLook') {
      if (m.color && COLORS.includes(m.color)) player.look.color = m.color;
      if (m.hat && player.hats.includes(m.hat)) player.look.hat = m.hat;
      sendFarm(player);
    }
  });

  ws.on('close', () => {
    if (player) { persistPlayer(player); saveDB(); players.delete(id); }
  });
  ws.on('error', () => {});
});

/* ---------------- Loop ---------------- */
let tickCount = 0;
function tick() {
  tickCount++;
  const now = Date.now();
  const byMap = {};
  for (const [, p] of players) {
    const g = byMap[p.mapId] || (byMap[p.mapId] = []);
    g.push({ id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), dir: +p.dir.toFixed(2),
      moving: p.moving, level: p.level, look: p.look,
      chat: (now - p.chatT < 5000) ? p.chatMsg : '' });
    // Day trang thai farm dinh ky de client biet cay chin
    if (tickCount % 50 === 0 && p.mapId === farmOf(p.name)) sendFarm(p);
  }
  for (const mapId in byMap) {
    const s = JSON.stringify({ t: 'state', p: byMap[mapId], online: players.size });
    for (const pl of byMap[mapId]) {
      const p = players.get(pl.id);
      if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
    }
  }
}
loadDB();
setInterval(tick, TICK_MS);
setInterval(() => { for (const [, p] of players) persistPlayer(p); saveDB(); }, 30000);
httpServer.listen(PORT, () => console.log(`[avatar-tu-tien] chay tai port ${PORT}`));
