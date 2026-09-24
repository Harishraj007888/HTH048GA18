/* ═══════════════════════════════════════════════════════════════
   HIGHWAY SAFETY MONITORING — app.js  v3
   Fully matched to index.html v3 + styles.css v3
   ═══════════════════════════════════════════════════════════════
   • Loader screen with progress bar
   • Cinematic highway canvas (night road, cars, stars, shimmer)
   • Floating particles
   • MQTT WebSocket → test.mosquitto.org:8081
   • Real-time dashboard rendering (all v3 class/ID names)
   • Excel export via SheetJS (2 sheets)
   • Live data table
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
const CFG = {
  BROKER      : 'wss://test.mosquitto.org:8081',
  TOPIC       : 'highway/data',
  MAX_CHART   : 40,
  MAX_LOG     : 60,
  MAX_RECORDS : 500,
};

/* ── STATE ──────────────────────────────────────────────────── */
let mqttClient  = null;
let msgCount    = 0;
let logCount    = 0;
let speedChart  = null;
let distChart   = null;
let dataRecords = [];

const timeLabels = [];
const speedHist  = [];
const dist1Hist  = [];
const dist2Hist  = [];

/* ── DOM SHORTCUT ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* All DOM refs — matched to index.html v3 IDs exactly */
const D = {
  /* loader */
  loaderScreen : $('loaderScreen'),
  loaderBar    : $('loaderBar'),
  loaderStatus : $('loaderStatus'),

  /* header */
  statusDot    : $('statusDot'),
  statusText   : $('statusText'),
  liveTime     : $('liveTime'),
  lastUpdate   : $('lastUpdate'),
  msgCount     : $('msgCount'),
  footerStatus : $('footerStatus'),

  /* alert */
  alertBanner  : $('alertBanner'),   /* id="alertBanner" */
  alertIcon    : $('alertIcon'),
  alertMsg     : $('alertMessage'),

  /* speed kpi */
  speedKmh     : $('speedKmh'),
  speedMps     : $('speedMps'),
  speedBar     : $('speedBar'),
  speedGlow    : $('speedGlow'),

  /* status kpi */
  statusBadge  : $('statusBadge'),
  statusIcon   : $('statusBadgeIcon'),
  statusTxt    : $('statusBadgeText'),
  activeSensor : $('activeSensor'),

  /* distance kpi */
  minDist      : $('minDist'),
  distRing     : $('distRing'),
  ringLabel    : $('ringLabel'),

  /* device kpi */
  deviceName   : $('deviceName'),
  recordCount  : $('recordCount'),

  /* ultrasonic sensors */
  dist1   : $('dist1'),    dist2   : $('dist2'),
  bar1    : $('bar1'),     bar2    : $('bar2'),
  s1dot   : $('s1dot'),    s2dot   : $('s2dot'),   /* class: us-ind */
  s1label : $('s1label'),  s2label : $('s2label'), /* class: us-tag */

  /* IR */
  ir1Val  : $('ir1Val'),   ir2Val  : $('ir2Val'),

  /* LEDs — class: led-orb */
  greenLed    : $('greenLed'),
  yellowLed   : $('yellowLed'),
  redLed      : $('redLed'),
  /* buzzer — class: buzzer-cell */
  buzzerOrb   : $('buzzerOrb'),
  buzzerIcon  : $('buzzerIcon'),
  /* state labels — class: led-state */
  greenState  : $('greenState'),
  yellowState : $('yellowState'),
  redState    : $('redState'),
  buzzerState : $('buzzerState'),

  /* log terminal */
  logBox      : $('logBox'),

  /* table */
  tableBody   : $('tableBody'),
  recordBadge : $('recordBadge'),
};

/* ══════════════════════════════════════════════════════════════
   1. LOADER SCREEN
══════════════════════════════════════════════════════════════ */
function runLoader() {
  const msgs = [
    'Initializing sensors...',
    'Loading highway modules...',
    'Connecting to MQTT broker...',
    'Rendering dashboard...',
    'System ready!',
  ];
  let pct = 0;
  let idx = 0;

  const iv = setInterval(() => {
    pct += 20;
    if (D.loaderBar)    D.loaderBar.style.width = pct + '%';
    if (D.loaderStatus) D.loaderStatus.textContent = msgs[idx++] || 'Ready';
    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        if (D.loaderScreen) D.loaderScreen.classList.add('hidden');
      }, 500);
    }
  }, 380);
}

/* ══════════════════════════════════════════════════════════════
   2. ANIMATED HIGHWAY CANVAS BACKGROUND
══════════════════════════════════════════════════════════════ */
(function initHighwayCanvas() {
  const canvas = $('highwayCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Road config ── */
  const NUM_LANES = 4;
  const DASH_H    = 60;
  const DASH_GAP  = 50;
  const DASH_W    = 4;

  /* Lane dash offsets */
  const lanes = [];
  for (let i = 1; i < NUM_LANES; i++) {
    lanes.push({ offset: Math.random() * (DASH_H + DASH_GAP) });
  }

  /* Cars driving toward viewer */
  const CAR_COLS = ['#2979ff','#00e5ff','#00e676','#ff6d00','#d500f9','#ff1744'];
  const CARS = [];
  function spawnCar() {
    const lane = Math.floor(Math.random() * NUM_LANES);
    CARS.push({
      lane,
      y      : -50,
      speed  : 2.5 + Math.random() * 4,
      colour : CAR_COLS[Math.floor(Math.random() * CAR_COLS.length)],
      w      : 18 + Math.random() * 6,
      h      : 36 + Math.random() * 12,
      glow   : Math.random() > 0.35,
    });
  }
  for (let i = 0; i < 7; i++) { spawnCar(); CARS[i].y = Math.random() * window.innerHeight; }

  /* Oncoming headlights */
  const LIGHTS = [];
  function spawnLight() {
    const lane = Math.floor(Math.random() * NUM_LANES);
    LIGHTS.push({ lane, y: window.innerHeight + 20, speed: 1.8 + Math.random() * 2.2, alpha: 0.4 + Math.random() * 0.45 });
  }
  for (let i = 0; i < 5; i++) { spawnLight(); LIGHTS[i].y = Math.random() * window.innerHeight; }

  /* Stars */
  const STARS = Array.from({ length: 140 }, () => ({
    x: Math.random(), y: Math.random() * 0.44,
    r: 0.35 + Math.random() * 1.3,
    a: 0.25 + Math.random() * 0.55,
    t: Math.random() * Math.PI * 2,
    s: 0.004 + Math.random() * 0.014,
  }));

  /* City buildings on horizon */
  const BUILDINGS = Array.from({ length: 18 }, (_, i) => ({
    x    : i / 17,
    w    : 0.02 + Math.random() * 0.04,
    h    : 0.04 + Math.random() * 0.12,
    col  : Math.random() > 0.5 ? '#0d2040' : '#0a1830',
    lights: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () => ({
      ox: Math.random(), oy: Math.random() * 0.7 + 0.1,
      on: Math.random() > 0.4,
    })),
  }));

  /* Lamp posts */
  const LAMPS = Array.from({ length: 6 }, (_, i) => ({ t: i / 5 }));

  let frame = 0;

  function draw() {
    requestAnimationFrame(draw);
    frame++;
    const W = canvas.width;
    const H = canvas.height;

    /* ── Sky ── */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,    '#000308');
    sky.addColorStop(0.42, '#010916');
    sky.addColorStop(0.52, '#040d20');
    sky.addColorStop(1,    '#020610');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* ── Stars ── */
    STARS.forEach(s => {
      s.t += s.s;
      const a = s.a * (0.55 + 0.45 * Math.sin(s.t));
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,230,255,${a})`;
      ctx.fill();
    });

    /* ── Horizon glow ── */
    const hY = H * 0.50;
    const hg = ctx.createRadialGradient(W * 0.5, hY, 0, W * 0.5, hY, W * 0.65);
    hg.addColorStop(0,   'rgba(41,121,255,0.09)');
    hg.addColorStop(0.4, 'rgba(0,229,255,0.04)');
    hg.addColorStop(1,   'transparent');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, H);

    /* ── City silhouette ── */
    const skylineY = H * 0.48;
    BUILDINGS.forEach(b => {
      const bx = b.x * W;
      const bw = b.w * W;
      const bh = b.h * H;
      const by = skylineY - bh;
      ctx.fillStyle = b.col;
      ctx.fillRect(bx - bw / 2, by, bw, bh);
      /* windows */
      b.lights.forEach(lw => {
        if (!lw.on) return;
        const lx = bx - bw / 2 + lw.ox * bw;
        const ly = by + lw.oy * bh;
        ctx.fillStyle = 'rgba(255,235,150,0.55)';
        ctx.fillRect(lx, ly, 2.5, 3.5);
      });
    });

    /* ── Road ── */
    const roadTop  = H * 0.48;
    const rWTop    = W * 0.17;
    const rWBot    = W * 0.88;
    const cx       = W * 0.5;

    /* road fill */
    const rg = ctx.createLinearGradient(0, roadTop, 0, H);
    rg.addColorStop(0,   '#080e1c');
    rg.addColorStop(0.3, '#0b1220');
    rg.addColorStop(1,   '#101826');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(cx - rWTop / 2, roadTop);
    ctx.lineTo(cx + rWTop / 2, roadTop);
    ctx.lineTo(cx + rWBot / 2, H);
    ctx.lineTo(cx - rWBot / 2, H);
    ctx.closePath();
    ctx.fill();

    /* road edge neon lines */
    [
      [cx - rWBot / 2, cx - rWTop / 2],
      [cx + rWTop / 2, cx + rWBot / 2],
    ].forEach(([xb, xt]) => {
      const eg = ctx.createLinearGradient(xb, H, xt, roadTop);
      eg.addColorStop(0,   'rgba(41,121,255,0.6)');
      eg.addColorStop(0.6, 'rgba(0,229,255,0.3)');
      eg.addColorStop(1,   'rgba(0,229,255,0)');
      ctx.strokeStyle = eg;
      ctx.lineWidth   = 2.5;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#2979ff';
      ctx.beginPath();
      ctx.moveTo(xb, H);
      ctx.lineTo(xt, roadTop);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });

    /* ── Lane dashes ── */
    const lFrac = 1 / NUM_LANES;
    lanes.forEach((ln, li) => {
      ln.offset = (ln.offset + 3.2) % (DASH_H + DASH_GAP);
      const t   = (li + 1) * lFrac;
      const xt  = cx - rWTop / 2 + rWTop * t;
      const xb  = cx - rWBot / 2 + rWBot * t;
      let y     = H + ln.offset;
      while (y > roadTop) {
        const prog = 1 - (y - roadTop) / (H - roadTop);
        const x    = xt + (xb - xt) * (1 - prog);
        const dh   = DASH_H * (0.28 + 0.72 * (1 - prog));
        const dw   = Math.max(1, DASH_W * (1 - prog * 0.65));
        const a    = 0.12 + 0.38 * (1 - prog);
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(x - dw / 2, y - dh, dw, dh);
        y -= DASH_H + DASH_GAP;
      }
    });

    /* ── Lamp posts ── */
    LAMPS.forEach(lp => {
      const progress = lp.t;
      const x   = cx - rWBot / 2 + rWBot * progress;
      const yBase = H;
      const yTop  = roadTop + (H - roadTop) * (1 - progress) * 0.4;
      const sc    = 0.3 + 0.7 * progress;
      /* pole */
      ctx.strokeStyle = `rgba(80,110,160,${0.3 * sc})`;
      ctx.lineWidth   = 1.5 * sc;
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x, yTop);
      ctx.stroke();
      /* lamp glow */
      const lg = ctx.createRadialGradient(x, yTop, 0, x, yTop, 28 * sc);
      lg.addColorStop(0,   `rgba(255,240,160,${0.5 * sc})`);
      lg.addColorStop(1,   'transparent');
      ctx.fillStyle = lg;
      ctx.fillRect(x - 28 * sc, yTop - 28 * sc, 56 * sc, 56 * sc);
    });

    /* ── Helpers ── */
    function laneX(laneIdx, y) {
      const t    = (laneIdx + 0.5) / NUM_LANES;
      const prog = (y - roadTop) / (H - roadTop);
      const xt   = cx - rWTop / 2 + rWTop * t;
      const xb   = cx - rWBot / 2 + rWBot * t;
      return xt + (xb - xt) * prog;
    }
    function carScale(y) { return Math.max(0.12, (y - roadTop) / (H - roadTop)); }

    /* ── Cars ── */
    if (frame % 85 === 0) spawnCar();
    for (let i = CARS.length - 1; i >= 0; i--) {
      const c = CARS[i];
      c.y += c.speed;
      if (c.y > H + 70) { CARS.splice(i, 1); continue; }
      const sc = carScale(c.y);
      const x  = laneX(c.lane, c.y);
      const cw = c.w * sc;
      const ch = c.h * sc;
      /* halo */
      if (c.glow) {
        const hg = ctx.createRadialGradient(x, c.y, 0, x, c.y, cw * 3);
        hg.addColorStop(0,   c.colour + '33');
        hg.addColorStop(1,   'transparent');
        ctx.fillStyle = hg;
        ctx.fillRect(x - cw * 3, c.y - ch * 1.5, cw * 6, ch * 3);
      }
      /* body */
      ctx.fillStyle = c.colour + 'cc';
      ctx.beginPath();
      ctx.roundRect(x - cw / 2, c.y - ch, cw, ch, cw * 0.22);
      ctx.fill();
      /* roof */
      ctx.fillStyle = c.colour + '55';
      ctx.beginPath();
      ctx.roundRect(x - cw * 0.3, c.y - ch * 0.92, cw * 0.6, ch * 0.48, cw * 0.14);
      ctx.fill();
      /* taillights */
      [x - cw * 0.26, x + cw * 0.26].forEach(lx => {
        ctx.beginPath();
        ctx.arc(lx, c.y - ch * 0.06, cw * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,245,180,0.95)';
        ctx.fill();
        /* light cone */
        const cone = ctx.createRadialGradient(lx, c.y - ch * 0.06, 0, lx, c.y - ch * 0.06, cw * 2);
        cone.addColorStop(0,   'rgba(255,245,180,0.12)');
        cone.addColorStop(1,   'transparent');
        ctx.fillStyle = cone;
        ctx.fillRect(lx - cw * 2, c.y - ch * 0.06 - cw * 2, cw * 4, cw * 4);
      });
    }

    /* ── Oncoming lights ── */
    if (frame % 110 === 0) spawnLight();
    for (let i = LIGHTS.length - 1; i >= 0; i--) {
      const l  = LIGHTS[i];
      l.y -= l.speed;
      if (l.y < roadTop - 30) { LIGHTS.splice(i, 1); continue; }
      const sc   = carScale(l.y);
      const x    = laneX(l.lane, l.y);
      const size = 16 * sc;
      /* beam cone */
      const beam = ctx.createRadialGradient(x, l.y, 0, x, l.y, size * 7);
      beam.addColorStop(0,   `rgba(255,248,210,${l.alpha * sc * 0.9})`);
      beam.addColorStop(1,   'transparent');
      ctx.fillStyle = beam;
      ctx.fillRect(x - size * 7, l.y - size * 7, size * 14, size * 14);
      /* dots */
      [x - size * 0.55, x + size * 0.55].forEach(lx => {
        ctx.beginPath();
        ctx.arc(lx, l.y, size * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,248,210,${Math.min(1, l.alpha * 2.2)})`;
        ctx.fill();
      });
    }

    /* ── Road reflection shimmer ── */
    const shimX = (Math.sin(frame * 0.007) * 0.28 + 0.5) * W;
    const shim  = ctx.createRadialGradient(shimX, H * 0.8, 0, shimX, H * 0.8, W * 0.28);
    shim.addColorStop(0,   'rgba(41,121,255,0.07)');
    shim.addColorStop(1,   'transparent');
    ctx.fillStyle = shim;
    ctx.fillRect(0, H * 0.48, W, H);

    /* ── Fog near horizon ── */
    const fog = ctx.createLinearGradient(0, roadTop - 20, 0, roadTop + 40);
    fog.addColorStop(0,   'transparent');
    fog.addColorStop(0.5, 'rgba(10,20,50,0.18)');
    fog.addColorStop(1,   'transparent');
    ctx.fillStyle = fog;
    ctx.fillRect(0, roadTop - 20, W, 60);
  }

  draw();
})();

/* ══════════════════════════════════════════════════════════════
   3. FLOATING PARTICLES
══════════════════════════════════════════════════════════════ */
(function initParticles() {
  const container = $('particles');
  if (!container) return;
  const COLS  = ['#2979ff','#00e5ff','#00e676','#d500f9','#ff6d00'];
  const COUNT = 24;
  for (let i = 0; i < COUNT; i++) {
    const el  = document.createElement('div');
    el.className = 'particle';
    const sz  = 2 + Math.random() * 4;
    const dur = 13 + Math.random() * 20;
    const del = Math.random() * 22;
    const col = COLS[Math.floor(Math.random() * COLS.length)];
    Object.assign(el.style, {
      width             : sz + 'px',
      height            : sz + 'px',
      left              : Math.random() * 100 + '%',
      background        : col,
      boxShadow         : `0 0 ${sz * 2.5}px ${col}`,
      animationDuration : dur + 's',
      animationDelay    : `-${del}s`,
      opacity           : (0.25 + Math.random() * 0.5).toString(),
    });
    container.appendChild(el);
  }
})();

/* ══════════════════════════════════════════════════════════════
   4. LIVE CLOCK
══════════════════════════════════════════════════════════════ */
function startClock() {
  const tick = () => {
    if (D.liveTime) D.liveTime.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

function tsNow() { return new Date().toLocaleTimeString('en-US', { hour12: false }); }
function dtNow() {
  return new Date().toLocaleString('en-GB', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false,
  });
}

/* ══════════════════════════════════════════════════════════════
   5. LOG  — uses .log-row / .log-t / .log-m  (v3 CSS names)
══════════════════════════════════════════════════════════════ */
function addLog(text, type = 'info') {
  if (!D.logBox) return;
  /* remove idle placeholder */
  const idle = D.logBox.querySelector('.log-idle');
  if (idle) idle.remove();

  const el = document.createElement('div');
  /* CSS class mapping:  info → (plain)   ok → ok   error → err */
  const cls = type === 'connected' ? 'ok' : type === 'error' ? 'err' : '';
  el.className = `log-row ${cls}`;
  el.innerHTML =
    `<span class="log-t">${tsNow()}</span>` +
    `<span class="log-m">${escHtml(text)}</span>`;
  D.logBox.prepend(el);

  logCount++;
  const kids = D.logBox.children;
  while (kids.length > CFG.MAX_LOG) D.logBox.removeChild(kids[kids.length - 1]);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ══════════════════════════════════════════════════════════════
   6. CONNECTION STATUS
══════════════════════════════════════════════════════════════ */
function setConnStatus(state) {
  if (!D.statusDot) return;
  /* v3 uses class "conn-dot" on the dot — reset by clearing all state classes */
  D.statusDot.className = 'conn-dot';

  switch (state) {
    case 'connecting':
      D.statusText.textContent    = 'Connecting...';
      D.footerStatus.textContent  = '● Connecting';
      D.footerStatus.className    = 'ft-status';
      break;
    case 'connected':
      D.statusDot.classList.add('connected');
      D.statusText.textContent    = 'Connected';
      D.footerStatus.textContent  = '● Connected';
      D.footerStatus.className    = 'ft-status';
      break;
    case 'reconnecting':
      D.statusText.textContent    = 'Reconnecting...';
      D.footerStatus.textContent  = '● Reconnecting';
      D.footerStatus.className    = 'ft-status';
      break;
    case 'error':
    case 'disconnected':
      D.statusDot.classList.add('error');
      D.statusText.textContent    = state === 'error' ? 'Error' : 'Disconnected';
      D.footerStatus.textContent  = '● ' + (state === 'error' ? 'Error' : 'Disconnected');
      D.footerStatus.className    = 'ft-status error';
      break;
  }
}

/* ══════════════════════════════════════════════════════════════
   7. CHARTS
══════════════════════════════════════════════════════════════ */
function initCharts() {
  const grid = 'rgba(255,255,255,0.04)';
  const tick = '#2d4a6e';
  const font = { family: "'Inter', sans-serif", size: 10 };

  const base = {
    responsive          : true,
    maintainAspectRatio : false,
    animation           : { duration: 350 },
    interaction         : { mode: 'index', intersect: false },
    plugins: {
      legend  : { labels: { color: tick, font, boxWidth: 10, padding: 14 } },
      tooltip : {
        backgroundColor : 'rgba(3,8,22,0.96)',
        borderColor     : 'rgba(41,121,255,0.35)',
        borderWidth     : 1,
        titleColor      : '#6b8ab0',
        bodyColor       : '#e8f0ff',
        padding         : 10,
        cornerRadius    : 8,
      },
    },
    scales: {
      x: { ticks: { color: tick, font, maxTicksLimit: 8 }, grid: { color: grid }, border: { color: 'transparent' } },
      y: { ticks: { color: tick, font }, grid: { color: grid }, border: { color: 'transparent' } },
    },
  };

  speedChart = new Chart($('speedChart').getContext('2d'), {
    type : 'line',
    data : {
      labels   : [],
      datasets : [{
        label               : 'Speed (km/h)',
        data                : [],
        borderColor         : '#2979ff',
        backgroundColor     : 'rgba(41,121,255,0.07)',
        borderWidth         : 2,
        pointRadius         : 3,
        pointHoverRadius    : 5,
        pointBackgroundColor: '#60a5fa',
        tension             : 0.45,
        fill                : true,
      }],
    },
    options: { ...base, scales: { ...base.scales, y: { ...base.scales.y, min: 0, title: { display: true, text: 'km/h', color: tick, font } } } },
  });

  distChart = new Chart($('distChart').getContext('2d'), {
    type : 'line',
    data : {
      labels   : [],
      datasets : [
        {
          label               : 'US-1 (cm)',
          data                : [],
          borderColor         : '#00e5ff',
          backgroundColor     : 'rgba(0,229,255,0.06)',
          borderWidth         : 2,
          pointRadius         : 3,
          pointHoverRadius    : 5,
          pointBackgroundColor: '#22d3ee',
          tension             : 0.45,
          fill                : true,
        },
        {
          label               : 'US-2 (cm)',
          data                : [],
          borderColor         : '#d500f9',
          backgroundColor     : 'rgba(213,0,249,0.06)',
          borderWidth         : 2,
          pointRadius         : 3,
          pointHoverRadius    : 5,
          pointBackgroundColor: '#e879f9',
          tension             : 0.45,
          fill                : true,
        },
      ],
    },
    options: { ...base, scales: { ...base.scales, y: { ...base.scales.y, min: 0, title: { display: true, text: 'cm', color: tick, font } } } },
  });
}

function pushChart(speedKmh, d1, d2) {
  const lbl = tsNow();
  timeLabels.push(lbl);
  speedHist.push(+speedKmh || 0);
  dist1Hist.push(d1 < 990 ? d1 : null);
  dist2Hist.push(d2 < 990 ? d2 : null);
  while (timeLabels.length > CFG.MAX_CHART) {
    timeLabels.shift(); speedHist.shift(); dist1Hist.shift(); dist2Hist.shift();
  }
  speedChart.data.labels           = [...timeLabels];
  speedChart.data.datasets[0].data = [...speedHist];
  speedChart.update('none');
  distChart.data.labels            = [...timeLabels];
  distChart.data.datasets[0].data  = [...dist1Hist];
  distChart.data.datasets[1].data  = [...dist2Hist];
  distChart.update('none');
}

/* ══════════════════════════════════════════════════════════════
   8. ALERT BANNER  — v3 uses id="alertBanner", class="alert-banner <state>"
══════════════════════════════════════════════════════════════ */
const ALERT_MAP = {
  CLEAR    : { cls: 'clear',    icon: '✅', msg: 'Road is CLEAR — No obstacles detected.' },
  DETECTED : { cls: 'detected', icon: '🔵', msg: 'Object DETECTED within 30 cm proximity.' },
  WARNING  : { cls: 'warning',  icon: '⚠️', msg: 'WARNING! Object within 20 cm — Slow down immediately!' },
  CRITICAL : { cls: 'critical', icon: '🚨', msg: 'CRITICAL ALERT! Object within 10 cm — Immediate danger!' },
};
const STATUS_ICON = { CLEAR: '✅', DETECTED: '🔵', WARNING: '⚠️', CRITICAL: '🚨' };

function setAlert(status) {
  const cfg = ALERT_MAP[status] || { cls: '', icon: '📡', msg: `Status: ${status}` };
  /* v3 class is "alert-banner <state>" — NOT "alert-strip" */
  D.alertBanner.className   = `alert-banner ${cfg.cls}`;
  D.alertIcon.textContent   = cfg.icon;
  D.alertMsg.textContent    = cfg.msg;
}

/* ══════════════════════════════════════════════════════════════
   9. STATUS BADGE
══════════════════════════════════════════════════════════════ */
function setBadge(status) {
  const key = status ? status.toUpperCase() : 'WAITING';
  D.statusBadge.className  = `status-badge ${key.toLowerCase()}`;
  D.statusIcon.textContent = STATUS_ICON[key] || '📡';
  D.statusTxt.textContent  = key;
}

/* ══════════════════════════════════════════════════════════════
   10. SPEED CARD
══════════════════════════════════════════════════════════════ */
function setSpeed(mps, kmh) {
  D.speedKmh.textContent  = (+kmh || 0).toFixed(1);
  D.speedMps.textContent  = `${(+mps || 0).toFixed(2)} m/s`;
  const pct = Math.min((+kmh / 200) * 100, 100);
  /* gauge-fill width drives the fill; gauge-knob position uses right offset */
  D.speedBar.style.width  = pct + '%';
  /* knob is absolute positioned with right=-1px baseline; shift via right */
  D.speedGlow.style.right = (100 - pct) + '%';
}

/* ══════════════════════════════════════════════════════════════
   11. DISTANCE RING
══════════════════════════════════════════════════════════════ */
function setDistRing(minDist) {
  const MAX = 50;
  const C   = 238.8;
  const d   = minDist < 990 ? Math.min(minDist, MAX) : MAX;
  const off = C - (d / MAX) * C;

  D.distRing.style.strokeDashoffset = off;
  D.minDist.textContent   = minDist < 990 ? minDist : '---';
  D.ringLabel.textContent = minDist < 990 ? `${minDist}cm` : '--';

  let col = '#8b5cf6';
  if      (minDist <= 10) col = '#ff1744';
  else if (minDist <= 20) col = '#ffea00';
  else if (minDist <= 30) col = '#2979ff';
  else if (minDist < 990) col = '#00e676';
  D.distRing.style.stroke = col;
}

/* ══════════════════════════════════════════════════════════════
   12. SENSOR BARS — v3 dot class = "us-ind", tag class = "us-tag"
══════════════════════════════════════════════════════════════ */
function sensorLevel(dist) {
  if (dist <= 10)  return { cls: 'critical', tag: 'CRITICAL', colour: '#ff1744', dot: 'critical' };
  if (dist <= 20)  return { cls: 'warning',  tag: 'WARNING',  colour: '#ffea00', dot: 'warning' };
  if (dist <= 30)  return { cls: 'detected', tag: 'DETECTED', colour: '#2979ff', dot: 'active' };
  if (dist < 990)  return { cls: 'ok',       tag: 'CLEAR',    colour: '#00e676', dot: 'active' };
  return              { cls: '',        tag: 'NO DATA', colour: '#2d4a6e', dot: '' };
}

function setSensor(distEl, barEl, dotEl, lblEl, dist) {
  const lv = sensorLevel(dist);
  distEl.textContent     = dist < 990 ? `${dist} cm` : '--- cm';
  barEl.style.width      = dist < 990 ? `${Math.min((1 - dist / 52) * 100, 100)}%` : '0%';
  barEl.style.background = lv.colour;
  /* v3 dot class = "us-ind <state>" */
  dotEl.className        = `us-ind ${lv.dot}`;
  /* v3 tag class = "us-tag <state>" */
  lblEl.className        = `us-tag ${lv.cls}`;
  lblEl.textContent      = lv.tag;
}

/* ══════════════════════════════════════════════════════════════
   13. LED INDICATORS — v3 uses led-orb, led-state, buzzer-cell
══════════════════════════════════════════════════════════════ */
function setLed(orbEl, stateEl, on, colour, stateClass) {
  /* v3 orb class = "led-orb [on] <colour>" */
  orbEl.className     = on ? `led-orb on ${colour}` : `led-orb ${colour}`;
  stateEl.textContent = on ? 'ON' : 'OFF';
  /* v3 state label class = "led-state [on <colour>]" */
  stateEl.className   = on ? `led-state on ${stateClass}` : 'led-state';
}

function setIndicators(status) {
  const s = (status || '').toUpperCase();

  setLed(D.greenLed,  D.greenState,  s === 'CLEAR',   'green',  '');
  setLed(D.yellowLed, D.yellowState, ['DETECTED','WARNING','CRITICAL'].includes(s), 'yellow', 'y');
  setLed(D.redLed,    D.redState,    s === 'CRITICAL', 'red',    'r');

  const buz = s === 'WARNING' || s === 'CRITICAL';
  /* v3 buzzer parent class = "buzzer-cell [active]" */
  D.buzzerOrb.className    = buz ? 'buzzer-cell active' : 'buzzer-cell';
  D.buzzerIcon.textContent = buz ? '🔊' : '🔇';
  D.buzzerState.textContent = buz ? 'ON' : 'OFF';
  D.buzzerState.className   = buz ? 'led-state on y' : 'led-state';
}

/* ══════════════════════════════════════════════════════════════
   14. DATA TABLE — v3 status classes: c-clear / c-detected / c-warning / c-critical
══════════════════════════════════════════════════════════════ */
function addTableRow(rec) {
  /* remove empty placeholder — v3 class is "tbl-empty" */
  const empty = D.tableBody.querySelector('.tbl-empty');
  if (empty) empty.remove();

  /* v3 table status cell CSS classes */
  const cellCls = {
    CLEAR    : 'c-clear',
    DETECTED : 'c-detected',
    WARNING  : 'c-warning',
    CRITICAL : 'c-critical',
  }[rec.status] || '';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${rec.index}</td>
    <td>${rec.time}</td>
    <td>${rec.speedKmh}</td>
    <td>${rec.speedMps}</td>
    <td>${rec.dist1 < 990 ? rec.dist1 : '---'}</td>
    <td>${rec.dist2 < 990 ? rec.dist2 : '---'}</td>
    <td>${rec.minDist < 990 ? rec.minDist : '---'}</td>
    <td class="${cellCls}">${rec.status}</td>
    <td>${rec.activeSensor}</td>
  `;
  D.tableBody.insertBefore(tr, D.tableBody.firstChild);
  while (D.tableBody.children.length > 100) D.tableBody.removeChild(D.tableBody.lastChild);

  const total = dataRecords.length;
  D.recordBadge.textContent = `${total} record${total !== 1 ? 's' : ''}`;
  D.recordCount.textContent  = total;
}

/* ══════════════════════════════════════════════════════════════
   15. EXCEL EXPORT
══════════════════════════════════════════════════════════════ */
function exportExcel() {
  if (!dataRecords.length) {
    alert('No data to export yet — wait for ESP32 messages.');
    return;
  }
  const headers = ['#','Date/Time','Speed (km/h)','Speed (m/s)',
    'Distance 1 (cm)','Distance 2 (cm)','Min Distance (cm)','Safety Status','Active Sensor'];
  const rows = dataRecords.map(r => [
    r.index, r.time, r.speedKmh, r.speedMps,
    r.dist1  < 990 ? r.dist1  : 'N/A',
    r.dist2  < 990 ? r.dist2  : 'N/A',
    r.minDist< 990 ? r.minDist: 'N/A',
    r.status, r.activeSensor,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    {wch:6},{wch:22},{wch:14},{wch:12},
    {wch:16},{wch:16},{wch:18},{wch:14},{wch:16},
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Highway Data');

  /* Summary sheet */
  const sum = XLSX.utils.aoa_to_sheet([
    ['Highway Safety Monitoring — Summary'],
    [],
    ['Export Time',   new Date().toLocaleString()],
    ['Total Records', dataRecords.length],
    ['Broker',        'test.mosquitto.org:8081'],
    ['Topic',         'highway/data'],
    [],
    ['Status','Count'],
    ['CLEAR',    dataRecords.filter(r=>r.status==='CLEAR').length],
    ['DETECTED', dataRecords.filter(r=>r.status==='DETECTED').length],
    ['WARNING',  dataRecords.filter(r=>r.status==='WARNING').length],
    ['CRITICAL', dataRecords.filter(r=>r.status==='CRITICAL').length],
  ]);
  sum['!cols'] = [{wch:20},{wch:18}];
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');

  const fname = `Highway_Data_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.xlsx`;
  XLSX.writeFile(wb, fname);
  addLog(`Excel exported: ${fname} (${dataRecords.length} rows)`, 'connected');
}

/* ══════════════════════════════════════════════════════════════
   16. MAIN MESSAGE HANDLER
══════════════════════════════════════════════════════════════ */
function handleMessage(payload) {
  let data;
  try   { data = JSON.parse(payload); }
  catch (e) { addLog(`Parse error: ${e.message}`, 'error'); return; }

  msgCount++;
  D.msgCount.textContent   = msgCount;
  D.lastUpdate.textContent = tsNow();
  D.deviceName.textContent = data.device || 'ESP32';

  const speedMps = parseFloat(data.speed_mps)        || 0;
  const speedKmh = parseFloat(data.speed_kmh)        || 0;
  const dist1    = parseInt(data.distance1_cm)        ?? 999;
  const dist2    = parseInt(data.distance2_cm)        ?? 999;
  const minDist  = parseInt(data.minimum_distance_cm) ?? 999;
  const status   = (data.safety_status || 'CLEAR').toUpperCase();
  const active   = data.active_sensor || 'NONE';
  const ir1      = data.ir1 !== undefined ? data.ir1 : '--';
  const ir2      = data.ir2 !== undefined ? data.ir2 : '--';

  setSpeed(speedMps, speedKmh);
  setBadge(status);
  setAlert(status);
  D.activeSensor.textContent = active;
  setDistRing(minDist);
  setSensor(D.dist1, D.bar1, D.s1dot, D.s1label, dist1);
  setSensor(D.dist2, D.bar2, D.s2dot, D.s2label, dist2);
  D.ir1Val.textContent = ir1;
  D.ir2Val.textContent = ir2;
  setIndicators(status);
  pushChart(speedKmh, dist1, dist2);

  /* Mark all KPI cards live — v3 class is "kpi" not "kpi-card" */
  document.querySelectorAll('.kpi').forEach(c => c.classList.add('live'));

  const rec = {
    index: msgCount, time: dtNow(),
    speedKmh: speedKmh.toFixed(2), speedMps: speedMps.toFixed(2),
    dist1, dist2, minDist, status, activeSensor: active,
  };
  dataRecords.push(rec);
  if (dataRecords.length > CFG.MAX_RECORDS) dataRecords.shift();
  addTableRow(rec);

  addLog(`Spd:${speedKmh.toFixed(1)} km/h | D1:${dist1}cm D2:${dist2}cm | ${status}`, 'info');
}

/* ══════════════════════════════════════════════════════════════
   17. MQTT
══════════════════════════════════════════════════════════════ */
function connectMQTT() {
  setConnStatus('connecting');
  addLog(`Connecting → ${CFG.BROKER}`, 'info');
  const clientId = 'HwyDash_' + Math.random().toString(36).slice(2, 8);

  mqttClient = mqtt.connect(CFG.BROKER, {
    clientId,
    clean          : true,
    reconnectPeriod: 4000,
    connectTimeout : 12000,
  });

  mqttClient.on('connect', () => {
    setConnStatus('connected');
    addLog('Connected to MQTT broker ✓', 'connected');
    mqttClient.subscribe(CFG.TOPIC, { qos: 0 }, err => {
      if (err) addLog(`Subscribe error: ${err.message}`, 'error');
      else     addLog(`Subscribed → ${CFG.TOPIC}`, 'connected');
    });
  });
  mqttClient.on('message',    (_t, msg) => handleMessage(msg.toString()));
  mqttClient.on('reconnect',  ()        => { setConnStatus('reconnecting'); addLog('Reconnecting…'); });
  mqttClient.on('offline',    ()        => { setConnStatus('disconnected'); addLog('Broker offline', 'error'); });
  mqttClient.on('error',      err       => { setConnStatus('error');        addLog(`Error: ${err.message}`, 'error'); });
  mqttClient.on('close',      ()        =>   setConnStatus('disconnected'));
}

/* ══════════════════════════════════════════════════════════════
   18. CLEAR HELPERS
══════════════════════════════════════════════════════════════ */
function clearCharts() {
  timeLabels.length = speedHist.length = dist1Hist.length = dist2Hist.length = 0;
  speedChart.data.labels = [];
  speedChart.data.datasets[0].data = [];
  distChart.data.labels  = [];
  distChart.data.datasets[0].data  = [];
  distChart.data.datasets[1].data  = [];
  speedChart.update();
  distChart.update();
  addLog('Charts cleared', 'info');
}

function clearLog() {
  D.logBox.innerHTML = '<div class="log-idle">▋ Log cleared</div>';
  logCount = 0;
}

function clearTable() {
  dataRecords = [];
  D.tableBody.innerHTML = '<tr class="tbl-empty"><td colspan="9">No data yet — waiting for ESP32...</td></tr>';
  D.recordBadge.textContent = '0 records';
  D.recordCount.textContent  = '0';
  addLog('Data records cleared', 'info');
}

/* ══════════════════════════════════════════════════════════════
   19. SIMULATE  (uncomment to test without ESP32 hardware)
══════════════════════════════════════════════════════════════ */
function simulateData() {
  setInterval(() => {
    const speed = Math.random() * 130;
    const d1    = Math.floor(Math.random() * 52) + 3;
    const d2    = Math.floor(Math.random() * 52) + 3;
    const minD  = Math.min(d1, d2);
    let status  = 'CLEAR';
    if      (minD <= 10) status = 'CRITICAL';
    else if (minD <= 20) status = 'WARNING';
    else if (minD <= 30) status = 'DETECTED';
    handleMessage(JSON.stringify({
      device: 'ESP32',
      speed_mps           : (speed / 3.6).toFixed(2),
      speed_kmh           : speed.toFixed(2),
      distance1_cm        : d1,
      distance2_cm        : d2,
      minimum_distance_cm : minD,
      safety_status       : status,
      active_sensor       : minD === d1 ? 'ULTRASONIC 1' : 'ULTRASONIC 2',
      ir1                 : Math.random() > 0.5 ? 'TRIGGERED' : 'CLEAR',
      ir2                 : Math.random() > 0.5 ? 'TRIGGERED' : 'CLEAR',
    }));
  }, 1500);
}

/* ══════════════════════════════════════════════════════════════
   20. BOOT
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  runLoader();
  startClock();
  initCharts();

  $('clearChart')  .addEventListener('click', clearCharts);
  $('clearLog')    .addEventListener('click', clearLog);
  $('clearTable')  .addEventListener('click', clearTable);
  $('exportExcel') .addEventListener('click', exportExcel);
  $('exportExcel2').addEventListener('click', exportExcel);

  /* Ripple effect on buttons */
  document.querySelectorAll('.ripple').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const circle = this.querySelector('.ripple-circle');
      if (!circle) return;
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      circle.style.width  = size + 'px';
      circle.style.height = size + 'px';
      circle.style.left   = (e.clientX - rect.left - size / 2) + 'px';
      circle.style.top    = (e.clientY - rect.top  - size / 2) + 'px';
      circle.classList.remove('animate');
      void circle.offsetWidth; /* reflow */
      circle.classList.add('animate');
    });
  });

  connectMQTT();

  /* ── Uncomment below to run demo without ESP32 ──
  simulateData();
  */
});
