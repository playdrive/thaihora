// ═══════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════
// fetch พร้อม timeout — กันสปินเนอร์ค้างถ้า /api/analyze (เรียก Claude) ไม่ตอบ
async function fetchWithTimeout(url, opts = {}, ms = 60000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('หมดเวลารอ AI (timeout) — ลองใหม่อีกครั้ง');
    throw e;
  } finally {
    clearTimeout(id);
  }
}

// ═══════════════════════════════════════════════
// MOON PHASE (คำนวณเอง เพื่อ real-time ที่แม่นยำ)
// ═══════════════════════════════════════════════
const DEG = Math.PI/180;
function julianDay(date) {
  const y=date.getUTCFullYear(), m=date.getUTCMonth()+1;
  const d=date.getUTCDate()+(date.getUTCHours()+date.getUTCMinutes()/60)/24;
  let Y=y,M=m; if(M<=2){Y--;M+=12;}
  const A=Math.floor(Y/100),B=2-A+Math.floor(A/4);
  return Math.floor(365.25*(Y+4716))+Math.floor(30.6001*(M+1))+d+B-1524.5;
}
function norm(x){return ((x%360)+360)%360;}
function moonPhaseAngle(jd) {
  const T=(jd-2451545)/36525;
  const sunL=norm(280.460+0.9856474*(jd-2451545));
  const g=norm(357.528+0.9856003*(jd-2451545))*DEG;
  const sunLon=norm(sunL+1.915*Math.sin(g)+0.020*Math.sin(2*g));
  const mL=norm(218.3164477+481267.88123421*T);
  const mD=norm(297.8501921+445267.1114034*T)*DEG;
  const mMp=norm(134.9633964+477198.8675055*T)*DEG;
  const mM=norm(357.5291092+35999.0502909*T)*DEG;
  const mF=norm(93.2720950+483202.0175233*T)*DEG;
  const moonLon=norm(mL+6.2888*Math.sin(mMp)+1.2740*Math.sin(2*mD-mMp)+0.6583*Math.sin(2*mD)+0.2136*Math.sin(2*mMp)-0.1851*Math.sin(mM)-0.1143*Math.sin(2*mF));
  return norm(moonLon-sunLon);
}
function moonIllum(jd){return (1-Math.cos(moonPhaseAngle(jd)*DEG))/2;}
function drawMoon(svgEl,phase,illum){
  const R=30,cx=36,cy=36;
  const k=Math.abs(Math.cos(phase*DEG));
  let d;
  if(phase<180) d=`M${cx} ${cy-R} A${R} ${R} 0 0 1 ${cx} ${cy+R} A${k*R} ${R} 0 0 ${illum<0.5?1:0} ${cx} ${cy-R}Z`;
  else          d=`M${cx} ${cy-R} A${R} ${R} 0 0 0 ${cx} ${cy+R} A${k*R} ${R} 0 0 ${illum>0.5?1:0} ${cx} ${cy-R}Z`;
  svgEl.innerHTML=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1a2535" stroke="#445" stroke-width="0.5"/><path d="${d}" fill="#d8e8f8" opacity="0.9"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(200,220,255,0.25)" stroke-width="0.5"/>`;
}
function moonPhaseName(a){
  if(a<10||a>350)return'จันทร์ดับ';
  if(a<90) return'ข้างขึ้นเสี้ยวแรก';
  if(a<170)return'ข้างขึ้น';
  if(a<190)return'จันทร์เพ็ญ';
  if(a<270)return'ข้างแรม';
  return'ข้างแรมเสี้ยวท้าย';
}

// ═══════════════════════════════════════════════
// THAI DATE
// ═══════════════════════════════════════════════
const THAI_DAYS=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function thaiDateStr(d){return `วัน${THAI_DAYS[d.getDay()]} ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} พ.ศ.${d.getFullYear()+543}`;}
function selectedDate() {
  // วันที่ที่ผู้ใช้เลือก (ใช้ทั่วทั้งแอปแทน new Date() เพื่อให้ทุก section ตามวันที่เลือก)
  if (typeof calSelectedISO !== 'undefined' && calSelectedISO) {
    const [y,m,d] = calSelectedISO.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  return new Date();
}
function todayStr(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

// ═══════════════════════════════════════════════
// YAM TABLE (ตารางยามสำหรับ badge ปัจจุบัน)
// ═══════════════════════════════════════════════
const YAM_TABLE = {
  0:[['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn'],['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn']],
  1:[['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn'],['ปกติ','neutral'],['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ธงชัย','good']],
  2:[['กาลกิณี','bad'],['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn'],['ปกติ','neutral'],['โลกาวินาศ','bad'],['กาลกิณี','bad']],
  3:[['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn'],['ปกติ','neutral'],['โลกาวินาศ','bad']],
  4:[['อธิบดี','warn'],['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn'],['ปกติ','neutral']],
  5:[['ธงชัย','good'],['อธิบดี','warn'],['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad'],['อธิบดี','warn']],
  6:[['อุบาทว์','bad'],['ธงชัย','good'],['อธิบดี','warn'],['โลกาวินาศ','bad'],['กาลกิณี','bad'],['ปกติ','neutral'],['ธงชัย','good'],['อุบาทว์','bad']],
};

let storedSunrise=378, storedSunset=1109, storedYams=[];

function buildYams(riseMin, setMin, dow){
  if (dow === undefined) dow = selectedDate().getDay();
  const rows = YAM_TABLE[dow];
  const dayLen=setMin-riseMin, nightLen=1440-dayLen;
  const dy=dayLen/4, ny=nightLen/4;
  const fmt=m=>{const mm=((Math.round(m)%1440)+1440)%1440;return`${String(Math.floor(mm/60)).padStart(2,'0')}:${String(mm%60).padStart(2,'0')}`;};
  return rows.map(([l,t],i)=>{
    const start = i<4 ? riseMin+i*dy : setMin+(i-4)*ny;
    const end   = i<4 ? riseMin+(i+1)*dy : setMin+(i-3)*ny;
    return {l,t,start,end,startStr:fmt(start),endStr:fmt(end),period:i<4?'กลางวัน':'กลางคืน'};
  });
}

function currentYam(yams){
  const now=new Date(), mins=now.getHours()*60+now.getMinutes();
  for(const y of yams){
    const s=((Math.round(y.start)%1440)+1440)%1440;
    const e=((Math.round(y.end)%1440)+1440)%1440;
    if(s<e){if(mins>=s&&mins<e)return y;}
    else{if(mins>=s||mins<e)return y;}
  }
  return yams[0];
}

// หายามปัจจุบันจาก storedApiYams
// คืนค่า { name, tc, startStr, endStr, slotLabel } หรือ null ถ้าไม่อยู่ในยามใด
function currentYamFromApi() {
  if (!storedApiYams.length) return null;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();

  function toM(str) {
    if (!str) return -1;
    const parts = str.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }
  // inRange: รองรับ overnight (start > end) เช่น 21:26–00:22
  function inRange(s, e, t) {
    if (s < 0 || e < 0) return false;
    if (s < e) return t >= s && t < e;           // ปกติ: ช่วงเดียวกัน
    return t >= s || t < e;                       // overnight: ข้ามเที่ยงคืน
  }

  for (const period of storedApiYams) {
    const slots = period.slots || [];
    for (let i = 0; i < slots.length; i++) {
      const s = toM(slots[i].start);
      const e = toM(slots[i].end);
      if (inRange(s, e, mins)) {
        const isOvernight = s > e; // slot ข้ามเที่ยงคืน
        return {
          name:       period.type,
          tc:         typeClass(period.type),
          startStr:   slots[i].start,
          endStr:     slots[i].end,
          slotLabel:  i === 0 ? '☀' : '🌙',
          isOvernight,
        };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════
// CLOCK TICK
// ═══════════════════════════════════════════════
let lastTickDate = '';

function tick(){
  const now=new Date();
  document.getElementById('clock').textContent=
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  // ── ตรวจจับวันเปลี่ยน → reload อัตโนมัติ ──
  const currentDate = todayStr(now);
  if (lastTickDate && lastTickDate !== currentDate) {
    lastTickDate = currentDate;
    document.getElementById('date-display').textContent = thaiDateStr(now);
    // ถ้าผู้ใช้กำลังดูวันวาน (วันเก่า) ให้เปลี่ยนเป็นวันใหม่อัตโนมัติ
    // แต่ถ้าเพิ่งข้ามเที่ยงคืน (ก่อน 06:00) ให้รอก่อน — อาจอยู่ใน overnight yam ยังไม่สิ้นสุด
    if (!calSelectedISO || calSelectedISO < currentDate) {
      const h = now.getHours();
      if (h >= 6) {
        // หลัง 06:00 → วันใหม่จริงๆ reload ได้เลย
        loadData(currentDate);
      } else {
        // ก่อน 06:00 → อาจยังอยู่ใน overnight yam ของวันเก่า
        // อัปเดตวันที่แสดง แต่ยังใช้ยามชุดเดิม รอ reload จนถึง sunrise
        // ตรวจว่ายามปัจจุบันสิ้นสุดแล้วหรือยัง แล้วค่อย reload
        const yam = currentYamFromApi();
        if (!yam) {
          // ออกจากยามแล้ว → reload ได้
          loadData(currentDate);
        }
        // ถ้ายังอยู่ใน yam → ไม่ reload ยัง ปล่อยให้ tick ต่อไป
      }
    }
    return;
  }
  if (!lastTickDate) lastTickDate = currentDate;

  // yam badge
  {
    const badge = document.getElementById('yam-badge');
    const colors = {
      good:    'background:rgba(90,158,112,0.2);color:#7ecb96;border:1px solid rgba(90,158,112,0.4)',
      warn:    'background:rgba(184,138,64,0.2);color:#d4aa6a;border:1px solid rgba(184,138,64,0.4)',
      bad:     'background:rgba(192,96,80,0.2);color:#e08878;border:1px solid rgba(192,96,80,0.4)',
      neutral: 'background:rgba(201,168,76,0.1);color:var(--gold2);border:1px solid var(--border)',
      none:    'background:rgba(201,168,76,0.05);color:var(--text2);border:1px solid var(--border)',
    };

    if (storedApiYams.length) {
      const yam = currentYamFromApi();
      if (yam) {
        const nowH = now.getHours();
        // overnight slot ข้ามเที่ยงคืน + ตอนนี้ก่อน 06:00 → บอกผู้ใช้ว่าเป็น slot ข้ามวัน
        const overnightNote = (yam.isOvernight && nowH < 6) ? ' (ข้ามวัน)' : '';
        badge.style.cssText = colors[yam.tc] || colors.neutral;
        badge.textContent   = `${yam.slotLabel} ยามนี้: ${yam.name}  ${yam.startStr}–${yam.endStr}${overnightNote}`;
      } else {
        badge.style.cssText = colors.none;
        badge.textContent   = '— ช่วงเวลาระหว่างยาม —';
      }
    } else if (storedYams.length) {
      const yam = currentYam(storedYams);
      badge.style.cssText = colors[yam.t] || colors.neutral;
      badge.textContent   = `ยาม (ประมาณ): ${yam.l}  ${yam.startStr}–${yam.endStr}`;
    }
  }

  // sun bar
  const mins=now.getHours()*60+now.getMinutes();
  let pct=0;
  if(mins>=storedSunrise&&mins<=storedSunset) pct=(mins-storedSunrise)/(storedSunset-storedSunrise)*100;
  else if(mins>storedSunset) pct=100;
  document.getElementById('sun-fill').style.width=pct+'%';

  // notification check (once per minute)
  checkYamNotifs();

  // moon — ใช้เวลาจริงเสมอ ไม่ขึ้นกับวันที่เลือก
  const realNow=new Date();
  const jd=julianDay(realNow);
  const phase=moonPhaseAngle(jd), illum=moonIllum(jd);
  drawMoon(document.getElementById('moon-svg'),phase,illum);
  document.getElementById('moon-phase-name').textContent=moonPhaseName(phase);
  document.getElementById('illum-fill').style.width=(illum*100)+'%';
  document.getElementById('illum-pct').textContent=(illum*100).toFixed(0)+'%';
}

// ═══════════════════════════════════════════════
// RENDER DATA FROM API
// ═══════════════════════════════════════════════
function typeClass(name){
  if(name==='ธงชัย')return'good';
  if(name==='อธิบดี')return'warn';
  if(['อุบาทว์','โลกาวินาศ','กาลกิณี'].includes(name))return'bad';
  if(name==='ปกติ')return'neutral';
  return'neutral';
}
const typeLabel={good:'✦ มงคล',warn:'⚠ ระวัง',bad:'✗ หลีกเลี่ยง',neutral:'— ปกติ'};

function renderData(data) {
  const isToday = calSelectedISO === todayStr(new Date());

  // sunrise/sunset — อัปเดต storedSunrise/storedSunset เฉพาะวันนี้
  // (tick() ใช้ค่านี้วาด sun bar ตามเวลาจริง ไม่ใช่วันที่เลือก)
  if(data.sunrise){
    if (isToday) {
      const [rh,rm]=data.sunrise.split(':').map(Number);
      storedSunrise=rh*60+rm;
      document.getElementById('sunrise').textContent=data.sunrise;
    }
  }
  if(data.sunset){
    if (isToday) {
      const [sh,sm]=data.sunset.split(':').map(Number);
      storedSunset=sh*60+sm;
      document.getElementById('sunset').textContent=data.sunset;
    }
  }
  storedYams=buildYams(storedSunrise,storedSunset, new Date(calSelectedISO||new Date()).getDay());
  // อัปเดตยามปัจจุบัน (ใช้โดย tick) เฉพาะเมื่อดูวันนี้เท่านั้น
  // ถ้าดูวันอื่น ยังคงใช้ข้อมูลยามของวันนี้ที่โหลดไว้แล้ว
  if(data.yam?.periods?.length && isToday) storedApiYams=data.yam.periods;
  // เก็บยามของวันที่กำลังแสดง (ทุกวัน ไม่ใช่แค่วันนี้) สำหรับ section ต่างๆ
  if(data.yam?.periods?.length) storedDisplayYams=data.yam.periods;
  else storedDisplayYams=[];
  if(data.planets?.length) storedPlanets=data.planets;
  if(data.nakshatra) storedNakshatra=data.nakshatra;
  if(data.tithi)     storedTithi=data.tithi;

  // lunar day from API — แสดงเฉพาะวันนี้ (card ดวงจันทร์อยู่เหนือ date picker)
  if(data.lunar?.phase && isToday){
    document.getElementById('moon-dithi').textContent=data.lunar.phase;
  }

  // Build main content HTML
  let html='';

  // ── Date picker (ดูฤกษ์วันที่) ──
  html+=`<div class="date-picker-bar">
    <label>📅 ดูฤกษ์วันที่:</label>
    <div class="date-picker-wrap">
      <input type="text" class="date-picker-input" id="date-picker"
             placeholder="วว/ดด/ปปปป" maxlength="10" autocomplete="off" readonly
             onclick="toggleCalPopup()">
      <span class="date-picker-icon">📅</span>
      <div class="cal-popup" id="cal-popup" style="display:none;"></div>
    </div>
    <button class="date-today-btn" id="btn-today" onclick="goToToday()">วันนี้</button>
  </div>`;

  // ── สีประจำวัน ──
  html+=`<div class="section-label">สีประจำวัน</div>`;
  html+=`<div class="card card-full" id="daycolor-section"></div>`;

  // ── ฤกษ์ดาว + ดิถีเพียร ──
  html+=`<div class="section-label">ฤกษ์ดาว & ดิถีเพียร</div>`;
  html+=`<div class="info-row">`;

  // ฤกษ์ดาว card
  if (data.nakshatra) {
    const nk = data.nakshatra;
    const qCls  = nk.quality==='good'?'good-border':nk.quality==='bad'?'bad-border':'warn-border';
    const qBadge= nk.quality==='good'?'good-q':nk.quality==='bad'?'bad-q':'warn-q';
    const qTxt  = nk.quality==='good'?'✦ ฤกษ์มงคล':nk.quality==='bad'?'✗ ฤกษ์ร้าย':'◈ ฤกษ์กลาง';
    const endTxt = nk.endTime ? `สิ้นสุด ${nk.endTime} น.` : '';
    html+=`<div class="info-card ${qCls}">
      <div class="info-label">🌟 ฤกษ์ดาว (นักษัตร)</div>
      <div class="info-main">${nk.name}</div>
      <div class="info-num">ฤกษ์ที่ ${nk.num}${nk.deg?' · '+nk.deg:''}</div>
      <div><span class="info-q-badge ${qBadge}">${qTxt}</span></div>
      ${endTxt?`<div class="info-end">⏱ ${endTxt}</div>`:''}
    </div>`;
  } else {
    html+=`<div class="info-card">
      <div class="info-label">🌟 ฤกษ์ดาว (นักษัตร)</div>
      <div class="info-main" style="color:var(--text2);font-size:22px;">ยังไม่ได้ข้อมูล</div>
      <div class="info-num" style="margin-top:6px;font-size:20px;">ปฏิทินลาหิรีอาจมีข้อมูลนี้</div>
    </div>`;
  }

  // ดิถีเพียร card
  if (data.tithi) {
    const ti = data.tithi;
    const qCls  = ti.quality==='good'?'good-border':ti.quality==='bad'?'bad-border':'warn-border';
    const qBadge= ti.quality==='good'?'good-q':ti.quality==='bad'?'bad-q':'warn-q';
    const endTxt = ti.endTime ? `สิ้นสุด ${ti.endTime} น.` : '';
    html+=`<div class="info-card ${qCls}">
      <div class="info-label">📅 ดิถีเพียร</div>
      <div class="info-main">${ti.label}</div>
      <div class="info-num">ดิถีที่ ${ti.num}${ti.deg?' · '+ti.deg:''}</div>
      <div><span class="info-q-badge ${qBadge}">${ti.qualityLabel}</span></div>
      ${endTxt?`<div class="info-end">⏱ ${endTxt}</div>`:''}
    </div>`;
  } else {
    html+=`<div class="info-card">
      <div class="info-label">📅 ดิถีเพียร</div>
      <div class="info-main" style="color:var(--text2);font-size:22px;">ยังไม่ได้ข้อมูล</div>
      <div class="info-num" style="margin-top:6px;font-size:20px;">ข้อมูลอาจแตกต่างในสองปฏิทิน</div>
    </div>`;
  }

  html+=`</div>`; // end info-row

  html+=`<div class="section-label">ฤกษ์ยามรายวัน</div>`;
  html+=`<div class="card card-full">`;
  html+=`<span class="card-title">✦ ช่วงเวลามงคลและต้องหลีกเลี่ยง (ยาม 8)</span>`;
  html+=`<div class="hour-list">`;

  // ใช้ยามจากตาราง
  const displayYams = storedYams.filter(y=>y.t!=='neutral');

  // ถ้า API ส่ง yam periods มา ใช้แทน (รองรับ 2 slots)
  if(data.yam?.periods?.length > 0){
    data.yam.periods.forEach(p=>{
      const tc=typeClass(p.type);
      // สร้าง slot rows (กลางวัน + กลางคืน)
      const slotLabels=['☀ กลางวัน','🌙 กลางคืน'];
      const slotsHtml=(p.slots||[]).map((s,i)=>
        `<div class="yam-slot-row"><span class="yam-slot-dot"></span>${slotLabels[i]||''} ${s.start}–${s.end}</div>`
      ).join('');
      html+=`<div class="hour-item ${tc}">
        <div class="hour-dot"></div>
        <div class="hour-label" style="flex:1">
          <div>${p.type}</div>
          <div class="yam-slots">${slotsHtml||`<div class="yam-slot-row"><span class="yam-slot-dot"></span>${(p.start||'')}–${(p.end||'')}</div>`}</div>
        </div>
        <span class="hour-badge">${typeLabel[tc]||'— ปกติ'}</span>
      </div>`;
    });
  } else {
    // fallback ใช้ตารางยามของเรา
    displayYams.forEach(y=>{
      html+=`<div class="hour-item ${y.t}">
        <div class="hour-dot"></div>
        <div class="hour-label">${y.l} <span style="font-size:18px;color:var(--text2)">(${y.period})</span></div>
        <div class="hour-time">${y.startStr}–${y.endStr}</div>
        <span class="hour-badge">${typeLabel[y.t]||''}</span>
      </div>`;
    });
  }
  html+=`</div></div>`;

  // ── ดาวนพเคราะห์ section ──
  html+=`<div class="section-label">ตำแหน่งดาวนพเคราะห์</div>`;
  html+=`<div class="card card-full">`;
  html+=`<span class="card-title">🪐 ดาวนพเคราะห์ (${data.calendarLabel||'สุริยยาส'})</span>`;

  if(data.planets?.length > 0){
    // ── วิเคราะห์ conjunction + malefic/benefic ──
    const MALEFIC  = new Set(['เสาร์','ราหู','อังคาร','เกตุ']);
    const BENEFIC  = new Set(['พฤหัสบดี','ศุกร์','จันทร์']);
    const rasiGroups = {};
    data.planets.forEach(p => {
      const key = p.rasi;
      if (!rasiGroups[key]) rasiGroups[key] = [];
      rasiGroups[key].push(p);
    });
    const conjunctions = Object.entries(rasiGroups).filter(([,ps]) => ps.length >= 2);

    // planet grid พร้อม badges
    html+=`<div class="planet-grid">`;
    data.planets.forEach(p=>{
      const retro   = p.retrograde ? `<div class="retro">℞ ถอยหลัง</div>` : '';
      const isMal   = MALEFIC.has(p.name);
      const isBen   = BENEFIC.has(p.name);
      const rasiPeers = rasiGroups[p.rasi]?.filter(x=>x.name!==p.name)||[];
      const isConj  = rasiPeers.length > 0;
      const conjBadge = isConj ? `<span class="conj-badge">☌</span>` : '';
      const cls = isConj?'conjunct':isMal?'malefic':isBen?'benefic':'';
      html+=`<div class="planet-item ${cls}">
        ${conjBadge}
        <span class="planet-symbol">${p.sym}</span>
        <span class="planet-name">${p.name}</span>
        <span class="planet-pos">${p.rasi}</span>
        <div class="planet-deg">${p.deg}° ${p.min}'</div>
        ${retro}
      </div>`;
    });
    html+=`</div>`;

    // ── ผลวิเคราะห์ ──────────────────────────
    html+=`<div class="planet-analysis">`;

    // 1. Conjunctions
    if(conjunctions.length > 0){
      conjunctions.forEach(([rasi, ps]) => {
        const names  = ps.map(p=>p.name).join(' + ');
        const hasMal = ps.some(p=>MALEFIC.has(p.name));
        const hasBen = ps.some(p=>BENEFIC.has(p.name));
        const cls    = hasMal&&!hasBen?'bad':hasBen&&!hasMal?'good':'warn';
        const icon   = cls==='bad'?'⚠️':cls==='good'?'✦':'◈';
        const tip    = hasMal&&hasBen ? 'ดาวมงคล-อัปมงคลร่วมราศี พลังงานขัดแย้ง ผลลัพธ์ไม่แน่นอน'
                     : hasMal ? 'ดาวอัปมงคลร่วมราศี เสริมพลังลบ ควรระวังเรื่องที่ดาวเหล่านี้ปกครอง'
                     : 'ดาวมงคลร่วมราศี เสริมพลังบวกกัน';
        html+=`<div class="pa-row ${cls}">
          <span class="pa-icon">${icon}</span>
          <div class="pa-text">
            <b>☌ ${names}</b> ร่วมราศี<b>${rasi}</b> — ${tip}
          </div>
        </div>`;
      });
    }

    // 2. ดาวร้าย 3 ดวงอยู่ราศีไหน
    const malefics = data.planets.filter(p=>MALEFIC.has(p.name));
    malefics.forEach(p => {
      const MALEFIC_TIPS = {
        'เสาร์': 'เสาร์ — บีบคั้น ล่าช้า อุปสรรค ราศีที่อยู่จะรู้สึกกดดัน',
        'ราหู':  'ราหู — สร้างความสับสน ลวงหลอก ปัญหาซ่อนเร้น ต้องระวังการตัดสินใจ',
        'อังคาร':'อังคาร — พลังงานรุนแรง ขัดแย้ง อุบัติเหตุ เหมาะกับงานที่ต้องการพลัง',
        'เกตุ':  'เกตุ — พลังจิต ความลึกลับ สิ่งที่ไม่คาดคิด',
      };
      const retro = p.retrograde?' (ถอยหลัง — ผลชะลอ)':'';
      html+=`<div class="pa-row bad">
        <span class="pa-icon">⚠️</span>
        <div class="pa-text">
          <b>${p.sym} ${p.name}</b> ใน<b>${p.rasi}</b>${retro} — ${MALEFIC_TIPS[p.name]||''}
        </div>
      </div>`;
    });

    // 3. ดาวมงคลอยู่ที่ไหน
    const benefics = data.planets.filter(p=>BENEFIC.has(p.name));
    benefics.forEach(p => {
      const BENEFIC_TIPS = {
        'พฤหัสบดี':'พฤหัส — โชคลาภ ปัญญา ความเจริญ ราศีที่อยู่ได้รับพรพิเศษ',
        'ศุกร์':   'ศุกร์ — ความรัก ความงาม ศิลปะ เงินทอง',
        'จันทร์':  'จันทร์ — อารมณ์ ความรู้สึก ผู้หญิง ครอบครัว',
      };
      html+=`<div class="pa-row good">
        <span class="pa-icon">✦</span>
        <div class="pa-text">
          <b>${p.sym} ${p.name}</b> ใน<b>${p.rasi}</b> — ${BENEFIC_TIPS[p.name]||''}
        </div>
      </div>`;
    });

    // 4. ดาวถอยหลัง
    const retros = data.planets.filter(p=>p.retrograde);
    if(retros.length>0){
      html+=`<div class="pa-row warn">
        <span class="pa-icon">℞</span>
        <div class="pa-text">
          <b>ดาวถอยหลัง:</b> ${retros.map(p=>`${p.sym}${p.name}`).join(', ')} —
          พลังงานดาวหันกลับภายใน สิ่งที่ค้างคาหรือยังไม่เสร็จจะถูกหวนกลับมา
        </div>
      </div>`;
    }

    html+=`</div>`; // end planet-analysis

    // AI วิเคราะห์ดาว
    html+=`<div class="ai-box" style="margin-top:14px;" id="planet-ai-box">
      <div class="ai-box-header">
        ✦ AI วิเคราะห์ภาพรวมดาววันนี้
        <button class="ai-reload" onclick="analyzePlanetsAI(true)">↻ วิเคราะห์ใหม่</button>
      </div>
      <div class="ai-body loading" id="planet-ai-body">กดปุ่ม ↻ เพื่อวิเคราะห์</div>
    </div>
    <div class="ai-unavail-note">— AI วิเคราะห์ไม่พร้อมใช้งาน —</div>`;

  } else {
    html+=`<div style="text-align:center;padding:24px;color:var(--text2);">
      <p>⚠️ ยังไม่ได้รับข้อมูลดาว</p>
    </div>`;
  }
  html+=`</div>`;

  // ── ฤกษ์วิเคราะห์ section ──
  html+=`<div class="section-label">วิเคราะห์ฤกษ์กิจกรรม</div>`;
  html+=`<div class="card card-full">`;
  html+=`<div class="activity-tabs">
    <button class="act-tab active" id="tab-lottery" onclick="switchActivity('lottery')">🎟 ซื้อล็อตเตอรี่</button>
    <button class="act-tab" id="tab-forex" onclick="switchActivity('forex')">📈 เทรดอัตราแลกเปลี่ยน / IQ Option</button>
  </div>`;
  html+=`<div id="activity-panel"></div>`;
  html+=`</div>`;

  // ── สถิติสลากกินแบ่ง section ──
  html+=`<div class="section-label">🎟 สถิติสลากกินแบ่งรัฐบาล</div>`;
  html+=`<div class="card card-full" id="lotto-stats-card">
    <span class="card-title" style="display:flex;align-items:center;gap:10px;">
      📊 สถิติย้อนหลังสะสม + เลขเด่นงวดหน้า
      <button class="ai-reload" id="lotto-reload-btn" onclick="loadLottoStats(true)" style="margin-left:auto;padding:6px 18px;font-size:20px;">↻ โหลดสถิติ</button>
    </span>
    <div style="font-size:20px;color:var(--text2);margin-bottom:10px;">
      ข้อมูลจาก <b style="color:var(--gold3)">สำนักงานสลากกินแบ่งรัฐบาล</b> · วิเคราะห์ความถี่ออก เลขร้อน-เย็น และ AI คาดการณ์งวดหน้า
    </div>
    <div id="lotto-stats-body">
      <div style="text-align:center;padding:24px;color:var(--text2);font-style:italic;">กดปุ่ม "↻ โหลดสถิติ" เพื่อดึงข้อมูล</div>
    </div>
    <div style="margin-top:14px;font-size:17px;color:var(--text2);opacity:0.5;font-style:italic;">
      ⚠ สถิติและการคาดการณ์เป็นข้อมูลทางสถิติเพื่อความบันเทิงเท่านั้น ไม่ใช่การรับประกันผลรางวัล
    </div>
  </div>`;

  // ── เลขศาสตร์ section ──
  html+=`<div class="section-label">เลขศาสตร์ไทย</div>`;
  html+=`<div class="card card-full">`;
  html+=`<div class="numro-tabs">
    <button class="numro-tab active" id="ntab-phone" onclick="switchNumroTab('phone')">📱 เบอร์มือถือ</button>
    <button class="numro-tab" id="ntab-id" onclick="switchNumroTab('id')">🪪 บัตรประชาชน</button>
  </div>`;
  html+=`<div id="numro-panel"><div id="numro-phone-panel"></div><div id="numro-id-panel" style="display:none"></div></div>`;
  html+=`</div>`;

  // ── ดวงชะตาส่วนตัว section ──
  html+=`<div class="section-label">ดวงชะตาส่วนตัว</div>`;
  html+=`<div class="card card-full" id="personal-card">
    <div id="personal-form-area"></div>
    <div id="personal-result-area"></div>
  </div>`;

  // ── บทสรุปรวม (Final Summary) section ──
  html+=`<div class="section-label" style="margin-top:32px;">✦ บทสรุปดวงชะตาวันนี้</div>`;
  html+=`<div class="card card-full" id="final-summary-card" style="border-color:rgba(201,168,76,0.3);background:linear-gradient(135deg,rgba(201,168,76,0.04),rgba(13,10,20,0.8));">
    <span class="card-title" style="display:flex;align-items:center;gap:10px;">
      ✦ วิเคราะห์รวม: ฤกษ์ยาม · ดวงดาว · ชะตาเกิด
      <button class="ai-reload" id="summary-reload-btn" onclick="loadFinalSummary(true)" style="margin-left:auto;padding:6px 18px;font-size:20px;">↻ วิเคราะห์</button>
    </span>
    <div style="font-size:20px;color:var(--text2);margin-bottom:14px;line-height:1.8;">
      AI โหราจารย์จะนำข้อมูลทั้งหมด — ฤกษ์ยาม, ตำแหน่งดาวนพเคราะห์, ฤกษ์นักษัตร, ดิถี และชะตาเกิดของคุณ — มาสังเคราะห์เป็นบทสรุปเดียว
    </div>
    <div id="final-summary-body" class="ai-body" style="font-size:22px;line-height:2;min-height:60px;color:var(--text2);font-style:italic;">
      กดปุ่ม "↻ วิเคราะห์" เพื่อให้ AI สรุปดวงชะตาวันนี้ของคุณ
    </div>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);font-size:18px;color:var(--text2);opacity:0.6;">
      📚 อ้างอิง: คัมภีร์กาลโยค · Jean Meeus Astronomical Algorithms · Lahiri Ayanamsa · Ptolemy Tetrabiblos · ตำราโหราศาสตร์ไทย หลักนพเคราะห์
    </div>
  </div>`;

  document.getElementById('main-content').innerHTML=html;
  // render analysis หลัง DOM พร้อม
  setTimeout(() => {
    renderActivityAnalysis(currentActivity);
    renderNumroPanel('phone');
    renderDayColors();
    renderPersonalForm();
  }, 50);
}

function renderError(msg){
  document.getElementById('main-content').innerHTML=`
    <div class="error-box" style="margin-top:24px;">
      <h3>⚠️ เชื่อมต่อ server ไม่ได้</h3>
      <p>${msg}</p>
      <p style="margin-top:8px;">ตรวจสอบว่าได้รัน <code style="color:var(--gold3)">node server.js</code> แล้วหรือยัง</p>
      <button class="retry-btn" onclick="loadData()">🔄 ลองอีกครั้ง</button>
    </div>`;
}

// ═══════════════════════════════════════════════
// FETCH FROM PROXY
// ═══════════════════════════════════════════════
let currentCalendar = 'suriyayas';

function switchCalendar(calType) {
  if (calType === currentCalendar) return;
  currentCalendar = calType;
  document.querySelectorAll('.cal-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + calType)?.classList.add('active');
  loadData();
}

async function loadData(dateStr){
  if(!dateStr) dateStr = todayStr(new Date());
  calSelectedISO = dateStr;

  document.getElementById('main-content').innerHTML=`
    <div class="loading" style="margin-top:24px;">
      <div class="spinner"></div>
      <p>กำลังโหลดข้อมูล...</p>
    </div>`;
  try{
    const res = await fetch(`api/horoscope?date=${dateStr}&calendar=${currentCalendar}`);
    if(!res.ok) throw new Error(`Server ตอบ ${res.status}`);
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    renderData(data);
    // sync date picker หลัง renderData (เพราะ element อยู่ใน main-content)
    const picker = document.getElementById('date-picker');
    if(picker) {
      const [y,m,d] = dateStr.split('-');
      picker.value = `${d}/${m}/${y}`;
    }
    const todayVal = todayStr(new Date());
    const btnToday = document.getElementById('btn-today');
    if(btnToday) btnToday.classList.toggle('active', dateStr === todayVal);
  } catch(err){
    renderError(err.message);
  }
}

function onDatePickerChange(val) {
  if(val) loadData(val);
}

function goToToday() {
  loadData(todayStr(new Date()));
}

// ── Custom Calendar Popup ────────────────────

function isoToDMY(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseDMY(str) {
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd||!mm||!yyyy||yyyy<2020||yyyy>2100) return null;
  if (mm<1||mm>12||dd<1||dd>31) return null;
  const d = new Date(yyyy, mm-1, dd);
  if (d.getFullYear()!==yyyy||d.getMonth()!==mm-1||d.getDate()!==dd) return null;
  return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

function renderCalPopup() {
  const popup = document.getElementById('cal-popup');
  if (!popup) return;
  const todayISO = todayStr(new Date());
  const y = calViewYear, m = calViewMonth;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrev  = new Date(y, m, 0).getDate();

  let html = `<div class="cal-header">
    <button class="cal-nav" onclick="calNav(event,-1)">‹</button>
    <span class="cal-month-label">${THAI_MONTHS[m]} พ.ศ.${y+543}</span>
    <button class="cal-nav" onclick="calNav(event,1)">›</button>
  </div><div class="cal-grid">`;

  ['อา','จ','อ','พ','พฤ','ศ','ส'].forEach((d,i) => {
    const cls = i===0?'sun-h':i===6?'sat-h':'';
    html += `<div class="cal-dow ${cls}">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day other-month empty">${daysInPrev-firstDay+1+i}</div>`;
  }
  for (let d2 = 1; d2 <= daysInMonth; d2++) {
    const mm2 = String(m+1).padStart(2,'0'), dd2 = String(d2).padStart(2,'0');
    const iso = `${y}-${mm2}-${dd2}`;
    const dow = (firstDay + d2 - 1) % 7;
    const cls = [
      dow===0?' sun-col':dow===6?' sat-col':'',
      iso===todayISO?' today':'',
      (iso===calSelectedISO && iso!==todayISO)?' selected':iso===calSelectedISO?' today selected':''
    ].join('');
    html += `<div class="cal-day${cls}" onclick="calSelectDay('${iso}')">${d2}</div>`;
  }
  const trailing = (firstDay+daysInMonth)%7===0?0:7-(firstDay+daysInMonth)%7;
  for (let i=1;i<=trailing;i++) html+=`<div class="cal-day other-month empty">${i}</div>`;
  html += '</div>';
  popup.innerHTML = html;
}

function calNav(e, dir) {
  // stopPropagation กันไม่ให้ click bubble ไปถึง document listener
  // เพราะ renderCalPopup() จะ replace innerHTML ทำให้ปุ่มเดิม (e.target) หลุด DOM
  // แล้ว wrap.contains(e.target) กลายเป็น false → popup โดนปิดทันที (เดือนเลยดูเหมือนเลื่อนไม่ได้)
  if (e && e.stopPropagation) e.stopPropagation();
  calViewMonth += dir;
  if (calViewMonth>11){calViewMonth=0;calViewYear++;}
  if (calViewMonth<0) {calViewMonth=11;calViewYear--;}
  renderCalPopup();
}

function calSelectDay(iso) {
  calSelectedISO = iso;
  closeCalPopup();
  loadData(iso);
}

function openCalPopup() {
  const popup = document.getElementById('cal-popup');
  if (!popup) return;
  const baseISO = calSelectedISO || todayStr(new Date());
  const [y,m] = baseISO.split('-').map(Number);
  calViewYear = y; calViewMonth = m-1;
  renderCalPopup();
  popup.style.display = 'block';
}

function closeCalPopup() {
  const popup = document.getElementById('cal-popup');
  if (popup) popup.style.display = 'none';
}

function toggleCalPopup() {
  const popup = document.getElementById('cal-popup');
  if (!popup) return;
  popup.style.display === 'none' ? openCalPopup() : closeCalPopup();
}

document.addEventListener('click', function(e) {
  const wrap = document.querySelector('.date-picker-wrap');
  if (wrap && !wrap.contains(e.target)) closeCalPopup();
});



// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// FENGRI ANALYSIS — ระบบวิเคราะห์ฤกษ์ 4 ชั้น
// ═══════════════════════════════════════════════
//
// ชั้นที่ 1 — ยาม (คัมภีร์กาลโยค / Wikipedia โหราศาสตร์ไทย)
//   ความหมายดั้งเดิมของยามแต่ละชนิด ไม่ตีความตรงๆ ว่า "ซื้อหวยได้"
//   แต่ map ผ่าน logic: ยามที่เหมาะกับ "ริเริ่ม ตัดสินใจ เคลื่อนไหว"
//   ถือว่าเหมาะกับกิจกรรมที่ต้องการลงมือทำ
//
// ชั้นที่ 2 — ดวงส่วนตัว (วันเกิด / ดาวเกิด / เลขชีวิต)
//   เสริมหรือขัดแย้งกับฤกษ์ฟ้าวันนี้
//
// ชั้นที่ 3 — ปีนักษัตรและธาตุ (โหราศาสตร์ไทย)
//   ธาตุปีนักษัตรเกิด + ธาตุดาวเจ้าวันนี้ เสริมกันหรือขัดกัน
//
// ชั้นที่ 4 — ปัจจัยตลาด (วันสำคัญ / ปฏิทิน)
//   วันหยุดตลาด, ช่วง high volatility ที่รู้กันในแวดวง Forex
//
// ⚠️ DISCLAIMER (แสดงทุกครั้ง):
//   ข้อมูลนี้เป็นการทำนายตามหลักโหราศาสตร์เพื่อความบันเทิง
//   ไม่ใช่คำแนะนำทางการเงิน การลงทุนมีความเสี่ยง
// ═══════════════════════════════════════════════

// ── Layer 1: ความหมายยามจากตำราจริง ──────────
// แหล่งอ้างอิง: คัมภีร์กาลโยค, Wikipedia โหราศาสตร์ไทย
// pptvhd36.com/news/ไลฟ์สไตล์/190891 (วันธงชัย/อธิบดี)
// sawad.co.th/auspicious-dates-2025
const YAM_CLASSIC = {
  'ธงชัย': {
    // ต้นฉบับ: "ฤกษ์ชัยชนะ เหมาะยกทัพ เคลื่อนย้าย ริเริ่มกิจการ เซ็นสัญญา"
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์แห่งชัยชนะ เหมาะกับการริเริ่ม เคลื่อนไหว ตัดสินใจลงมือ',
    energy: 'initiative', // พลังงาน: ริเริ่ม
    tier: 'best',
  },
  'อธิบดี': {
    // ต้นฉบับ: "ฤกษ์ความมั่นคง ลงหลักปักฐาน แต่งงาน วางศิลาฤกษ์"
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์แห่งความมั่นคง เหมาะกับการวางแผน รักษาฐาน ไม่รีบร้อน',
    energy: 'stability',  // พลังงาน: มั่นคง
    tier: 'ok',
  },
  'อุบาทว์': {
    // ต้นฉบับ: "ฤกษ์ไม่เป็นมงคล ไม่ควรเริ่มสิ่งใหม่"
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์ระวัง ไม่เหมาะกับการเริ่มต้นสิ่งใหม่หรือตัดสินใจสำคัญ',
    energy: 'caution',
    tier: 'avoid',
  },
  'อุบาสน': {
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์พักผ่อน เหมาะกับการรอดูสถานการณ์มากกว่าลงมือทำ',
    energy: 'wait',
    tier: 'avoid',
  },
  'ปกติ': {
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์ธรรมดา ไม่มีผลพิเศษเชิงมงคลหรืออัปมงคล เหมาะกับกิจกรรมทั่วไป',
    energy: 'normal',
    tier: 'ok',
  },
  'โลกาวินาศ': {
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์ร้าย ควรหลีกเลี่ยงกิจกรรมสำคัญทุกชนิด',
    energy: 'danger',
    tier: 'avoid',
  },
  'กาลกิณี': {
    source: 'คัมภีร์กาลโยค',
    meaning: 'ฤกษ์ร้ายแรงที่สุด ควรหยุดพักและไม่ตัดสินใจเรื่องสำคัญ',
    energy: 'danger',
    tier: 'avoid',
  },
};

// ── ธาตุประจำวัน (โหราศาสตร์ไทย) ──────────
// อ้างอิง: ธาตุดาวเจ้าวัน ตามนพเคราะห์ไทย
// อาทิตย์=ไฟ, จันทร์=น้ำ, อังคาร=ไฟ, พุธ=ดิน, พฤหัสบดี=ลม, ศุกร์=น้ำ, เสาร์=ลม
const THAI_ELEMENT_TODAY = () => {
  const dayElements = ['ไฟ','น้ำ','ไฟ','ดิน','ลม','น้ำ','ลม']; // อา-เสาร์
  return dayElements[selectedDate().getDay()];
};
// alias
const CHINESE_ELEMENT_TODAY = THAI_ELEMENT_TODAY;

// ── ความสัมพันธ์ธาตุ (โหราศาสตร์ไทย 4 ธาตุ) ──
// ไฟ+ลม = เสริม (ลมพัดให้ไฟแรงขึ้น)
// น้ำ+ดิน = เสริม (น้ำหล่อเลี้ยงดิน)
// ไฟ+น้ำ = ขัด, ดิน+ลม = ขัด
// ธาตุเดียวกัน = เสริมพิเศษ
function chineseElementCompat(birthElement, todayElement) {
  return thaiElementCompat(birthElement, todayElement);
}
function thaiElementCompat(birthElement, todayElement) {
  if (!birthElement || !todayElement) return { level:'neutral', label:'ไม่ทราบธาตุเกิด', note:'กรุณากรอกวันเกิด' };
  if (birthElement === todayElement)
    return { level:'good',    label:'ธาตุเดียวกัน ✦', note:`ธาตุ${birthElement}ทั้งคู่ — เสริมพลังกัน` };
  // คู่เสริม
  const harmonious = [['ไฟ','ลม'],['น้ำ','ดิน']];
  for (const pair of harmonious) {
    if (pair.includes(birthElement) && pair.includes(todayElement))
      return { level:'good',    label:'ธาตุเสริมกัน ✦', note:`${birthElement}และ${todayElement} — ส่งเสริมกัน` };
  }
  // คู่ขัด
  const conflicting = [['ไฟ','น้ำ'],['ดิน','ลม']];
  for (const pair of conflicting) {
    if (pair.includes(birthElement) && pair.includes(todayElement))
      return { level:'caution', label:'ธาตุขัดแย้ง ⚠', note:`${birthElement}และ${todayElement} — ขัดกัน ควรระวัง` };
  }
  return { level:'neutral', label:'ธาตุเป็นกลาง', note:`${birthElement}และ${todayElement} — ไม่มีผลพิเศษ` };
}

// ── Layer 4: ปัจจัยตลาด ───────────────────────
// วันหยุดหลักที่ตลาด Forex ปิดหรือ liquidity ต่ำมาก
// (ข้อมูลสาธารณะ ไม่ใช่การรับประกันผล)
const MARKET_CALENDAR = () => {
  const now   = selectedDate();
  const month = now.getMonth() + 1;
  const date  = now.getDate();
  const dow   = now.getDay(); // 0=อา, 6=เสาร์

  const notes = [];
  if (dow === 0 || dow === 6) notes.push({ type:'warn', text:'ตลาดอัตราแลกเปลี่ยนปิดสุดสัปดาห์ — ไม่มีการซื้อขายจริง' });
  if (month === 1 && date === 1)  notes.push({ type:'warn', text:'วันขึ้นปีใหม่ — ตลาดหยุด ความผันผวนสูงหลังเปิด' });
  if (month === 12 && date === 25) notes.push({ type:'warn', text:'คริสต์มาส — ตลาดหยุด สภาพคล่องต่ำมาก' });
  if (month === 1 && date >= 28 && date <= 31 && month <= 2)
    notes.push({ type:'info', text:'ช่วงตรุษจีน — ตลาดเอเชียผันผวนสูง' });
  // วันที่ 1 และ 15 — สถิติ: วันประกาศตัวเลขเศรษฐกิจสหรัฐฯ บ่อยครั้ง
  if (date === 1 || date === 15) notes.push({ type:'info', text:`วันที่ ${date} — มักมีตัวเลขเศรษฐกิจสำคัญประกาศ ความผันผวนสูง` });

  // วัน Friday 3pm NY = ปิดสัปดาห์ พฤติกรรมราคาผิดปกติ
  const nyHour = (now.getUTCHours() + 19) % 24; // UTC+7 → NY ≈ UTC-5
  if (dow === 5 && nyHour >= 20) notes.push({ type:'warn', text:'ช่วงปิดตลาดนิวยอร์กวันศุกร์ — ส่วนต่างราคากว้าง ควรระวัง' });

  return notes;
};

// ── Map ยาม → กิจกรรม ─────────────────────────
// Logic: ยามที่มีพลังงาน initiative/stability → เหมาะกับกิจกรรมที่ต้องลงมือ
// ยาม caution/danger → ไม่ว่ากิจกรรมใดก็ควรระวัง
// *** ไม่ได้บอกว่า "ซื้อหวยแล้วถูก" แต่บอกว่า "ฤกษ์นี้เหมาะกับการตัดสินใจแค่ไหน"
const YAM_TO_ACTIVITY = {
  initiative: { // ธงชัย
    lottery: { tier:'best', label:'✦ ฤกษ์ตัดสินใจ',
      tip:'ยามนี้ตำราว่าเหมาะกับการริเริ่มและลงมือ — หากจะซื้อวันนี้ ช่วงนี้เป็นฤกษ์ที่เหมาะที่สุด' },
    forex:   { tier:'best', label:'✦ ฤกษ์เคลื่อนไหว',
      tip:'ยามนี้ตำราว่าเหมาะกับการเคลื่อนไหวและตัดสินใจ — เหมาะกับการวิเคราะห์และเปิดสถานะใหม่' },
  },
  stability: { // อธิบดี
    lottery: { tier:'ok', label:'◈ ฤกษ์วางแผน',
      tip:'ยามนี้ตำราว่าเหมาะกับความมั่นคง ไม่ใช่การเสี่ยงดวง — หากซื้อ ซื้อตามที่วางแผนไว้เท่านั้น' },
    forex:   { tier:'ok', label:'◈ ฤกษ์คงสถานะ',
      tip:'ยามนี้ตำราว่าเหมาะกับการรักษาฐาน — เหมาะกับการถือสถานะที่มีอยู่ ไม่ใช่เปิดใหม่' },
  },
  caution: { // อุบาทว์, อุบาสน
    lottery: { tier:'avoid', label:'✗ ฤกษ์ระวัง',
      tip:'ยามนี้ตำราว่าไม่เหมาะกับการเริ่มต้นสิ่งใหม่ — ควรรอฤกษ์ที่ดีกว่า' },
    forex:   { tier:'avoid', label:'✗ ฤกษ์ระวัง',
      tip:'ยามนี้ตำราว่าไม่เหมาะกับการตัดสินใจสำคัญ — ถ้าต้องเทรด ลดขนาดสถานะและตั้งจุดตัดขาดทุนเสมอ' },
  },
  wait: {
    lottery: { tier:'avoid', label:'✗ ฤกษ์รอ',
      tip:'ยามนี้ตำราว่าควรรอดูสถานการณ์ก่อน ไม่เหมาะกับการลงทุนใดๆ' },
    forex:   { tier:'avoid', label:'✗ ฤกษ์รอ',
      tip:'ยามนี้ตำราว่าควรพักสังเกตการณ์ — ปิดสถานะทั้งหมดและรอดูก่อน' },
  },
  danger: { // โลกาวินาศ, กาลกิณี
    lottery: { tier:'avoid', label:'✗ ฤกษ์ร้าย',
      tip:'ยามนี้ตำราว่าเป็นฤกษ์ร้าย — ควรหลีกเลี่ยงกิจกรรมสำคัญและการลงทุนทุกชนิด' },
    forex:   { tier:'avoid', label:'✗ ฤกษ์ร้าย',
      tip:'ยามนี้ตำราว่าเป็นฤกษ์ร้ายแรง — ปิดสถานะทั้งหมดและพักจากการเทรด' },
  },
  normal: { // ปกติ
    lottery: { tier:'ok', label:'◈ ฤกษ์ธรรมดา',
      tip:'ยามนี้ตำราว่าเป็นฤกษ์ปกติ ไม่มีผลพิเศษ — ซื้อได้ตามปกติ ไม่มีข้อห้ามจากตำรา' },
    forex:   { tier:'ok', label:'◈ ฤกษ์ธรรมดา',
      tip:'ยามนี้ตำราว่าเป็นฤกษ์ปกติ ไม่มีผลพิเศษ — เทรดได้ตามแผน ไม่มีข้อระวังพิเศษจากตำรา' },
  },
};

function getYamActivityRule(yamName, actKey) {
  const yam = YAM_CLASSIC[yamName];
  if (!yam) return { tier:'neutral', label:'ปกติ', tip:'ไม่พบข้อมูลยามนี้ในตำรา' };
  const map = YAM_TO_ACTIVITY[yam.energy];
  return map?.[actKey] || { tier:'neutral', label:'ปกติ', tip:yam.meaning };
}

const ACTIVITY_META = {
  lottery: { label:'🎟 ซื้อล็อตเตอรี่', icon:'🎟' },
  forex:   { label:'📈 เทรดอัตราแลกเปลี่ยน / IQ Option', icon:'📈' },
};

let currentActivity = 'lottery';
let aiCache = {};

function switchActivity(act) {
  currentActivity = act;
  document.querySelectorAll('.act-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + act)?.classList.add('active');
  renderActivityAnalysis(act);
}

function isNowInSlot(slot) {
  if (!slot?.start || !slot?.end) return false;
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = slot.start.split(':').map(Number).reduce((h,m) => h*60+m);
  const e = slot.end.split(':').map(Number).reduce((h,m) => h*60+m);
  if (s <= e) return mins >= s && mins < e;
  return mins >= s || mins < e;
}

// คำนวณปัจจัยดวงส่วนตัวสำหรับ activity
function computePersonalFactors(act) {
  const saved = loadBirthInfo();
  if (!saved) return null;
  const { day, month, year } = saved;
  const birthDate   = new Date(year, month-1, day);
  const birthDow    = birthDate.getDay();
  const birthPlanet = DAY_PLANET[birthDow];
  const lifePath    = getLifePath(year, month, day);
  const chYear      = getChineseYear(year, month, day);
  const compat      = computePlanetCompatibility(birthPlanet, storedPlanets);
  const compatLevel = compat.score >= 65 ? 'good' : compat.score >= 45 ? 'neutral' : 'caution';
  const todayEl     = THAI_ELEMENT_TODAY();
  const elCompat    = chineseElementCompat(chYear.element, todayEl);
  // ทักษาดาวเจ้าวัน — ภูมิที่วันนี้ตกอยู่สำหรับดาวเกิด
  // อ้างอิง: ทักษาปกรณ์ โหราศาสตร์ไทย
  const todayDow    = selectedDate().getDay(); // 0=อา
  const birthDow2   = birthDate.getDay();
  const birthPlanetName = DAY_PLANET[birthDow2];
  const thaxaOrder  = THAXA_PLANET_ORDER[birthPlanetName] || [];
  // ภูมิทักษาของวันนี้ = ลำดับที่ดาวเจ้าวันนี้ตกอยู่ในตารางทักษาของดาวเกิด
  const todayPlanetName = DAY_PLANET[todayDow];
  const thaxaIdx    = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'].indexOf(todayPlanetName);
  const thaxaBhumi  = thaxaOrder[thaxaIdx] || '';
  const thaxaMeaning = THAXA_MEANING[thaxaBhumi] || { quality:'กลาง', note:'' };
  const numComp     = {
    level: thaxaMeaning.quality==='ดี' ? 'good' : thaxaMeaning.quality==='ร้าย' ? 'caution' : 'neutral',
    note:  `ทักษาวันนี้: ${thaxaBhumi} (${thaxaMeaning.quality}) — ${thaxaMeaning.note}`
  };
  const dayNum = selectedDate().getDate();
  const lifePath2 = lifePath;
  return { birthPlanet, lifePath, chYear, compat, compatLevel, elCompat, numComp, todayEl };
}

function renderActivityAnalysis(act) {
  const container = document.getElementById('activity-panel');
  if (!container) return;
  if (!storedDisplayYams.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">⏳ รอข้อมูลยาม...</div>';
    return;
  }

  const meta       = ACTIVITY_META[act];
  const tierOrder  = { best:0, ok:1, avoid:2, neutral:3 };
  const sorted = [...storedDisplayYams].sort((a, b) => {
    const ra = getYamActivityRule(a.type, act);
    const rb = getYamActivityRule(b.type, act);
    return (tierOrder[ra.tier]||3) - (tierOrder[rb.tier]||3);
  });

  let html = '';

  // ── DISCLAIMER ──
  html += `<div style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);
    border-radius:10px;padding:10px 14px;margin-bottom:14px;
    display:flex;align-items:flex-start;gap:10px;">
    <span style="font-size:24px;flex-shrink:0;margin-top:1px;">📜</span>
    <div style="font-size:20px;color:var(--text2);line-height:1.8;">
      <b style="color:var(--gold3);">การทำนายตามหลักโหราศาสตร์</b><br>
      ยามและฤกษ์อ้างอิงจาก <b style="color:var(--text)">คัมภีร์กาลโยค</b> โหราศาสตร์ไทย
      ไม่ใช่คำแนะนำทางการเงิน การลงทุนมีความเสี่ยง
    </div>
  </div>`;

  // ── Layer 1: ยาม ──
  html += `<div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:10px;">
    ✦ ชั้น 1 — ฤกษ์ยามวันนี้ <span style="font-size:18px;color:var(--text2);font-style:italic;letter-spacing:0">(คัมภีร์กาลโยค)</span>
  </div>`;

  for (const period of sorted) {
    const rule    = getYamActivityRule(period.type, act);
    const classic = YAM_CLASSIC[period.type] || {};
    const slotLabels = ['☀ กลางวัน','🌙 กลางคืน'];
    const icons   = { best:'✦', ok:'◈', avoid:'✗', neutral:'—' };
    const slotsHtml = (period.slots||[]).map((s, i) => {
      const isNow    = (calSelectedISO === todayStr(new Date())) && isNowInSlot(s);
      const nowBadge = isNow ? '<span class="now-indicator"><span class="now-dot"></span>ตอนนี้</span>' : '';
      return `<div class="fengri-slot"><span class="slot-dot"></span>${slotLabels[i]||''} ${s.start}–${s.end}${nowBadge}</div>`;
    }).join('');

    html += `<div class="fengri-card ${rule.tier}">
      <div class="fengri-header">
        <span class="fengri-rank">${icons[rule.tier]||'—'}</span>
        <span class="fengri-name">${period.type}</span>
        <span class="fengri-badge">${rule.label||rule.tier}</span>
      </div>
      <div class="fengri-slots">${slotsHtml}</div>
      <div class="fengri-tip">${rule.tip}</div>
      <div style="font-size:18px;color:var(--text2);margin-top:6px;opacity:.7;">
        📖 ${classic.source||'โหราศาสตร์ไทย'}: "${classic.meaning||''}"
      </div>
    </div>`;
  }

  // ── Layer 2: ดวงส่วนตัว ──
  const pf = computePersonalFactors(act);
  if (pf) {
    const compatColor = pf.compatLevel==='good'?'#7ecb96':pf.compatLevel==='caution'?'#e08878':'var(--text2)';
    const elColor     = pf.elCompat.level==='good'?'#7ecb96':pf.elCompat.level==='caution'?'#e08878':'var(--text2)';
    const numColor    = pf.numComp.level==='good'?'#7ecb96':'var(--text2)';
    html += `<div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin:16px 0 10px;">✦ ชั้น 2 — ดวงส่วนตัว</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:20px;">
        <div>
          <div style="color:var(--text2);font-size:18px;margin-bottom:3px;">ดาวเกิด${pf.birthPlanet} vs ดาวฟ้าวันนี้</div>
          <div style="color:${compatColor};font-weight:500;">
            ${pf.compatLevel==='good'?'✦ ดาวเสริม':pf.compatLevel==='caution'?'⚠ ดาวขัด':'◈ เป็นกลาง'}
            <span style="font-size:18px;color:var(--text2);font-weight:400;"> (${pf.compat.level==="good"?"ดาวเสริม":pf.compat.level==="caution"?"ดาวขัด":"กลาง"})</span>
          </div>
        </div>
        <div>
          <div style="color:var(--text2);font-size:18px;margin-bottom:3px;">เลขศาสตร์ ${pf.lifePath}</div>
          <div style="color:${numColor};font-weight:500;">${pf.numComp.note}</div>
        </div>
      </div>
    </div>`;

    // ── Layer 3: ฮวงจุ้ย ──
    html += `<div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin:16px 0 10px;">✦ ชั้น 3 — ธาตุนักษัตร (โหราศาสตร์ไทย)</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:20px;">
      <div style="color:var(--text2);font-size:18px;margin-bottom:6px;">
        นักษัตร${pf.chYear.animal}(${pf.chYear.thaiName||''}) ธาตุ${pf.chYear.element} — ธาตุวันนี้: ${pf.todayEl}
      </div>
      <div style="color:${elColor};font-weight:500;">${pf.elCompat.label}</div>
      <div style="color:var(--text2);font-size:20px;margin-top:4px;">${pf.elCompat.note}</div>
    </div>`;
  } else {
    html += `<div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin:16px 0 8px;">✦ ชั้น 2+3 — ดวงส่วนตัว + ธาตุนักษัตร</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:20px;color:var(--text2);">
      กรอกวันเกิดในส่วน "ดวงชะตาส่วนตัว" เพื่อดูปัจจัยส่วนบุคคล
    </div>`;
  }

  // ── Layer 4: ปัจจัยตลาด (Forex) ──
  if (act === 'forex') {
    const mktNotes = MARKET_CALENDAR();
    html += `<div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin:16px 0 10px;">✦ ชั้น 4 — ปัจจัยตลาด</div>`;
    if (mktNotes.length > 0) {
      html += `<div style="display:flex;flex-direction:column;gap:6px;">`;
      for (const n of mktNotes) {
        const bg  = n.type==='warn' ? 'rgba(192,96,80,0.08)' : 'rgba(201,168,76,0.06)';
        const bdr = n.type==='warn' ? 'rgba(192,96,80,0.3)'  : 'rgba(201,168,76,0.2)';
        html += `<div style="background:${bg};border:1px solid ${bdr};border-radius:10px;
          padding:10px 14px;font-size:20px;color:var(--text2);">
          ${n.type==='warn'?'⚠️':'ℹ️'} ${n.text}</div>`;
      }
      html += `</div>`;
    } else {
      html += `<div style="background:rgba(90,158,112,0.06);border:1px solid rgba(90,158,112,0.2);
        border-radius:10px;padding:10px 14px;font-size:20px;color:var(--text2);">
        ✦ ไม่มีวันหยุดตลาดพิเศษวันนี้ — ตลาดเปิดปกติ</div>`;
    }
  }

  // ── AI Analysis ──
  html += `<div class="ai-box" id="ai-box-${act}" style="margin-top:16px;">
    <div class="ai-box-header">
      ✦ วิเคราะห์รวม 4 ชั้นโดย AI
      <button class="ai-reload" onclick="loadAiAnalysis('${act}', true)">↻ วิเคราะห์ใหม่</button>
    </div>
    <div class="ai-body loading" id="ai-body-${act}">กดปุ่ม ↻ เพื่อวิเคราะห์</div>
  </div>
  <div class="ai-unavail-note">— AI วิเคราะห์ไม่พร้อมใช้งาน —</div>`;

  container.innerHTML = html;
  applyAiVisibility();
}

async function loadAiAnalysis(act, forceRefresh) {
  const bodyEl = document.getElementById('ai-body-' + act);
  if (!bodyEl) return;
  const cacheKey = act + ':' + (calSelectedISO || new Date().toDateString());
  if (!forceRefresh && aiCache[cacheKey]) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = aiCache[cacheKey];
    return;
  }
  bodyEl.className = 'ai-body loading';
  bodyEl.textContent = 'กำลังวิเคราะห์...';

  const now  = new Date();
  const meta = ACTIVITY_META[act];

  const yamLines = storedDisplayYams.map(p => {
    const classic = YAM_CLASSIC[p.type] || {};
    const rule    = getYamActivityRule(p.type, act);
    const slots   = (p.slots||[]).map((s,i)=>`${i===0?'กลางวัน':'กลางคืน'} ${s.start}–${s.end}`).join(', ');
    return `- ${p.type} [${classic.source||'ตำราโหราศาสตร์ไทย'}]: "${classic.meaning||''}" → ${rule.tier==='best'?'เหมาะที่สุด':rule.tier==='ok'?'พอได้':'ควรระวัง'} (${slots})`;
  }).join('\n');

  const nkLine = storedNakshatra ? `ฤกษ์ดาว: ${storedNakshatra.name} ฤกษ์ที่ ${storedNakshatra.num} — ${storedNakshatra.quality==='good'?'มงคล':storedNakshatra.quality==='bad'?'ร้าย':'กลาง'}` : '';
  const tiLine = storedTithi ? `ดิถีเพียร: ${storedTithi.label} — ${storedTithi.qualityLabel}` : '';

  const pf = computePersonalFactors(act);
  const personalLines = pf
    ? `ดาวเกิด${pf.birthPlanet}: ${pf.compatLevel==="good"?"ดาวมิตรเสริม":pf.compatLevel==="caution"?"ดาวศัตรูกดดัน":"กลาง"} (มิตร${pf.compat.friendCount||0} ศัตรู${pf.compat.enemyCount||0})\n${pf.numComp.note}`
    : 'ไม่มีข้อมูลวันเกิด';
  const chineseLine = pf
    ? `ธาตุนักษัตรเกิด: ${pf.chYear.element} | ธาตุวันนี้: ${pf.todayEl} → ${pf.elCompat.label} — ${pf.elCompat.note}`
    : 'ไม่มีข้อมูลปีเกิด';
  const mktLines = act === 'forex'
    ? (MARKET_CALENDAR().map(n=>`- ${n.text}`).join('\n') || '- ตลาดเปิดปกติ')
    : '';

  const prompt = `คุณเป็นโหราจารย์ผู้อ่านฤกษ์ตามหลักคัมภีร์กาลโยคและโหราศาสตร์ไทย

วันนี้: ${now.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} เวลา ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')} น.

═══ ฤกษ์ยาม (คัมภีร์กาลโยค) ═══
${yamLines}
${nkLine}
${tiLine}

═══ ดวงชะตาส่วนตัว ═══
${personalLines}

═══ ธาตุและนักษัตร (โหราศาสตร์ไทย) ═══
${chineseLine}
${act==='forex'?`\n═══ ปัจจัยตลาด ═══\n${mktLines}`:''}

กิจกรรม: ${meta.label}

กฎเหล็ก:
- อ่านผลตรงจากข้อมูลที่ให้เท่านั้น ห้ามอนุมานหรือเติมนอกข้อมูล
- ห้ามใช้ประโยคกำกวม เช่น "ขึ้นอยู่กับตัวคุณ" "หากใช้อย่างถูกวิธี" "มีศักยภาพสูง"
- ห้ามแนะนำสิ่งที่ไม่มีในตำรา เช่น การสวมอัญมณี การทำบุญเฉพาะวัน
- ระบุเหตุและผลจากหลักคำนวณ เช่น "ยามธงชัยเริ่ม XX:XX น. — เหมาะ${meta.label}เพราะเป็นยามมงคลตามคัมภีร์กาลโยค"

วิเคราะห์ (ไม่เกิน 200 คำ ภาษาไทย):
1. ยามและฤกษ์ที่หนุน/ฉุดกิจกรรม${meta.label}วันนี้ — ระบุเวลาและเหตุผลจากตำรา
2. ช่วงเวลาที่ดีที่สุดและควรหลีกเลี่ยง — ระบุจากยามที่คำนวณได้จริง
3. ผลจากดวงส่วนตัวและธาตุนักษัตร (โหราศาสตร์ไทย)ต่อกิจกรรมนี้`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    const text = data.text || 'ไม่สามารถวิเคราะห์ได้';
    aiCache[cacheKey] = text;
    bodyEl.className = 'ai-body';
    bodyEl.textContent = text;
  } catch(e) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = '⚠ ' + e.message;
  }
}

// ═══════════════════════════════════════════════
// เลขศาสตร์ไทย (THAI NUMEROLOGY)
// ═══════════════════════════════════════════════

// ── อ้างอิง: เลขศาสตร์ไทย ผูกดาวนพเคราะห์ ──────
// แหล่งอ้างอิง: โหราศาสตร์ไทยประยุกต์, ดร.สมัย โชติชัยสถิตย์
// และ "เลขศาสตร์มงคล" สำนักพิมพ์ดวงกมล
const NUMRO_PLANET = {
  1: { name:'อาทิตย์', sym:'☉', cls:'sun',    quality:'good',    trait:'อำนาจ ผู้นำ ความสำเร็จ' },
  2: { name:'จันทร์',  sym:'☽', cls:'moon',   quality:'neutral', trait:'อารมณ์ ความผูกพัน ความเปลี่ยนแปลง' },
  3: { name:'พฤหัส',  sym:'♃', cls:'jupit',  quality:'good',    trait:'โชคลาภ ปัญญา ความเจริญ' },
  4: { name:'ราหู',   sym:'☊', cls:'rahu',   quality:'bad',     trait:'ขัดขวาง ความลึกลับ อุปสรรคซ่อนเร้น' },
  5: { name:'พุธ',    sym:'☿', cls:'merc',   quality:'good',    trait:'การสื่อสาร ค้าขาย ไหวพริบ' },
  6: { name:'ศุกร์',  sym:'♀', cls:'venus',  quality:'good',    trait:'ความรัก ศิลปะ ความสุข' },
  7: { name:'เกตุ',   sym:'☋', cls:'ketu',   quality:'neutral', trait:'จิตวิญญาณ โดดเดี่ยว เรื่องลี้ลับ' },
  8: { name:'เสาร์',  sym:'♄', cls:'saturn', quality:'bad',     trait:'อุปสรรค ความล่าช้า แต่อดทน' },
  9: { name:'อังคาร', sym:'♂', cls:'mars',   quality:'good',    trait:'พลังงาน ความกล้า ความมุ่งมั่น' },
};

// เลขตำแหน่งสำคัญในเบอร์มือถือ (10 หลัก)
// อ้างอิง: หลักเลขศาสตร์โหราไทยประยุกต์
const PHONE_POSITION = {
  0: 'หลักต้น (เครือข่าย)',
  1: 'หลักที่ 2',
  2: 'หลักที่ 3',
  3: 'เลขโชค (หลัก 4)',
  4: 'เลขโชค (หลัก 5)',
  5: 'เลขกลาง 1',
  6: 'เลขกลาง 2',
  7: 'เลขท้าย 1',
  8: 'เลขท้าย 2',
  9: 'เลขท้าย 3',
};

// เลขตำแหน่งในบัตรประชาชน (13 หลัก)
// หลักที่ 1 = ประเภทบุคคล, 2-5 = รหัสจังหวัด/อำเภอ, 6-12 = ลำดับ, 13 = check digit
const ID_POSITION = {
  0: 'ประเภทบุคคล',
  1: 'รหัสจังหวัด 1',
  2: 'รหัสจังหวัด 2',
  3: 'รหัสอำเภอ 1',
  4: 'รหัสอำเภอ 2',
  5: 'ลำดับ 1',
  6: 'ลำดับ 2',
  7: 'ลำดับ 3',
  8: 'ลำดับ 4',
  9: 'ลำดับ 5',
  10:'ลำดับ 6',
  11:'ลำดับ 7',
  12:'เลขตรวจสอบ',
};

function digitReduce(digits) {
  // ลดรูปจนเหลือหลักเดียว
  let sum = digits.reduce((a,b) => a + b, 0);
  while (sum > 9) sum = String(sum).split('').reduce((a,b) => a + Number(b), 0);
  return sum;
}

function countDigit(digits, d) { return digits.filter(x => x === d).length; }

function analyzeDigits(digits) {
  const rootNum = digitReduce(digits);
  const rootPlanet = NUMRO_PLANET[rootNum];
  // นับจำนวนดาวแต่ละดวง
  const planetCount = {};
  digits.forEach(d => { if(d > 0) planetCount[d] = (planetCount[d]||0) + 1; });
  // หาดาวเด่น (มากสุด)
  const dominant = Object.entries(planetCount).sort((a,b) => b[1]-a[1])[0];
  const dominantPlanet = dominant ? NUMRO_PLANET[parseInt(dominant[0])] : null;
  // คะแนนโดยรวม
  const goodCount = digits.filter(d => d > 0 && NUMRO_PLANET[d]?.quality === 'good').length;
  const badCount  = digits.filter(d => d > 0 && NUMRO_PLANET[d]?.quality === 'bad').length;
  const score = Math.round((goodCount / (goodCount + badCount + 0.01)) * 100);

  return { rootNum, rootPlanet, dominant, dominantPlanet, planetCount, goodCount, badCount, score };
}

// ── Render digit boxes ────────────────────────
function renderDigitBoxes(digits, posMap) {
  return digits.map((d, i) => {
    const p = d > 0 ? NUMRO_PLANET[d] : null;
    const cls = p ? p.cls : '';
    const tip = posMap ? (posMap[i] || '') : '';
    return `<div class="digit-box ${cls}" title="${tip}">
      <span class="d-num" style="color:${p?'var(--text)':'var(--text2)'}">${d}</span>
      <span class="d-planet">${p ? p.sym : ''}</span>
    </div>`;
  }).join('');
}

// ── Render numerology panel ────────────────────
let currentNumroTab = 'phone';
function switchNumroTab(tab) {
  currentNumroTab = tab;
  document.querySelectorAll('.numro-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('ntab-' + tab)?.classList.add('active');
  document.getElementById('numro-phone-panel').style.display = tab === 'phone' ? '' : 'none';
  document.getElementById('numro-id-panel').style.display    = tab === 'id'    ? '' : 'none';
}

function renderNumroPanel(tab) {
  const phoneEl = document.getElementById('numro-phone-panel');
  const idEl    = document.getElementById('numro-id-panel');
  if (!phoneEl || !idEl) return;

  phoneEl.innerHTML = buildNumroInput('phone', '📱 เบอร์มือถือ',    '0812345678',  10, 'วิเคราะห์เบอร์');
  idEl.innerHTML    = buildNumroInput('id',    '🪪 บัตรประชาชน', '1234567890123', 13, 'วิเคราะห์บัตร');
}

function buildNumroInput(type, label, placeholder, maxLen, btnLabel) {
  return `<div class="numro-wrap">
    <div class="numro-input-row">
      <div class="numro-field">
        <label>${label}</label>
        <input type="text" id="numro-input-${type}" maxlength="${maxLen}" placeholder="${placeholder}"
          inputmode="numeric" oninput="this.value=this.value.replace(/\D/g,'')"
          onkeydown="if(event.key==='Enter') analyzeNumro('${type}')">
      </div>
      <button class="numro-btn" onclick="analyzeNumro('${type}')">${btnLabel}</button>
    </div>
    <div id="numro-result-${type}"></div>
  </div>`;
}

async function analyzeNumro(type) {
  const input    = document.getElementById('numro-input-' + type);
  const resultEl = document.getElementById('numro-result-' + type);
  if (!input || !resultEl) return;

  const raw    = input.value.replace(/\D/g, '');
  const minLen = type === 'phone' ? 9 : 13;
  const maxLen = type === 'phone' ? 10 : 13;

  if (raw.length < minLen || raw.length > maxLen) {
    resultEl.innerHTML = `<div style="color:var(--danger);font-size:20px;padding:8px 0">
      ⚠ กรุณากรอก${type==='phone'?'เบอร์มือถือ 9-10 หลัก':'เลขบัตร 13 หลัก'}ให้ครบ</div>`;
    return;
  }

  // แสดง loading
  resultEl.innerHTML = `<div class="loading" style="padding:20px 0">
    <div class="spinner"></div><p>กำลังโหลดข้อมูล...</p></div>`;

  const digits   = raw.split('').map(Number);
  const posMap   = type === 'phone' ? PHONE_POSITION : ID_POSITION;
  const analysis = analyzeDigits(digits);
  const { rootNum, rootPlanet, dominantPlanet, planetCount, score } = analysis;

  // ── สร้าง HTML ──
  const scoreColor = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warn)' : 'var(--danger)';
  const scoreLabel = score >= 70 ? '✦ ดีมาก' : score >= 40 ? '◈ พอไหว' : '✗ ควรระวัง';
  let html = `<div class="numro-result">`;

  // digit boxes
  html += `<div style="font-size:18px;color:var(--text2);margin-bottom:6px;">hover เพื่อดูตำแหน่ง</div>`;
  html += `<div class="digit-row">${renderDigitBoxes(digits, posMap)}</div>`;

  // summary stats
  html += `<div class="numro-summary">
    <div class="numro-stat">
      <div class="numro-stat-label">เลขมูล</div>
      <div class="numro-stat-val">${rootNum}</div>
      <div class="numro-stat-sub">${rootPlanet?.name||''} ${rootPlanet?.sym||''}</div>
    </div>
    <div class="numro-stat">
      <div class="numro-stat-label">ดาวเด่น</div>
      <div class="numro-stat-val">${dominantPlanet?.sym||'—'}</div>
      <div class="numro-stat-sub">${dominantPlanet?.name||'—'}</div>
    </div>
    <div class="numro-stat">
      <div class="numro-stat-label">คะแนนรวม</div>
      <div class="numro-stat-val" style="color:${scoreColor}">${score}</div>
      <div class="numro-stat-sub">${scoreLabel}</div>
    </div>
  </div>`;

  // planet breakdown
  const breakdown = Object.entries(planetCount)
    .sort((a,b) => b[1]-a[1])
    .map(([d,cnt]) => {
      const p = NUMRO_PLANET[parseInt(d)];
      if (!p) return '';
      const qColor = p.quality==='good'?'var(--success)':p.quality==='bad'?'var(--danger)':'var(--text2)';
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
        <span style="font-size:24px;width:24px;text-align:center">${p.sym}</span>
        <span style="font-size:20px;flex:1;color:var(--text)">${p.name} (${d}) × ${cnt}</span>
        <span style="font-size:18px;color:${qColor}">${p.trait}</span>
      </div>`;
    }).join('');
  html += `<div style="margin:10px 0 14px">${breakdown}</div>`;

  // AI analysis box
  html += `<div class="ai-box" id="numro-ai-box-${type}">
    <div class="ai-box-header">
      ✦ วิเคราะห์เชิงลึกโดย AI
      <button class="ai-reload" onclick="analyzeNumroAI('${type}','${raw}',true)">↻ วิเคราะห์ใหม่</button>
    </div>
    <div class="ai-body loading" id="numro-ai-body-${type}">กดปุ่ม ↻ เพื่อวิเคราะห์</div>
  </div>
  <div class="ai-unavail-note">— AI วิเคราะห์ไม่พร้อมใช้งาน —</div>`;

  html += `</div>`;
  resultEl.innerHTML = html;
  applyAiVisibility();


}

let numroAiCache = {};

async function analyzeNumroAI(type, numStr, forceRefresh) {
  const bodyEl = document.getElementById('numro-ai-body-' + type);
  if (!bodyEl) return;

  const cacheKey = type + ':' + numStr;
  if (!forceRefresh && numroAiCache[cacheKey]) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = numroAiCache[cacheKey];
    return;
  }

  bodyEl.className = 'ai-body loading';
  bodyEl.textContent = 'กำลังวิเคราะห์เชิงลึก...';

  const digits   = numStr.split('').map(Number);
  const analysis = analyzeDigits(digits);
  const posMap   = type === 'phone' ? PHONE_POSITION : ID_POSITION;

  // สร้าง breakdown สำหรับ prompt
  const digitList = digits.map((d,i) => `ตำแหน่ง${i+1}(${posMap[i]||''})=${d}→${NUMRO_PLANET[d]?.name||'?'}`).join(', ');
  const planetList = Object.entries(analysis.planetCount)
    .map(([d,c]) => `${NUMRO_PLANET[d]?.name}(${d})×${c}: ${NUMRO_PLANET[d]?.trait}`).join('; ');

  const typeLabel = type === 'phone' ? 'เบอร์มือถือ' : 'หมายเลขบัตรประชาชน';

  const prompt = `คุณเป็นผู้เชี่ยวชาญเลขศาสตร์ไทย ใช้หลักการผูกตัวเลขกับดาวนพเคราะห์ตามโหราศาสตร์ไทยดั้งเดิม

วิเคราะห์${typeLabel}: ${numStr}

ข้อมูลที่คำนวณได้:
- เลขมูล: ${analysis.rootNum} (${analysis.rootPlanet?.name} — ${analysis.rootPlanet?.trait})
- ดาวเด่น: ${analysis.dominantPlanet?.name || '-'} (ปรากฏ ${analysis.dominant?.[1]||0} ครั้ง)
- รายละเอียดดาวแต่ละหลัก: ${planetList}
- ตำแหน่งตัวเลข: ${digitList}
- คะแนนรวม: ${analysis.score}/100

กฎเหล็ก:
- อ่านผลตรงจากข้อมูลที่ให้เท่านั้น ห้ามอนุมานนอกข้อมูล
- ห้ามใช้ประโยคกำกวม เช่น "มีศักยภาพสูงหากใช้อย่างถูกวิธี" "ขึ้นอยู่กับตัวคุณ"
- ห้ามแนะนำสิ่งที่ไม่มีในตำราเลขศาสตร์ไทย เช่น การสวมอัญมณีสี การทำบุญวันใดวันหนึ่ง
- ระบุเหตุผลจากหลักดาวนพเคราะห์เสมอ เช่น "เลขมูล 3 ตรงกับดาวพฤหัสบดี ตำราระบุว่า..."

วิเคราะห์ (ภาษาไทย ไม่เกิน 6 ประโยค):
1. ผลรวมดาวที่ปรากฏใน${typeLabel}นี้ตามหลักเลขศาสตร์ไทย — ระบุดาวและความหมายจากตำรา
2. จุดเด่นและจุดระวังตามตำแหน่งตัวเลขที่คำนวณได้
3. ความเหมาะสมด้านต่างๆ ตามคุณสมบัติดาวที่ปรากฏ`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    const _nt = data.text || 'ไม่สามารถวิเคราะห์ได้';
    numroAiCache[cacheKey] = _nt;
    bodyEl.className = 'ai-body';
    bodyEl.textContent = _nt;
  } catch(e) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = '⚠ ' + e.message;
  }
}



// ═══════════════════════════════════════════════
// สีประจำวัน (THAI DAY COLORS)
// ═══════════════════════════════════════════════
// อ้างอิง: ตาราง "สีมงคลประจำวันเกิด" — หลักทักษาปกรณ์โหราศาสตร์ไทย
// เผยแพร่โดย myhora.com | ทักษา 8 ภูมิ: บริวาร อายุ เดช ศรี มูละ อุตสาหะ มนตรี กาลกิณี

// ── ชื่อสีหลักและ hex ──────────────────────────
// สีดาวนพเคราะห์ตามโหราศาสตร์ไทย:
//   อาทิตย์ = แดง (#CC2200)
//   จันทร์  = ขาว/เหลืองนวล (#F5F0D8)
//   อังคาร  = ชมพู (#E75480)
//   พุธ(กลางวัน)  = เขียว (#2E7D32)
//   พฤหัส  = ส้ม/เหลืองแก่ (#E65100)
//   ศุกร์   = ฟ้า/น้ำเงิน (#1565C0)
//   พุธ(กลางคืน) = เทา/ควันบุหรี่ (#607D8B)
//   เสาร์   = ดำ/ม่วง (#1A1A2E)

const COLOR_GROUPS = {
  red:    { hex:'#CC2200', hex2:'#FF4500', name:'แดง',          planet:'อาทิตย์' },
  white:  { hex:'#F5F0D8', hex2:'#FFD700', name:'ขาว/เหลือง',   planet:'จันทร์'  },
  pink:   { hex:'#E75480', hex2:'#FF69B4', name:'ชมพู',         planet:'อังคาร'  },
  green:  { hex:'#2E7D32', hex2:'#66BB6A', name:'เขียว',        planet:'พุธ(กลางวัน)' },
  orange: { hex:'#E65100', hex2:'#FF8F00', name:'ส้ม/เหลืองแก่',planet:'พฤหัส'  },
  blue:   { hex:'#1565C0', hex2:'#42A5F5', name:'ฟ้า/น้ำเงิน', planet:'ศุกร์'   },
  gray:   { hex:'#607D8B', hex2:'#90A4AE', name:'เทา/ควันบุหรี่',planet:'พุธ(กลางคืน)' },
  black:  { hex:'#1A1A2E', hex2:'#4A148C', name:'ดำ/ม่วง',      planet:'เสาร์'   },
};

// ตาราง 8 ภูมิ × 8 วันเกิด
// อ้างอิง: ทักษาปกรณ์ myhora.com
// วันเกิด 0=อาทิตย์ 1=จันทร์ 2=อังคาร 3=พุธ(กลางวัน)
//          4=พฤหัส 5=ศุกร์ 6=เสาร์ 7=พุธ(กลางคืน)
const TAKSA_TABLE = {
  //         บริวาร    อายุ    เดช     ศรี     มูละ    อุตสาหะ มนตรี   กาลกิณี
  0: ['red','white','pink','green','black','orange','gray','blue'],    // อาทิตย์
  1: ['white','pink','green','black','orange','gray','blue','red'],    // จันทร์
  2: ['pink','green','black','orange','gray','blue','red','white'],    // อังคาร
  3: ['green','black','orange','gray','blue','red','white','pink'],    // พุธ(กลางวัน)
  4: ['orange','gray','blue','red','white','pink','green','black'],    // พฤหัส
  5: ['blue','red','white','pink','green','black','orange','gray'],    // ศุกร์
  6: ['black','orange','gray','blue','white','pink','green','red'],    // เสาร์
  7: ['gray','blue','red','white','pink','green','black','orange'],    // พุธ(กลางคืน)
};

const TAKSA_CATS = ['บริวาร','อายุ','เดช','ศรี','มูละ','อุตสาหะ','มนตรี','กาลกิณี'];
const CATEGORY_META = {
  บริวาร: {
    icon: '👥',
    meaning: 'ภูมิที่ 1 — ความสัมพันธ์และผู้คนรอบข้าง',
    detail: 'ครอบคลุมบุตร ภรรยา สามี ญาติมิตร ลูกน้อง และผู้ใต้บังคับบัญชา ใส่สีนี้เมื่อต้องการให้คนรอบข้างเป็นมิตร ประชุมทีม สัมภาษณ์งาน หรือพบปะสังสรรค์',
    wear: 'เหมาะใส่วันที่ต้องพบปะผู้คนจำนวนมาก งานสังคม หรือต้องการความร่วมมือจากทีม',
  },
  อายุ: {
    icon: '💚',
    meaning: 'ภูมิที่ 2 — สุขภาพและความสุขในชีวิต',
    detail: 'ดูแลสุขภาพกาย สุขภาพใจ ความสบาย และอายุยืนยาว ใส่สีนี้วันที่ไปพบแพทย์ ออกกำลังกาย หรือต้องการความสงบผ่อนคลาย',
    wear: 'เหมาะใส่วันพักผ่อน วันดูแลสุขภาพ หรือเมื่อรู้สึกเครียดต้องการฟื้นฟูพลังงาน',
  },
  เดช: {
    icon: '⚔️',
    meaning: 'ภูมิที่ 3 — อำนาจ บารมี และหน้าที่การงาน',
    detail: 'เสริมความมีอำนาจวาสนา ชื่อเสียง เกียรติยศ และความก้าวหน้าในอาชีพ นับเป็น "ภูมิดาวเด่น" ที่โหรไทยแนะนำให้ใส่บ่อยที่สุด',
    wear: 'เหมาะที่สุดสำหรับการประชุมสำคัญ เจรจาธุรกิจ สอบ นำเสนองาน หรือวันที่ต้องการสร้างความประทับใจ',
  },
  ศรี: {
    icon: '✨',
    meaning: 'ภูมิที่ 4 — โชคลาภ บารมี และความมั่งคั่ง',
    detail: 'นำพาโชคลาภ เงินทอง บารมี และให้ผู้คนนิยมยกย่อง เป็นภูมิแห่งความงาม บุคลิกดึงดูด',
    wear: 'เหมาะใส่วันสัมภาษณ์งาน พบนักลงทุน ออกเดต หรือวันที่ต้องการให้ตัวเองดูมีเสน่ห์น่าเชื่อถือ',
  },
  มูละ: {
    icon: '💰',
    meaning: 'ภูมิที่ 5 — ฐานะ ทรัพย์สิน และความมั่นคง',
    detail: 'เสริมฐานะทางการเงิน บ้านเรือน ที่ดิน ทรัพย์สินมรดก และหลักฐานที่มั่นคงในชีวิต',
    wear: 'เหมาะใส่วันทำนิติกรรม ซื้อบ้าน ลงนามสัญญา หรือวันที่ต้องการสร้างความมั่นคงในระยะยาว',
  },
  อุตสาหะ: {
    icon: '🔥',
    meaning: 'ภูมิที่ 6 — ความขยัน ความพยายาม และความสำเร็จ',
    detail: 'หนุนนำความขยันหมั่นเพียร มานะบากบั่น และผลสำเร็จจากการลงแรงลงใจ เหมาะกับการเริ่มต้นสิ่งใหม่',
    wear: 'เหมาะใส่วันเริ่มโปรเจกต์ใหม่ ทำงานหนัก ออกกำลังกายหนัก หรือวันที่ต้องการแรงฮึดและความมุ่งมั่น',
  },
  มนตรี: {
    icon: '🤝',
    meaning: 'ภูมิที่ 7 — ผู้อุปถัมภ์และความช่วยเหลือจากผู้ใหญ่',
    detail: 'ดึงดูดการช่วยเหลือจากผู้ใหญ่ เจ้านาย ผู้มีอำนาจ หรือผู้มีบารมี ให้ความคุ้มครองและอุปถัมภ์',
    wear: 'เหมาะใส่วันพบผู้บังคับบัญชา ขอความช่วยเหลือ ขอโปรโมชั่น หรือวันที่ต้องการพึ่งพาบุญวาสนา',
  },
  กาลกิณี: {
    icon: '⚠️',
    meaning: 'ภูมิที่ 8 — อุปสรรค ศัตรู และความสูญเสีย',
    detail: 'เป็นสีต้องห้ามในวันสำคัญ นำมาซึ่งอุปสรรค ศัตรู ความสูญเสีย และปัญหาที่ไม่คาดฝัน ตามคัมภีร์ทักษาปกรณ์ถือว่าร้ายแรงที่สุด',
    wear: 'หลีกเลี่ยงในวันสำคัญทุกกรณี — งานสัมภาษณ์ เซ็นสัญญา งานมงคล งานแต่งงาน และการตัดสินใจครั้งสำคัญ',
  },
};

// วันปัจจุบัน → index ใน TAKSA_TABLE
// (พุธกลางคืน = 7 ต้อง input จากผู้ใช้ เพราะต้องรู้เวลาเกิด)
function todayTaksaIdx() { return selectedDate().getDay(); } // 0=อาทิตย์...6=เสาร์

// ── render สีประจำวัน (วันนี้) ─────────────────
function renderDayColors() {
  const el = document.getElementById('daycolor-section');
  if (!el) return;
  const dow    = todayTaksaIdx();
  const cats   = TAKSA_CATS;
  const colors = TAKSA_TABLE[dow];

  const dayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ (กลางวัน)','พฤหัสบดี','ศุกร์','เสาร์'];
  const planets  = ['ดวงอาทิตย์ ☉','ดวงจันทร์ ☽','ดาวอังคาร ♂','ดาวพุธ ☿','ดาวพฤหัส ♃','ดาวศุกร์ ♀','ดาวเสาร์ ♄'];

  // swatch bar (ไม่รวมกาลกิณี)
  const swatchHtml = cats.slice(0,7).map((cat,i) => {
    const cg = COLOR_GROUPS[colors[i]];
    const meta = CATEGORY_META[cat];
    return `<div class="swatch-wrap" title="${meta.meaning} — ${meta.detail}">
      <div class="swatch lucky" style="background:${cg.hex}"></div>
      <span class="swatch-label">${meta.icon} ${cat}</span>
    </div>`;
  }).join('');

  const tabooCg = COLOR_GROUPS[colors[7]];
  const tabooMeta = CATEGORY_META['กาลกิณี'];
  const tabooHtml = `<div class="swatch-wrap" title="${tabooMeta.meaning} — ${tabooMeta.detail}">
    <div class="swatch taboo" style="background:${tabooCg.hex}"></div>
    <span class="swatch-label">⚠️ กาลกิณี</span>
  </div>`;

  // color cards
  const goodCards = cats.slice(0,7).map((cat,i) => {
    const cg = COLOR_GROUPS[colors[i]];
    const meta = CATEGORY_META[cat];
    const textCol = isLight(cg.hex) ? '#1a1a1a' : '#ffffff';
    return `<div class="color-card">
      <div class="color-card-top" style="background:${cg.hex};color:${textCol}">
        ${meta.icon} ${cat}
      </div>
      <div class="color-card-body">
        <div class="color-card-name">${cg.name}</div>
        <div style="font-size:17px;color:var(--text2);font-family:monospace;margin-bottom:4px;">${cg.hex}</div>
        <span class="color-card-tag tag-lucky">✦ ${cat}</span>
        <div class="color-meaning" style="margin-top:7px;font-size:19px;line-height:1.7;"><b style="color:var(--text);font-size:18px;">${meta.meaning}</b><br>${meta.detail}</div>
        <div style="margin-top:8px;padding:8px 10px;background:rgba(201,168,76,0.06);border-left:2px solid rgba(201,168,76,0.35);border-radius:0 8px 8px 0;font-size:18px;color:var(--gold3);line-height:1.6;">👔 ${meta.wear}</div>
      </div>
    </div>`;
  }).join('');

  const badCard = (() => {
    const cg = COLOR_GROUPS[colors[7]];
    const meta = CATEGORY_META['กาลกิณี'];
    const textCol = isLight(cg.hex) ? '#1a1a1a' : '#ffffff';
    return `<div class="color-card">
      <div class="color-card-top" style="background:${cg.hex};color:${textCol}">⚠️ กาลกิณี</div>
      <div class="color-card-body">
        <div class="color-card-name">${cg.name}</div>
        <div style="font-size:17px;color:var(--text2);font-family:monospace;margin-bottom:4px;">${cg.hex}</div>
        <span class="color-card-tag tag-taboo">✗ ห้ามสวมใส่วันสำคัญ</span>
        <div class="color-meaning" style="margin-top:7px;font-size:19px;line-height:1.7;"><b style="color:var(--text);font-size:18px;">${meta.meaning}</b><br>${meta.detail}</div>
        <div style="margin-top:8px;padding:8px 10px;background:rgba(192,96,80,0.08);border-left:2px solid rgba(192,96,80,0.4);border-radius:0 8px 8px 0;font-size:18px;color:#e08878;line-height:1.6;">🚫 ${meta.wear}</div>
      </div>
    </div>`;
  })();

  const topCg = COLOR_GROUPS[colors[2]]; // เดช
  const sriCg = COLOR_GROUPS[colors[3]]; // ศรี

  el.innerHTML = `

    <div class="daycolor-hero">
      <div class="daycolor-swatches">${swatchHtml}${tabooHtml}</div>
      <div class="daycolor-info">
        <div class="daycolor-day">วัน${dayNames[dow]}</div>
        <div class="daycolor-planet">${planets[dow]}</div>
        <div style="font-size:20px;color:var(--text2);line-height:1.9;margin-top:6px;">
          <b style="color:${topCg.hex2}">⚔️ เดช:</b> ${topCg.name} — เสริมอำนาจ บารมี เจรจาธุรกิจ นำเสนองาน<br>
          <b style="color:${sriCg.hex2}">✨ ศรี:</b> ${sriCg.name} — เสริมโชคลาภ ความมั่งคั่ง บุคลิกดึงดูด<br>
          <span style="color:var(--danger)">⚠️ กาลกิณี: ${tabooCg.name} — ห้ามใส่วันสำคัญ (สัมภาษณ์ เซ็นสัญญา งานมงคล)</span>
        </div>
      </div>
    </div>
    <div class="color-grid">${goodCards}${badCard}</div>

    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;">
      <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:10px;">✦ สีตามวันเกิดของคุณ (ส่วนตัว)</div>
      <div style="font-size:20px;color:var(--text2);margin-bottom:10px;">เลือกวันเกิดเพื่อดูสีที่เหมาะกับคุณโดยเฉพาะ</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;" id="birth-day-btns">
        ${['อาทิตย์','จันทร์','อังคาร','พุธ (กลางวัน)','พฤหัสบดี','ศุกร์','เสาร์','พุธ (กลางคืน)'].map((d,i)=>
          `<button onclick="showBirthDayColors(${i})" class="numro-btn" style="padding:6px 14px;font-size:20px;" id="bday-btn-${i}">${d}</button>`
        ).join('')}
      </div>
      <div id="birth-day-result"></div>
    </div>

`;
}

// ── แสดงสีตามวันเกิด ──────────────────────────
function showBirthDayColors(birthDayIdx) {
  // highlight selected button
  document.querySelectorAll('[id^="bday-btn-"]').forEach(b => {
    b.style.borderColor = '';
    b.style.color = '';
    b.style.background = '';
  });
  const btn = document.getElementById('bday-btn-' + birthDayIdx);
  if (btn) {
    btn.style.borderColor = 'rgba(201,168,76,0.6)';
    btn.style.color = 'var(--gold2)';
    btn.style.background = 'rgba(201,168,76,0.12)';
  }

  const todayIdx = todayTaksaIdx();
  const colors   = TAKSA_TABLE[birthDayIdx];
  const todayColors = TAKSA_TABLE[todayIdx];
  const dayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ (กลางวัน)','พฤหัสบดี','ศุกร์','เสาร์','พุธ (กลางคืน)'];

  // สีไหนของวันนี้ตรงกับ category ดีของวันเกิด
  const goodCatsForBirthday = new Set(colors.slice(0,7)); // index 0-6 = บริวาร..มนตรี
  const todayGoodColors = todayColors.slice(0,7).filter(col => goodCatsForBirthday.has(col));
  const todayBadColor   = todayColors[7]; // กาลกิณีวันนี้
  const birthBadColor   = colors[7];      // กาลกิณีวันเกิด

  // Cross-reference: สีที่เหมาะกับวันนี้สำหรับคนวันเกิดนี้
  const crossColors = TAKSA_CATS.map((cat, i) => {
    const colKey = colors[i];
    const cg = COLOR_GROUPS[colKey];
    const isKalakinee = i === 7;
    // หาว่าสีนี้อยู่ใน category ไหนของวันนี้
    const todayIdx2 = todayColors.indexOf(colKey);
    const todayCat = todayIdx2 >= 0 ? TAKSA_CATS[todayIdx2] : null;
    return { cat, colKey, cg, isKalakinee, todayCat, todayIdx2 };
  });

  const resultEl = document.getElementById('birth-day-result');
  if (!resultEl) return;

  // สรุปว่าวันนี้ควรใส่สีอะไร
  const recommendedToday = crossColors
    .filter(x => !x.isKalakinee && x.todayCat && x.todayCat !== 'กาลกิณี')
    .slice(0, 3);
  const avoidToday = crossColors.filter(x => x.colKey === todayBadColor || x.colKey === birthBadColor);

  let html = `<div style="background:rgba(201,168,76,0.05);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:12px;">`;
  html += `<div style="font-size:20px;color:var(--gold3);font-weight:600;margin-bottom:8px;">คนเกิดวัน${dayNames[birthDayIdx]} · วันนี้วัน${dayNames[todayIdx]}</div>`;

  if (recommendedToday.length > 0) {
    html += `<div style="font-size:20px;color:var(--text2);margin-bottom:6px;">🎯 <b style="color:var(--text)">วันนี้ควรใส่:</b></div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">`;
    recommendedToday.forEach(x => {
      const textCol = isLight(x.cg.hex) ? '#1a1a1a' : '#ffffff';
      html += `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;background:${x.cg.hex};color:${textCol};font-size:20px;">
        ${x.cg.name} <span style="opacity:.7;font-size:18px;">(${x.cat} ของคุณ = ${x.todayCat} ของวันนี้)</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div style="font-size:18px;color:var(--danger);">⚠ กาลกิณีของคุณ: <b>${COLOR_GROUPS[birthBadColor].name}</b> — หลีกเลี่ยงในวันสำคัญเสมอ</div>`;
  html += `</div>`;

  // ตาราง 8 ภูมิ
  html += `<div class="color-grid">`;
  crossColors.forEach(({ cat, cg, isKalakinee, todayCat }) => {
    const textCol = isLight(cg.hex) ? '#1a1a1a' : '#ffffff';
    const meta = CATEGORY_META[cat];
    const cardCls = isKalakinee ? 'tag-taboo' : 'tag-lucky';
    const cardTag = isKalakinee ? '✗ กาลกิณี' : `✦ ${cat}`;
    const todayNote = todayCat ? `<div style="font-size:18px;color:var(--gold3);margin-top:3px;">= ${todayCat} วันนี้</div>` : '';
    const wearStyle = isKalakinee
      ? 'background:rgba(192,96,80,0.08);border-left:2px solid rgba(192,96,80,0.4);color:#e08878;'
      : 'background:rgba(201,168,76,0.06);border-left:2px solid rgba(201,168,76,0.35);color:var(--gold3);';
    const wearIcon = isKalakinee ? '🚫' : '👔';
    html += `<div class="color-card">
      <div class="color-card-top" style="background:${cg.hex};color:${textCol}">
        ${meta.icon} ${cat}
      </div>
      <div class="color-card-body">
        <div class="color-card-name">${cg.name}</div>
        <span class="color-card-tag ${cardCls}">${cardTag}</span>
        ${todayNote}
        <div class="color-meaning" style="margin-top:7px;font-size:19px;line-height:1.7;"><b style="color:var(--text);font-size:18px;">${meta.meaning}</b><br>${meta.detail}</div>
        <div style="margin-top:8px;padding:8px 10px;${wearStyle}border-radius:0 8px 8px 0;font-size:18px;line-height:1.6;">${wearIcon} ${meta.wear}</div>
      </div>
    </div>`;
  });
  html += `</div>`;

  resultEl.innerHTML = html;
}

function isLight(hex) {
  if (!hex || hex.length < 7) return false;
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return (r*299+g*587+b*114)/1000 > 128;
}



// ── ดาวนพเคราะห์ global + AI ─────────────────
let storedPlanets = [];

async function analyzePlanetsAI(forceRefresh=false) {
  const bodyEl = document.getElementById('planet-ai-body');
  if (!bodyEl || !storedPlanets.length) return;

  const cacheKey = 'planets:' + (calSelectedISO || new Date().toDateString());
  if (!forceRefresh && window._planetAiCache?.[cacheKey]) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = window._planetAiCache[cacheKey];
    return;
  }
  if (!window._planetAiCache) window._planetAiCache = {};

  bodyEl.className = 'ai-body loading';
  bodyEl.textContent = 'กำลังวิเคราะห์...';

  const MALEFIC = new Set(['เสาร์','ราหู','อังคาร','เกตุ']);
  const BENEFIC = new Set(['พฤหัสบดี','ศุกร์','จันทร์']);

  // สร้าง summary
  const planetList = storedPlanets.map(p =>
    `${p.name}(${p.sym}) ราศี${p.rasi} ${p.deg}°${p.min}'${p.retrograde?' ถอยหลัง':''}`
  ).join(', ');

  // หา conjunction
  const rasiMap = {};
  storedPlanets.forEach(p => { (rasiMap[p.rasi]||(rasiMap[p.rasi]=[])).push(p.name); });
  const conjs = Object.entries(rasiMap).filter(([,ps])=>ps.length>=2)
    .map(([r,ps])=>`${ps.join('+')} ร่วม${r}`).join('; ');

  const malList = storedPlanets.filter(p=>MALEFIC.has(p.name)).map(p=>`${p.name}ใน${p.rasi}`).join(', ');
  const benList = storedPlanets.filter(p=>BENEFIC.has(p.name)).map(p=>`${p.name}ใน${p.rasi}`).join(', ');
  const retroList = storedPlanets.filter(p=>p.retrograde).map(p=>p.name).join(', ');

  const now = new Date();
  const prompt = `คุณเป็นโหราจารย์ผู้อ่านตำแหน่งดาวนพเคราะห์ตามหลักโหราศาสตร์ไทย

วันนี้: ${now.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}

ตำแหน่งดาวนพเคราะห์ที่คำนวณได้:
${planetList}

ดาวร่วมราศี (Conjunction): ${conjs||'ไม่มี'}
ดาวอัปมงคล: ${malList||'ไม่มี'}
ดาวมงคล: ${benList||'ไม่มี'}
ดาวถอยหลัง: ${retroList||'ไม่มี'}

กฎเหล็ก:
- อ่านผลตรงจากตำแหน่งดาวที่ให้เท่านั้น ห้ามอนุมานนอกข้อมูล
- ห้ามใช้ประโยคกำกวม เช่น "ขึ้นอยู่กับการกระทำของคุณ" "มีโอกาสดีหากพยายาม"
- ห้ามแนะนำพิธีกรรม การสวมอัญมณี หรือสิ่งที่ไม่ได้มาจากตำแหน่งดาว
- ระบุราศีและเหตุผลจากหลักโหราศาสตร์เสมอ เช่น "พฤหัสบดีอยู่ราศีเมษ — ตำราระบุว่า..."

วิเคราะห์ (ภาษาไทย ไม่เกิน 5 ประโยค):
1. ผลของตำแหน่งดาวแต่ละดวงวันนี้ตามหลักโหราศาสตร์ไทย — ระบุราศีและความหมาย
2. ผลของ conjunction และดาวถอยหลังต่อพลังงานรวม
3. ด้านใดได้รับอิทธิพลชัดเจนที่สุดจากดาวที่คำนวณได้`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    const _txt = data.text || 'ไม่สามารถวิเคราะห์ได้';
    window._planetAiCache[cacheKey] = _txt;
    bodyEl.className = 'ai-body';
    bodyEl.textContent = _txt;
  } catch(e) {
    bodyEl.className = 'ai-body';
    bodyEl.textContent = '⚠ ' + e.message;
  }
}

// ═══════════════════════════════════════════════
// NOTIFICATION ENGINE
// ═══════════════════════════════════════════════

// State
let calSelectedISO = '';
let calViewYear    = new Date().getFullYear();
let calViewMonth   = new Date().getMonth();
let notifEnabled   = localStorage.getItem('notifEnabled') === 'true';
let soundEnabled   = localStorage.getItem('soundEnabled') === 'true';
let firedKeys      = new Set();   // "yamName:startStr:slotIdx" fired this session
let firedAlertKeys = new Set();   // same but for 5-min-ahead alerts

// ── Sound notification (Web Audio API) ────────
function playBeep(type = 'good') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const configs = {
      good:  [{ f:523, t:0,    d:0.15 }, { f:659, t:0.16, d:0.15 }, { f:784, t:0.32, d:0.3  }], // C E G
      warn:  [{ f:440, t:0,    d:0.2  }, { f:440, t:0.25, d:0.2  }],                              // double beep
      alert: [{ f:880, t:0,    d:0.1  }, { f:660, t:0.12, d:0.1  }, { f:880, t:0.24, d:0.2  }], // 5-min alert
    };
    const notes = configs[type] || configs.good;
    notes.forEach(({ f, t, d }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, ctx.currentTime + t);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d + 0.05);
    });
    // auto-close context after sounds finish
    setTimeout(() => ctx.close(), 1500);
  } catch(e) { /* browser blocked autoplay */ }
}

function updateSoundUI() {
  const btn = document.getElementById('sound-btn');
  if (!btn) return;
  if (soundEnabled) {
    btn.className = 'sound-btn enabled';
    btn.textContent = '🔔 เสียงเปิดอยู่';
  } else {
    btn.className = 'sound-btn';
    btn.textContent = '🔇 เสียง';
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('soundEnabled', soundEnabled ? 'true' : 'false');
  updateSoundUI();
  if (soundEnabled) {
    playBeep('good');
    showToast('good', '🔔', 'เปิดเสียงแจ้งเตือนแล้ว', 'จะมีเสียงเมื่อถึงฤกษ์ธงชัยและอธิบดี');
  } else {
    showToast('info', '🔇', 'ปิดเสียงแจ้งเตือนแล้ว', '');
  }
}

// ── Toast (in-app) ────────────────────────────
function showToast(type, icon, title, sub, duration=7000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-sub">${sub}</div>
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
  c.appendChild(t);
  if (duration > 0) setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease both';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── Browser push notification ─────────────────
function pushNotif(title, body, icon='🔔') {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>', silent: false });
  } catch(e) { /* iframe/sandboxed — skip */ }
}

// ── Bell button UI ────────────────────────────
function updateBellUI() {
  const btn = document.getElementById('notif-btn');
  const warn = document.getElementById('notif-warning');
  if (!btn) return;
  const perm = Notification.permission;
  if (perm === 'denied') {
    btn.className = 'notif-btn denied';
    btn.textContent = '🔕 ถูกบล็อค';
    warn.style.display = 'block';
    return;
  }
  if (notifEnabled && perm === 'granted') {
    btn.className = 'notif-btn enabled';
    btn.textContent = '🔔 แจ้งเตือนเปิดอยู่';
  } else {
    btn.className = 'notif-btn';
    btn.textContent = '🔔 แจ้งเตือนฤกษ์';
  }
  warn.style.display = 'none';
}

async function toggleNotif() {
  if (Notification.permission === 'denied') return;
  if (!notifEnabled) {
    // request permission
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      notifEnabled = true;
      localStorage.setItem('notifEnabled', 'true');
      showToast('good', '🔔', 'เปิดการแจ้งเตือนแล้ว', 'คุณจะได้รับแจ้งเตือนเมื่อเข้าสู่ฤกษ์ธงชัยและอธิบดี');
    } else {
      showToast('bad', '🔕', 'ไม่ได้รับอนุญาต', 'กรุณาอนุญาตการแจ้งเตือนในการตั้งค่าบราวเซอร์');
    }
  } else {
    notifEnabled = false;
    localStorage.setItem('notifEnabled', 'false');
    showToast('info', '🔕', 'ปิดการแจ้งเตือนแล้ว', '');
  }
  updateBellUI();
}

// ── Convert "HH:MM" → minutes since midnight ─
function toMins(str) {
  if (!str) return -1;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

// ── Check yam slots and fire notifications ────
// Called every minute from tick()
function checkYamNotifs() {
  if (!notifEnabled) return;
  if (typeof storedApiYams === 'undefined' || !storedApiYams.length) return;

  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const sec  = now.getSeconds();
  if (sec > 5) return;  // only check in first 5s of each minute

  const NOTIF_TYPES = { good: true, warn: true };  // only ธงชัย + อธิบดี

  for (const period of storedApiYams) {
    if (!NOTIF_TYPES[typeClass(period.type)]) continue;
    const tc    = typeClass(period.type);
    const slots = period.slots || [];

    slots.forEach((slot, si) => {
      const startM = toMins(slot.start);
      const endM   = toMins(slot.end);
      if (startM < 0) return;

      const slotLabel = si === 0 ? '☀ กลางวัน' : '🌙 กลางคืน';
      const fireKey   = `${period.type}:${slot.start}:${si}`;
      const alertKey  = `alert:${period.type}:${slot.start}:${si}`;

      // ── แจ้งเตือนล่วงหน้า 5 นาที ─────────────
      if (!firedAlertKeys.has(alertKey) && mins === startM - 5) {
        firedAlertKeys.add(alertKey);
        const msg = `${period.type} ${slotLabel} เริ่ม ${slot.start} น.`;
        showToast(tc, tc==='good'?'⏰':'⚠️', `อีก 5 นาที — ${period.type}`, msg, 10000);
        pushNotif(`⏰ อีก 5 นาที — ${period.type}`, msg);
        if (soundEnabled) playBeep('alert');
      }

      // ── แจ้งเตือนเมื่อเริ่มฤกษ์ ──────────────
      if (!firedKeys.has(fireKey) && mins === startM) {
        firedKeys.add(fireKey);
        const icons = { good:'✦', warn:'⚠️' };
        const titles = { good:`✦ เริ่มฤกษ์ธงชัย!`, warn:`⚠ เริ่มฤกษ์อธิบดี` };
        const msg = `${slotLabel}  ${slot.start} – ${slot.end} น.`;
        showToast(tc, icons[tc]||'🔔', titles[tc]||period.type, msg, 12000);
        pushNotif(titles[tc]||period.type, msg);
        if (soundEnabled) playBeep(tc === 'good' ? 'good' : 'warn');
      }
    });
  }
}

// Storage for yams from API (set in renderData)
let storedApiYams  = []; // ยามวันนี้จริงๆ (ใช้โดย tick/yam badge)
let storedDisplayYams = []; // ยามของวันที่กำลังดู (ใช้โดย sections ทั้งหมด)
let storedNakshatra = null;
let storedTithi     = null;


// ═══════════════════════════════════════════════
// PERSONAL NATAL ANALYSIS (วิเคราะห์ดวงชะตาส่วนตัว)
// ═══════════════════════════════════════════════

// ── ตารางดาวเจ้าวัน (โหราศาสตร์ไทย) ──
const DAY_PLANET = {
  0:'อาทิตย์',1:'จันทร์',2:'อังคาร',3:'พุธ',4:'พฤหัสบดี',5:'ศุกร์',6:'เสาร์'
};
const DAY_PLANET_SYM = {
  0:'☉',1:'☽',2:'♂',3:'☿',4:'♃',5:'♀',6:'♄'
};
// คุณสมบัติดาวเจ้าวัน
// ธาตุดาวตามโหราศาสตร์ไทย (นพเคราะห์):
// อาทิตย์=ไฟ, จันทร์=น้ำ, อังคาร=ไฟ, พุธ=ดิน, พฤหัสบดี=ลม(อากาศ), ศุกร์=น้ำ, เสาร์=ลม
// อ้างอิง: ตำราโหราศาสตร์ไทย หลักนพเคราะห์
const PLANET_NATURE = {
  'อาทิตย์': { energy:'มหาราช',          trait:'บารมี อำนาจ ความสำเร็จ ความสง่างาม', element:'ไฟ',  color:'แดง/ทอง',   lucky:[0,4] },
  'จันทร์':  { energy:'ราชินี',           trait:'ความรู้สึก สติปัญญา ความสุข ความอ่อนโยน', element:'น้ำ',  color:'ขาว/เงิน',  lucky:[1,5] },
  'อังคาร':  { energy:'นักรบ',            trait:'ความกล้า พลังงาน มุมานะ ความเด็ดขาด', element:'ไฟ',  color:'แดง/ส้ม',   lucky:[2,6] },
  'พุธ':     { energy:'นักปราชญ์',        trait:'สติปัญญา การสื่อสาร การค้า ความคล่องแคล่ว', element:'ดิน', color:'เขียว/เหลือง', lucky:[3,0] },
  'พฤหัสบดี':{ energy:'ครูบาอาจารย์',    trait:'ความเมตตา ปัญญา โชคลาภ ธรรมะ', element:'ลม',  color:'เหลือง/ส้ม', lucky:[4,1] },
  'ศุกร์':   { energy:'เทพแห่งความงาม',  trait:'ความงาม ความรัก ศิลปะ ความสุขสบาย', element:'น้ำ',  color:'ฟ้า/ชมพู',  lucky:[5,2] },
  'เสาร์':   { energy:'ผู้พิพากษา',      trait:'ความอดทน วินัย กรรม ความรับผิดชอบ', element:'ลม',  color:'ดำ/น้ำเงิน', lucky:[6,3] },
};

// ── ราศีเกิด (Sun Sign) จากวัน-เดือน ──
// ── ราศีเกิด (Sidereal — โหราศาสตร์ไทย/เวทย์) ──
// อ้างอิง: ระบบ Lahiri Ayanamsa (~23 วัน ช้ากว่า Tropical)
// ธาตุราศีตามโหราศาสตร์ไทย: ไฟ ดิน ลม น้ำ (วนซ้ำ 3 รอบ)
function getSunSign(month, day) {
  // ขอบเขต Sidereal โดยประมาณ (Lahiri):
  // เมษ 14 เม.ย.–14 พ.ค. | พฤษภ 15 พ.ค.–14 มิ.ย. | มิถุน 15 มิ.ย.–16 ก.ค.
  // กรกฎ 17 ก.ค.–16 ส.ค. | สิงห์ 17 ส.ค.–16 ก.ย. | กันย์ 17 ก.ย.–17 ต.ค.
  // ตุลย์ 18 ต.ค.–16 พ.ย. | พิจิก 17 พ.ย.–15 ธ.ค. | ธนู 16 ธ.ค.–13 ม.ค.
  // มกร 14 ม.ค.–12 ก.พ.  | กุมภ์ 13 ก.พ.–14 มี.ค. | มีน 15 มี.ค.–13 เม.ย.
  const signs = [
    { name:'ธนู',   sym:'♐', start:[12,16], end:[1,13],  trait:'ผจญภัย มองโลกในแง่ดี รักอิสระ หยั่งรู้', element:'ไฟ',  ruler:'พฤหัสบดี' },
    { name:'มกร',   sym:'♑', start:[1,14],  end:[2,12],  trait:'ขยัน มุ่งมั่น ปฏิบัติจริง อดทน',          element:'ดิน', ruler:'เสาร์' },
    { name:'กุมภ์', sym:'♒', start:[2,13],  end:[3,14],  trait:'สร้างสรรค์ อิสระ มีวิสัยทัศน์ มนุษยธรรม', element:'ลม',  ruler:'เสาร์' },
    { name:'มีน',   sym:'♓', start:[3,15],  end:[4,13],  trait:'อ่อนโยน มีสัญชาตญาณ เห็นอกเห็นใจ จิตใจดี', element:'น้ำ', ruler:'พฤหัสบดี' },
    { name:'เมษ',   sym:'♈', start:[4,14],  end:[5,14],  trait:'กล้าหาญ ริเริ่ม มีพลังงาน เป็นผู้นำ',      element:'ไฟ',  ruler:'อังคาร' },
    { name:'พฤษภ',  sym:'♉', start:[5,15],  end:[6,14],  trait:'มั่นคง อดทน รักสวยรักงาม ซื่อสัตย์',       element:'ดิน', ruler:'ศุกร์' },
    { name:'มิถุน', sym:'♊', start:[6,15],  end:[7,16],  trait:'ชาญฉลาด ปรับตัวเก่ง พูดเก่ง กระตือรือร้น', element:'ลม',  ruler:'พุธ' },
    { name:'กรกฎ',  sym:'♋', start:[7,17],  end:[8,16],  trait:'ห่วงใย ซื่อสัตย์ มีสัญชาตญาณ รักครอบครัว', element:'น้ำ', ruler:'จันทร์' },
    { name:'สิงห์', sym:'♌', start:[8,17],  end:[9,16],  trait:'มีความเป็นผู้นำ ใจกว้าง สง่างาม มีเกียรติ', element:'ไฟ',  ruler:'อาทิตย์' },
    { name:'กันย์', sym:'♍', start:[9,17],  end:[10,17], trait:'ละเอียดรอบคอบ ช่างวิเคราะห์ ขยัน มีเหตุผล', element:'ดิน', ruler:'พุธ' },
    { name:'ตุลย์', sym:'♎', start:[10,18], end:[11,16], trait:'ยุติธรรม รักความสวยงาม มีเสน่ห์ สมดุล',    element:'ลม',  ruler:'ศุกร์' },
    { name:'พิจิก', sym:'♏', start:[11,17], end:[12,15], trait:'เข้มแข็ง มีพลัง ลึกซึ้ง มุ่งมั่น',         element:'น้ำ', ruler:'อังคาร' },
  ];
  // ตรวจสอบทีละราศี
  for (const s of signs) {
    const [sm,sd] = s.start, [em,ed] = s.end;
    if (sm <= em) {
      // ราศีปกติ (ไม่ข้ามปี)
      if (month===sm && day>=sd) return s;
      if (month===em && day<=ed) return s;
    } else {
      // ราศีข้ามปี (เช่น ธนู: ธ.ค.–ม.ค.)
      if ((month===sm && day>=sd) || (month===em && day<=ed)) return s;
    }
  }
  return signs[2]; // default มีน
}

// ── ปีนักษัตรและธาตุปี (โหราศาสตร์ไทย) ──
// นักษัตร 12 ปี — ธาตุปีอ้างอิงจากดาวเจ้าปี (นพเคราะห์ไทย)
// ดาวเจ้าปีวนรอบ 7 (อาทิตย์→จันทร์→อังคาร→พุธ→พฤหัส→ศุกร์→เสาร์) ไม่สัมพันธ์กับ 12 นักษัตรตรงๆ
// ธาตุปีนักษัตร = ธาตุของดาวเจ้าปีนั้น (อ้างอิง: ตำราโหราศาสตร์ไทย หลักนพเคราะห์)
// ดาวเจ้าปีวนรอบ 7 ดาว: อาทิตย์ จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์ เสาร์
// ปีนักษัตรไทยเปลี่ยนช่วง "สงกรานต์" (~13 เม.ย.) ไม่ใช่ 1 ม.ค.
// ผู้เกิดก่อน 13 เม.ย. จึงนับเป็นปีนักษัตรของปีก่อนหน้า (effYear = year-1)
// รับ month/day เป็น optional — ถ้าไม่ส่งมาจะใช้ทั้งปี (พฤติกรรมเดิม แบบประมาณ)
function getThaiNaksat(year, month, day) {
  const animals = ['ชวด','ฉลู','ขาล','เถาะ','มะโรง','มะเส็ง',
                   'มะเมีย','มะแม','วอก','ระกา','จอ','กุน'];
  const thaiNames = ['หนู','วัว','เสือ','กระต่าย','มังกร','งู',
                     'ม้า','แพะ','ลิง','ไก่','หมา','หมู'];

  // ปรับปีตามขอบเขตสงกรานต์ (13 เม.ย.)
  let effYear = year;
  if (month != null && day != null && (month < 4 || (month === 4 && day < 13))) {
    effYear = year - 1;
  }

  // ดาวเจ้าปี (วนรอบ 7 ดาวนพเคราะห์) — อ้างอิง: ตำราโหราศาสตร์ไทย
  // เริ่มนับจากปี พ.ศ. 2484 = ดาวอาทิตย์ (ปีขาล)
  const rulers = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const thaiYear = effYear + 543; // แปลงเป็น พ.ศ.
  const rulerIdx = ((thaiYear - 2484) % 7 + 7) % 7;
  const ruler = rulers[rulerIdx];
  // ธาตุปีนักษัตร = ธาตุของดาวเจ้าปี (ตามนพเคราะห์ไทย)
  const rulerElement = (PLANET_NATURE[ruler]||{}).element || 'ไม่ทราบ';
  const idx = ((effYear - 4) % 12 + 12) % 12;
  return {
    animal:   animals[idx],
    thaiName: thaiNames[idx],
    element:  rulerElement,   // ธาตุจากดาวเจ้าปี ไม่ใช่ธาตุจีน
    ruler:    ruler,
    thaiYear: thaiYear,
    year:     effYear
  };
}
// alias เพื่อ backward compat — ส่ง month/day ต่อไปด้วย
function getChineseYear(year, month, day) { return getThaiNaksat(year, month, day); }

// ── ทักษา (โหราศาสตร์ไทย) ──────────────────────
// อ้างอิง: ตำราทักษาปกรณ์ โหราศาสตร์ไทย
// ทักษา 8 ภูมิ วนตามวันเกิดในสัปดาห์ + ลำดับในตำรา
// ภูมิทักษา: บริวาร(1) อายุ(2) เดช(3) ศรี(4) มูละ(5) อุตสาหะ(6) มนตรี(7) กาลกิณี(8)
// ดาวเจ้าวันเกิด → ภูมิทักษา → ความหมาย
// หมายเหตุ: ฟังก์ชัน getLifePath ยังคงไว้เพื่อส่วนเลขศาสตร์ (แยกจากทักษา)
function getLifePath(year, month, day) {
  // เลขศาสตร์ไทย: ใช้เลขรวมวันเกิด+เดือน+ปี ลดเหลือ 1-9
  // (ระบบนี้แสดงใน UI ส่วนเลขศาสตร์ ไม่ใช่ทักษา)
  const digits = `${day}${month}${year}`;
  let sum = digits.split('').reduce((a, d) => a + Number(d), 0);
  while (sum > 9) {
    sum = String(sum).split('').reduce((a, d) => a + Number(d), 0);
  }
  return sum || 9;
}

// ทักษาดาวเจ้าวัน — ภูมิ 8 ตามลำดับวนของแต่ละดาว
// อ้างอิง: ทักษาปกรณ์ โหราศาสตร์ไทย (ดาวเจ้าวัน → ภูมิ 1-8 วนซ้ำ)
const THAXA_PLANET_ORDER = {
  // ลำดับภูมิทักษาของแต่ละดาวเจ้าวัน (วนตามตำรา)
  'อาทิตย์': ['บริวาร','อายุ','เดช','ศรี','มูละ','อุตสาหะ','มนตรี','กาลกิณี'],
  'จันทร์':  ['อายุ','เดช','ศรี','มูละ','อุตสาหะ','มนตรี','กาลกิณี','บริวาร'],
  'อังคาร':  ['เดช','ศรี','มูละ','อุตสาหะ','มนตรี','กาลกิณี','บริวาร','อายุ'],
  'พุธ':     ['ศรี','มูละ','อุตสาหะ','มนตรี','กาลกิณี','บริวาร','อายุ','เดช'],
  'พฤหัสบดี':['มูละ','อุตสาหะ','มนตรี','กาลกิณี','บริวาร','อายุ','เดช','ศรี'],
  'ศุกร์':   ['อุตสาหะ','มนตรี','กาลกิณี','บริวาร','อายุ','เดช','ศรี','มูละ'],
  'เสาร์':   ['มนตรี','กาลกิณี','บริวาร','อายุ','เดช','ศรี','มูละ','อุตสาหะ'],
};
const THAXA_MEANING = {
  'บริวาร':   { quality:'ดี',    note:'บริวารดี มีผู้ช่วยเหลือ เหมาะสั่งการ ริเริ่ม' },
  'อายุ':     { quality:'ดี',    note:'ชีวิตยืนยาว มีพลัง สุขภาพแข็งแรง' },
  'เดช':      { quality:'ดี',    note:'มีอำนาจ บารมี เหมาะกับงานที่ต้องความกล้า' },
  'ศรี':      { quality:'ดี',    note:'โชคดี ร่ำรวย มีโอกาสดี เหมาะลงทุน' },
  'มูละ':     { quality:'กลาง', note:'เป็นพื้นฐาน ไม่ดีไม่ร้าย ระวังรายจ่าย' },
  'อุตสาหะ':  { quality:'ดี',    note:'ขยันหมั่นเพียร ทำงานสำเร็จ เหมาะเริ่มงาน' },
  'มนตรี':   { quality:'ดี',    note:'ได้รับการสนับสนุน มีที่ปรึกษาดี' },
  'กาลกิณี': { quality:'ร้าย',  note:'ฤกษ์ร้าย ควรหลีกเลี่ยงกิจสำคัญ' },
};

// เลขศาสตร์ไทย (ความหมายเลข 1-9 ตามดาวเจ้าเลข)
// อ้างอิง: เลขศาสตร์ไทย อิงนพเคราะห์ (ไม่ใช่ Life Path ตะวันตก)
const LIFE_PATH_MEANING = {
  1: { title:'เลข ๑ — ดาวอาทิตย์', trait:'มีบารมี เป็นผู้นำ มุ่งมั่น ภาคภูมิใจ', planet:'อาทิตย์' },
  2: { title:'เลข ๒ — ดาวจันทร์',  trait:'อ่อนโยน มีความรู้สึกไว อารมณ์ดี รักสงบ', planet:'จันทร์' },
  3: { title:'เลข ๓ — ดาวพฤหัสบดี',trait:'มีปัญญา โชคดี ชอบเรียนรู้ มีธรรมะ', planet:'พฤหัสบดี' },
  4: { title:'เลข ๔ — ดาวราหู',    trait:'มุมานะ อดทน พัฒนาตัวเอง ลึกซึ้ง', planet:'ราหู' },
  5: { title:'เลข ๕ — ดาวพุธ',     trait:'ฉลาด ปรับตัวเก่ง สื่อสารดี กระตือรือร้น', planet:'พุธ' },
  6: { title:'เลข ๖ — ดาวศุกร์',   trait:'มีเสน่ห์ รักสวยรักงาม รักครอบครัว ศิลปะ', planet:'ศุกร์' },
  7: { title:'เลข ๗ — ดาวเกตุ',    trait:'มีสัญชาตญาณ จิตวิญญาณสูง ลึกลับ ชอบโดดเดี่ยว', planet:'เกตุ' },
  8: { title:'เลข ๘ — ดาวเสาร์',   trait:'อดทน มีวินัย ขยัน รับผิดชอบสูง', planet:'เสาร์' },
  9: { title:'เลข ๙ — ดาวอังคาร',  trait:'กล้าหาญ พลังสูง มุ่งมั่น เด็ดขาด', planet:'อังคาร' },
};

// ── คำนวณความสัมพันธ์ดาวเกิด vs ดาวปัจจุบัน ──
function computePlanetCompatibility(birthPlanet, todayPlanets) {
  // ความสัมพันธ์ดาวตามโหราศาสตร์ไทย (มิตร/ศัตรู)
  // อ้างอิง: ตำราจักรราศีและนพเคราะห์ไทย, หลวงวิศาลดรุณกร
  // ใช้ตารางเดียวร่วมกับ transit (TR_FRIENDS/TR_ENEMIES) — แหล่งความจริงเดียว
  // กันข้อมูลสองชุดไม่ตรงกันเวลาแก้ไข
  const friends = TR_FRIENDS[birthPlanet] || [];
  const enemies = TR_ENEMIES[birthPlanet] || [];

  // ความสัมพันธ์ดาวเกิด vs ดาวฟ้าวันนี้ — ใช้หลักมิตร/ศัตรูนพเคราะห์ไทย
  // อ้างอิง: ตำราโหราศาสตร์ไทย หลักนพเคราะห์ มิตรศัตรูดาว
  // ผลลัพธ์: ระดับ (ดี/กลาง/ร้าย) พร้อมรายละเอียดดาวแต่ละดวง
  const factors = [];
  let friendCount = 0, enemyCount = 0;

  for (const p of todayPlanets) {
    if (friends.includes(p.name)) {
      friendCount++;
      const retro = p.retrograde ? ' (ถดถอย — อิทธิพลลดลง)' : '';
      factors.push({ label:`${p.name} ${p.sym}`, val:`ราศี${p.rasi}`, note:`ดาวมิตร — เสริมดาวเกิด${retro}`, type: p.retrograde?'neutral':'good' });
    } else if (enemies.includes(p.name)) {
      if (!p.retrograde) { // ถดถอย = พลังงานลดลง ไม่นับเต็ม
        enemyCount++;
        factors.push({ label:`${p.name} ${p.sym}`, val:`ราศี${p.rasi}`, note:'ดาวศัตรู — กดดันดาวเกิด', type:'bad' });
      } else {
        factors.push({ label:`${p.name} (ถอย)`, val:`ราศี${p.rasi}`, note:'ดาวศัตรูถดถอย — อิทธิพลลดลง', type:'neutral' });
      }
    } else {
      if (p.name === birthPlanet) {
        factors.push({ label:`${p.name} ${p.sym}`, val:`ราศี${p.rasi}`, note:'ดาวเจ้าชะตา — เสริมพิเศษ', type:'good' });
        friendCount++;
      } else if (p.retrograde) {
        factors.push({ label:`${p.name} (ถอย)`, val:`ราศี${p.rasi}`, note:'ดาวถดถอย — กลาง', type:'neutral' });
      }
    }
  }

  // ระดับผล: ดี/กลาง/ร้าย (ไม่ใช้ตัวเลข% ซึ่งไม่มีในตำราไทย)
  const level = friendCount > enemyCount ? 'good' : enemyCount > friendCount ? 'caution' : 'neutral';
  // score สำหรับ backward compat กับส่วนอื่นที่ยังใช้
  const score = level==='good' ? 70 : level==='caution' ? 30 : 50;
  return { score, level, friendCount, enemyCount, factors };
}

// ── คำนวณ Today's Score รวม ──
function computeTodayScore(birthInfo, todayData) {
  let score = 50;
  const reasons = [];

  // 1. ยาม: ใช้ยามวันที่เลือก (storedDisplayYams) และตรวจเวลาเฉพาะวันนี้
  if (typeof storedDisplayYams !== 'undefined' && storedDisplayYams.length) {
    const isViewingToday = (calSelectedISO === todayStr(new Date()));
    if (isViewingToday) {
      const now = new Date();
      const mins = now.getHours()*60 + now.getMinutes();
      for (const p of storedDisplayYams) {
        const cls = typeClass(p.type);
        for (const s of (p.slots||[])) {
          const sm = toMins(s.start), em = toMins(s.end);
          if (sm >= 0 && mins >= sm && mins < em) {
            if (cls==='good')  { score += 20; reasons.push('อยู่ในยามธงชัย ✦ ++'); }
            if (cls==='warn')  { score += 10; reasons.push('อยู่ในยามอธิบดี ⚑ +'); }
            if (cls==='bad')   { score -= 15; reasons.push('อยู่ในยามกาลกิณี ✗ −'); }
          }
        }
      }
    }
  }

  // 2. ฤกษ์ดาว
  if (storedNakshatra) {
    const q = storedNakshatra.quality;
    if (q==='good')    { score += 15; reasons.push(`ฤกษ์${storedNakshatra.name} มหัทธโน ++`); }
    if (q==='neutral') { reasons.push(`ฤกษ์${storedNakshatra.name} มัชฌิมฤกษ์ ±`); }
    if (q==='bad')     { score -= 10; reasons.push(`ฤกษ์${storedNakshatra.name} อธรรมฤกษ์ −`); }
  }

  // 3. ดิถี
  if (storedTithi) {
    const q = storedTithi.quality;
    if (q==='good') { score += 10; reasons.push(`ดิถีมงคล ${storedTithi.label} +`); }
    if (q==='bad')  { score -= 8;  reasons.push(`ดิถีอัปมงคล ${storedTithi.label} −`); }
  }

  // 4. ดาวเกิด vs ดาวปัจจุบัน
  const compat = computePlanetCompatibility(birthInfo.birthPlanet, storedPlanets);
  if (compat.level === 'good')    { score += 10; reasons.push('ดาวเกิดสอดคล้องกับดาวฟ้า ++'); }
  else if (compat.level === 'caution') { score -= 8; reasons.push('ดาวเกิดขัดแย้งกับดาวฟ้า −'); }

  // 5. ทักษาวันนี้ (โหราศาสตร์ไทย) — ดาวเจ้าชะตา vs ภูมิทักษาวันนี้
  // อ้างอิง: ทักษาปกรณ์ โหราศาสตร์ไทย
  const birthPlanetName2 = birthInfo.birthPlanet;
  const todayDow2 = selectedDate().getDay();
  const todayPlanetName2 = DAY_PLANET[todayDow2];
  const thaxaOrder2 = THAXA_PLANET_ORDER[birthPlanetName2] || [];
  const thaxaDawIdx = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'].indexOf(todayPlanetName2);
  const thaxaBhumi2 = thaxaOrder2[thaxaDawIdx] || '';
  const thaxaMeaning2 = THAXA_MEANING[thaxaBhumi2] || {};
  if (thaxaMeaning2.quality === 'ดี') {
    score += 10;
    reasons.push(`ทักษาวันนี้: ${thaxaBhumi2} — ${thaxaMeaning2.note} +`);
  }

  score = Math.max(0, Math.min(100, score));

  let level, levelText;
  if (score >= 80) { level = 'great';   levelText = 'วันมหาศุภมงคล'; }
  else if (score >= 65) { level = 'good'; levelText = 'วันดี'; }
  else if (score >= 45) { level = 'mixed'; levelText = 'วันธรรมดา'; }
  else { level = 'caution'; levelText = 'ระมัดระวัง'; }

  return { score, level, levelText, reasons, planetCompat: compat };
}

// ── Save/Load ข้อมูลเกิดจาก localStorage ──
function saveBirthInfo(info) {
  try { localStorage.setItem('ruekdee_birth', JSON.stringify(info)); } catch(e){}
}
function loadBirthInfo() {
  try { return JSON.parse(localStorage.getItem('ruekdee_birth')||'null'); } catch(e){ return null; }
}

// ── Render Form ──
function renderPersonalForm() {
  const el = document.getElementById('personal-form-area');
  if (!el) return;

  const saved = loadBirthInfo();

  el.innerHTML = `
    <div style="margin-bottom:8px;">
      <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">✦ กรอกวันเดือนปีเกิดเพื่อวิเคราะห์ดวงชะตาเฉพาะบุคคล</div>
      <div class="personal-form">
        <div class="personal-field">
          <label>วันเกิด</label>
          <input type="number" id="pb-day" min="1" max="31" placeholder="วัน" value="${saved?.day||''}" style="width:80px;">
        </div>
        <div class="personal-field">
          <label>เดือนเกิด</label>
          <select id="pb-month" style="width:145px;">
            <option value="">เลือกเดือน</option>
            ${['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'].map((m,i)=>`<option value="${i+1}" ${saved?.month===i+1?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="personal-field">
          <label>ปีเกิด (ค.ศ.)</label>
          <input type="number" id="pb-year" min="1924" max="2026" placeholder="เช่น 1990" value="${saved?.year||''}" style="width:135px;">
        </div>
        <button class="personal-analyze-btn" onclick="runPersonalAnalysis()">✦ วิเคราะห์ดวงชะตา</button>
      </div>
      <div class="personal-save-note">💾 ระบบจะจำข้อมูลของคุณไว้ในอุปกรณ์นี้</div>
    </div>
  `;

  // ถ้ามีข้อมูลเก่า วิเคราะห์ทันที
  if (saved && storedPlanets.length > 0) {
    setTimeout(() => renderPersonalResult(saved), 100);
  }
}

// ── Run Analysis ──
function runPersonalAnalysis() {
  const day   = parseInt(document.getElementById('pb-day')?.value);
  const month = parseInt(document.getElementById('pb-month')?.value);
  const year  = parseInt(document.getElementById('pb-year')?.value);

  if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1924 || year > 2026) {
    showToast('bad','⚠️','ข้อมูลไม่ครบ','กรุณากรอกวัน เดือน ปีเกิดให้ครบถ้วน', 4000);
    return;
  }

  const info = { day, month, year };
  saveBirthInfo(info);
  // เคลียร์ cache ผลวิเคราะห์ AI ส่วนตัวจริง (เดิมเคลียร์ตัวแปรผิดชื่อ personalAiCache
  // ที่ไม่มีอยู่ ทำให้เปลี่ยนวันเกิดแล้วยังเห็นผลเก่า) — cache จริงคือ personalAiCacheMap
  Object.keys(personalAiCacheMap).forEach(k => delete personalAiCacheMap[k]);
  renderPersonalResult(info);
}

// ── Render Result ──
function renderPersonalResult(info) {
  const { day, month, year } = info;
  const el = document.getElementById('personal-result-area');
  if (!el) return;

  // คำนวณค่าต่างๆ
  const birthDate = new Date(year, month-1, day);
  const birthDow  = birthDate.getDay(); // 0=อาทิตย์...6=เสาร์
  const birthPlanet = DAY_PLANET[birthDow];
  const birthPlanetSym = DAY_PLANET_SYM[birthDow];
  const planetNature = PLANET_NATURE[birthPlanet] || {};

  const sunSign   = getSunSign(month, day);
  const chYear    = getChineseYear(year, month, day);
  const lifePath  = getLifePath(year, month, day);
  const lpMeaning = LIFE_PATH_MEANING[lifePath] || LIFE_PATH_MEANING[1];

  const birthInfo = { day, month, year, birthPlanet, lifePath };
  const todayScore = computeTodayScore(birthInfo, storedPlanets);
  const compat = todayScore.planetCompat;

  // ชื่อวันภาษาไทย
  const thDayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

  // สีตาม score level
  const scoreColors = { great:'#7ecb96', good:var_gold2(), mixed:'#d4aa6a', caution:'#e08878' };
  function var_gold2() { return '#e8c97a'; }

  let html = '';

  // ── โปรไฟล์ดาวเกิด ──
  html += `<div class="personal-section-title">โปรไฟล์ดาวเกิด</div>`;
  html += `<div class="chart-grid">
    <div class="chart-item">
      <span class="chart-item-icon">${birthPlanetSym}</span>
      <div class="chart-item-label">ดาวเจ้าชะตา</div>
      <div class="chart-item-val">${birthPlanet}</div>
      <div class="chart-item-sub">วัน${thDayNames[birthDow]}</div>
    </div>
    <div class="chart-item">
      <span class="chart-item-icon">${sunSign.sym}</span>
      <div class="chart-item-label">ราศีเกิด</div>
      <div class="chart-item-val">ราศี${sunSign.name}</div>
      <div class="chart-item-sub">ธาตุ${sunSign.element}</div>
    </div>
    <div class="chart-item">
      <span class="chart-item-icon">🔢</span>
      <div class="chart-item-label">เลขชีวิต</div>
      <div class="chart-item-val">${lifePath}</div>
      <div class="chart-item-sub">${lpMeaning.title}</div>
    </div>
    <div class="chart-item">
      <span class="chart-item-icon">🀄</span>
      <div class="chart-item-label">ปีนักษัตร</div>
      <div class="chart-item-val">${chYear.animal}</div>
      <div class="chart-item-sub">ธาตุ${chYear.element} ดาว${chYear.ruler||''}</div>
    </div>
  </div>`;

  // ── คะแนนวันนี้สำหรับคุณ ──
  html += `<div class="personal-section-title">ดวงวันนี้สำหรับคุณ</div>`;
  html += `<div class="today-score ${todayScore.level}">
    <div class="score-num ${todayScore.level}">${todayScore.score}</div>
    <div class="score-info">
      <div class="score-title">${todayScore.levelText}</div>
      <div class="score-desc">${todayScore.reasons.slice(0,3).join(' · ')}</div>
      <div class="score-bar-wrap">
        <div class="score-bar">
          <div class="score-bar-fill ${todayScore.level}" style="width:${todayScore.score}%"></div>
        </div>
      </div>
    </div>
  </div>`;

  // ── ปัจจัยดาวเกิดกับดาวปัจจุบัน ──
  html += `<div class="personal-section-title">ดาวเกิด ↔ ดาวฟ้าวันนี้</div>`;
  if (compat.factors.length > 0) {
    html += `<table class="factor-table">
      <tr><th>ดาว</th><th>ตำแหน่งวันนี้</th><th>ผลต่อดาว${birthPlanet}ของคุณ</th></tr>`;
    for (const f of compat.factors) {
      const noteColor = f.type==='great'?'#7ecb96':f.type==='good'?'var(--gold3)':f.type==='bad'?'#e08878':'var(--text2)';
      html += `<tr>
        <td class="factor-name">${f.label}</td>
        <td class="factor-val">${f.val}</td>
        <td class="factor-note" style="color:${noteColor}">${f.note}</td>
      </tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p style="color:var(--text2);font-size:20px;">กำลังรอข้อมูลตำแหน่งดาว...</p>`;
  }

  // ── คุณสมบัติดาวเกิด ──
  html += `<div class="personal-section-title">ลักษณะดาว${birthPlanet}</div>`;
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:20px;line-height:2;color:var(--text2);">
    <b style="color:var(--gold3)">พลังงาน:</b> ${planetNature.energy || '—'}<br>
    <b style="color:var(--gold3)">คุณสมบัติ:</b> ${planetNature.trait || '—'}<br>
    <b style="color:var(--gold3)">ธาตุ:</b> ${planetNature.element || '—'}&nbsp;&nbsp;
    <b style="color:var(--gold3)">สีมงคล:</b> ${planetNature.color || '—'}
  </div>`;

  // ── ราศีเกิด ──
  html += `<div class="personal-section-title">ราศี${sunSign.name} ${sunSign.sym}</div>`;
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:20px;line-height:2;color:var(--text2);">
    <b style="color:var(--gold3)">บุคลิกภาพ:</b> ${sunSign.trait}<br>
    <b style="color:var(--gold3)">ธาตุ:</b> ${sunSign.element}
  </div>`;

  // ── เลขชีวิต ──
  html += `<div class="personal-section-title">เลขศาสตร์ ${lifePath} — ${lpMeaning.title}</div>`;
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 16px;font-size:20px;line-height:2;color:var(--text2);">
    ${lpMeaning.trait}<br>
    <b style="color:var(--gold3)">ดาวประจำเลข:</b> ${lpMeaning.planet}
  </div>`;

  // ── ดาวย้ายกระทบชะตาเกิด (Transits) ──
  const RASI_ORDER_CLIENT = ['เมษ','พฤษภ','มิถุน','กรกฎ','สิงห์','กันย์','ตุลย์','พิจิก','ธนู','มกร','กุมภ์','มีน'];
  const birthRasiIdx = RASI_ORDER_CLIENT.indexOf(sunSign.name);
  html += `<div class="personal-section-title">🪐 ดาวย้ายกระทบชะตาเกิด</div>`;
  html += `<div id="transit-panel"><div class="tr-loading">⟳ กำลังคำนวณดาวย้าย...</div></div>`;

  // ── AI วิเคราะห์เฉพาะบุคคล ──
  if (aiAvailable) {
    html += `<div class="personal-section-title">วิเคราะห์เชิงลึกด้วย AI</div>`;
    html += `<div class="ai-box" id="personal-ai-box">
      <div class="ai-box-header">
        ✦ CLAUDE · AI ASTROLOGER
        <button class="ai-reload" onclick="analyzePersonalAI(true)">↻ วิเคราะห์ใหม่</button>
      </div>
      <div class="ai-body loading" id="personal-ai-body">กำลังวิเคราะห์...</div>
    </div>`;
  }

  el.innerHTML = html;

  // Trigger transit fetch
  fetchAndRenderTransits(calSelectedISO || todayStr(new Date()), birthRasiIdx, birthPlanet, sunSign, currentCalendar);

  // Trigger AI analysis
  if (aiAvailable) {
    analyzePersonalAI(false, { day, month, year, birthPlanet, sunSign, lifePath, lpMeaning, chYear, todayScore });
  }
}

// ═══════════════════════════════════════════════
// TRANSIT FETCH + RENDER
// ═══════════════════════════════════════════════

/**
 * ตารางมิตร-ศัตรูดาวสำหรับ transit evaluation (client-side)
 * อ้างอิง: ตำราโหราศาสตร์ไทย หลักนพเคราะห์ มิตรศัตรูดาว
 */
const TR_FRIENDS = {
  'อาทิตย์':  ['จันทร์','อังคาร','พฤหัสบดี'],
  'จันทร์':   ['อาทิตย์','พุธ','พฤหัสบดี'],
  'อังคาร':   ['อาทิตย์','จันทร์','พฤหัสบดี'],
  'พุธ':      ['ศุกร์','เสาร์'],
  'พฤหัสบดี': ['อาทิตย์','จันทร์','อังคาร'],
  'ศุกร์':    ['พุธ','เสาร์'],
  'เสาร์':    ['พุธ','ศุกร์'],
};
const TR_ENEMIES = {
  'อาทิตย์':  ['เสาร์','ราหู','เกตุ'],
  'จันทร์':   ['เสาร์','ราหู','เกตุ'],
  'อังคาร':   ['พุธ','ศุกร์','เสาร์'],
  'พุธ':      ['อาทิตย์','จันทร์','อังคาร'],
  'พฤหัสบดี': ['พุธ','ศุกร์','เสาร์'],
  'ศุกร์':    ['อาทิตย์','จันทร์','อังคาร'],
  'เสาร์':    ['อาทิตย์','จันทร์','อังคาร','พฤหัสบดี'],
};
const TR_MALEFIC = new Set(['เสาร์','ราหู','อังคาร','เกตุ']);
const TR_BENEFIC = new Set(['พฤหัสบดี','ศุกร์','จันทร์','อาทิตย์']);

const TR_ASPECT_INFO = {
  'Trine':       { icon:'△', label:'ตรีโกณ 120°',     quality:'good'  },
  'Sextile':     { icon:'✶', label:'หกเหลี่ยม 60°',   quality:'good'  },
  'Conjunction': { icon:'☌', label:'ร่วมราศี 0°',      quality:'mixed' },
  'Opposition':  { icon:'☍', label:'ตรงข้าม 180°',    quality:'warn'  },
  'Square':      { icon:'□', label:'สี่เหลี่ยม 90°',  quality:'bad'   },
};

function evalTransitCard(t, birthPlanetName, birthRuler) {
  // t = transit object จาก /api/transits
  const isMal    = TR_MALEFIC.has(t.planet);
  const isBen    = TR_BENEFIC.has(t.planet);
  const isFriend = (TR_FRIENDS[birthPlanetName]||[]).includes(t.planet);
  const isEnemy  = (TR_ENEMIES[birthPlanetName]||[]).includes(t.planet);
  const isRuler  = t.planet === birthRuler;
  const isBirthP = t.planet === birthPlanetName;
  const retro    = t.retrogradeNow;

  // หา best aspect (เรียงตาม power และ quality)
  const bestAsp = t.aspectEvents[0]; // เรียงตาม date แล้ว — ใช้ที่ใกล้สุด
  const aspInfo = bestAsp ? (TR_ASPECT_INFO[bestAsp.aspect] || {}) : null;

  let level = 'good';
  let desc  = '';

  if (isBirthP) {
    level = retro ? 'warn' : 'great';
    desc  = `ดาวเจ้าชะตา${t.planet}เองอยู่ในราศีเกิดของคุณ — พลังดาวเจ้าชะตาทำงานโดยตรง${retro?' (ถดถอย: พลังงานหันเข้าภายใน)':''}`;
  } else if (isRuler) {
    level = retro ? 'warn' : 'great';
    desc  = `${t.planet}ดาวเจ้าราศีเกิด${retro?' (ถอยหลัง)':''} กลับมาอยู่ในราศีเกิดของคุณ — เสริมพลังราศีโดยตรง`;
  } else if (isFriend && isBen && !retro) {
    level = 'great';
    desc  = `${t.planet}ดาวมงคลและมิตรของ${birthPlanetName}อยู่ในราศีเกิด — เสริมพลังงานดาวเกิดอย่างแรง`;
  } else if (isFriend && !retro) {
    level = 'good';
    desc  = `${t.planet}มิตรดาวของ${birthPlanetName}อยู่ในราศีเกิด — ส่งเสริมกัน`;
  } else if (isEnemy && isMal && !retro) {
    level = 'bad';
    desc  = `${t.planet}ดาวอัปมงคลและศัตรูของ${birthPlanetName}อยู่ในราศีเกิด — กดดันและสร้างแรงเสียดทานสูง`;
  } else if (isEnemy && !retro) {
    level = 'warn';
    desc  = `${t.planet}ศัตรูดาวของ${birthPlanetName}อยู่ในราศีเกิด — ต้องระวัง`;
  } else if (isMal && !retro) {
    level = 'warn';
    desc  = `${t.planet}ดาวอัปมงคลย้ายเข้าราศีเกิด — สร้างแรงกดดัน`;
  } else if (isBen) {
    level = retro ? 'good' : 'good';
    desc  = `${t.planet}ดาวมงคลอยู่ในราศีเกิด${retro?' (ถดถอย)':''} — บรรยากาศดี`;
  } else {
    level = 'good';
    desc  = `${t.planet}อยู่ในราศีเกิด — ผลกระทบขึ้นกับ aspect ที่เกิดขึ้น`;
  }

  return { level, desc, isBirthP, isRuler, isFriend, isEnemy, isMal, isBen };
}

function durationLabel(ingressDate, egressDate) {
  if (!ingressDate || !egressDate) return null;
  const a = new Date(ingressDate.isoDate);
  const b = new Date(egressDate.isoDate);
  const days = Math.round((b - a) / 86400000);
  if (days < 0) return null;
  if (days < 60)  return `${days} วัน`;
  if (days < 365) return `~${Math.round(days/30)} เดือน`;
  return `~${(days/365).toFixed(1)} ปี`;
}

const transitCache = {}; // key = `${date}:${rasi}:${calendar}`

async function fetchAndRenderTransits(dateStr, rasiIdx, birthPlanetName, sunSign, calendar) {
  const panel = document.getElementById('transit-panel');
  if (!panel || rasiIdx < 0) {
    if (panel) panel.innerHTML = '<p style="color:var(--text2);font-size:20px;">ไม่พบราศีเกิด</p>';
    return;
  }

  const cacheKey = `${dateStr}:${rasiIdx}:${calendar}`;
  if (transitCache[cacheKey]) {
    panel.innerHTML = renderTransitPanel(transitCache[cacheKey], birthPlanetName, sunSign, dateStr);
    return;
  }

  panel.innerHTML = '<div class="tr-loading">⟳ กำลังคำนวณตำแหน่งดาวย้าย...</div>';

  try {
    const resp = await fetch(`api/transits?date=${dateStr}&rasi=${rasiIdx}&calendar=${encodeURIComponent(calendar)}`);
    if (!resp.ok) throw new Error(`Server ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    transitCache[cacheKey] = data;
    panel.innerHTML = renderTransitPanel(data, birthPlanetName, sunSign, dateStr);
  } catch(e) {
    panel.innerHTML = `<p style="color:var(--danger);font-size:20px;">⚠ คำนวณดาวย้ายไม่ได้: ${e.message}</p>`;
  }
}

function renderTransitPanel(data, birthPlanetName, sunSign, selectedISO) {
  const birthRuler = sunSign.ruler || '';
  const transits   = data.transits || [];
  const todayISO   = selectedISO || todayStr(new Date());
  const RASI_ORDER_C = ['เมษ','พฤษภ','มิถุน','กรกฎ','สิงห์','กันย์','ตุลย์','พิจิก','ธนู','มกร','กุมภ์','มีน'];
  const RASI_SYM_C   = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
  const birthRasiName = RASI_ORDER_C[data.rasi] || '?';
  const birthRasiSym  = RASI_SYM_C[data.rasi]  || '';

  // ฟังก์ชันเช็คว่าดาวย้าย/มุมดาว กระทบวันนี้หรือไม่
  function daysFromSelected(isoDate) {
    if (!isoDate) return 9999;
    return Math.round((new Date(isoDate) - new Date(todayISO)) / 86400000);
  }
  function isoToday(isoDate) { return isoDate === todayISO; }

  // ดาวที่อยู่ในราศีเกิด = currentRasi === data.rasi
  const inRasi = transits.filter(t => t.currentRasi === data.rasi);
  // ดาวที่มี aspect events ข้างหน้า
  const withAspects = transits.filter(t => t.currentRasi !== data.rasi && t.aspectEvents.length > 0);

  if (inRasi.length === 0 && withAspects.length === 0) {
    return `<p style="color:var(--text2);font-size:20px;padding:8px 0;">
      ขณะนี้ไม่มีดาวอยู่ในราศี${birthRasiName}${birthRasiSym} และยังไม่มีมุมดาวใหม่ใน 180 วันข้างหน้า
    </p>`;
  }

  // นับสถิติ + เช็คกระทบวันนี้
  let cntGreat=0, cntWarn=0, cntBad=0, activeToday=[];
  [...inRasi, ...withAspects].forEach(t => {
    const ev = evalTransitCard(t, birthPlanetName, birthRuler);
    if (ev.level==='great'||ev.level==='good') cntGreat++;
    else if (ev.level==='warn') cntWarn++;
    else cntBad++;
  });

  // เช็คกระทบวันนี้: ดาวในราศีเกิดถือว่ากระทบทุกวัน
  inRasi.forEach(t => {
    const ev = evalTransitCard(t, birthPlanetName, birthRuler);
    activeToday.push({ planet: t.planet, sym: t.sym, level: ev.level, note: 'อยู่ในราศีเกิด' });
  });
  // มุมดาวที่ exact วันนี้หรือใน ±3 วัน
  withAspects.forEach(t => {
    const asp0 = t.aspectEvents[0];
    if (!asp0) return;
    const d = daysFromSelected(asp0.exactDate?.isoDate);
    if (Math.abs(d) <= 3) {
      const ai = TR_ASPECT_INFO[asp0.aspect] || { icon:'◈', label:asp0.aspect };
      const note = d === 0 ? `${ai.icon} ${ai.label} — แน่นอนวันนี้` :
                   d > 0  ? `${ai.icon} ${ai.label} — อีก ${d} วัน` :
                             `${ai.icon} ${ai.label} — ผ่านไป ${-d} วัน`;
      activeToday.push({ planet: t.planet, sym: t.sym, level: d === 0 ? 'bad' : 'warn', note });
    }
  });

  let html = '';

  // ── Banner: ดาวย้ายกระทบวันนี้ ──
  if (activeToday.length > 0) {
    const bannerLvl = activeToday.some(x=>x.level==='bad'||x.level==='warn') ? 'warn' : 'good';
    const bgCol = bannerLvl==='warn' ? 'rgba(184,138,64,0.10)' : 'rgba(90,158,112,0.10)';
    const brCol = bannerLvl==='warn' ? 'rgba(184,138,64,0.40)' : 'rgba(90,158,112,0.35)';
    html += `<div style="background:${bgCol};border:1px solid ${brCol};border-radius:12px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-size:19px;color:var(--gold);margin-bottom:8px;">🔔 ดาวย้ายที่กระทบวันนี้</div>
      ${activeToday.map(x => {
        const dotCol = x.level==='bad'?'#e08878':x.level==='warn'?'#d4aa6a':'#7ecb96';
        return `<div style="font-size:20px;color:var(--text);display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="color:${dotCol}">${x.sym}</span>
          <b style="color:var(--text)">${x.planet}</b>
          <span style="color:var(--text2)">${x.note}</span>
        </div>`;
      }).join('')}
    </div>`;
  } else {
    html += `<div style="background:rgba(90,158,112,0.06);border:1px solid rgba(90,158,112,0.2);border-radius:12px;padding:10px 16px;margin-bottom:14px;font-size:20px;color:var(--text2);">
      ✓ ไม่มีดาวย้ายหรือมุมดาวที่กระทบโดยตรงในวันนี้ (ออร์บ ±3 วัน)
    </div>`;
  }

  // ── Summary ──
  html += `<div class="tr-summary-box">
    <div class="tr-summary-title">🪐 ดาวย้ายกระทบราศี${birthRasiName}${birthRasiSym} (ราศีเกิดของคุณ)</div>
    <div class="tr-summary-grid">
      <div class="tr-summary-stat">
        <div class="tr-summary-num great">${cntGreat}</div>
        <div class="tr-summary-lbl">ส่งเสริม</div>
      </div>
      <div class="tr-summary-stat">
        <div class="tr-summary-num warn">${cntWarn}</div>
        <div class="tr-summary-lbl">ระวัง</div>
      </div>
      <div class="tr-summary-stat">
        <div class="tr-summary-num bad">${cntBad}</div>
        <div class="tr-summary-lbl">กดดัน</div>
      </div>
      <div class="tr-summary-stat">
        <div class="tr-summary-num ${activeToday.length > 0 ? 'warn' : 'great'}">${activeToday.length}</div>
        <div class="tr-summary-lbl">กระทบวันนี้</div>
      </div>
    </div>
  </div>`;

  // ── ดาวที่อยู่ในราศีเกิดตอนนี้ ──
  if (inRasi.length > 0) {
    html += `<div style="font-size:19px;letter-spacing:1px;color:var(--gold);margin:10px 0 8px;">
      ✦ ดาวที่อยู่ในราศี${birthRasiName}ขณะนี้ (กระทบอยู่)</div>`;
    html += `<div class="transit-list">`;

    for (const t of inRasi) {
      const ev = evalTransitCard(t, birthPlanetName, birthRuler);
      const cls = `tr-${ev.level}`;
      const retBadge = t.retrogradeNow ? `<span class="tr-asp-retro">℞ ถอยหลัง</span>` : '';
      const specialTag = ev.isBirthP ? `<span style="font-size:17px;padding:2px 7px;border-radius:999px;background:rgba(201,168,76,0.2);color:var(--gold3);margin-left:6px;">ดาวเจ้าชะตา</span>` :
                         ev.isRuler  ? `<span style="font-size:17px;padding:2px 7px;border-radius:999px;background:rgba(90,158,112,0.2);color:#7ecb96;margin-left:6px;">เจ้าราศีเกิด</span>` : '';

      const labelMap = { great:'✦ ส่งเสริมสูงสุด', good:'✦ ส่งเสริม', warn:'◈ ระวัง', bad:'⚠ กดดัน' };

      // Ingress / Egress / Duration
      const ing = t.ingressDate;
      const egr = t.egressDate;
      const dur = durationLabel(ing, egr);

      // Aspect events ที่ใกล้ที่สุด (ในอนาคต max 5)
      const futureAsp = (t.aspectEvents || []).slice(0, 5);

      html += `<div class="transit-card ${cls}">
        <div class="tr-top">
          <div class="tr-sym">${t.sym}</div>
          <div class="tr-meta">
            <div class="tr-name">${t.planet}${retBadge}${specialTag}</div>
            <div class="tr-rasi">อยู่ในราศี${birthRasiName}${birthRasiSym} — กระทบอยู่วันนี้</div>
          </div>
          <span class="tr-badge">${labelMap[ev.level]||''}</span>
        </div>`;

      // Timeline: ingress → egress (พร้อมเวลา)
      if (ing || egr || dur) {
        html += `<div class="tr-timeline">`;
        if (ing) html += `<div class="tr-date-pill ingress">
          <span class="tr-date-label">▶ เข้าราศี</span>
          <span class="tr-date-val">${ing.dateStr}${ing.timeStr ? ` · ${ing.timeStr}` : ''}</span>
        </div>`;
        if (egr) html += `<div class="tr-date-pill egress">
          <span class="tr-date-label">◀ ออกราศี</span>
          <span class="tr-date-val">${egr.dateStr}${egr.timeStr ? ` · ${egr.timeStr}` : ''}</span>
        </div>`;
        if (dur) html += `<div class="tr-date-pill duration">
          <span class="tr-date-label">⏱ ระยะเวลา</span>
          <span class="tr-date-val">${dur}</span>
        </div>`;
        html += `</div>`;
      }

      // มุมดาวสำคัญที่จะเกิดขึ้น
      if (futureAsp.length > 0) {
        html += `<div style="font-size:18px;color:var(--text2);margin:6px 0 4px;letter-spacing:.5px;">มุมดาวสำคัญที่จะเกิดขึ้น:</div>`;
        html += `<div class="tr-aspects">`;
        for (const asp of futureAsp) {
          const ai = TR_ASPECT_INFO[asp.aspect] || { icon:'◈', label:asp.aspect, quality:'warn' };
          const retNote = asp.retrograde ? `<span class="tr-asp-retro">℞</span>` : '';
          const aspCls  = ai.quality==='good'?'rgba(90,158,112,0.08)':ai.quality==='bad'?'rgba(192,96,80,0.08)':'rgba(184,138,64,0.08)';
          const dAsp = daysFromSelected(asp.exactDate?.isoDate);
          const todayMark = isoToday(asp.exactDate?.isoDate) ? `<span style="font-size:16px;padding:1px 6px;border-radius:999px;background:rgba(192,96,80,0.25);color:#e08878;margin-left:4px;">วันนี้</span>` : '';
          const timeNote = asp.exactDate?.timeStr ? ` · ${asp.exactDate.timeStr}` : '';
          html += `<div class="tr-asp-row" style="background:${aspCls}">
            <span class="tr-asp-icon">${ai.icon}</span>
            <span class="tr-asp-name">${ai.label}${retNote}${todayMark}</span>
            <span class="tr-asp-date">${asp.exactDate.dateStr}${timeNote}</span>
          </div>`;
        }
        html += `</div>`;
      }

      html += `<div class="tr-desc">${ev.desc}</div>`;
      html += `<div class="tr-ref">📚 ตำแหน่งดาว: Jean Meeus, Astronomical Algorithms · มิตร-ศัตรูดาว: ตำราโหราศาสตร์ไทย นพเคราะห์ · มุมดาว: Ptolemy Tetrabiblos</div>`;
      html += `</div>`;
    }
    html += `</div>`;
  }

  // ── มุมดาวจากดาวนอกราศี (ข้างหน้า) ──
  if (withAspects.length > 0) {
    html += `<div style="font-size:19px;letter-spacing:1px;color:var(--gold);margin:16px 0 8px;">
      ⟳ มุมดาวที่จะเกิดขึ้นใน 180 วันข้างหน้า</div>`;
    html += `<div class="transit-list">`;

    // เรียงตาม exact date ของ aspect แรก
    const sorted = [...withAspects].sort((a, b) => {
      const da = a.aspectEvents[0]?.exactDate?.jd || 999999;
      const db = b.aspectEvents[0]?.exactDate?.jd || 999999;
      return da - db;
    });

    for (const t of sorted) {
      const asp0 = t.aspectEvents[0];
      if (!asp0) continue;
      const ai  = TR_ASPECT_INFO[asp0.aspect] || { icon:'◈', label:asp0.aspect, quality:'warn' };
      const isMal = TR_MALEFIC.has(t.planet);
      const isBen = TR_BENEFIC.has(t.planet);
      const retBadge = asp0.retrograde ? `<span class="tr-asp-retro"> ℞ ถอยหลัง</span>` : '';

      // level จาก aspect + nature ดาว
      let aspLevel = ai.quality;
      if (isMal && (asp0.aspect==='Square'||asp0.aspect==='Opposition')) aspLevel = 'bad';
      else if (isBen && (asp0.aspect==='Trine'||asp0.aspect==='Sextile')) aspLevel = 'great';
      else if (isMal && (asp0.aspect==='Trine'||asp0.aspect==='Sextile')) aspLevel = 'warn';
      const cls = `tr-${aspLevel}`;
      const labelMap2 = { great:'✦ ส่งเสริม', good:'✦ เอื้อ', warn:'◈ ระวัง', bad:'⚠ กดดัน', mixed:'◈ ผสม' };

      // เช็คกระทบวันนี้
      const dFromToday = daysFromSelected(asp0.exactDate?.isoDate);
      const isNearToday = Math.abs(dFromToday) <= 3;
      const nearBadge = isoToday(asp0.exactDate?.isoDate)
        ? `<span style="font-size:16px;padding:2px 8px;border-radius:999px;background:rgba(192,96,80,0.3);color:#e08878;margin-left:6px;">⚡ แน่นอนวันนี้</span>`
        : isNearToday
          ? `<span style="font-size:16px;padding:2px 8px;border-radius:999px;background:rgba(184,138,64,0.25);color:#d4aa6a;margin-left:6px;">${dFromToday>0?`อีก ${dFromToday} วัน`:`ผ่านไป ${-dFromToday} วัน`}</span>`
          : '';

      const timeNote = asp0.exactDate?.timeStr ? ` · ${asp0.exactDate.timeStr}` : '';

      html += `<div class="transit-card ${cls}">
        <div class="tr-top">
          <div class="tr-sym">${t.sym}</div>
          <div class="tr-meta">
            <div class="tr-name">${t.planet}${retBadge}${nearBadge}</div>
            <div class="tr-rasi">${ai.icon} ${ai.label} กับราศี${birthRasiName}${birthRasiSym}</div>
          </div>
          <span class="tr-badge">${labelMap2[aspLevel]||''}</span>
        </div>
        <div class="tr-timeline">
          <div class="tr-date-pill exact">
            <span class="tr-date-label">📅 วันที่แน่นอน</span>
            <span class="tr-date-val">${asp0.exactDate.dateStr}${timeNote}</span>
          </div>
          ${t.aspectEvents.length > 1 ? `<div class="tr-date-pill" style="border-color:rgba(255,255,255,0.08)">
            <span class="tr-date-label">ครั้งถัดไป</span>
            <span class="tr-date-val">${t.aspectEvents[1]?.exactDate?.dateStr||'—'}${t.aspectEvents[1]?.exactDate?.timeStr ? ` · ${t.aspectEvents[1].exactDate.timeStr}` : ''}</span>
          </div>` : ''}
        </div>
        <div class="tr-ref">📚 Jean Meeus, Astronomical Algorithms · Ptolemy Tetrabiblos · ตำราโหราศาสตร์ไทย</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div class="tr-source">
    แหล่งอ้างอิง: Jean Meeus "Astronomical Algorithms" ฉบับที่ 2 (การคำนวณตำแหน่งดาว, หาวันแน่นอนด้วย bisection) ·
    Lahiri Ayanamsa (ระบบสิเดอเรียล) · Ptolemy Tetrabiblos เล่ม 1 (มุมดาว) ·
    ตำราโหราศาสตร์ไทย หลักนพเคราะห์ (มิตร-ศัตรูดาว) — คำนวณทั้งหมดโดยเซิร์ฟเวอร์ ไม่ใช่การดึงข้อมูลจากภายนอก
  </div>`;

  return html;
}

// ── AI วิเคราะห์เฉพาะบุคคล ──
const personalAiCacheMap = {}; // key = calSelectedISO

async function analyzePersonalAI(forceRefresh=false, dataOverride=null) {
  const bodyEl = document.getElementById('personal-ai-body');
  if (!bodyEl) return;

  const _pCacheKey = calSelectedISO || 'today';
  if (!forceRefresh && personalAiCacheMap[_pCacheKey]) {
    bodyEl.textContent = personalAiCacheMap[_pCacheKey];
    bodyEl.classList.remove('loading');
    return;
  }

  bodyEl.classList.add('loading');
  bodyEl.textContent = 'กำลังวิเคราะห์ดวงชะตาเฉพาะบุคคล...';

  const saved = loadBirthInfo();
  if (!saved) { bodyEl.textContent = 'ไม่พบข้อมูลวันเกิด'; return; }

  const { day, month, year } = saved;
  const birthDate = new Date(year, month-1, day);
  const birthDow  = birthDate.getDay();
  const birthPlanet = DAY_PLANET[birthDow];
  const sunSign   = getSunSign(month, day);
  const lifePath  = getLifePath(year, month, day);
  const lpMeaning = LIFE_PATH_MEANING[lifePath] || {};
  const chYear    = getChineseYear(year, month, day);
  const thDayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const thMonths = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  const selectedD = selectedDate();
  const todayStr2 = selectedD.toLocaleDateString('th-TH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // สร้าง planet summary จาก storedPlanets
  const planetSummary = storedPlanets.map(p=>`${p.name}${p.sym} อยู่${p.rasi}${p.retrograde?' (ถดถอย)':''}`).join(', ');
  const nakStr = storedNakshatra ? `ฤกษ์${storedNakshatra.name}(${storedNakshatra.num}) ${storedNakshatra.quality==='good'?'มงคล':storedNakshatra.quality==='bad'?'ร้าย':'กลาง'}` : '';
  const tithiStr = storedTithi ? `ดิถี${storedTithi.label} ${storedTithi.quality==='good'?'มงคล':storedTithi.quality==='bad'?'อัปมงคล':'ปกติ'}` : '';

  const prompt = `คุณเป็นโหราจารย์ผู้เชี่ยวชาญโหราศาสตร์ไทย อ้างอิงระบบนพเคราะห์และสิเดอเรียล

ข้อมูลผู้ถาม: เกิดวันที่ ${day} ${thMonths[month]} ค.ศ.${year}
- ดาวเจ้าชะตา: ${birthPlanet} (เกิดวัน${thDayNames[birthDow]})
- ราศีเกิด (สิเดอเรียล): ราศี${sunSign.name} ${sunSign.sym} ดาวเจ้าราศี${sunSign.ruler||''} ธาตุ${sunSign.element} — ${sunSign.trait}
- เลขศาสตร์ไทย: ${lifePath} — ${lpMeaning.title} — ${lpMeaning.trait}
- ปีนักษัตร: ปี${chYear.animal}(${chYear.thaiName||''}) ธาตุ${chYear.element} ดาวเจ้าปี${chYear.ruler||''}

ดวงดาวฟ้าวันนี้ (${todayStr2}):
- ตำแหน่งดาวนพเคราะห์: ${planetSummary}
${nakStr ? `- ${nakStr}` : ''}
${tithiStr ? `- ${tithiStr}` : ''}

กฎเหล็ก:
- อ่านผลตรงจากข้อมูลที่ให้เท่านั้น ห้ามอนุมานนอกข้อมูล
- ห้ามใช้ประโยคกำกวม เช่น "ขึ้นอยู่กับความพยายาม" "มีศักยภาพสูงหากใช้อย่างถูกวิธี"
- ห้ามแนะนำพิธีกรรม การสวมอัญมณี หรือสิ่งที่ไม่ได้อ้างอิงจากตำรา
- ระบุที่มาของการทำนายทุกข้อ เช่น "ดาวเจ้าชะตา${birthPlanet} ตำราระบุว่า..."

วิเคราะห์เฉพาะบุคคล (ภาษาไทย ไม่เกิน 250 คำ):
1. ดาวเจ้าชะตา${birthPlanet}กับตำแหน่งดาวฟ้าวันนี้ — ส่งเสริมหรือขัดแย้งตามหลักมิตร/ศัตรูดาว
2. ผลของนักษัตรและดิถีวันนี้ต่อดาวเจ้าชะตา — ระบุจากค่าที่คำนวณได้
3. ผลของราศี${sunSign.name}และเลขชีวิต${lifePath}ต่อวันนี้ — อ้างอิงจากตำราโหราศาสตร์`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt }),
    });
    const data = await resp.json();
    const text = data.text || 'ไม่สามารถวิเคราะห์ได้ในขณะนี้';
    personalAiCacheMap[_pCacheKey] = text;
    bodyEl.classList.remove('loading');
    bodyEl.textContent = text;
  } catch(e) {
    bodyEl.classList.remove('loading');
    bodyEl.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
  }
}

// ═══════════════════════════════════════════════
// สถิติสลากกินแบ่งรัฐบาล
// ═══════════════════════════════════════════════
let _lottoStatsCache = null;

async function loadLottoStats(forceRefresh) {
  const bodyEl = document.getElementById('lotto-stats-body');
  const reloadBtn = document.getElementById('lotto-reload-btn');
  if (!bodyEl) return;

  if (!forceRefresh && _lottoStatsCache) {
    renderLottoStats(_lottoStatsCache);
    return;
  }

  // ── แสดง Progress UI ──
  bodyEl.innerHTML = `
    <div id="lotto-progress-wrap" style="padding:20px 0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div class="spinner"></div>
        <div id="lotto-progress-msg" style="font-size:21px;color:var(--gold2);">กำลังเชื่อมต่อ...</div>
      </div>
      <div style="background:var(--bg3);border-radius:999px;height:8px;overflow:hidden;margin-bottom:8px;">
        <div id="lotto-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:999px;transition:width 0.4s ease;"></div>
      </div>
      <div id="lotto-progress-log" style="font-size:18px;color:var(--text2);line-height:1.9;max-height:120px;overflow-y:auto;"></div>
    </div>`;
  if (reloadBtn) reloadBtn.disabled = true;

  const msgEl = document.getElementById('lotto-progress-msg');
  const barEl = document.getElementById('lotto-progress-bar');
  const logEl = document.getElementById('lotto-progress-log');

  function updateProgress(pct, msg) {
    if (barEl) barEl.style.width = pct + '%';
    if (msgEl) msgEl.textContent = msg;
    if (logEl) {
      const line = document.createElement('div');
      line.textContent = msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  try {
    // ?refresh=1 → ดึงงวดใหม่จาก API | ไม่มี param → ใช้ข้อมูลใน DB ทันที
    const refreshParam = forceRefresh ? '?refresh=1' : '';

    const resp = await fetch(`api/lottery-stats${refreshParam}`, {
      headers: { 'Accept': 'text/event-stream' }
    });

    if (!resp.ok) throw new Error(`Server ตอบ ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // currentEvent/currentData ต้องอยู่ "นอก" loop เพื่อให้ยังจำค่าไว้ได้
    // ถ้า event หนึ่งตัวถูกเครือข่ายแบ่งส่งมาคนละ chunk กัน (พบบ่อยกับ event สุดท้าย
    // ก่อน res.end()) — ถ้าประกาศไว้ข้างในจะโดนรีเซ็ตทุก chunk ทำให้ event หายไปเงียบ ๆ
    let currentEvent = '';
    let currentData  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // เก็บบรรทัดที่ยังไม่สมบูรณ์

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6).trim();
        } else if (line === '') {
          // จบ event block
          if (currentEvent && currentData) {
            try {
              const payload = JSON.parse(currentData);
              if (currentEvent === 'progress') {
                updateProgress(payload.percent || 0, payload.message || '...');
              } else if (currentEvent === 'done') {
                _lottoStatsCache = payload;
                updateProgress(100, '✅ โหลดเสร็จสมบูรณ์!');
                await new Promise(r => setTimeout(r, 400));
                renderLottoStats(payload);
              } else if (currentEvent === 'error') {
                throw new Error(payload.message || 'เกิดข้อผิดพลาด');
              }
            } catch (parseErr) {
              // skip malformed data
            }
          }
          currentEvent = '';
          currentData  = '';
        }
      }
    }

  } catch(e) {
    if (bodyEl) {
      bodyEl.innerHTML = `<div style="color:var(--danger);padding:16px;font-size:20px;">⚠ ${e.message}</div>`;
    }
  } finally {
    if (reloadBtn) reloadBtn.disabled = false;
  }
}

function renderLottoStats(data) {
  const bodyEl = document.getElementById('lotto-stats-body');
  if (!bodyEl || !data) return;

  // max = top[0].cnt (sorted desc แล้ว) — ไม่ต้องใช้ freq raw อีกต่อไป
  const maxOf  = (topArr) => topArr?.[0]?.cnt || 1;
  // กรองเฉพาะที่ออกมากกว่า 1 งวด
  const top2up = (topArr, n) => (topArr || []).filter(x => x.cnt > 1).slice(0, n);

  // ── ตัวช่วย render bar ──
  const freqBar = (entries, max, cls='') => !entries.length
    ? `<div style="color:var(--text2);font-size:20px;padding:8px 0;">ไม่มีข้อมูล (ทุกเลขออกแค่ 1 งวด)</div>`
    : entries.map(({num, cnt}) => {
    const pct = Math.round(cnt / max * 100);
    return `<div class="lotto-freq-row">
      <span class="lotto-num ${cls}">${num}</span>
      <div class="lotto-bar"><div class="lotto-bar-fill" style="width:${pct}%"></div></div>
      <span class="lotto-cnt">${cnt} งวด</span>
    </div>`;
  }).join('');

  const latest = data.history?.[0];
  const prevDate = data.history?.[1]?.date || '';

  let html = '';

  // แจ้งเตือนถ้าข้อมูลนี้ถูกส่งมาเพราะมีการอัปเดตค้างอยู่ในอีกหน้าต่าง (refreshBusy)
  // หรือเป็นข้อมูลเก่าเพราะดึงงวดใหม่ไม่สำเร็จ (stale)
  if (data.refreshBusy) {
    html += `<div style="background:rgba(184,138,64,0.10);border:1px solid rgba(184,138,64,0.4);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:19px;color:#d4aa6a;">
      ⏳ กำลังอัปเดตข้อมูลอยู่ในอีกหน้าต่างหนึ่ง — แสดงข้อมูลเดิมไปก่อน กด "↻ โหลดสถิติ" อีกครั้งเมื่ออัปเดตเสร็จ
    </div>`;
  } else if (data.stale) {
    html += `<div style="background:rgba(192,96,80,0.10);border:1px solid rgba(192,96,80,0.4);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:19px;color:#e08878;">
      ⚠ ดึงงวดใหม่ไม่สำเร็จ — แสดงข้อมูลเดิมที่มีอยู่ ลองใหม่อีกครั้งภายหลัง
    </div>`;
  }

  // ── สรุปงวดล่าสุด ──
  html += `<div style="background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.2);border-radius:12px;padding:14px 18px;margin-bottom:16px;">
    <div style="font-size:18px;color:var(--gold);letter-spacing:2px;margin-bottom:8px;">✦ งวดล่าสุด: ${latest?.date || '—'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
      <div>
        <div style="font-size:17px;color:var(--text2);">รางวัลที่ 1</div>
        <div style="font-family:'Noto Serif Thai',serif;font-size:42px;color:var(--gold2);font-weight:600;letter-spacing:6px;">${latest?.first6 || '—'}</div>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="font-size:17px;color:var(--text2);">หน้า 3 ตัว</div>
          <div style="font-size:24px;color:var(--text);font-weight:600;">${(latest?.front3||[]).join(', ') || '—'}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:17px;color:var(--text2);">ท้าย 3 ตัว</div>
          <div style="font-size:24px;color:var(--text);font-weight:600;">${(latest?.back3||[]).join(', ') || '—'}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:17px;color:var(--text2);">ท้าย 2 ตัว</div>
          <div style="font-family:'Noto Serif Thai',serif;font-size:34px;color:var(--gold3);font-weight:600;">${latest?.back2 || '—'}</div>
        </div>
      </div>
    </div>
  </div>`;

  // ── 4 กริดสถิติ ──
  html += `<div class="lotto-grid">`;

  // รางวัลที่ 1 (6 หลัก)
  const mx1 = maxOf(data.top.first6);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🏆 รางวัลที่ 1 (6 หลัก) ออกบ่อยสุด</div>
    ${freqBar(top2up(data.top.first6, 8), mx1)}
  </div>`;

  // ท้าย 2 ตัว
  const mx2 = maxOf(data.top.back2);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">2️⃣ เลขท้าย 2 ตัว ออกบ่อยสุด</div>
    ${freqBar(top2up(data.top.back2,  8), mx2)}
    <div style="margin-top:10px;">
      <span style="font-size:18px;color:var(--gold);letter-spacing:1px;">🔥 เลขร้อน (ออกซ้ำล่าสุด)</span>
      <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:5px;">
        ${(data.hotBack2||[]).slice(0,6).map(x=>`<span class="lotto-tag hot">${x.num} ×${x.cnt}</span>`).join('')||'<span style="color:var(--text2);font-size:18px;">—</span>'}
      </div>
    </div>
  </div>`;

  // หน้า 3 ตัว
  const mxF3 = maxOf(data.top.front3);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🔼 หน้า 3 ตัว ออกบ่อยสุด</div>
    ${freqBar(top2up(data.top.front3, 8), mxF3)}
  </div>`;

  // ท้าย 3 ตัว
  const mxB3 = maxOf(data.top.back3);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🔽 ท้าย 3 ตัว ออกบ่อยสุด</div>
    ${freqBar(top2up(data.top.back3,  8), mxB3)}
  </div>`;

  // รางวัลที่ 2 (6 หลัก)
  const mx2p = maxOf(data.top.second);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🥈 รางวัลที่ 2 (6 หลัก) ออกซ้ำบ่อยสุด</div>
    ${freqBar(top2up(data.top.second, 8), mx2p)}
  </div>`;

  // รางวัลที่ 3 (6 หลัก)
  const mx3p = maxOf(data.top.third);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🥉 รางวัลที่ 3 (6 หลัก) ออกซ้ำบ่อยสุด</div>
    ${freqBar(top2up(data.top.third, 8), mx3p)}
  </div>`;

  // รางวัลที่ 4 (6 หลัก) — มี 50 เลข/งวด จำนวนตัวเลขที่เป็นไปได้เยอะมาก
  // จึงมักไม่ค่อยเจอเลขซ้ำ (แสดง "ไม่มีข้อมูล" ได้บ่อยกว่ารางวัลอื่น ถือเป็นเรื่องปกติ)
  const mx4p = maxOf(data.top.fourth);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🎖️ รางวัลที่ 4 (6 หลัก) ออกซ้ำบ่อยสุด</div>
    ${freqBar(top2up(data.top.fourth, 8), mx4p)}
  </div>`;

  // รางวัลที่ 5 (6 หลัก) — มี 100 เลข/งวด เช่นกัน มักไม่ค่อยเจอเลขซ้ำ
  const mx5p = maxOf(data.top.fifth);
  html += `<div class="lotto-panel">
    <div class="lotto-panel-title">🏵️ รางวัลที่ 5 (6 หลัก) ออกซ้ำบ่อยสุด</div>
    ${freqBar(top2up(data.top.fifth, 8), mx5p)}
  </div>`;

  html += `</div>`; // end lotto-grid

  // ── สถิติ 16 รายการ ──────────────────────────────────────────────────────
  const topEntry = (arr) => arr?.[0];  // อันดับ 1
  const noData   = `<span style="color:var(--text2);font-size:20px;">ไม่มีข้อมูล</span>`;

  // helper: render ช่อง "เลขที่ออกบ่อยสุด" พร้อม bar
  function statRow(label, entry, maxCnt) {
    if (!entry || entry.cnt <= 1) return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:19px;color:var(--text2);">${label}</span>
      ${noData}
    </div>`;
    const pct = Math.round(entry.cnt / maxCnt * 100);
    return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:19px;color:var(--text2);">${label}</span>
        <span style="font-family:'Noto Serif Thai',serif;font-size:24px;color:var(--gold2);font-weight:600;">${entry.num}
          <span style="font-size:17px;color:var(--text2);font-weight:400;">${entry.cnt} งวด</span>
        </span>
      </div>
      <div class="lotto-bar"><div class="lotto-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  // helper: max count จาก array of {num,cnt}
  const maxCntOf = (arr) => arr?.length ? arr[0].cnt : 1;

  // สถิติ 1-4
  const s1 = topEntry(data.top?.first6);
  const s2 = topEntry(data.top?.back2);
  const s3 = topEntry(data.top?.front3);
  const s4 = topEntry(data.top?.back3);
  const max1 = maxCntOf(data.top?.first6);
  const max2 = maxCntOf(data.top?.back2);
  const max3 = maxCntOf(data.top?.front3);
  const max4 = maxCntOf(data.top?.back3);

  html += `<div style="margin-bottom:20px;">
    <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">📊 สถิติสำคัญ จาก ${data.rounds} งวด</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
      ${statRow('1. รางวัลที่ 1 (6 หลัก) ที่ออกบ่อยสุด', s1, max1)}
      ${statRow('2. เลขท้าย 2 ตัว ที่ออกบ่อยสุด',        s2, max2)}
      ${statRow('3. เลขหน้า 3 ตัว ที่ออกบ่อยสุด',        s3, max3)}
      ${statRow('4. เลขท้าย 3 ตัว ที่ออกบ่อยสุด',        s4, max4)}
    </div>
  </div>`;

  // สถิติ 5-10: หลักแยกตำแหน่ง จาก first6
  const dp1 = data.digitPos_first6 || [];
  const maxDP1 = Math.max(...dp1.map(pos => pos[0]?.cnt || 0), 1);
  html += `<div style="margin-bottom:20px;">
    <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">🔢 หลักแยกตำแหน่ง — รางวัลที่ 1 เท่านั้น (สถิติ 5–10)</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
      ${[5,6,7,8,9,10].map((no, i) => statRow(
        `${no}. หลักที่ ${i+1} (รางวัลที่ 1) ออกบ่อยสุด`,
        dp1[i]?.[0],
        maxDP1
      )).join('')}
    </div>
  </div>`;

  // สถิติ 11-16: หลักแยกตำแหน่ง จากทุกรางวัล 6 หลัก
  const dp2 = data.digitPos_all6 || [];
  const maxDP2 = Math.max(...dp2.map(pos => pos[0]?.cnt || 0), 1);
  html += `<div style="margin-bottom:20px;">
    <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">🔢 หลักแยกตำแหน่ง — ทุกรางวัล 6 หลัก (สถิติ 11–16)</div>
    <div style="font-size:18px;color:var(--text2);margin-bottom:8px;">รวมรางวัลที่ 1–5 และใกล้เคียงที่ 1</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
      ${[11,12,13,14,15,16].map((no, i) => statRow(
        `${no}. หลักที่ ${i+1} (ทุกรางวัล 6 หลัก) ออกบ่อยสุด`,
        dp2[i]?.[0],
        maxDP2
      )).join('')}
    </div>
  </div>`;

  // ── เลขที่ไม่เคยออก (2 ตัว) ──
  if (data.neverBack2?.length) {
    html += `<div style="margin-bottom:16px;">
      <div style="font-size:18px;color:var(--gold);letter-spacing:2px;margin-bottom:8px;">❄ เลขท้าย 2 ตัว ที่ยังไม่เคยออกใน ${data.rounds} งวด</div>
      <div class="lotto-never">
        ${data.neverBack2.map(n=>`<span class="lotto-never-num">${n}</span>`).join('')}
      </div>
    </div>`;
  }

  // ── เลขรอนาน (gap สูง) ──
  if (data.longGap?.length) {
    html += `<div style="margin-bottom:16px;">
      <div style="font-size:18px;color:var(--gold);letter-spacing:2px;margin-bottom:8px;">⏳ เลขท้าย 2 ตัว ที่นานที่สุดที่ยังไม่ออก</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${(data.longGap||[]).map(x=>`<div class="lotto-tag cold" style="font-size:19px;padding:4px 12px;">${x.num} <span style="opacity:.7;">ห่าง ${x.gap} งวด</span></div>`).join('')}
      </div>
    </div>`;
  }

  // ── เลขท้าย 2 ตัว ออกบ่อยสุด แยกตามวันในสัปดาห์ที่ออกจริง ──
  if (data.byDow?.length) {
    const maxDow = Math.max(...data.byDow.map(d => d.top?.[0]?.cnt || 0), 1);
    html += `<div style="margin-bottom:20px;">
      <div style="font-size:18px;letter-spacing:2px;color:var(--gold);margin-bottom:4px;">📆 เลขท้าย 2 ตัว ออกบ่อยสุด แยกตามวันที่ออกจริง</div>
      <div style="font-size:16px;color:var(--text2);margin-bottom:8px;">นับจากวันที่ออกรางวัลจริง (หลังปรับเลื่อนวันหยุด/กรณีพิเศษแล้ว) ไม่ใช่วันตามรอบ 1/16 เดิม</div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 18px;">
        ${data.byDow.map(d => statRow(
          `วัน${d.dowName} (${d.drawCount} งวด)`,
          d.top?.[0],
          maxDow
        )).join('')}
      </div>
    </div>`;
  }

  // ── ประวัติย้อนหลัง 12 งวด ──
  html += `<div style="margin-bottom:16px;">
    <div style="font-size:18px;color:var(--gold);letter-spacing:2px;margin-bottom:8px;">📅 ผลย้อนหลัง ${Math.min(data.history.length,12)} งวด</div>
    <div class="lotto-history">
      ${(data.history||[]).slice(0,12).map(h => `
        <div class="lotto-hist-row">
          <span class="lotto-hist-date">${h.date}</span>
          <span class="lotto-hist-f1">🏆 ${h.first6}</span>
          <span class="lotto-hist-tag">หน้า3:</span>
          <div class="lotto-hist-nums">${(h.front3||[]).map(n=>`<span class="lotto-hist-num">${n}</span>`).join('')}</div>
          <span class="lotto-hist-tag">ท้าย3:</span>
          <div class="lotto-hist-nums">${(h.back3||[]).map(n=>`<span class="lotto-hist-num">${n}</span>`).join('')}</div>
          <span class="lotto-hist-tag">2ตัว:</span>
          <span style="font-weight:600;color:var(--gold3);">${h.back2}</span>
        </div>`).join('')}
    </div>
  </div>`;

  // ── AI คาดการณ์งวดหน้า ──
  html += `<div class="ai-box" id="lotto-ai-box" style="margin-top:4px;">
    <div class="ai-box-header">
      🎯 AI วิเคราะห์เลขเด่นงวดหน้า
      <button class="ai-reload" onclick="loadLottoAI(true)">↻ วิเคราะห์</button>
    </div>
    <div class="ai-body" id="lotto-ai-body" style="color:var(--text2);font-style:italic;">กดปุ่ม ↻ เพื่อให้ AI วิเคราะห์เลขเด่นงวดหน้าจากสถิติ</div>
  </div>`;

  bodyEl.innerHTML = html;
}

// ── AI วิเคราะห์เลขเด่นงวดหน้า ──
let _lottoAiCache = null;
async function loadLottoAI(forceRefresh) {
  const bodyEl = document.getElementById('lotto-ai-body');
  if (!bodyEl || !_lottoStatsCache) return;
  if (!forceRefresh && _lottoAiCache) {
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'white-space:pre-wrap;color:var(--text);font-style:normal;font-size:21px;line-height:1.9;';
    bodyEl.textContent = _lottoAiCache;
    return;
  }

  bodyEl.className = 'ai-body loading';
  bodyEl.style.cssText = 'color:var(--text2);font-style:italic;font-size:21px;';
  bodyEl.textContent = 'กำลังวิเคราะห์สถิติ...';

  const d = _lottoStatsCache;
  const top2  = (d.top.back2||[]).slice(0,5).map(x=>`${x.num}(${x.cnt}งวด)`).join(', ');
  const topF3 = (d.top.front3||[]).slice(0,5).map(x=>`${x.num}(${x.cnt}งวด)`).join(', ');
  const topB3 = (d.top.back3||[]).slice(0,5).map(x=>`${x.num}(${x.cnt}งวด)`).join(', ');
  const top6  = (d.top.first6||[]).slice(0,5).map(x=>`${x.num}(${x.cnt}งวด)`).join(', ');
  const hot2  = (d.hotBack2||[]).slice(0,4).map(x=>`${x.num}(${x.cnt}งวดล่าสุด)`).join(', ');
  const cold2 = (d.coldBack2||[]).slice(0,6).join(', ');
  const never2 = (d.neverBack2||[]).slice(0,10).join(', ');
  const last5 = (d.history||[]).slice(0,5).map(h=>`${h.date}: รางวัล1=${h.first6}, ท้าย2=${h.back2}, หน้า3=[${(h.front3||[]).join('|')}], ท้าย3=[${(h.back3||[]).join('|')}]`).join('\n');

  const prompt = `คุณเป็นนักสถิติที่วิเคราะห์ผลสลากกินแบ่งรัฐบาลไทย โดยใช้หลักสถิติล้วน (ไม่ใช้โหราศาสตร์)

ข้อมูลสถิติย้อนหลัง ${d.rounds} งวด:

ผลล่าสุด 5 งวด:
${last5}

ความถี่ออกสูงสุด:
- รางวัลที่ 1 (6 หลัก): ${top6}
- หน้า 3 ตัว: ${topF3}
- ท้าย 3 ตัว: ${topB3}
- ท้าย 2 ตัว: ${top2}

เลขร้อน (ออกซ้ำใน 10 งวดล่าสุด): ${hot2||'—'}
เลขเย็น (ไม่ออกใน 10 งวดล่าสุด): ${cold2||'—'}
เลขท้าย 2 ตัวที่ไม่เคยออกใน ${d.rounds} งวด: ${never2||'—'}

กฎเหล็ก:
- วิเคราะห์จากสถิติที่ให้เท่านั้น ห้ามอุปโลกน์ข้อมูล
- ระบุว่าเป็นการวิเคราะห์ทางสถิติ ไม่ใช่การรับประกันผล
- ใช้หลักการ mean reversion, hot/cold numbers, frequency analysis

วิเคราะห์และสรุป (ภาษาไทย ไม่เกิน 300 คำ):

[เลขท้าย 2 ตัว — น่าจับตา]
เลขที่ออกบ่อย vs เลขที่นานไม่ออก เลือก 3-5 เลข พร้อมเหตุผลทางสถิติ

[หน้า 3 ตัว — น่าจับตา]
เลข 3 ตัวหน้าที่มีรูปแบบน่าสนใจ 2-3 เลข

[ท้าย 3 ตัว — น่าจับตา]
เลข 3 ตัวล่างที่มีรูปแบบน่าสนใจ 2-3 เลข

[ข้อสังเกตจากสถิติ]
รูปแบบที่น่าสังเกตจากข้อมูล เช่น เลขซ้ำ ช่วงห่าง หรือรูปแบบอื่น

[คำเตือน]
ย้ำว่านี่คือสถิติเพื่อความบันเทิง ไม่รับประกันผล`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 1200 }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    const text = data.text || 'ไม่สามารถวิเคราะห์ได้';
    _lottoAiCache = text;
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'white-space:pre-wrap;color:var(--text);font-style:normal;font-size:21px;line-height:1.9;';
    bodyEl.textContent = text;
  } catch(e) {
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'color:var(--danger);font-size:20px;';
    bodyEl.textContent = '⚠ ' + e.message;
  }
}

// ═══════════════════════════════════════════════
// บทสรุปดวงชะตาวันนี้ — เรียก /api/analyze
// ═══════════════════════════════════════════════
const finalSummaryCache = {};

async function loadFinalSummary(forceRefresh) {
  const bodyEl = document.getElementById('final-summary-body');
  const reloadBtn = document.getElementById('summary-reload-btn');
  if (!bodyEl) return;

  const cacheKey = 'summary:' + (calSelectedISO || new Date().toDateString());
  if (!forceRefresh && finalSummaryCache[cacheKey]) {
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'font-size:22px;line-height:2;color:var(--text);font-style:normal;white-space:pre-wrap;';
    bodyEl.textContent = finalSummaryCache[cacheKey];
    return;
  }

  bodyEl.className = 'ai-body loading';
  bodyEl.style.cssText = 'font-size:22px;line-height:2;color:var(--text2);font-style:italic;';
  bodyEl.textContent = 'กำลังสังเคราะห์ข้อมูลดวงชะตา...';
  if (reloadBtn) reloadBtn.disabled = true;

  const selectedD  = selectedDate();
  const todayStr3  = selectedD.toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const thDayNames = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const thMonthsF  = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  const planetSummary = storedPlanets.length
    ? storedPlanets.map(p => `${p.name}(${p.sym}) ราศี${p.rasi} ${p.deg}°${p.min}'${p.retrograde?' ถอยหลัง':''}`).join(', ')
    : 'ไม่มีข้อมูลดาว';

  const nakStr2   = storedNakshatra ? `${storedNakshatra.name} (ฤกษ์ที่ ${storedNakshatra.num}) — ${storedNakshatra.quality==='good'?'มงคล':storedNakshatra.quality==='bad'?'ร้าย':'กลาง'}` : 'ไม่มีข้อมูล';
  const tithiStr2 = storedTithi     ? `${storedTithi.label} — ${storedTithi.quality==='good'?'มงคล':storedTithi.quality==='bad'?'อัปมงคล':'ปกติ'}` : 'ไม่มีข้อมูล';

  const yamGood = storedDisplayYams.filter(y => y.type==='ธงชัย').map(y => (y.slots||[]).map(s=>`${s.start}–${s.end}`).join(', ')).join(' / ');
  const yamOk   = storedDisplayYams.filter(y => y.type==='อธิบดี').map(y => (y.slots||[]).map(s=>`${s.start}–${s.end}`).join(', ')).join(' / ');
  const yamBad  = storedDisplayYams.filter(y => ['กาลกิณี','โลกาวินาศ','อุบาทว์'].includes(y.type)).map(y => y.type + ': ' + (y.slots||[]).map(s=>`${s.start}–${s.end}`).join(', ')).join(' | ');

  const saved = loadBirthInfo();
  let birthSection = 'ไม่มีข้อมูลวันเกิด (ผู้ใช้ยังไม่กรอก)';
  if (saved) {
    const { day, month, year } = saved;
    const birthDate   = new Date(year, month-1, day);
    const birthDow    = birthDate.getDay();
    const birthPlanet = DAY_PLANET[birthDow];
    const sunSign     = getSunSign(month, day);
    const lifePath    = getLifePath(year, month, day);
    const lpMeaning   = LIFE_PATH_MEANING[lifePath] || {};
    const chYear      = getChineseYear(year, month, day);
    const compat      = computePlanetCompatibility(birthPlanet, storedPlanets);
    const todayEl     = THAI_ELEMENT_TODAY();
    const elCompat    = chineseElementCompat(chYear.element, todayEl);
    birthSection = `วันเกิด: ${day} ${thMonthsF[month]} ค.ศ.${year} (วัน${thDayNames[birthDow]})
- ดาวเจ้าชะตา: ${birthPlanet}
- ราศีเกิด (สิเดอเรียล): ราศี${sunSign.name} ${sunSign.sym} ธาตุ${sunSign.element} — ${sunSign.trait}
- เลขศาสตร์: เลขชีวิต ${lifePath} — ${lpMeaning.title||''} — ${lpMeaning.trait||''}
- ปีนักษัตร: ปี${chYear.animal}(${chYear.thaiName||''}) ธาตุ${chYear.element}
- ความเข้ากันของดาวเกิดกับดาวฟ้าวันนี้: ${compat.level==='good'?'เสริมกัน':compat.level==='caution'?'ขัดแย้ง':'เป็นกลาง'} (${compat.score}/100)
- ธาตุนักษัตรกับธาตุวันนี้(${todayEl}): ${elCompat.label} — ${elCompat.note}`;
  }

  const prompt = `คุณเป็นโหราจารย์ผู้เชี่ยวชาญโหราศาสตร์ไทย ระบบนพเคราะห์ สิเดอเรียล และคัมภีร์กาลโยค

วันนี้: ${todayStr3}

== ข้อมูลดาวฟ้า ==
ตำแหน่งดาวนพเคราะห์: ${planetSummary}
ฤกษ์นักษัตร: ${nakStr2}
ดิถี: ${tithiStr2}

== ฤกษ์ยาม (คัมภีร์กาลโยค) ==
ธงชัย (ฤกษ์ชัยชนะ มงคลสูงสุด): ${yamGood||'ไม่มีในวันนี้'}
อธิบดี (ฤกษ์มั่นคง): ${yamOk||'ไม่มีในวันนี้'}
ฤกษ์ร้ายที่ควรหลีกเลี่ยง: ${yamBad||'ไม่มีในวันนี้'}

== ดวงชะตาเกิด ==
${birthSection}

กฎเหล็ก:
- อ่านผลจากข้อมูลที่ให้เท่านั้น ห้ามอนุมานนอกข้อมูล
- ระบุที่มาของการทำนายทุกข้อ เช่น "ดาวพฤหัสอยู่ราศีเมษ ตำราระบุว่า..."
- ห้ามใช้ประโยคกำกวม ห้ามแนะนำพิธีกรรมหรืออัญมณี

เขียนบทสรุปดวงชะตาวันนี้ (ภาษาไทย ไม่เกิน 350 คำ) แบ่งเป็น 4 ส่วนดังนี้:

[1. ภาพรวมพลังงานวันนี้]
สรุปตำแหน่งดาวสำคัญและความหมายรวมของวัน

[2. ฤกษ์ยามที่โดดเด่น]
ระบุช่วงเวลาที่ดีที่สุดและที่ควรระวังวันนี้พร้อมเหตุผลจากคัมภีร์

[3. ผลต่อดวงชะตาส่วนตัว]
วิเคราะห์ดาวเจ้าชะตากับดาวฟ้าวันนี้ ธาตุ และเลขชีวิต (ถ้าไม่มีวันเกิดให้บอกว่าต้องกรอกข้อมูล)

[4. ข้อแนะนำจากตำรา]
สรุปสั้น 2-3 ประโยค จากหลักโหราศาสตร์ไทยล้วนๆ`;

  try {
    const resp = await fetchWithTimeout('api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 1500 }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    const text = data.text || 'ไม่สามารถวิเคราะห์ได้ในขณะนี้';
    finalSummaryCache[cacheKey] = text;
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'font-size:22px;line-height:2;color:var(--text);font-style:normal;white-space:pre-wrap;';
    bodyEl.textContent = text;
  } catch(e) {
    bodyEl.className = 'ai-body';
    bodyEl.style.cssText = 'font-size:22px;line-height:2;color:var(--danger);font-style:normal;';
    bodyEl.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
  } finally {
    if (reloadBtn) reloadBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
let aiAvailable = false;

async function checkAiStatus() {
  try {
    const resp = await fetch('api/ai-status');
    const data = await resp.json();
    aiAvailable = data.available === true;
  } catch(e) {
    aiAvailable = false;
  }
  applyAiVisibility();
}

function applyAiVisibility() {
  document.querySelectorAll('.ai-box').forEach(el => {
    el.classList.toggle('ai-hidden', !aiAvailable);
  });
  document.querySelectorAll('.ai-unavail-note').forEach(el => {
    el.classList.toggle('show', !aiAvailable);
  });
}

function init(){
  const now=new Date();
  document.getElementById('date-display').textContent=thaiDateStr(now);
  tick();
  setInterval(tick,1000);
  // อัปเดต "ตอนนี้" indicator ทุกนาที
  setInterval(() => { if(storedApiYams.length) renderActivityAnalysis(currentActivity); }, 60000);
  const todayISO = todayStr(now);
  calSelectedISO = todayISO;
  loadData();
  updateBellUI();
  updateSoundUI();
  checkAiStatus();
}
init();
