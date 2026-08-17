/**
 * server.js — ฤกษ์ดี API Server
 * ข้อมูลทั้งหมดคำนวณเอง ไม่มี scraping
 *
 * แหล่งอ้างอิง:
 *   ดาราศาสตร์  : SunCalc (sunrise/sunset), Meeus "Astronomical Algorithms"
 *                 (planet/moon longitudes), Lahiri ayanamsa
 *   โหราศาสตร์  : คัมภีร์กาลโยค (ยาม), ตำราโหราศาสตร์ไทย (nakshatra)
 *   AI          : Anthropic Claude API
 */
'use strict';
require('dotenv').config();

const express  = require('express');
const path     = require('path');
const suncalc  = require('suncalc');
const app      = express();
const PORT     = process.env.PORT || 3000;

const DEFAULT_LAT = 13.7563;  // Bangkok
const DEFAULT_LON = 100.5018;
const DEFAULT_TZ  = 'Asia/Bangkok';

// โมเดล Claude ที่ใช้ — ตั้งทับได้ผ่าน env CLAUDE_MODEL (รวมไว้ที่เดียว)
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// path prefix สำหรับตอนอยู่หลัง reverse proxy ที่ mount ใต้ subpath (เช่น /horo)
// - local (ไม่ตั้ง APP_PREFIX): '' → ทำงานที่ root เหมือนเดิม
// - server: ตั้ง APP_PREFIX=/horo → หน้าเว็บฉีด <base href="/horo/"> ให้ asset/api อ้างอิงถูก
//   (nginx ตัด /horo ออกก่อนส่งให้แอป แอปจึงรับ path แบบ root ตามปกติ)
let APP_PREFIX = (process.env.APP_PREFIX || '').trim().replace(/\/+$/, '');
if (APP_PREFIX && !APP_PREFIX.startsWith('/')) APP_PREFIX = '/' + APP_PREFIX;

const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

// CORS — จำกัดเฉพาะ origin ที่อนุญาต (แอปนี้เสิร์ฟหน้าเว็บจาก origin เดียวกันอยู่แล้ว)
// เดิมตั้ง '*' ทำให้เว็บใดๆ เรียก /api/analyze ใช้ ANTHROPIC_API_KEY ของเราได้ฟรี
// ตั้ง ALLOWED_ORIGINS ใน .env (คั่นด้วย comma) หากต้องการเปิดให้ origin อื่น
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  `http://localhost:${PORT},http://127.0.0.1:${PORT}`)
  .split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  // คำขอจาก origin เดียวกัน (fetch ภายในแอป) ไม่มี header Origin — ผ่านได้ปกติ
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' })); // จำกัดขนาด body กัน payload ใหญ่เกิน
// เสิร์ฟ static แบบ deny-by-default — อนุญาตเฉพาะ asset ของหน้าเว็บ
// กันไม่ให้โหลด source (server.js), ฐานข้อมูล (*.json), เอกสาร (*.md),
// และโดยเฉพาะ backups/*.zip ที่มี .env (API key) อยู่ข้างใน
const PUBLIC_PATHS = new Set(['/', '/index.html', '/styles.css', '/app.js']);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next(); // POST/อื่นๆ → ไป route
  if (req.path.startsWith('/api/')) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  return res.status(404).end(); // ทุกอย่างนอก whitelist → 404
});

// เสิร์ฟ index.html พร้อมฉีด <base href> ตาม APP_PREFIX
// ให้ลิงก์ asset (styles.css/app.js) + fetch แบบ relative อ้างอิงถูกทั้ง local และใต้ /horo
const INDEX_PATH = path.join(__dirname, 'index.html');
function serveIndex(req, res) {
  try {
    const html = require('fs').readFileSync(INDEX_PATH, 'utf8')
      .replace('<head>', `<head>\n<base href="${APP_PREFIX}/">`);
    res.type('html').send(html);
  } catch {
    res.status(500).send('index.html not found');
  }
}
app.get(['/', '/index.html'], serveIndex);

app.use(express.static(path.join(__dirname), { dotfiles: 'ignore' }));

// ── Rate limiter อย่างง่าย (in-memory, ต่อ IP) สำหรับ endpoint ที่ใช้ API key ──
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 นาที
const RATE_LIMIT_MAX    = 20;        // สูงสุด 20 คำขอ/นาที/IP
const _rateHits = new Map();         // ip → [timestamps]
function rateLimit(req, res, next) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const hits = (_rateHits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (hits.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
  }
  hits.push(now);
  _rateHits.set(ip, hits);
  next();
}
// เคลียร์ entry เก่าทุก 5 นาที กัน memory โต
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of _rateHits) {
    const live = ts.filter(t => now - t < RATE_LIMIT_WINDOW);
    live.length ? _rateHits.set(ip, live) : _rateHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

const MAX_TOKENS_CAP = 2000; // เพดาน max_tokens ฝั่ง server (client เดิมส่งสูงสุด 1500)

// ════════════════════════════════════════════════
// ASTRONOMY — Meeus "Astronomical Algorithms"
// ════════════════════════════════════════════════

const DEG = Math.PI / 180;

function jdn(date) {
  const y=date.getUTCFullYear(), m=date.getUTCMonth()+1;
  const d=date.getUTCDate()+(date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600)/24;
  let Y=y,M=m; if(M<=2){Y--;M+=12;}
  const A=Math.floor(Y/100),B=2-A+Math.floor(A/4);
  return Math.floor(365.25*(Y+4716))+Math.floor(30.6001*(M+1))+d+B-1524.5;
}

function sunLongitude(jd) {
  const T=(jd-2451545.0)/36525;
  const L0=280.46646+36000.76983*T;
  const M=(357.52911+35999.05029*T-0.0001537*T*T)*DEG;
  const C=(1.914602-0.004817*T)*Math.sin(M)+0.019993*Math.sin(2*M);
  return ((L0+C)%360+360)%360;
}

function moonLongitude(jd) {
  const T=(jd-2451545.0)/36525;
  const D=(297.8501921+445267.1114034*T)*DEG;
  const M=(357.5291092+35999.0502909*T)*DEG;
  const Mp=(134.9633964+477198.8675055*T)*DEG;
  const F=(93.2720950+483202.0175233*T)*DEG;
  const Lp=218.3164477+481267.88123421*T;
  return ((Lp
    +6.2888*Math.sin(Mp)+1.2740*Math.sin(2*D-Mp)+0.6583*Math.sin(2*D)
    +0.2136*Math.sin(2*Mp)-0.1851*Math.sin(M)-0.1143*Math.sin(2*F)
    +0.0588*Math.sin(2*D-2*Mp)+0.0572*Math.sin(2*D-M-Mp)+0.0533*Math.sin(2*D+Mp)
  )%360+360)%360;
}

/**
 * Planet true longitudes — Meeus Ch.33 (low precision with equation of center)
 * Accuracy: Sun <1°, Moon <1°, Venus <1°, others ~1-2° (vs ~5-23° mean-only)
 * อ้างอิง: Jean Meeus "Astronomical Algorithms" 2nd ed.
 */
function planetTrueLongitudes(jd) {
  const T = (jd - 2451545.0) / 36525;
  const n = x => ((x % 360) + 360) % 360;
  const rad = x => x * DEG;

  // Equation of center helper (2-term)
  const eoc = (M_deg, ecc) => {
    const M = rad(M_deg);
    return (180 / Math.PI) * (2 * ecc * Math.sin(M) + 1.25 * ecc * ecc * Math.sin(2 * M));
  };

  // Mercury — e=0.2056 (true_lon ≈ mean_lon + equation_of_center, Meeus)
  const MercM = n(174.7948 + 4.09233445 * (jd - 2451545.0));
  const mercTrue = n(252.2509 + 4.09233445 * (jd - 2451545.0) + eoc(MercM, 0.20563));

  // Venus — e=0.0068 (nearly circular, mean ≈ true)
  const VenM = n(50.4161 + 1.60213034 * (jd - 2451545.0));
  const venTrue = n(181.9798 + 1.60213034 * (jd - 2451545.0) + eoc(VenM, 0.00677));

  // Mars — e=0.0934
  const MarM = n(19.3730 + 0.52402068 * (jd - 2451545.0));
  const marsTrue = n(355.4330 + 0.52402068 * (jd - 2451545.0) + eoc(MarM, 0.09341));

  // Jupiter — e=0.0484
  const JupM = n(20.9201 + 0.08308530 * (jd - 2451545.0));
  const jupTrue = n(34.3515 + 0.08308530 * (jd - 2451545.0) + eoc(JupM, 0.04839));

  // Saturn — e=0.0542
  const SatM = n(317.0207 + 0.03344414 * (jd - 2451545.0));
  const satTrue = n(50.0774 + 0.03344414 * (jd - 2451545.0) + eoc(SatM, 0.05415));

  // Rahu (Mean North Node) — retrograde by definition
  const rahu = n(125.044 - 1934.1363 * T);

  return { mercury: mercTrue, venus: venTrue, mars: marsTrue, jupiter: jupTrue, saturn: satTrue, rahu };
}

/**
 * คำนวณ retrograde โดยใช้ velocity (dL/dt) — positive=direct, negative=retrograde
 * ใช้ finite difference h=0.5 วัน
 */
function isRetrograde(jd, getAngle) {
  const h = 0.5;
  const a0 = getAngle(jd - h);
  const a1 = getAngle(jd + h);
  let diff = ((a1 - a0) % 360 + 360) % 360;
  if (diff > 180) diff -= 360; // wrap to -180..+180
  return diff < 0;
}

// Lahiri ayanamsa — 23.85° in J2000, precessing 1.3963°/century
function ayanamsa(jd) {
  const T=(jd-2451545.0)/36525;
  return 23.85+0.013963*T*100;
}

const RASI_TH  = ['เมษ','พฤษภ','มิถุน','กรกฎ','สิงห์','กันย์','ตุลย์','พิจิก','ธนู','มกร','กุมภ์','มีน'];
const RASI_SYM = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];

function rasiName(sid) {
  const i=Math.floor(sid/30)%12;
  return `${RASI_TH[i]} (${RASI_SYM[i]})`;
}
function degMin(sid) {
  return { deg: Math.floor(sid % 30), min: Math.floor((sid % 1) * 60) };
}

// ════════════════════════════════════════════════
// NAKSHATRA — อ้างอิง: ตำราโหราศาสตร์ไทย-อินเดีย
// ════════════════════════════════════════════════

const NK_NAMES = [
  'อัศวินี','ภรณี','กฤตติกา','โรหิณี','มิคสิระ','อารทรา',
  'ปุนัพสุ','ปุสยะ','อาสเลษา','มาฆะ','อุตตร','ปุรวผัลคุนี',
  'หัตถะ','จิตร','สวาตี','วิศาขา','อนุราธา','โชษฐา',
  'มูละ','ปุรวาษาฒ','อุตตราษาฒ','ศรวณะ','ธนิษฐา',
  'สตาภิษัช','ปุรวภัทร','อุตตรภัทร','เรวดี',
];
const NK_QUALITY = {
  1:'good',4:'good',5:'good',7:'good',8:'good',11:'good',13:'good',14:'good',
  15:'good',17:'good',21:'good',22:'good',23:'good',24:'good',26:'good',27:'good',
  6:'neutral',16:'neutral',19:'neutral',20:'neutral',
  2:'bad',3:'bad',9:'bad',10:'bad',12:'bad',18:'bad',25:'bad',
};

function calcNakshatra(moonSid) {
  const span = 360/27;
  const num  = Math.floor(moonSid/span)+1;
  const deg  = moonSid%span;
  return {
    num, name: NK_NAMES[num-1],
    deg: `${Math.floor(deg)}°${Math.floor((deg%1)*60)}'`,
    quality: NK_QUALITY[num]||'neutral',
  };
}

// ════════════════════════════════════════════════
// TITHI — อ้างอิง: ตำราโหราศาสตร์ไทย
// ════════════════════════════════════════════════

function calcTithi(sunSid, moonSid) {
  const diff  = ((moonSid-sunSid)%360+360)%360;
  const num   = Math.floor(diff/12)+1;
  const phase = num<=15?'ขึ้น':'แรม';
  const day   = num<=15?num:num-15;
  const good  = [1,4,5,9,10,11,14];
  const bad   = [8,13,15,23,28,30]; // 15=ขึ้น 15 ค่ำ (ปุณณมี/วันเพ็ญ), 30=แรม 15 ค่ำ (อมาวสี/จันทร์ดับ)
  const q     = good.includes(num)?'good':bad.includes(num)?'bad':'neutral';
  const labels= {good:'✦ มงคลดิถี',neutral:'◈ ปกติ',bad:'✗ อัปมงคล'};
  return { num, phase, day, label:`${phase} ${day} ค่ำ`, quality:q, qualityLabel:labels[q], deg:`${Math.floor(diff%12)}°` };
}

// ════════════════════════════════════════════════
// YAM — อ้างอิง: คัมภีร์กาลโยค
// ════════════════════════════════════════════════

const YAM_TABLE = {
  0:['ธงชัย','อุบาทว์','อธิบดี','โลกาวินาศ',  'กาลกิณี','ธงชัย','อุบาทว์','อธิบดี'],
  1:['ปกติ',  'ธงชัย', 'อุบาทว์','อธิบดี',    'ปกติ','โลกาวินาศ','กาลกิณี','ธงชัย'],
  2:['กาลกิณี','ปกติ', 'ธงชัย', 'อุบาทว์',    'อธิบดี','ปกติ','โลกาวินาศ','กาลกิณี'],
  3:['โลกาวินาศ','กาลกิณี','ปกติ','ธงชัย',     'อุบาทว์','อธิบดี','ปกติ','โลกาวินาศ'],
  4:['อธิบดี','โลกาวินาศ','กาลกิณี','ปกติ',    'ธงชัย','อุบาทว์','อธิบดี','ปกติ'],
  5:['ธงชัย','อธิบดี','โลกาวินาศ','กาลกิณี',   'ปกติ','ธงชัย','อุบาทว์','อธิบดี'],
  6:['อุบาทว์','ธงชัย','อธิบดี','โลกาวินาศ',   'กาลกิณี','ปกติ','ธงชัย','อุบาทว์'],
};

function calcYams(date, lat, lon) {
  const times   = suncalc.getTimes(date, lat, lon);
  const toBKK   = d => { const b=new Date(d.toLocaleString('en-US',{timeZone:DEFAULT_TZ})); return b.getHours()*60+b.getMinutes(); };
  const toHHMM  = m => { m=((Math.round(m)%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };

  const riseMin = toBKK(times.sunrise);
  const setMin  = toBKK(times.sunset);
  const dayLen  = setMin-riseMin, nightLen=1440-dayLen;
  const dy=dayLen/4, ny=nightLen/4;

  const bkk  = new Date(date.toLocaleString('en-US',{timeZone:DEFAULT_TZ}));
  const seq  = YAM_TABLE[bkk.getDay()]||YAM_TABLE[0];

  const raw  = seq.map((name,i)=>({
    name, period: i<4?'กลางวัน':'กลางคืน',
    start: i<4 ? riseMin+i*dy   : setMin+(i-4)*ny,
    end:   i<4 ? riseMin+(i+1)*dy: setMin+(i-3)*ny,
  }));

  // Group same-name yams (day + night occurrences)
  const grouped = {};
  for (const r of raw) {
    if (!grouped[r.name]) grouped[r.name] = { type:r.name, slots:[] };
    grouped[r.name].slots.push({ start:toHHMM(r.start), end:toHHMM(r.end) });
  }

  return {
    periods:  Object.values(grouped),
    sunrise:  toHHMM(riseMin),
    sunset:   toHHMM(setMin),
  };
}

// ════════════════════════════════════════════════
// PLANETS
// ════════════════════════════════════════════════

function calcPlanets(jd, ay) {
  if (ay === undefined) ay = ayanamsa(jd);
  const sid  = l => ((l - ay) % 360 + 360) % 360;
  const strop = sunLongitude(jd);
  const mtrop = moonLongitude(jd);
  const pl    = planetTrueLongitudes(jd);

  // Retrograde via velocity — closure per planet
  const retro = {
    mercury: isRetrograde(jd, j => planetTrueLongitudes(j).mercury),
    venus:   isRetrograde(jd, j => planetTrueLongitudes(j).venus),
    mars:    isRetrograde(jd, j => planetTrueLongitudes(j).mars),
    jupiter: isRetrograde(jd, j => planetTrueLongitudes(j).jupiter),
    saturn:  isRetrograde(jd, j => planetTrueLongitudes(j).saturn),
  };

  const build = (name, sym, trop, r = false) => {
    const s = sid(trop);
    return { name, sym, rasi: rasiName(s), ...degMin(s), sidLon: +s.toFixed(3), retrograde: r };
  };

  const rahuSid = sid(pl.rahu);
  const ketuSid = ((rahuSid + 180) % 360 + 360) % 360;

  return [
    build('อาทิตย์',  '☉', strop),
    build('จันทร์',   '☽', mtrop),
    build('อังคาร',   '♂', pl.mars,    retro.mars),
    build('พุธ',      '☿', pl.mercury, retro.mercury),
    build('พฤหัสบดี', '♃', pl.jupiter, retro.jupiter),
    build('ศุกร์',    '♀', pl.venus,   retro.venus),
    build('เสาร์',    '♄', pl.saturn,  retro.saturn),
    { name:'ราหู', sym:'☊', rasi:rasiName(rahuSid), ...degMin(rahuSid), sidLon:+rahuSid.toFixed(3), retrograde:true },
    { name:'เกตุ', sym:'☋', rasi:rasiName(ketuSid), ...degMin(ketuSid), sidLon:+ketuSid.toFixed(3), retrograde:true },
  ];
}

// ════════════════════════════════════════════════
// TRANSIT ENGINE — Ingress dates + Exact Aspect dates
// อ้างอิง: Meeus "Astronomical Algorithms" Ch.33/36
//   - Ingress = วันที่ดาวเคลื่อนเข้าราศีใหม่ (sidLon ข้ามขอบ 0° ของราศี)
//   - Exact Aspect = วันที่มุมระหว่างดาวย้ายกับ natal lon ตรงพอดี
//   - Duration = จาก ingress ถึง egress (ถัดไป)
//   ค้นหาด้วย binary bisection บน sidLon(jd) — แม่นยำ ±1 วัน
// ════════════════════════════════════════════════

/**
 * sidLon ของดาวแต่ละดวงจาก jd + ayanamsa
 * คืนค่าเป็น sidereal longitude 0–360
 */
function getSidLon(planetKey, jd, ay) {
  const n = x => ((x % 360) + 360) % 360;
  switch (planetKey) {
    case 'sun':     return n(sunLongitude(jd) - ay);
    case 'moon':    return n(moonLongitude(jd) - ay);
    case 'mercury': { const pl=planetTrueLongitudes(jd); return n(pl.mercury - ay); }
    case 'venus':   { const pl=planetTrueLongitudes(jd); return n(pl.venus   - ay); }
    case 'mars':    { const pl=planetTrueLongitudes(jd); return n(pl.mars    - ay); }
    case 'jupiter': { const pl=planetTrueLongitudes(jd); return n(pl.jupiter - ay); }
    case 'saturn':  { const pl=planetTrueLongitudes(jd); return n(pl.saturn  - ay); }
    case 'rahu':    { const T=(jd-2451545)/36525; return n(125.044-1934.1363*T - ay); }
    case 'ketu':    { const T=(jd-2451545)/36525; return n(125.044-1934.1363*T - ay + 180); }
    default: return 0;
  }
}

/**
 * หา JD ที่ดาว (planetKey) เคลื่อนเข้าสู่ targetRasiIdx (0=เมษ…11=มีน)
 * ค้นหาย้อนหลังและข้างหน้าจาก jd0 ภายใน ±windowDays
 * คืน { ingressJD, egressJD } หรือ null
 *
 * วิธี: bisection บน f(jd) = floor(sidLon(jd)/30) - targetRasiIdx
 *        เมื่อ f เปลี่ยนเครื่องหมาย → ข้ามขอบราศี
 */
function findIngressEgress(planetKey, targetRasiIdx, jd0, ay, windowDays = 400) {
  const step = 1; // วันต่อ step (ปรับละเอียดตาม speed ดาว)
  const rasiOf = jd => Math.floor(getSidLon(planetKey, jd, ay) / 30) % 12;

  // --- หา ingress (ขอบซ้าย: วันที่เข้าราศีนี้) ---
  let ingressJD = null;
  // ค้นหาย้อนหลังจาก jd0 ว่าดาวเข้าราศีนี้เมื่อไหร่
  {
    let lo = jd0 - windowDays, hi = jd0;
    // ตรวจว่าตอนนี้ดาวอยู่ในราศีนี้หรือเปล่า
    if (rasiOf(jd0) === targetRasiIdx) {
      // scan ย้อนหลังหาจุดที่ดาวยังไม่ได้อยู่ในราศีนี้
      let prev = jd0;
      for (let jd = jd0 - step; jd >= lo; jd -= step) {
        if (rasiOf(jd) !== targetRasiIdx) {
          // bisect ระหว่าง jd กับ prev
          let a = jd, b = prev;
          for (let i = 0; i < 20; i++) {
            const mid = (a + b) / 2;
            rasiOf(mid) !== targetRasiIdx ? a = mid : b = mid;
          }
          ingressJD = (a + b) / 2;
          break;
        }
        prev = jd;
      }
      if (!ingressJD) ingressJD = lo; // ดาวอยู่ในราศีนี้มานานมากแล้ว
    } else {
      // ดาวยังไม่ได้อยู่ในราศีนี้ — หา ingress ข้างหน้า
      let prev = jd0;
      for (let jd = jd0 + step; jd <= jd0 + windowDays; jd += step) {
        if (rasiOf(jd) === targetRasiIdx) {
          let a = prev, b = jd;
          for (let i = 0; i < 20; i++) {
            const mid = (a + b) / 2;
            rasiOf(mid) !== targetRasiIdx ? a = mid : b = mid;
          }
          ingressJD = (a + b) / 2;
          break;
        }
        prev = jd;
      }
    }
  }

  if (!ingressJD) return null;

  // --- หา egress (ขอบขวา: วันที่ออกจากราศีนี้) ---
  let egressJD = null;
  {
    let prev = ingressJD + 1;
    const maxSearch = ingressJD + windowDays;
    for (let jd = prev + step; jd <= maxSearch; jd += step) {
      if (rasiOf(jd) !== targetRasiIdx) {
        let a = prev, b = jd;
        for (let i = 0; i < 20; i++) {
          const mid = (a + b) / 2;
          rasiOf(mid) === targetRasiIdx ? a = mid : b = mid;
        }
        egressJD = (a + b) / 2;
        break;
      }
      prev = jd;
    }
  }

  return { ingressJD, egressJD };
}

/**
 * หาวันที่ exact aspect ระหว่างดาวย้าย (transit) กับตำแหน่ง natal (natalSidLon)
 * aspectDeg = มุม (0, 60, 90, 120, 180)
 * ค้นหาในช่วง searchFrom..searchTo (JD)
 * คืน array ของ JD ที่ exact (อาจมีหลายครั้ง เช่น retrograde loop)
 */
function findExactAspects(planetKey, natalSidLon, aspectDeg, searchFrom, searchTo, ay) {
  const n = x => ((x % 360) + 360) % 360;
  // f(jd) = n(transitLon - natalLon) - aspectDeg  → หาจุดที่ f=0
  // ใช้ทั้ง aspectDeg และ 360-aspectDeg (สองทิศทาง) ยกเว้น 0 และ 180
  const targets = new Set([aspectDeg]);
  if (aspectDeg !== 0 && aspectDeg !== 180) targets.add(360 - aspectDeg);

  const results = [];
  const step = 1;

  for (const tgt of targets) {
    // f(jd) = angleDiff - tgt  →  ต้องการ f=0
    const f = jd => {
      const tLon = getSidLon(planetKey, jd, ay);
      let diff = n(tLon - natalSidLon);
      return diff - tgt;
    };

    let prev = f(searchFrom);
    for (let jd = searchFrom + step; jd <= searchTo; jd += step) {
      const cur = f(jd);
      // zero crossing (sign change, handling wrap at ±180)
      const prevN = ((prev % 360) + 360) % 360;
      const curN  = ((cur  % 360) + 360) % 360;
      if (Math.abs(prevN - curN) < 180 && prev * cur < 0) {
        // bisect
        let a = jd - step, b = jd;
        for (let i = 0; i < 30; i++) {
          const mid = (a + b) / 2;
          f(a) * f(mid) <= 0 ? b = mid : a = mid;
        }
        const exactJD = (a + b) / 2;
        // avoid duplicates (ห่างกัน > 5 วัน)
        if (!results.some(r => Math.abs(r - exactJD) < 5)) {
          results.push(exactJD);
        }
      }
      prev = cur;
    }
  }
  return results.sort((a, b) => a - b);
}

/** แปลง JD → วันที่ไทย พ.ศ. (เวลาตามเวลาประเทศไทย ICT = UTC+7) */
function jdToThaiDate(jd) {
  // แปลง JD → JS Date (UTC) โดยใช้ J2000 epoch เป็นฐาน
  const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0); // JD 2451545.0
  const utcMs = J2000_MS + (jd - 2451545.0) * 86400000;
  const utcDate = new Date(utcMs);

  // แปลงเป็นเวลาไทย (ICT = UTC+7)
  const ictMs = utcMs + 7 * 3600000;
  const ictDate = new Date(ictMs);

  const day   = ictDate.getUTCDate();
  const month = ictDate.getUTCMonth() + 1;
  const year  = ictDate.getUTCFullYear();
  const hrs   = ictDate.getUTCHours();
  const mins  = ictDate.getUTCMinutes();

  const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                              'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const bsYear = year + 543;
  return {
    dateStr: `${day} ${THAI_MONTHS_SHORT[month-1]} ${bsYear}`,
    timeStr: `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')} น.`,
    isoDate: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    jd,
  };
}

/**
 * คำนวณ transit events ทั้งหมดสำหรับดาวแต่ละดวงที่ทำมุมกับ natalSidLon
 * สำหรับ API /api/transits
 *
 * natalRasiIdx = ราศีเกิด (0=เมษ…11=มีน)
 * natalSidLon  = ตำแหน่ง sidereal แน่นอนของราศีเกิด (เช่น กึ่งกลางราศี)
 * jd0          = JD ณ วันที่ดู
 * ay           = ayanamsa
 */
const PLANET_KEYS = [
  { key:'sun',     name:'อาทิตย์', sym:'☉', speed:'fast'  },
  { key:'moon',    name:'จันทร์',  sym:'☽', speed:'fast'  },
  { key:'mercury', name:'พุธ',     sym:'☿', speed:'fast'  },
  { key:'venus',   name:'ศุกร์',   sym:'♀', speed:'fast'  },
  { key:'mars',    name:'อังคาร',  sym:'♂', speed:'medium'},
  { key:'jupiter', name:'พฤหัสบดี',sym:'♃', speed:'slow'  },
  { key:'saturn',  name:'เสาร์',   sym:'♄', speed:'slow'  },
  { key:'rahu',    name:'ราหู',    sym:'☊', speed:'slow'  },
  { key:'ketu',    name:'เกตุ',    sym:'☋', speed:'slow'  },
];

const ASPECT_DEFS = [
  { deg:0,   name:'Conjunction', thaiName:'ร่วมราศี 0°',     power:4 },
  { deg:180, name:'Opposition',  thaiName:'ตรงข้าม 180°',    power:3 },
  { deg:120, name:'Trine',       thaiName:'ตรีโกณ 120°',     power:4 },
  { deg:90,  name:'Square',      thaiName:'สี่เหลี่ยม 90°',  power:3 },
  { deg:60,  name:'Sextile',     thaiName:'หกเหลี่ยม 60°',   power:2 },
];

// สถานะถอยหลังของดาวแต่ละดวง ณ jd หนึ่ง:
//   ราหู/เกตุ = ถอยหลังเสมอ (ตามนิยาม node)
//   อาทิตย์/จันทร์ = ไม่มีวันถอยหลัง → false เสมอ (ไม่ต้องเสียเวลาคำนวณ)
//   ที่เหลือ = คำนวณจริงด้วย velocity
function retroOf(planetKey, jd) {
  if (planetKey === 'rahu' || planetKey === 'ketu') return true;
  if (planetKey === 'sun'  || planetKey === 'moon') return false;
  return isRetrograde(jd, j => getSidLon(planetKey, j, ayanamsa(j)));
}

function computeTransits(dateStr, natalRasiIdx, natalSidLonOverride, calendar = 'suriyayas') {
  const [y,m,d] = dateStr.split('-').map(Number);
  const jd0 = jdn(new Date(Date.UTC(y,m-1,d,5,0,0)));
  const ay   = calendar === 'lahiri'
    ? (() => { const T=(jd0-2451545)/36525; return 23.8564+1.3964*T; })()
    : ayanamsa(jd0);

  // ตำแหน่ง natal = กึ่งกลางราศีเกิด (เช่น เมษ = 15°) เว้นแต่ client ส่งมาชัดเจน
  const natalSidLon = natalSidLonOverride != null
    ? natalSidLonOverride
    : natalRasiIdx * 30 + 15; // กึ่งกลางราศี

  const results = [];

  for (const pk of PLANET_KEYS) {
    // ingress/egress ของดาวนี้ในราศีเกิด
    const searchWindow = pk.speed === 'fast' ? 60 : pk.speed === 'medium' ? 200 : 500;
    const ie = findIngressEgress(pk.key, natalRasiIdx, jd0, ay, searchWindow);

    // aspect events กับ natal lon (ค้นใน ±180 วัน)
    // จำกัดกรอบค้นหา aspect ตามความเร็วดาว — ดาวเร็ว (อาทิตย์/จันทร์/พุธ/ศุกร์)
    // ทำมุมกับ natal บ่อยมาก ถ้าค้น 180 วันจะได้ event ล้นเกินจำเป็น (UI ใช้แค่ 5 อันแรก)
    const aspectWindow = pk.speed === 'fast' ? 60 : 180;

    const aspectEvents = [];
    for (const asp of ASPECT_DEFS) {
      const exactJDs = findExactAspects(pk.key, natalSidLon, asp.deg, jd0 - 10, jd0 + aspectWindow, ay);
      for (const ejd of exactJDs) {
        aspectEvents.push({
          aspect: asp.name,
          aspectThai: asp.thaiName,
          power: asp.power,
          exactDate: jdToThaiDate(ejd),
          retrograde: retroOf(pk.key, ejd), // ตรวจ retrograde ณ วันนั้น
        });
      }
    }

    // หา retrograde ณ วันนี้
    const retroNow = retroOf(pk.key, jd0);

    results.push({
      planet: pk.name,
      sym:    pk.sym,
      key:    pk.key,
      currentRasi: Math.floor(getSidLon(pk.key, jd0, ay) / 30) % 12,
      ingressDate:  ie?.ingressJD ? jdToThaiDate(ie.ingressJD) : null,
      egressDate:   ie?.egressJD  ? jdToThaiDate(ie.egressJD)  : null,
      retrogradeNow: retroNow,
      aspectEvents,
    });
  }

  return results;
}

// ════════════════════════════════════════════════
// MAIN CALC
// ════════════════════════════════════════════════

function computeHoroscope(dateStr, lat, lon, calendar = 'suriyayas') {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dateUTC = new Date(Date.UTC(y,m-1,d,5,0,0)); // noon BKK
  const jd      = jdn(dateUTC);

  // FIX #2: แยก ayanamsa ตามระบบปฏิทิน
  // Suriyayas (ไทยดั้งเดิม): ~23.85°  |  Lahiri (สากล): คำนวณต่างออกไปเล็กน้อย
  const ayBase  = calendar === 'lahiri'
    ? (() => { const T=(jd-2451545.0)/36525; return 23.8564+1.3964*T; })() // Lahiri (IAU J2000 = 23.8564°)
    : ayanamsa(jd); // Suriyayas (default)

  const sunTrop = sunLongitude(jd);
  const moonTrop= moonLongitude(jd);
  const sunSid  = ((sunTrop-ayBase)%360+360)%360;
  const moonSid = ((moonTrop-ayBase)%360+360)%360;

  const yam    = calcYams(dateUTC, lat, lon);
  const nk     = calcNakshatra(moonSid);
  const tithi  = calcTithi(sunSid, moonSid);
  const planets= calcPlanets(jd, ayBase);

  // Moon phase name
  const diff = ((moonTrop-sunTrop)%360+360)%360;
  const phaseName = diff<10||diff>350?'จันทร์ดับ':diff<90?'ข้างขึ้นเสี้ยวแรก':diff<170?'ข้างขึ้น':diff<190?'จันทร์เพ็ญ':diff<270?'ข้างแรม':'ข้างแรมเสี้ยวท้าย';

  const calLabel = calendar === 'lahiri' ? 'ลาหิรี' : 'สุริยยาส';

  return {
    date: dateStr, calendar, calendarLabel: calLabel,
    source: 'คำนวณจาก Meeus Astronomical Algorithms + SunCalc (ไม่ใช่ scraping)',
    sunrise: yam.sunrise, sunset: yam.sunset,
    lunar: { phase: tithi.label, phaseName },
    yam:   { periods: yam.periods },
    planets, nakshatra: nk, tithi,
    ayanamsa: +ayBase.toFixed(4), jd: +jd.toFixed(2),
  };
}

// ════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════

app.get('/api/horoscope', (req, res) => {
  const date     = req.query.date || new Date().toISOString().slice(0,10);
  const lat      = parseFloat(req.query.lat)  || DEFAULT_LAT;
  const lon      = parseFloat(req.query.lon)  || DEFAULT_LON;

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: `รูปแบบวันที่ไม่ถูกต้อง: "${date}" (ต้องการ YYYY-MM-DD)` });
  }
  const [dy, dm, dd] = date.split('-').map(Number);
  const testDate = new Date(Date.UTC(dy, dm-1, dd));
  if (isNaN(testDate.getTime()) || testDate.getUTCMonth() !== dm-1) {
    return res.status(400).json({ error: `วันที่ไม่มีอยู่จริง: "${date}"` });
  }

  // FIX #2: อ่าน calendar param และ validate
  const calendar = ['suriyayas','lahiri'].includes(req.query.calendar)
                   ? req.query.calendar : 'suriyayas';
  const key  = `${date}:${lat}:${lon}:${calendar}`;

  const cached = cache.get(key);
  if (cached && Date.now()-cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const data = computeHoroscope(date, lat, lon, calendar);
    cache.set(key, { data, ts:Date.now() });
    console.log(`[calc] ${date} [${calendar}] ☀${data.sunrise}→${data.sunset} 🌟${data.nakshatra.name} 📅${data.tithi.label}`);
    res.json(data);
  } catch(err) {
    console.error('[error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({
  status:'ok', time:new Date().toISOString(),
  engine:'self-contained — Meeus + SunCalc + Lahiri Ayanamsa',
}));

// ════════════════════════════════════════════════
// TRANSIT API — /api/transits
// Query params:
//   date     = YYYY-MM-DD (วันที่ดู)
//   rasi     = 0-11 (ราศีเกิด: 0=เมษ…11=มีน)
//   lon      = sidereal longitude ของราศีเกิด (optional, default กึ่งกลางราศี)
//   calendar = suriyayas|lahiri
// ════════════════════════════════════════════════
app.get('/api/transits', (req, res) => {
  const date     = req.query.date || new Date().toISOString().slice(0,10);
  const rasi     = parseInt(req.query.rasi);
  const lon      = req.query.lon != null ? parseFloat(req.query.lon) : null;
  const calendar = ['suriyayas','lahiri'].includes(req.query.calendar) ? req.query.calendar : 'suriyayas';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องการ YYYY-MM-DD)' });
  if (isNaN(rasi) || rasi < 0 || rasi > 11)
    return res.status(400).json({ error: 'rasi ต้องเป็น 0–11' });

  const cacheKey = `transits:${date}:${rasi}:${lon}:${calendar}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const transitsArr = computeTransits(date, rasi, lon, calendar);
    const fullResponse = { date, rasi, transits: transitsArr, source: 'Meeus Astronomical Algorithms — bisection search' };
    cache.set(cacheKey, { data: fullResponse, ts: Date.now() });
    console.log(`[transit] ${date} rasi=${rasi} planets=${transitsArr.length}`);
    res.json(fullResponse);
  } catch(err) {
    console.error('[transit error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

let aiStatusCache=null, aiStatusTs=0;
app.get('/api/ai-status', rateLimit, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ available:false, reason:'no_key' });
  if (aiStatusCache && Date.now()-aiStatusTs < 5*60*1000) return res.json(aiStatusCache);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:CLAUDE_MODEL,max_tokens:5,messages:[{role:'user',content:'Hi'}]}),
    });
    const d = await r.json();
    aiStatusCache = r.ok ? {available:true,reason:'ok'} : {available:false,reason:d.error?.type||'unknown'};
  } catch { aiStatusCache = {available:false,reason:'network_error'}; }
  aiStatusTs = Date.now();
  res.json(aiStatusCache);
});

app.post('/api/analyze', rateLimit, async (req, res) => {
  // ตรวจ input ของผู้เรียกก่อน (400) แล้วค่อยตรวจ config ฝั่ง server (500)
  const { prompt, max_tokens } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error:'ต้องระบุ prompt' });
  if (prompt.length > 20000) return res.status(400).json({ error:'prompt ยาวเกินกำหนด' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error:'ANTHROPIC_API_KEY ยังไม่ได้ตั้งค่า' });
  // cap max_tokens ฝั่ง server — กันผู้เรียกกำหนดค่าสูงจนสิ้นเปลืองเครดิต
  const capped = Math.min(Math.max(parseInt(max_tokens, 10) || 1200, 1), MAX_TOKENS_CAP);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: capped,
        messages: [{ role:'user', content:prompt }],
      }),
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('[analyze error]', JSON.stringify(d.error));
      return res.status(r.status).json({ error: d.error?.message || 'Claude API error' });
    }
    const text = d.content?.find(b => b.type === 'text')?.text || '';
    console.log(`[analyze] ${text.length} chars`);
    res.json({ text });
  } catch(err) {
    console.error('[analyze catch]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════
// LOTTERY STATS — ระบบสถิติสลากสะสม (Persistent Cache)
// แหล่งข้อมูล: www.glo.or.th (API ทางการของสำนักงานสลากกินแบ่งรัฐบาล — ไม่ต้องใช้ API key)
// หมายเหตุ: เดิมใช้ lotto.api.rayriffy.com แต่ repo ต้นทางถูก archive แล้ว (พ.ค. 2026) จึงเปลี่ยนมาใช้ API ทางการแทน
//
// กลยุทธ์: เก็บข้อมูลสะสมใน lotto-db.json (ข้างๆ server.js)
//   - ครั้งแรก: ดึงย้อนหลังให้ได้มากที่สุด (ทีละ page จนครบ)
//   - ครั้งต่อไป: ดึงเฉพาะงวดใหม่ที่ยังไม่มีในฐานข้อมูล
//   - ไม่ต้องดึงซ้ำทุกครั้งที่ client ขอ
// ════════════════════════════════════════════════
const fs   = require('fs');

// ════════════════════════════════════════════════
// GITHUB-BACKED PERSISTENCE
// Render free tier ไม่มี persistent disk — ไฟล์ที่เขียนตอน runtime จะหายทุกครั้งที่
// deploy ใหม่หรือ container restart (spin down เพราะ idle) กลยุทธ์: เก็บไฟล์ .json
// สำคัญไว้ใน GitHub repo ด้วย ทุกครั้งที่ server เริ่มทำงาน จะดึงไฟล์ล่าสุดจาก
// GitHub มาเขียนลง disk ก่อน (restore) แล้วทุกครั้งที่บันทึกข้อมูลใหม่ จะ push
// ขึ้น GitHub ด้วย (backup) — โค้ดส่วนอื่นที่อ่าน/เขียนไฟล์ local ทำงานเหมือนเดิมทุกอย่าง
// ════════════════════════════════════════════════
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'playdrive';
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'thaihora';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_ENABLED = !!GITHUB_TOKEN;

// เก็บ sha ล่าสุดของแต่ละไฟล์ไว้ในหน่วยความจำ (GitHub Contents API ต้องใช้ sha
// เดิมตอนอัปเดตไฟล์ที่มีอยู่แล้ว ไม่งั้นจะถูกปฏิเสธด้วย 409 Conflict)
const _ghShaCache = {};

async function ghGetFile(repoPath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}?ref=${GITHUB_BRANCH}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'ruek-dee-server' }
  });
  if (r.status === 404) return null; // ไฟล์ยังไม่เคยถูกสร้างใน repo — ไม่ใช่ error
  if (!r.ok) throw new Error(`GitHub read ${repoPath} ล้มเหลว: ${r.status} ${await r.text()}`);
  const json = await r.json();
  _ghShaCache[repoPath] = json.sha;
  return Buffer.from(json.content, 'base64').toString('utf8');
}

async function ghPutFile(repoPath, content) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`;
  const body = {
    message: `อัปเดต ${repoPath} — ${new Date().toISOString()}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (_ghShaCache[repoPath]) body.sha = _ghShaCache[repoPath];
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'ruek-dee-server',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub write ${repoPath} ล้มเหลว: ${r.status} ${await r.text()}`);
  const json = await r.json();
  _ghShaCache[repoPath] = json.content.sha; // เก็บ sha ใหม่ไว้ใช้ครั้งถัดไป
}

// เรียกตอน server เริ่มทำงาน: ดึงไฟล์ล่าสุดจาก GitHub มาเขียนทับไฟล์ local
// ก่อนที่โค้ดส่วนอื่นจะเริ่มอ่าน (กัน local ว่างเปล่าหลัง deploy ใหม่)
async function restoreFromGitHub(repoPath, localPath) {
  if (!GITHUB_ENABLED) return;
  try {
    const content = await ghGetFile(repoPath);
    if (content !== null) {
      fs.writeFileSync(localPath, content, 'utf8');
      console.log(`[github-sync] กู้คืน ${repoPath} จาก GitHub สำเร็จ`);
    } else {
      console.log(`[github-sync] ยังไม่มี ${repoPath} ใน GitHub (เริ่มจากไฟล์ว่าง)`);
    }
  } catch (e) {
    console.error(`[github-sync] กู้คืน ${repoPath} ล้มเหลว:`, e.message);
  }
}

// เรียกหลังบันทึกไฟล์ local ทุกครั้ง: push ขึ้น GitHub เพื่อ backup ถาวร
async function backupToGitHub(repoPath, content) {
  if (!GITHUB_ENABLED) return;
  try {
    await ghPutFile(repoPath, content);
  } catch (e) {
    console.error(`[github-sync] backup ${repoPath} ล้มเหลว:`, e.message);
  }
}

// เขียนไฟล์แบบ atomic: เขียนลงไฟล์ .tmp ก่อน แล้ว rename ทับตัวจริง
// (rename เป็น atomic บน filesystem เดียวกัน) — กันไฟล์ DB พังถ้า process ตายกลางการเขียน
function writeFileAtomicSync(file, data) {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    // fallback: ถ้า rename ใช้ไม่ได้ (เช่นบางระบบไฟล์) เขียนตรงแทน
    try { fs.writeFileSync(file, data, 'utf8'); } catch {}
  }
}
function writeFileAtomic(file, data) {
  return new Promise((resolve) => {
    const tmp = `${file}.tmp`;
    fs.writeFile(tmp, data, 'utf8', (err) => {
      if (err) { console.error('[atomic] write tmp error', err.message); return resolve(); }
      fs.rename(tmp, file, (err2) => {
        if (err2) {
          console.error('[atomic] rename error', err2.message);
          fs.writeFile(file, data, 'utf8', () => resolve()); // fallback
        } else resolve();
      });
    });
  });
}

const LOTTO_DB_PATH = path.join(__dirname, 'lotto-db.json');
let _lottoMemCache = null; // in-memory cache หลังโหลดจากไฟล์
let _lottoMemTs = 0;
const LOTTO_MEM_TTL = 60 * 60 * 1000; // 1 ชั่วโมง
let _lottoRefreshInProgress = false; // กันไม่ให้ refresh ซ้อน (เขียนไฟล์ชนกัน)

// โหลด/บันทึก lotto-db.json
function loadLottoDB() {
  if (!fs.existsSync(LOTTO_DB_PATH)) return { records: [], skipIds: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(LOTTO_DB_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.records)) return { records: [], skipIds: [] };
    if (!Array.isArray(parsed.skipIds)) parsed.skipIds = [];
    return parsed;
  } catch { return { records: [], skipIds: [] }; }
}
function saveLottoDB(db) {
  writeFileAtomicSync(LOTTO_DB_PATH, JSON.stringify(db, null, 2));
}
async function saveLottoDBAsync(db) {
  const data = JSON.stringify(db, null, 2);
  await writeFileAtomic(LOTTO_DB_PATH, data);
  await backupToGitHub('lotto-db.json', data); // สำรองขึ้น GitHub ทันทีหลังเขียน local
}

// ── lotto-raw-db.json: เก็บ raw response จาก API ก่อน parse ──────────────
// โครงสร้าง: { records: [ { id, date, raw: <API response object> }, ... ] }
const LOTTO_RAW_DB_PATH = path.join(__dirname, 'lotto-raw-db.json');

function loadLottoRawDB() {
  if (!fs.existsSync(LOTTO_RAW_DB_PATH)) return { records: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(LOTTO_RAW_DB_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch { return { records: [] }; }
}

async function saveLottoRawDBAsync(db) {
  const data = JSON.stringify(db, null, 2);
  await writeFileAtomic(LOTTO_RAW_DB_PATH, data);
  await backupToGitHub('lotto-raw-db.json', data); // สำรองขึ้น GitHub ทันทีหลังเขียน local
}

// ── lotto-stats-cache.json: cache ผลวิเคราะห์ ──────────────────────────────
// cache key = recordCount + lastRecordId
// ถ้า key ตรงกัน → ใช้ผลเก่าได้เลย ไม่ต้อง recompute
const LOTTO_STATS_CACHE_PATH = path.join(__dirname, 'lotto-stats-cache.json');

const STATS_CACHE_VERSION = 2; // เพิ่มทุกครั้งที่ schema เปลี่ยน → invalidate cache เก่า

function loadStatsCache() {
  if (!fs.existsSync(LOTTO_STATS_CACHE_PATH)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(LOTTO_STATS_CACHE_PATH, 'utf8'));
    if (c && c.cacheKey && c.stats && c.v === STATS_CACHE_VERSION) return c;
    // version ไม่ตรง หรือมี freq (schema เก่า) → invalidate
    console.log('[stats-cache] version mismatch — invalidated');
  } catch {}
  return null;
}

function saveStatsCache(cacheKey, stats) {
  writeFileAtomicSync(
    LOTTO_STATS_CACHE_PATH,
    JSON.stringify({ v: STATS_CACHE_VERSION, cacheKey, stats, savedAt: new Date().toISOString() })
  );
}

// สร้าง cache key จาก records — ใช้ count + id งวดล่าสุด + id งวดเก่าสุด
// เพิ่มเลขนี้ทุกครั้งที่แก้ computeStats() แล้วอยากบังคับให้ cache เก่า invalidate
// (เช่น เพิ่ม field ใหม่ในผลลัพธ์) มิฉะนั้น cache เดิมจะยัง HIT อยู่เพราะ key ผูกกับ
// records เท่านั้น ไม่ได้ผูกกับโครงสร้างผลลัพธ์ของ computeStats
const STATS_SCHEMA_VERSION = 2; // v2: เพิ่ม byDow (เลขเด่นแยกตามวันในสัปดาห์)

function makeStatsCacheKey(records) {
  if (!records.length) return '';
  return `v${STATS_SCHEMA_VERSION}:${records.length}:${records[0].id}:${records[records.length - 1].id}`;
}

// แปลง raw API response → record ย่อที่เราเก็บ
// แปลง id DDMMYYYY → YYYYMMDD เพื่อใช้ sort
function idToSortKey(id) {
  if (id && id.length === 8) return id.slice(4) + id.slice(2, 4) + id.slice(0, 2);
  return id || '';
}

// แปลง id DDMMYYYY → "DD-MM-YYYY" อ่านง่ายขึ้น สำหรับข้อความ progress/log
function formatIdDate(id) {
  if (!id || id.length !== 8) return id || '';
  return `${id.slice(0, 2)}-${id.slice(2, 4)}-${id.slice(4)}`;
}

// แปลง slug date → ชื่อวันที่ภาษาไทยสวยงาม จาก id
const THAI_MONTHS_MAP = {
  '01':'มกราคม','02':'กุมภาพันธ์','03':'มีนาคม','04':'เมษายน',
  '05':'พฤษภาคม','06':'มิถุนายน','07':'กรกฎาคม','08':'สิงหาคม',
  '09':'กันยายน','10':'ตุลาคม','11':'พฤศจิกายน','12':'ธันวาคม',
};
function normalizeDateFromId(id, rawDate) {
  // ถ้าไม่มี id ส่ง rawDate กลับ
  if (!id || id.length !== 8) return rawDate || '';
  const dd = id.slice(0, 2), mm = id.slice(2, 4), yyyy = id.slice(4);
  const monthName = THAI_MONTHS_MAP[mm] || mm;
  const clean = `${parseInt(dd, 10)} ${monthName} ${yyyy}`;
  // ถ้า rawDate สวยงามอยู่แล้ว (ขึ้นต้นด้วยตัวเลข ไม่มีขีดกลาง ไม่มี prefix) ใช้ได้เลย
  if (rawDate && /^\d/.test(rawDate.trim()) && !rawDate.includes('-')) return rawDate.trim();
  // มิฉะนั้น (slug, มี prefix, มีขีด) → สร้างใหม่จาก id
  return clean;
}

// helper: ดึง numbers จาก prizes array ตาม prizeId, trim + filter ตาม regex
function extractPrizeNums(prizes, prizeId, pattern) {
  const raw = prizes.find(x => x.id === prizeId)?.number || [];
  return raw.map(n => String(n).trim()).filter(n => pattern.test(n));
}

// แปลงข้อมูลจาก GLO API (result.response.result.data) → รูปแบบ prizes/runningNumbers เดิม
// เพื่อให้ parseRecord() ด้านล่างใช้ต่อได้โดยไม่ต้องแก้ logic การ extract เลข
function gloDataToRespShape(data) {
  const numsOf = (field) => (field?.number || []).map(x => String(x?.value ?? x ?? '').trim());
  return {
    prizes: [
      { id: 'prizeFirst',     number: numsOf(data.first) },
      { id: 'prizeFirstNear', number: numsOf(data.near1) },
      { id: 'prizeSecond',    number: numsOf(data.second) },
      { id: 'prizeThird',     number: numsOf(data.third) },
      { id: 'prizeForth',     number: numsOf(data.fourth) },
      { id: 'prizeFifth',     number: numsOf(data.fifth) },
    ],
    runningNumbers: [
      { id: 'runningNumberFrontThree', number: numsOf(data.last3f) },
      { id: 'runningNumberBackThree',  number: numsOf(data.last3b) },
      { id: 'runningNumberBackTwo',    number: numsOf(data.last2) },
    ],
  };
}

function parseRecord(id, date, resp) {
  const prizes  = resp.prizes || [];
  const running = resp.runningNumbers || [];

  const SIX   = /^\d{6}$/;
  const THREE = /^\d{3}$/;
  const TWO   = /^\d{2}$/;

  // ── รางวัลหลัก (prizes[]) ──────────────────────────────────────────────
  // รางวัลที่ 1 (1 เลข, 6 หลัก)
  const first6 = extractPrizeNums(prizes, 'prizeFirst', SIX)[0] || '';

  // รางวัลใกล้เคียงที่ 1 (2 เลข, 6 หลัก) — รองรับทั้ง 2 ชื่อ field ที่ API อาจใช้
  const nearFirst = [
    ...extractPrizeNums(prizes, 'prizeNearFirst',  SIX),
    ...extractPrizeNums(prizes, 'prizeFirstNear',  SIX),
  ].slice(0, 2);

  // รางวัลที่ 2–5 (6 หลัก)
  const second = extractPrizeNums(prizes, 'prizeSecond', SIX).slice(0, 5);
  const third  = extractPrizeNums(prizes, 'prizeThird',  SIX).slice(0, 10);
  const fourth = extractPrizeNums(prizes, 'prizeForth', SIX).slice(0, 50);
  const fifth  = extractPrizeNums(prizes, 'prizeFifth',  SIX).slice(0, 100);

  // ── เลขท้าย (runningNumbers[]) ─────────────────────────────────────────
  const allRunning = running.flatMap(x => (x.number || []).map(n => String(n).trim()));
  const threeDigit = allRunning.filter(n => THREE.test(n));
  const twoDigit   = allRunning.filter(n => TWO.test(n));

  // หน้า 3 ตัว (2 เลข) — slice(0,2) กัน 4-items กรณี API รวม front+back มาด้วยกัน
  const front3raw   = (running.find(x => x.id === 'runningNumberFrontThree')?.number || []).map(n => String(n).trim());
  const front3field = front3raw.filter(n => THREE.test(n)).slice(0, 2);
  const front3      = front3field.length >= 2 ? front3field : threeDigit.slice(0, 2);

  // ท้าย 3 ตัว (2 เลข) — filter 2-digit ออก, fallback pool ที่ไม่ซ้ำ front3
  const back3raw   = (running.find(x => x.id === 'runningNumberBackThree')?.number || []).map(n => String(n).trim());
  const back3field = back3raw.filter(n => THREE.test(n)).slice(0, 2);
  const back3      = back3field.length >= 2 ? back3field : threeDigit.filter(n => !front3.includes(n)).slice(0, 2);

  // ท้าย 2 ตัว (1 เลข)
  const back2raw = (running.find(x => x.id === 'runningNumberBackTwo')?.number || []).map(n => String(n).trim());
  const back2    = back2raw.find(n => TWO.test(n)) || twoDigit[0] || '';

  return {
    id,
    date: normalizeDateFromId(id, date),
    first6,
    nearFirst,  // รางวัลใกล้เคียงที่ 1 (2 เลข)
    second,     // รางวัลที่ 2 (5 เลข)
    third,      // รางวัลที่ 3 (10 เลข)
    fourth,     // รางวัลที่ 4 (50 เลข)
    fifth,      // รางวัลที่ 5 (100 เลข)
    front3,     // หน้า 3 ตัว (2 เลข)
    back3,      // ท้าย 3 ตัว (2 เลข)
    back2,      // ท้าย 2 ตัว (1 เลข)
  };
}

// แปลงปี พ.ศ. (string 4 หลัก) → ปี ค.ศ. (string) ตามที่ GLO API ต้องการ
function buddhistToGregorianYear(yyyyBE) {
  return String(parseInt(yyyyBE, 10) - 543);
}

const THAI_DOW_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

// หาวันในสัปดาห์ (0=อาทิตย์ ... 6=เสาร์) จาก id ของงวด (ddmmyyyyBE)
// ใช้ id จริงของงวด (actualId ที่บันทึกไว้ ไม่ใช่ candidateId ที่เดาไว้ตอนแรก)
// จึงได้วันที่ออกรางวัลจริง แม้งวดนั้นจะถูกเลื่อนวันมาก็ตาม
function dowFromId(id) {
  if (!id || id.length !== 8) return null;
  const dd = parseInt(id.slice(0, 2), 10);
  const mm = parseInt(id.slice(2, 4), 10) - 1;
  const yyyyCE = parseInt(buddhistToGregorianYear(id.slice(4)), 10);
  // ใช้ 05:00 UTC (= 12:00 ICT) แล้วอ่าน getUTCDay() เพื่อให้ได้วันในสัปดาห์
  // ตาม ICT เสมอ ไม่ขึ้นกับ timezone ของเครื่องที่รัน server
  const d = new Date(Date.UTC(yyyyCE, mm, dd, 5, 0, 0));
  return isNaN(d.getTime()) ? null : d.getUTCDay();
}

// ── งวดที่มีประกาศทางการยืนยันแล้วว่า "ไม่มีการจำหน่าย/ออกรางวัลจริง" ──────────
// ต่างจากกรณีเลื่อนวันไม่กี่วัน (วันหยุด/วันสำคัญทางศาสนา) เพราะนี่เป็นมติคณะกรรมการ
// ที่คำนวณจากวันที่อย่างเดียวไม่ได้ จึงต้องจดไว้เป็นกรณีพิเศษล่วงหน้า เพื่อไม่ต้องเสีย
// เวลาไล่ลอง ±3 วันซ้ำทุกครั้งที่รัน backfill ใหม่
//
// กรณี COVID-19 ปี 2563: บอร์ดสลากฯ มีมติเลื่อนงวด 1 เม.ย. 2563 ไปออกรางวัลวันที่
// 16 พ.ค. 2563 แทน (ตั๋วเดิมงวด 1 เม.ย. ยังใช้ได้ ไม่ต้องซื้อใหม่ — ผลรางวัลที่ประกาศ
// วันที่ 16 พ.ค. ยังคงระบุว่าเป็น "งวดประจำวันที่ 1 เมษายน 2563") และงดจำหน่ายสลากใหม่
// ทั้งหมดในงวด 16 เม.ย., 1 พ.ค., และ 16 พ.ค. 2563 — จึงไม่มีผลรางวัลของ 3 งวดนี้อยู่จริง
// อ้างอิง: https://www.sanook.com/news/8081278/ , https://thaipublica.org/2020/03/lotto-online-covid-19/
const LOTTO_CONFIRMED_NO_DRAW = new Set([
  '16042563', // งดขาย/งดออกรางวัล (โควิด-19)
  '01052563', // งดขาย/งดออกรางวัล (โควิด-19)
  '16052563', // งดขาย/งดออกรางวัลของงวดใหม่ — ผลที่ประกาศวันนี้เป็นของงวด 01042563 ที่เลื่อนมา
]);

// ดึงงวดหนึ่งจาก GLO API (ตามวันที่) พร้อม retry
// id คือ DDMMYYYY (ปี พ.ศ.) เช่น "01032567"
// คืนค่า { status: 'ok', resp } | { status: 'nodata' } (ยืนยันว่าไม่มีข้อมูลจริง) | { status: 'error' } (ดึงไม่สำเร็จชั่วคราว ควรลองใหม่)
async function fetchOneLotto(id, retries = 4) {
  if (!id || id.length !== 8) return { status: 'error' };
  const dd = id.slice(0, 2), mm = id.slice(2, 4), yyyyBE = id.slice(4);
  const yyyyCE = buddhistToGregorianYear(yyyyBE);
  const body = JSON.stringify({ date: dd, month: mm, year: yyyyCE });

  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch('https://www.glo.or.th/api/checking/getLotteryResult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body,
        signal: AbortSignal.timeout(LOTTO_API_TIMEOUT),
      });
      if (r.status === 429) {
        const wait = 2000 * Math.pow(2, i);
        console.log(`[lotto] rate-limit on ${formatIdDate(id)}, waiting ${wait}ms (attempt ${i+1})`);
        await new Promise(res => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) {
        console.log(`[lotto] HTTP ${r.status} on ${formatIdDate(id)} (attempt ${i+1}/${retries+1})`);
        await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        continue;
      }
      const json = await r.json();
      const data = json?.response?.result?.data;
      // ยืนยันแล้วว่าไม่มีผลรางวัลจริง (เช่น งวดในอนาคต หรือเก่าเกินกว่าระบบจะมีข้อมูล)
      if (!data || !data.first?.number?.length) return { status: 'nodata' };
      return { status: 'ok', resp: gloDataToRespShape(data) };
    } catch (err) {
      console.log(`[lotto] fetch error on ${formatIdDate(id)}: ${err.message} (attempt ${i+1}/${retries+1})`);
      if (i < retries) await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }
  // ลองครบทุกครั้งแล้วยังไม่สำเร็จ → ถือเป็นปัญหาชั่วคราว (network/timeout) ไม่ใช่ "ไม่มีข้อมูล"
  return { status: 'error' };
}

// หวยไทยปกติออกวันที่ 1/16 แต่บางครั้งชนวันหยุดพิเศษ ทำให้เลื่อนออกไป 1-2 วัน (เช่น 1→2,3 หรือ 16→17,18)
// ฟังก์ชันนี้ลอง candidateId ตามที่คำนวณไว้ก่อน ถ้าไม่มีข้อมูลจริง ค่อยไล่ลอง +1, +2 วันถัดไป
// คืนค่าเพิ่ม actualId (id ที่ใช้บันทึกจริง) และ shifted (true ถ้าไม่ตรงกับ candidateId เดิม)
async function fetchLottoForCandidate(candidateId, maxShiftDays = 2) {
  // งวดที่ยืนยันแล้วว่าไม่มีการออกรางวัลจริง (ดูตาราง LOTTO_CONFIRMED_NO_DRAW ด้านบน)
  // → ข้ามการยิง API ทั้งหมด ตอบ nodata ได้เลยทันที ประหยัดเวลาและรอบ retry
  if (LOTTO_CONFIRMED_NO_DRAW.has(candidateId)) {
    return { status: 'nodata' };
  }

  const ddNum = parseInt(candidateId.slice(0, 2), 10);
  const mmNum = parseInt(candidateId.slice(2, 4), 10);
  const mm = mmNum - 1; // 0-indexed
  const yyyyCE = parseInt(buddhistToGregorianYear(candidateId.slice(4)), 10);
  const baseDate = new Date(yyyyCE, mm, ddNum);

  // งวดวันที่ 1 หรือ 16 ของทุกเดือน เป็นกรณีพิเศษ: บางครั้งวันจริงชนวันหยุด
  // ทางพุทธศาสนา (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา/เข้าพรรษา ฯลฯ ซึ่งอิงปฏิทินจันทรคติ
  // เลยไม่ตรงวันเดิมทุกปี) ทำให้รัฐบาลกำหนดให้ออก "ล่วงหน้า" ไปอยู่ก่อนวันเดิมไม่กี่วัน
  // (เช่น งวด 16 ก.ค. 2562 เลื่อนมาออกวันที่ 15 ก.ค. 2562 เพราะ 16-17 ก.ค. ตรงกับ
  // วันอาสาฬหบูชา/วันเข้าพรรษา) แทนที่จะเลื่อนไปข้างหน้าเหมือนงวดที่ชนวันหยุดราชการทั่วไป
  // ดังนั้นถ้า candidate ตรงกับวันที่ 1 หรือ 16 ของเดือนใดก็ตาม ต้องไล่ค้นย้อนหลังด้วยเสมอ
  // ค้นในช่วง -2 ถึง +2 วันจากวันที่คำนวณไว้ (ลองย้อนหลังก่อน เพราะเป็นพฤติกรรมจริงที่พบ
  // บ่อยกว่า แล้วค่อยลองวันจริง/เลื่อนไปข้างหน้าเป็น fallback) — ไม่ว่าจะลองกี่ offset
  // ในช่วงนี้ ถ้าไม่พบข้อมูลเลยสักวัน ก็ยังนับ/log เป็น "1 งวด" (candidateId เดิม) เท่านั้น
  // ไม่ได้นับซ้ำตามจำนวน offset ที่ลอง (ดู loop ด้านล่าง — log และ skipIds ทำครั้งเดียวต่อ
  // candidate หลังจบ loop ไม่ใช่ต่อ offset)
  const isRegularDrawDay = ddNum === 1 || ddNum === 16;
  const offsets = isRegularDrawDay
    ? [-2, -1, 0, 1, 2]
    : Array.from({ length: maxShiftDays + 1 }, (_, i) => i); // 0,1,2,... เหมือนเดิม

  let sawError = false;
  for (const shift of offsets) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + shift);
    const tryId =
      String(d.getDate()).padStart(2, '0') +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getFullYear() + 543);

    const result = await fetchOneLotto(tryId);
    if (result.status === 'ok') {
      return { status: 'ok', resp: result.resp, actualId: tryId, shifted: shift !== 0 };
    }
    if (result.status === 'error') sawError = true;
    await new Promise(r => setTimeout(r, 500));
  }
  // ไม่มีข้อมูลไม่ว่าจะลองวันไหนในช่วงที่กำหนด
  // ถ้าระหว่างทางเคย error (ไม่ใช่ nodata ล้วนๆ) → ถือว่ายังสรุปไม่ได้ ให้ลองใหม่ครั้งหน้า
  return { status: sawError ? 'error' : 'nodata' };
}

// GLO ไม่มี endpoint แบบ "list ทุกงวด" เหมือน API เดิม
// จึงสร้างรายการงวดที่ "น่าจะมี" เอง โดยหวยไทยออกทุกวันที่ 1 และ 16 ของเดือน
// เริ่มนับจากงวดล่าสุดที่มีอยู่แล้วใน DB มาจนถึงวันนี้ (หรือย้อนหลัง ~2 ปีถ้า DB ว่าง)
function generateCandidateIds(existingIds, skipIds, maxItems = 5000) {
  const today = new Date();
  let startDate;

  if (existingIds.size) {
    let maxKey = '', maxId = '';
    for (const id of existingIds) {
      const key = idToSortKey(id);
      if (key > maxKey) { maxKey = key; maxId = id; }
    }
    const dd = maxId.slice(0, 2), mm = maxId.slice(2, 4), yyyyCE = parseInt(buddhistToGregorianYear(maxId.slice(4)), 10);
    startDate = new Date(yyyyCE, parseInt(mm, 10) - 1, parseInt(dd, 10));
  } else {
    // ไม่มีข้อมูลเดิมเลย → backfill ย้อนหลังลึก (งวดที่ยังไม่มีข้อมูลจริงจะถูก skip อัตโนมัติ
    // และจำไว้ใน skipIds ไม่ต้องลองซ้ำในครั้งถัดไป จึงตั้งลึกไว้ก่อนได้อย่างปลอดภัย)
    // เริ่มที่ 1 ม.ค. 2553 (พ.ศ.) เพราะข้อมูลจริงที่เก่าที่สุดที่หาได้มีแค่ถึงวันนี้
    startDate = new Date(2010, 0, 1);
  }

  const results = [];
  // เมื่อไม่มีข้อมูลเดิมเลย ต้อง "รวม" startDate เองเป็น candidate แรกด้วย (ไม่ใช่แค่งวดถัดไป)
  // จึงต้องถอย cursor ไป 1 วันก่อน startDate เพื่อให้รอบแรกของ loop คำนวณแล้วตกลงที่ startDate พอดี
  let cursor = new Date(startDate);
  if (!existingIds.size) cursor.setDate(cursor.getDate() - 1);
  let guard = 0;
  while (guard++ < maxItems) {
    // เลื่อนไปหางวดถัดไป: ถ้าวันปัจจุบัน < 16 → ไปวันที่ 16 เดือนเดียวกัน, ไม่งั้น → วันที่ 1 เดือนถัดไป
    if (cursor.getDate() < 16) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 16);
    } else {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    if (cursor > today) break;

    const dd = String(cursor.getDate()).padStart(2, '0');
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const yyyyBE = String(cursor.getFullYear() + 543);
    const id = `${dd}${mm}${yyyyBE}`;
    if (!existingIds.has(id) && !skipIds.has(id)) {
      results.push({ id, url: `/lotto/${id}`, date: '' });
    }
  }
  return results;
}

// คงชื่อ fetchAllIds ไว้เพื่อให้จุดเรียกใช้ด้านล่างไม่ต้องแก้ (wrap แบบ sync → async)
async function fetchAllIds() {
  return [];
}

// คำนวณสถิติจาก records[] — ครบทุกรางวัล
function computeStats(records) {
  const freq = {
    first6: {}, nearFirst: {}, second: {}, third: {}, fourth: {}, fifth: {},
    front3: {}, back3: {}, back2: {},
  };
  const inc = (obj, k) => { if (k) obj[k] = (obj[k] || 0) + 1; };

  // ความถี่หลักแยกตำแหน่ง (0-5) จาก first6 เท่านั้น (สถิติ 5–10)
  const digitPos_first6 = Array.from({length:6}, () => ({}));
  // ความถี่หลักแยกตำแหน่ง (0-5) จากเลข 6 หลักทุกรางวัล (สถิติ 11–16)
  const digitPos_all6   = Array.from({length:6}, () => ({}));

  for (const r of records) {
    inc(freq.first6, r.first6);
    (r.nearFirst || []).forEach(n => inc(freq.nearFirst, n));
    (r.second    || []).forEach(n => inc(freq.second,    n));
    (r.third     || []).forEach(n => inc(freq.third,     n));
    (r.fourth    || []).forEach(n => inc(freq.fourth,    n));
    (r.fifth     || []).forEach(n => inc(freq.fifth,     n));
    (r.front3    || []).forEach(n => inc(freq.front3,    n));
    (r.back3     || []).forEach(n => inc(freq.back3,     n));
    inc(freq.back2, r.back2);

    // นับหลักแยกตำแหน่ง จาก first6
    if (r.first6 && r.first6.length === 6) {
      for (let i = 0; i < 6; i++) inc(digitPos_first6[i], r.first6[i]);
    }

    // นับหลักแยกตำแหน่ง จากทุกรางวัล 6 หลัก
    const all6 = [
      r.first6,
      ...(r.nearFirst || []),
      ...(r.second    || []),
      ...(r.third     || []),
      ...(r.fourth    || []),
      ...(r.fifth     || []),
    ].filter(n => n && n.length === 6);
    for (const num of all6) {
      for (let i = 0; i < 6; i++) inc(digitPos_all6[i], num[i]);
    }
  }

  const topN = (obj, n) =>
    Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([num,cnt]) => ({num,cnt}));

  // top digit แต่ละตำแหน่ง — คืน array 6 ตัว แต่ละตัวคือ top 3 หลักที่ออกบ่อยสุด
  const topDigitByPos = (posArr) => posArr.map(d => topN(d, 3));

  // เลขที่ไม่เคยออกเลย (ท้าย 2 ตัว)
  const allBack2   = Array.from({length:100}, (_,i) => String(i).padStart(2,'0'));
  const neverBack2 = allBack2.filter(n => !freq.back2[n]);

  // เลขร้อน/เย็น (ท้าย 2 ตัว) จาก 20 งวดล่าสุด
  const recent = records.slice(0, 20);
  const hotMap = {}, seenInRecent = new Set();
  recent.forEach(h => { if (h.back2) { hotMap[h.back2] = (hotMap[h.back2]||0)+1; seenInRecent.add(h.back2); } });
  const hotBack2  = Object.entries(hotMap).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]).map(([n,c])=>({num:n,cnt:c}));
  const coldBack2 = Object.keys(freq.back2).filter(n => !seenInRecent.has(n)).slice(0, 15);

  // ช่วงห่าง (gap) ท้าย 2 ตัว
  const lastSeen = {};
  records.forEach((r, i) => { if (r.back2 && !(r.back2 in lastSeen)) lastSeen[r.back2] = i; });
  const longGap = Object.entries(lastSeen)
    .filter(([,g]) => g >= 10).sort((a,b) => b[1]-a[1]).slice(0,10)
    .map(([num,gap]) => ({num, gap}));

  // ── เลขท้าย 2 ตัว ที่ออกบ่อยสุด แยกตามวันในสัปดาห์ที่ออกจริง ──
  // ใช้ r.id (วันที่ออกจริงหลังปรับเลื่อนแล้ว) ไม่ใช่วันที่ "ควรจะ" ออกตามรอบ 1/16
  const freqByDow  = Array.from({ length: 7 }, () => ({}));
  const dowDrawCnt = Array(7).fill(0);
  for (const r of records) {
    const dow = dowFromId(r.id);
    if (dow === null) continue;
    dowDrawCnt[dow]++;
    inc(freqByDow[dow], r.back2);
  }
  const byDow = THAI_DOW_NAMES.map((name, i) => ({
    dow: i,
    dowName: name,
    drawCount: dowDrawCnt[i],
    top: topN(freqByDow[i], 5),
  }));

  return {
    // ไม่ส่ง freq raw ไป client — ใหญ่มาก (esp. fifth=45k entries)
    // client ใช้ top[0].cnt เป็น max แทน
    top: {
      first6:   topN(freq.first6,   15),
      nearFirst:topN(freq.nearFirst, 10),
      second:   topN(freq.second,    15),
      third:    topN(freq.third,     15),
      fourth:   topN(freq.fourth,    15),
      fifth:    topN(freq.fifth,     15),
      front3:   topN(freq.front3,    15),
      back3:    topN(freq.back3,     15),
      back2:    topN(freq.back2,     15),
    },
    // สถิติ 5–10: หลักแยกตำแหน่งจาก first6
    digitPos_first6: topDigitByPos(digitPos_first6),
    // สถิติ 11–16: หลักแยกตำแหน่งจากทุกรางวัล 6 หลัก
    digitPos_all6:   topDigitByPos(digitPos_all6),
    neverBack2, hotBack2, coldBack2, longGap, byDow,
  };
}

// ── Stats cache helper ────────────────────────────
// ใช้ cache ถ้า key ตรง, ไม่งั้น recompute แล้ว save
function getOrComputeStats(records) {
  const key = makeStatsCacheKey(records);
  const cached = loadStatsCache();
  if (cached && cached.cacheKey === key) {
    console.log('[stats-cache] HIT — skip recompute');
    return cached.stats;
  }
  console.log('[stats-cache] MISS — computing stats...');
  const stats = computeStats(records);
  saveStatsCache(key, stats);
  console.log('[stats-cache] saved');
  return stats;
}

// ── SSE helper ──────────────────────────────────
function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── /api/lottery-stats — SSE progress stream ───
// query param: ?refresh=1 → ดึงงวดใหม่จาก API
// ไม่มี param → ใช้ข้อมูลใน lotto-db.json ที่มีอยู่ทันที ไม่ call API
const LOTTO_API_TIMEOUT = 60_000; // 60 วินาที

app.get('/api/lottery-stats', async (req, res) => {
  const wantSSE   = req.headers.accept === 'text/event-stream';
  const doRefresh = req.query.refresh === '1';

  // ── ถ้าไม่ใช่ SSE และมี cache ส่ง JSON ปกติ ──
  if (!wantSSE) {
    if (_lottoMemCache && Date.now() - _lottoMemTs < LOTTO_MEM_TTL) {
      return res.json(_lottoMemCache);
    }
    return res.status(202).json({ message: 'กรุณาใช้ SSE (Accept: text/event-stream) เพื่อดูความคืบหน้า' });
  }

  // ── SSE mode ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // ── ใช้ in-memory cache ถ้าไม่ได้ refresh ──
  if (!doRefresh && _lottoMemCache && Date.now() - _lottoMemTs < LOTTO_MEM_TTL) {
    sendSSE(res, 'progress', { step: 'cache', message: '✅ ใช้ข้อมูลจาก cache', percent: 100 });
    sendSSE(res, 'done', _lottoMemCache);
    return res.end();
  }

  // ── กัน refresh ซ้อนกัน: ถ้ามีการอัปเดตกำลังทำงานอยู่ ให้ตอบด้วยข้อมูลเดิมแทน ──
  // (ไม่งั้นสอง request จะยิง GLO API ซ้ำและเขียนไฟล์ทับกัน)
  if (doRefresh && _lottoRefreshInProgress) {
    sendSSE(res, 'progress', { step: 'busy', message: '⏳ กำลังอัปเดตอยู่แล้ว — แสดงข้อมูลเดิมก่อน', percent: 100 });
    const dbNow = loadLottoDB();
    if (dbNow.records?.length) {
      const stats  = getOrComputeStats(dbNow.records);
      sendSSE(res, 'done', { ok: true, rounds: dbNow.records.length, history: dbNow.records.slice(0, 24), updatedAt: dbNow.updatedAt, ...stats, refreshBusy: true });
    } else if (_lottoMemCache) {
      sendSSE(res, 'done', { ..._lottoMemCache, refreshBusy: true });
    } else {
      sendSSE(res, 'error', { message: 'กำลังอัปเดตข้อมูลอยู่ กรุณารอสักครู่แล้วลองใหม่' });
    }
    return res.end();
  }
  if (doRefresh) _lottoRefreshInProgress = true;

  try {
    // 1. โหลด DB เดิม
    sendSSE(res, 'progress', { step: 'load_db', message: '📂 โหลดฐานข้อมูลเดิม...', percent: 5 });
    const db = loadLottoDB();
    if (!Array.isArray(db.records)) db.records = [];
    const existingIds = new Set(db.records.map(r => r.id));
    if (!Array.isArray(db.skipIds)) db.skipIds = [];
    const skipIds = new Set(db.skipIds);
    console.log(`[lotto-stats] DB มี ${existingIds.size} งวด, skip ${skipIds.size} งวด`);

    // ── ถ้าไม่ได้กด refresh และมีข้อมูลใน DB อยู่แล้ว → ใช้เลย ไม่ call API ──
    if (!doRefresh && existingIds.size > 0) {
      sendSSE(res, 'progress', {
        step: 'load_db_done',
        message: `📂 ใช้ข้อมูลเดิม ${existingIds.size} งวด (กด "↻ โหลดสถิติ" เพื่ออัปเดต)`,
        percent: 90,
      });
      const stats  = getOrComputeStats(db.records);
      const result = { ok: true, rounds: db.records.length, history: db.records.slice(0, 24), updatedAt: db.updatedAt, ...stats };
      _lottoMemCache = result;
      _lottoMemTs    = Date.now();
      sendSSE(res, 'progress', { step: 'done', message: `✅ โหลดเสร็จ ${db.records.length} งวด`, percent: 100 });
      sendSSE(res, 'done', result);
      return res.end();
    }

    sendSSE(res, 'progress', {
      step: 'load_db_done',
      message: `📂 ฐานข้อมูลมี ${existingIds.size} งวด — กำลังตรวจหางวดใหม่...`,
      percent: 10,
    });

    // 2. สร้างรายการงวดที่ต้องตรวจสอบ (คำนวณเอง — GLO ไม่มี list endpoint)
    sendSSE(res, 'progress', { step: 'fetch_list', message: '🧮 คำนวณรายการงวดที่ต้องตรวจสอบ...', percent: 15 });
    const allItems = generateCandidateIds(existingIds, skipIds);

    // 3. คัดงวดใหม่
    const newItems = allItems.filter(x => !existingIds.has(x.id) && !skipIds.has(x.id));
    console.log(`[lotto-stats] งวดใหม่ที่ต้องดึง: ${newItems.length}`);
    sendSSE(res, 'progress', {
      step: 'list_done',
      message: `📋 พบงวดทั้งหมด ${allItems.length} งวด — งวดใหม่ที่ต้องดึง: ${newItems.length} งวด`,
      percent: 20,
    });

    // ── ไม่มีงวดใหม่ → ใช้ข้อมูลเดิม ──
    if (newItems.length === 0) {
      sendSSE(res, 'progress', { step: 'no_new', message: '✅ ข้อมูลครบถ้วนแล้ว ไม่มีงวดใหม่', percent: 90 });
      const stats  = getOrComputeStats(db.records);
      const result = { ok: true, rounds: db.records.length, history: db.records.slice(0, 24), updatedAt: db.updatedAt, ...stats };
      _lottoMemCache = result;
      _lottoMemTs    = Date.now();
      sendSSE(res, 'done', result);
      return res.end();
    }

    // 4. ดึงงวดใหม่ (parallel chunk + progress)
    if (newItems.length > 0) {
      // โหลด raw DB (เพื่อเพิ่มข้อมูลต้นทาง)
      const rawDb = loadLottoRawDB();
      if (!Array.isArray(rawDb.records)) rawDb.records = [];
      const existingRawIds = new Set(rawDb.records.map(r => r.id));

      // fetch ทีละ 1 งวด (fully sequential) — หลีกเลี่ยง rate-limit ทั้งหมด
      for (let i = 0; i < newItems.length; i++) {
        const item      = newItems[i];
        const doneCount = i + 1;
        const pct = Math.round(20 + (doneCount / newItems.length) * 65); // 20%→85%

        sendSSE(res, 'progress', {
          step: 'fetch_item',
          message: `⬇️ ดึงงวด ${formatIdDate(item.id)} (${doneCount}/${newItems.length})`,
          percent: pct,
          fetched: doneCount,
          total: newItems.length,
        });

        const result = await fetchLottoForCandidate(item.id);
        if (result.status === 'ok') {
          const actualId = result.actualId;
          if (!existingIds.has(actualId)) {
            const parsed = parseRecord(actualId, '', result.resp);
            db.records.push(parsed);
            existingIds.add(actualId);
            if (!existingRawIds.has(actualId)) {
              rawDb.records.push({ id: actualId, date: '', raw: result.resp });
              existingRawIds.add(actualId);
            }
          }
          // ถ้าวันจริงเลื่อนไปจากที่คำนวณไว้ (item.id) → item.id เดิมไม่ใช่งวดจริง ไม่ต้องคำนวณมาลองซ้ำอีก
          if (result.shifted && !skipIds.has(item.id)) {
            skipIds.add(item.id);
            db.skipIds.push(item.id);
          }
          console.log(`[lotto] OK ${formatIdDate(actualId)}${result.shifted ? ` (เลื่อนจาก ${formatIdDate(item.id)})` : ''} (${doneCount}/${newItems.length})`);
        } else if (result.status === 'nodata') {
          console.log(`[lotto] SKIP ${formatIdDate(item.id)} — ไม่มีข้อมูลงวดนี้จริง แม้ลองเลื่อนวันแล้ว (${doneCount}/${newItems.length})`);
          // บันทึก id ที่ไม่มีข้อมูลจริงลง skipIds — ไม่ลอง fetch ซ้ำในครั้งต่อไป
          if (!skipIds.has(item.id)) {
            skipIds.add(item.id);
            db.skipIds.push(item.id);
          }
        } else {
          // 'error' — ดึงไม่สำเร็จชั่วคราว (network/timeout) ไม่ใช่ยืนยันว่าไม่มีข้อมูล
          // จึงไม่บันทึกลง skipIds เพื่อให้ลองใหม่ได้ในการโหลดครั้งถัดไป
          console.log(`[lotto] ERROR ${formatIdDate(item.id)} — ดึงไม่สำเร็จ จะลองใหม่ครั้งหน้า (${doneCount}/${newItems.length})`);
        }

        // checkpoint ทุก 10 งวด — ข้อมูลที่ดึงมาแล้วไม่หายถ้า server หยุด
        if (doneCount % 10 === 0) {
          db.records.sort((a, b) => idToSortKey(b.id).localeCompare(idToSortKey(a.id)));
          rawDb.records.sort((a, b) => idToSortKey(b.id).localeCompare(idToSortKey(a.id)));
          await Promise.all([saveLottoDBAsync(db), saveLottoRawDBAsync(rawDb)]);
          console.log(`[lotto] checkpoint ${doneCount}/${newItems.length} — db: ${db.records.length} records`);
        }

        // delay 1s ระหว่างแต่ละ request
        if (i < newItems.length - 1) await new Promise(r => setTimeout(r, 1000));
      }

      // เรียงและบันทึก
      sendSSE(res, 'progress', { step: 'sort', message: `🔃 เรียงลำดับ ${db.records.length} งวด...`, percent: 86 });
      db.records.sort((a, b) => idToSortKey(b.id).localeCompare(idToSortKey(a.id)));
      rawDb.records.sort((a, b) => idToSortKey(b.id).localeCompare(idToSortKey(a.id)));
      db.updatedAt = rawDb.updatedAt = new Date().toISOString();
      sendSSE(res, 'progress', { step: 'save', message: `💾 เขียนไฟล์ฐานข้อมูล (${db.records.length} งวด)...`, percent: 88 });
      await Promise.all([saveLottoDBAsync(db), saveLottoRawDBAsync(rawDb)]);
      console.log(`[lotto-stats] บันทึกแล้ว รวม ${db.records.length} งวด (raw: ${rawDb.records.length} งวด)`);
      sendSSE(res, 'progress', { step: 'save_done', message: `✅ บันทึกเสร็จแล้ว รวม ${db.records.length} งวด`, percent: 91 });
    }

    const records = db.records || [];
    if (!records.length) throw new Error('ไม่มีข้อมูลสลากในฐานข้อมูล');

    // 5. คำนวณสถิติ (มีงวดใหม่ → recompute + save cache ใหม่)
    sendSSE(res, 'progress', { step: 'compute', message: '📊 คำนวณสถิติ...', percent: 93 });
    const key   = makeStatsCacheKey(records);
    const stats = computeStats(records);
    saveStatsCache(key, stats);
    const result = {
      ok: true,
      rounds: records.length,
      history: records.slice(0, 24),
      updatedAt: db.updatedAt,
      ...stats,
    };

    _lottoMemCache = result;
    _lottoMemTs = Date.now();

    sendSSE(res, 'progress', { step: 'done', message: `✅ โหลดเสร็จ รวม ${records.length} งวด`, percent: 100 });
    sendSSE(res, 'done', result);
    res.end();

  } catch (err) {
    console.error('[lotto-stats error]', err.message);
    if (_lottoMemCache) {
      sendSSE(res, 'progress', { step: 'error_fallback', message: `⚠️ ${err.message} — ใช้ข้อมูลเก่า`, percent: 100 });
      sendSSE(res, 'done', { ..._lottoMemCache, stale: true });
    } else {
      sendSSE(res, 'error', { message: err.message });
    }
    res.end();
  } finally {
    if (doRefresh) _lottoRefreshInProgress = false; // ปลดล็อกเสมอ
  }
});

// เริ่ม server เฉพาะเมื่อรันไฟล์นี้ตรงๆ (node server.js)
// เมื่อถูก require จาก test จะไม่เปิด port — ให้ import ฟังก์ชัน pure ไปทดสอบได้
if (require.main === module) {
  (async () => {
    // ก่อนเปิดรับ request ใดๆ ให้กู้คืนข้อมูลจาก GitHub มาไว้ใน local ก่อน
    // (สำคัญ: ถ้าไม่รอตรงนี้ request แรกๆ อาจมาถึงตอนที่ local ยังว่างเปล่าอยู่)
    if (GITHUB_ENABLED) {
      console.log('[github-sync] กำลังกู้คืนข้อมูลจาก GitHub...');
      await restoreFromGitHub('lotto-db.json', LOTTO_DB_PATH);
      await restoreFromGitHub('lotto-raw-db.json', LOTTO_RAW_DB_PATH);
    } else {
      console.log('[github-sync] ไม่พบ GITHUB_TOKEN — ข้ามการกู้คืน (ข้อมูลจะไม่ถูกเก็บถาวรบน Render free tier)');
    }

    app.listen(PORT, () => {
      console.log('');
      console.log('  ✦ ฤกษ์ดี Server พร้อมใช้งาน');
      console.log(`  → http://localhost:${PORT}`);
      console.log('  → Engine: Meeus + SunCalc + Lahiri Ayanamsa');
      console.log('  → ไม่มี scraping — ข้อมูลทุกอย่างคำนวณเอง');
      console.log('');
    });
  })();
}

// ── Exports สำหรับการทดสอบ (ไม่กระทบการทำงานปกติ) ──
module.exports = {
  app,
  jdn, sunLongitude, moonLongitude, planetTrueLongitudes, isRetrograde, ayanamsa,
  rasiName, degMin, calcNakshatra, calcTithi, calcYams, calcPlanets,
  getSidLon, findIngressEgress, findExactAspects, jdToThaiDate, computeTransits, retroOf,
  computeHoroscope,
  idToSortKey, formatIdDate, normalizeDateFromId, buddhistToGregorianYear, dowFromId,
  gloDataToRespShape, parseRecord, generateCandidateIds, computeStats, makeStatsCacheKey,
};