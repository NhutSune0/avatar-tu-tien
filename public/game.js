/* Avatar Tu Tien - client: the gioi chibi, linh dien, chat */
'use strict';
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', resize); resize();

const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');
let ws = null, myId = null, myName = '';
let players = {}, mapId = 'plaza';
let CROPS = {}, HATS = {}, COLORS = [];
let PLOT_POS = [], PLAZA = { w: 1600, h: 1200 }, FARM = { w: 1200, h: 900 };
let farm = { plots: [], seeds: {}, produce: {}, gold: 0, level: 1, xp: 0, xpNeed: 100, look: { color: '#5b8cff', hat: 'none' }, hats: ['none'] };
let cam = { x: 800, y: 600 };
let keys = {}, target = null, clouds = [];
for (let i = 0; i < 7; i++) clouds.push({ x: Math.random() * 2000, y: Math.random() * 350, s: .6 + Math.random() * .8, v: 6 + Math.random() * 10 });
let mouse = { x: 0, y: 0 };
let lastMoveSent = 0;

function banner(msg) {
  const b = document.getElementById('banner');
  b.textContent = msg; b.classList.add('show');
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 2600);
}

/* ---------------- Ket noi ---------------- */
function joinGame() {
  const name = document.getElementById('name-input').value.trim();
  if (!name) { document.getElementById('login-err').textContent = 'Hãy nhập tên đã!'; return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  ws.onclose = () => { document.getElementById('login-err').textContent = 'Mất kết nối, tải lại trang nhé!'; };
}
document.getElementById('join-btn').onclick = joinGame;
document.getElementById('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });

function onMsg(m) {
  if (m.t === 'nameTaken') { document.getElementById('login-err').textContent = 'Tên này đang có người dùng!'; ws.close(); return; }
  if (m.t === 'welcome') {
    myId = m.id; CROPS = m.crops; HATS = m.hats; COLORS = m.colors;
    PLOT_POS = m.plots; PLAZA = m.plaza; FARM = m.farm;
    document.getElementById('login').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    myName = document.getElementById('name-input').value.trim();
    addChat(null, m.isNew ? 'Chào mừng đến Quảng Trường Linh Giới! Bấm nút <b>🌾 Linh Điền</b> để về vườn trồng linh thảo nhé!' : 'Chào mừng trở lại!', true);
  }
  else if (m.t === 'state') {
    const np = {};
    for (const x of m.p) np[x.id] = x;
    players = np;
  }
  else if (m.t === 'farm') {
    farm.plots = m.plots; farm.seeds = m.seeds; farm.produce = m.produce;
    farm.gold = m.gold; farm.level = m.level; farm.xp = m.xp; farm.xpNeed = m.xpNeed;
    farm.look = m.look; farm.hats = m.hats;
    document.getElementById('gold-n').textContent = farm.gold;
    document.getElementById('lvl-n').textContent = farm.level;
    if (document.getElementById('panel-shop').classList.contains('open')) renderShop();
    if (document.getElementById('panel-look').classList.contains('open')) renderLook();
    if (plotPopPlot >= 0) showPlotPop(plotPopPlot, true);
  }
  else if (m.t === 'mapchange') {
    mapId = m.mapId; target = null;
    const me = players[myId];
    cam.x = me ? me.x : 600; cam.y = me ? me.y : 600;
    hidePlotPop();
    document.getElementById('btn-go').textContent = mapId === 'plaza' ? '🌾 Linh Điền' : '🏯 Quảng Trường';
    banner(mapId === 'plaza' ? '🏯 Quảng Trường Linh Giới' : '🌾 Linh Điền Của Bạn');
  }
  else if (m.t === 'notice') banner(m.msg);
  else if (m.t === 'chat') addChat(m.name, esc(m.msg), m.sys);
}
function addChat(name, msg, sys) {
  const log = document.getElementById('chatlog');
  const d = document.createElement('div');
  d.innerHTML = sys ? `<i style="color:#a08e78">${msg}</i>` : `<b style="color:#e75d8f">${esc(name)}:</b> ${msg}`;
  log.appendChild(d);
  while (log.children.length > 40) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
const chatInput = document.getElementById('chatinput');
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() && ws) {
    ws.send(JSON.stringify({ t: 'chat', msg: chatInput.value.trim() }));
    chatInput.value = '';
  }
});

/* ---------------- Dieu khien ---------------- */
addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput || document.activeElement === document.getElementById('name-input')) return;
  keys[e.key.toLowerCase()] = true;
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
cv.addEventListener('pointerdown', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  const wx = cam.x + (e.clientX - innerWidth / 2), wy = cam.y + (e.clientY - innerHeight / 2);
  // Bam cong dich chuyen?
  if (mapId === 'plaza' && Math.hypot(wx - 1300, wy - 300) < 70) { ws.send(JSON.stringify({ t: 'gotoFarm' })); return; }
  if (mapId !== 'plaza' && Math.hypot(wx - 600, wy - 830) < 70) { ws.send(JSON.stringify({ t: 'gotoPlaza' })); return; }
  // Bam NPC shop?
  if (mapId === 'plaza' && Math.hypot(wx - 400, wy - 420) < 60) { openShop(); return; }
  // Bam o dat?
  if (mapId !== 'plaza') {
    for (const pl of farm.plots) {
      const [px, py] = PLOT_POS[pl.i];
      if (Math.hypot(wx - px, wy - py) < 55) { showPlotPop(pl.i, false); return; }
    }
  }
  hidePlotPop();
  target = { x: Math.max(20, Math.min((mapId === 'plaza' ? PLAZA.w : FARM.w) - 20, wx)),
             y: Math.max(20, Math.min((mapId === 'plaza' ? PLAZA.h : FARM.h) - 20, wy)) };
});
addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

document.getElementById('btn-go').onclick = () => {
  if (!ws) return;
  ws.send(JSON.stringify({ t: mapId === 'plaza' ? 'gotoFarm' : 'gotoPlaza' }));
};
document.getElementById('btn-shop').onclick = openShop;
document.getElementById('btn-look').onclick = () => { renderLook(); togglePanel('look'); };
document.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => x.closest('.panel').classList.remove('open')));
function togglePanel(id) {
  const p = document.getElementById('panel-' + id);
  const was = p.classList.contains('open');
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('open'));
  if (!was) p.classList.add('open');
}

/* ---------------- Shop / Look ---------------- */
function openShop() { renderShop(); togglePanel('shop'); }
function renderShop() {
  const b = document.getElementById('shop-body');
  let h = '<div style="font-weight:bold;color:#8a5a3a;margin:8px 0 4px">🌱 Hạt giống</div>';
  for (const id in CROPS) {
    const c = CROPS[id];
    h += `<div class="shop-row"><span><b style="color:${c.c2}">${c.name}</b><br><small style="color:#a08e78">Có: ${farm.seeds[id] || 0} hạt · Thu: ${c.sellPrice} 💰</small></span><button data-seed="${id}">${c.seedPrice} 💰</button></div>`;
  }
  h += '<div style="font-weight:bold;color:#8a5a3a;margin:12px 0 4px">🎩 Mũ</div>';
  for (const id in HATS) {
    if (id === 'none') continue;
    const hh = HATS[id], owned = farm.hats.includes(id);
    h += `<div class="shop-row"><span>${hh.name}</span><button data-hat="${id}" ${owned ? 'class="worn" disabled' : ''}>${owned ? 'Đã có' : hh.price + ' 💰'}</button></div>`;
  }
  const totalProduce = Object.values(farm.produce).reduce((a, b) => a + b, 0);
  h += `<div style="margin-top:12px"><button id="sell-all" style="width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#ffd76a,#f5a623);color:#fff;font-weight:bold;cursor:pointer;font-size:15px">Bán hết nông sản (${totalProduce})</button></div>`;
  b.innerHTML = h;
  b.querySelectorAll('[data-seed]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'buySeed', crop: x.dataset.seed })));
  b.querySelectorAll('[data-hat]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'buyHat', hat: x.dataset.hat })));
  const sa = document.getElementById('sell-all');
  if (sa) sa.onclick = () => ws.send(JSON.stringify({ t: 'sellProduce' }));
}
function renderLook() {
  const b = document.getElementById('look-body');
  let h = '<div style="font-weight:bold;color:#8a5a3a">🎨 Màu áo</div><div class="look-swatches">';
  for (const c of COLORS) h += `<div class="swatch ${farm.look.color === c ? 'sel' : ''}" data-color="${c}" style="background:${c}"></div>`;
  h += '</div><div style="font-weight:bold;color:#8a5a3a">🎩 Mũ đang có</div>';
  for (const id of farm.hats) {
    const worn = farm.look.hat === id;
    h += `<div class="hat-row"><span>${HATS[id].name}</span><button data-wear="${id}" class="${worn ? 'worn' : ''}">${worn ? 'Đang đội' : 'Đội'}</button></div>`;
  }
  b.innerHTML = h;
  b.querySelectorAll('[data-color]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'setLook', color: x.dataset.color })));
  b.querySelectorAll('[data-wear]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'setLook', hat: x.dataset.wear })));
}

/* ---------------- Plot popup ---------------- */
let plotPopPlot = -1;
function showPlotPop(i, refresh) {
  const pl = farm.plots[i]; if (!pl) return;
  plotPopPlot = i;
  const [px, py] = PLOT_POS[i];
  const sx = px - cam.x + innerWidth / 2, sy = py - cam.y + innerHeight / 2 - 130;
  const pop = document.getElementById('plot-pop');
  pop.style.display = 'block';
  pop.style.left = Math.max(10, Math.min(innerWidth - 200, sx - 85)) + 'px';
  pop.style.top = Math.max(60, sy) + 'px';
  let h = `<span class="x" id="pp-x">✕</span><div class="pp-title">🌱 Ô đất ${i + 1}</div>`;
  if (!pl.crop) {
    h += '<div style="font-size:12px;color:#a08e78">Đất trống — gieo hạt gì?</div>';
    for (const id in CROPS) {
      const c = CROPS[id], n = farm.seeds[id] || 0;
      h += `<button data-plant="${id}" ${n <= 0 ? 'disabled style="opacity:.4"' : ''}>Gieo ${c.name} (${n})</button>`;
    }
  } else {
    const c = CROPS[pl.crop];
    h += `<div style="font-size:12px;color:#a08e78">${c.name} ${pl.ready ? '— <b style="color:#4ecb71">thu hoạch được!</b>' : ''}</div>`;
    h += `<div class="prog"><div style="width:${Math.round(pl.prog * 100)}%"></div></div>`;
    if (pl.ready) h += `<button class="gold" data-harvest="${i}">🧺 Thu hoạch</button>`;
    else if (!pl.watered) h += `<button data-water="${i}">💧 Tưới linh tuyền</button>`;
    else h += `<div style="font-size:12px;color:#a08e78;margin-top:6px">Đã tưới, đang lớn...</div>`;
  }
  pop.innerHTML = h;
  document.getElementById('pp-x').onclick = hidePlotPop;
  pop.querySelectorAll('[data-plant]').forEach(x => x.onclick = () => { ws.send(JSON.stringify({ t: 'plant', plot: i, crop: x.dataset.plant })); });
  pop.querySelectorAll('[data-water]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'water', plot: i })));
  pop.querySelectorAll('[data-harvest]').forEach(x => x.onclick = () => ws.send(JSON.stringify({ t: 'harvest', plot: i })));
}
function hidePlotPop() { plotPopPlot = -1; document.getElementById('plot-pop').style.display = 'none'; }

/* ---------------- Ve ---------------- */
function drawChibi(p, t, isNpc) {
  const x = p.x, y = p.y;
  const bob = p.moving ? Math.abs(Math.sin(t * 10)) * -3 : Math.sin(t * 2 + x) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 5, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y + bob);
  const col = (p.look && p.look.color) || '#5b8cff';
  const step = p.moving ? Math.sin(t * 10) * 3 : 0;
  ctx.fillStyle = '#6b5138';
  ctx.fillRect(-9, -5 + step * .4, 7, 7); ctx.fillRect(2, -5 - step * .4, 7, 7);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-11, -28); ctx.lineTo(11, -28); ctx.lineTo(15, -2); ctx.lineTo(-15, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-11, -28, 5, 26);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-11, -15, 22, 4);
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath(); ctx.arc(0, -40, 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.arc(0, -42, 14, Math.PI * 1.03, Math.PI * 1.97); ctx.fill();
  ctx.beginPath(); ctx.arc(-14, -40, 4, 0, 7); ctx.arc(14, -40, 4, 0, 7); ctx.fill();
  const ex = Math.cos(p.dir || 0) * 2.5;
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath(); ctx.arc(-5 + ex, -39, 2.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(5 + ex, -39, 2.2, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,140,140,.55)';
  ctx.beginPath(); ctx.arc(-9 + ex, -34, 2.6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(9 + ex, -34, 2.6, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a05a3a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ex, -33, 4, .3, Math.PI - .3); ctx.stroke();
  const hat = p.look && p.look.hat;
  if (hat === 'nonla') {
    ctx.fillStyle = '#d9b86a';
    ctx.beginPath(); ctx.moveTo(-20, -48); ctx.lineTo(20, -48); ctx.lineTo(0, -66); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a88f4a'; ctx.lineWidth = 2; ctx.stroke();
  } else if (hat === 'tramvan') {
    ctx.strokeStyle = '#8b4dff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, -52); ctx.lineTo(16, -62); ctx.stroke();
    ctx.fillStyle = '#c26bff'; ctx.beginPath(); ctx.arc(16, -62, 4, 0, 7); ctx.fill();
  } else if (hat === 'kimquan') {
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(-10, -58, 20, 8);
    ctx.beginPath(); ctx.moveTo(-10, -58); ctx.lineTo(-6, -66); ctx.lineTo(-2, -58); ctx.lineTo(2, -66); ctx.lineTo(6, -58); ctx.lineTo(10, -66); ctx.lineTo(10, -58); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = isNpc ? '#8a5a3a' : (p.id === myId ? '#e75d8f' : '#5a7a9a');
  ctx.fillText((isNpc ? '🏪 ' : '') + p.name + (p.level ? ' · Lv' + p.level : ''), x, y - 62);
  if (p.chat) {
    ctx.font = '12px sans-serif';
    const w = ctx.measureText(p.chat).width + 18;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.strokeStyle = '#ffcfdd'; ctx.lineWidth = 2;
    roundRect(x - w / 2, y - 108, w, 26, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a4a3a';
    ctx.fillText(p.chat, x, y - 90);
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawTree(x, y, s, t) {
  const sw = Math.sin(t * 1.2 + x) * 3;
  ctx.fillStyle = '#8a5f3d'; ctx.fillRect(x - 7 * s, y - 46 * s, 14 * s, 46 * s);
  ctx.fillStyle = '#ffb3c9';
  for (const [ox, oy, r] of [[-18, -52, 22], [18, -52, 22], [0, -66, 26]]) {
    ctx.beginPath(); ctx.arc(x + ox * s + sw, y + oy * s, r * s, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#ff8fb3';
  for (const [ox, oy, r] of [[-8, -58, 12], [12, -48, 10]]) {
    ctx.beginPath(); ctx.arc(x + ox * s + sw, y + oy * s, r * s, 0, 7); ctx.fill();
  }
}
function drawLantern(x, y, t) {
  ctx.fillStyle = '#6b5138'; ctx.fillRect(x - 3, y - 70, 6, 70);
  const gl = .7 + .3 * Math.sin(t * 3 + x);
  ctx.fillStyle = `rgba(255,120,120,${gl})`;
  ctx.shadowColor = '#ff5d5d'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(x, y - 78, 10, 13, 0, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#a03a3a'; ctx.fillRect(x - 6, y - 94, 12, 5); ctx.fillRect(x - 6, y - 68, 12, 5);
}
function drawPortal(x, y, label, t) {
  const pulse = .7 + .3 * Math.sin(t * 3);
  ctx.save(); ctx.translate(x, y - 50);
  ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 8; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 22 * pulse;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 50, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#e9e2ff'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.ellipse(0, 0, 18, 36, 0, 0, 7); ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#6d3fd4';
  ctx.fillText(label, x, y - 115);
}
function drawPlot(i, t) {
  const [x, y] = PLOT_POS[i];
  const pl = farm.plots[i] || {};
  ctx.fillStyle = '#a9764f';
  roundRect(x - 52, y - 34, 104, 68, 12); ctx.fill();
  ctx.fillStyle = '#8f5f3a';
  for (let r = 0; r < 3; r++) { ctx.fillRect(x - 42, y - 20 + r * 20, 84, 5); }
  if (pl.crop) {
    const c = CROPS[pl.crop];
    const s = pl.prog;
    const h = 8 + s * 30;
    if (s < 0.35) {
      ctx.strokeStyle = c.c2; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x, y - 10 - h); ctx.stroke();
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.ellipse(x - 7, y - 14 - h, 7, 4, -.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 7, y - 14 - h, 7, 4, .5, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = c.c2;
      ctx.beginPath(); ctx.arc(x, y - 16 - h / 2, 10 + s * 10, 0, 7); ctx.fill();
      ctx.fillStyle = c.c1;
      ctx.beginPath(); ctx.arc(x - 4, y - 20 - h / 2, 6 + s * 6, 0, 7); ctx.fill();
      if (pl.ready) {
        const tw = .6 + .4 * Math.sin(t * 5 + i);
        ctx.fillStyle = `rgba(255,215,106,${tw})`;
        ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(x, y - 20 - h / 2, 5, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (pl.watered && !pl.ready) {
      ctx.fillStyle = 'rgba(120,200,255,.8)';
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('💧', x + 34, y - 30);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('+', x, y + 7);
  }
}
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, innerHeight);
  if (mapId === 'plaza') {
    g.addColorStop(0, '#8ed4ff'); g.addColorStop(.55, '#c8ecff'); g.addColorStop(1, '#b8e6b8');
  } else {
    g.addColorStop(0, '#9edeff'); g.addColorStop(.5, '#d0f0ff'); g.addColorStop(1, '#a8dd9a');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(-cam.x * .9, -cam.y * .9);
  ctx.fillStyle = '#ffdf6b'; ctx.shadowColor = '#ffef9e'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(200, 140, 44, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (const c of clouds) {
    const cx = ((c.x + t * c.v) % 2200) - 200;
    ctx.beginPath();
    ctx.arc(cx, c.y, 26 * c.s, 0, 7); ctx.arc(cx + 30 * c.s, c.y + 6, 20 * c.s, 0, 7); ctx.arc(cx - 30 * c.s, c.y + 6, 20 * c.s, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  const B = mapId === 'plaza' ? PLAZA : FARM;
  if (mapId === 'plaza') {
    ctx.fillStyle = '#e8dcc4';
    ctx.beginPath(); ctx.ellipse(800, 620, 420, 300, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d4c4a4'; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#dccfae';
    ctx.beginPath(); ctx.ellipse(800, 620, 300, 200, 0, 0, 7); ctx.fill();
    drawTree(250, 350, 1.2, t); drawTree(1350, 850, 1.4, t); drawTree(300, 950, 1, t); drawTree(1200, 200, .9, t);
    drawLantern(550, 500, t); drawLantern(1050, 500, t); drawLantern(550, 780, t); drawLantern(1050, 780, t);
    ctx.fillStyle = '#7ec8e8';
    ctx.beginPath(); ctx.ellipse(1150, 950, 130, 80, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a8d8b8'; ctx.lineWidth = 8; ctx.stroke();
    drawPortal(1300, 300, '🌾 Linh Điền', t);
    drawChibi({ x: 400, y: 420, dir: 0, moving: false, look: { color: '#e8a05c', hat: 'none' }, name: 'Chủ Tiệm', chat: '' }, t, true);
  } else {
    ctx.fillStyle = '#9ed07e';
    roundRect(180, 220, 840, 560, 30); ctx.fill();
    ctx.strokeStyle = '#7ab55c'; ctx.lineWidth = 10; ctx.stroke();
    ctx.fillStyle = '#c4a06a';
    roundRect(880, 180, 220, 130, 12); ctx.fill();
    ctx.fillStyle = '#a87f4e';
    ctx.beginPath(); ctx.moveTo(870, 180); ctx.lineTo(990, 110); ctx.lineTo(1110, 180); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7ec8e8'; ctx.fillRect(960, 230, 60, 50);
    for (let i = 0; i < 6; i++) farm.plots[i] && drawPlot(i, t);
    ctx.fillStyle = '#8a5f3d';
    ctx.beginPath(); ctx.arc(200, 700, 34, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a3d24'; ctx.beginPath(); ctx.arc(200, 700, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#7ec8e8'; ctx.beginPath(); ctx.arc(200, 700, 14, 0, 7); ctx.fill();
    drawPortal(600, 830, '🏯 Quảng Trường', t);
    drawTree(150, 250, 1, t); drawTree(1050, 700, 1.1, t);
  }
  ctx.strokeStyle = '#8fce6e'; ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, B.w, B.h);
  ctx.restore();
}
/* ---------------- Vong lap ---------------- */
let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - lastT) / 1000 || .016);
  lastT = now;
  const t = now / 1000;
  const me = players[myId];
  const B = mapId === 'plaza' ? PLAZA : FARM;
  if (me && ws && ws.readyState === 1) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (dx || dy) target = null;
    else if (target) {
      const ddx = target.x - me.x, ddy = target.y - me.y, d = Math.hypot(ddx, ddy);
      if (d < 8) { target = null; }
      else { dx = ddx / d; dy = ddy / d; }
    }
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    const SPEED = 220;
    me.x = clamp(me.x + dx * SPEED * dt, 20, B.w - 20);
    me.y = clamp(me.y + dy * SPEED * dt, 20, B.h - 20);
    me.moving = m > .1;
    if (me.moving) me.dir = Math.atan2(dy, dx);
    if (now - lastMoveSent > 100) {
      lastMoveSent = now;
      ws.send(JSON.stringify({ t: 'move', x: Math.round(me.x), y: Math.round(me.y), dir: +me.dir.toFixed(2), moving: me.moving }));
    }
    cam.x += (me.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (me.y - cam.y) * Math.min(1, dt * 6);
  }
  drawBackground(t);
  ctx.save(); ctx.translate(-cam.x + innerWidth / 2, -cam.y + innerHeight / 2);
  const order = Object.values(players).sort((a, b) => a.y - b.y);
  for (const p of order) drawChibi(p, t, false);
  ctx.restore();
}
requestAnimationFrame(loop);
