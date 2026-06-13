const CACHE_TTL = 1800; // 30 minutes in seconds

// ─── BREAKS (mirrors index.html — keep in sync) ───────────────────────────────
const BREAKS = [
  {
    name: 'The Groyne', exposure: 0.50, maxScore: 6, sizeCap: 8, bankPenalty: 3,
    tide: { ideal: 'mid-high', avoid: 'low' },
    ideal:      { swellDirs: ['NE','ENE','E'],       windDirs: ['S','SSW','SW','WSW'],           periodMin: 8  },
    acceptable: { swellDirs: ['NNE','ESE','SE'],     windDirs: ['W','SSE','SE'],                 periodMin: 6  },
    avoid:      { swellDirs: ['N','NW','S'],         windDirs: ['N','NNE','NE','ENE','E'],       windPenalty: 2 },
  },
  {
    name: 'First Point', exposure: 0.32, pointBreak: true,
    tide: { ideal: 'low-mid', avoid: 'high' },
    ideal:      { swellDirs: ['ENE','E','NE'],       windDirs: ['S','SSW','SW'],                 periodMin: 10 },
    acceptable: { swellDirs: ['ESE','NNE','SE'],     windDirs: ['SSE','SE','WSW','W'],           periodMin: 8  },
    avoid:      { swellDirs: ['N','NW','S'],         windDirs: ['N','NNE','NE','ENE','E'],       windPenalty: 3 },
  },
  {
    name: 'Nationals', exposure: 0.58, pointBreak: true,
    tide: { ideal: 'low-mid', avoid: 'high' },
    ideal:      { swellDirs: ['ENE','E','NE'],       windDirs: ['SE','SSE','S'],                 periodMin: 10 },
    acceptable: { swellDirs: ['ESE','NNE','SE'],     windDirs: ['SSW','SW','ESE'],               periodMin: 8  },
    avoid:      { swellDirs: ['N','NW','S'],         windDirs: ['N','NNE','NE','ENE','E','W'],  windPenalty: 2 },
  },
  {
    name: 'Tea Tree', exposure: 0.55, pointBreak: true,
    tide: { ideal: 'low-mid', avoid: 'high' },
    ideal:      { swellDirs: ['ENE','E','NE'],       windDirs: ['SE','SSE','S'],                 periodMin: 10 },
    acceptable: { swellDirs: ['ESE','NNE','SE'],     windDirs: ['SSW','SW','ESE'],               periodMin: 8  },
    avoid:      { swellDirs: ['N','NW','S'],         windDirs: ['N','NNE','NE','ENE','E','W'],  windPenalty: 2 },
  },
  {
    name: 'Granite Bay', exposure: 0.65, pointBreak: true,
    tide: { ideal: 'low-mid', avoid: 'high' },
    ideal:      { swellDirs: ['ENE','E','NE','NNE'], windDirs: ['S','SSE','SE','SSW'],           periodMin: 9  },
    acceptable: { swellDirs: ['ESE','N','NNW','SE'], windDirs: ['SW','W','ESE'],                 periodMin: 7  },
    avoid:      { swellDirs: ['S','NW'],             windDirs: ['N','NE','ENE','E'],             windPenalty: 1 },
  },
  {
    name: 'Sunshine Beach', exposure: 0.90, sizeCap: 9, benefitsFromPeriod: true,
    tide: { ideal: 'mid-high', avoid: 'low' },
    ideal:      { swellDirs: ['E','ESE','ENE'],      windDirs: ['W','WSW','WNW','SW'],           periodMin: 8  },
    acceptable: { swellDirs: ['SE','NE'],            windDirs: ['NW','SSW'],                     periodMin: 6  },
    avoid:      { swellDirs: ['N','NW','S','SW'],   windDirs: ['NE','ENE','E','ESE','SE','N','S'], windPenalty: 3 },
  },
  {
    name: 'Double Island', exposure: 0.42, pointBreak: true,
    tide: { ideal: 'low-mid', avoid: 'high' },
    ideal:      { swellDirs: ['ENE','E','NE'],       windDirs: ['W','WSW','SW','SSW'],           periodMin: 10 },
    acceptable: { swellDirs: ['ESE','NNE','SE'],     windDirs: ['NW','WNW','S'],                 periodMin: 8  },
    avoid:      { swellDirs: ['N','NW','S'],         windDirs: ['NE','ENE','E','ESE','SE','N'], windPenalty: 2 },
  },
];

// ─── SCORING (mirrors index.html) ────────────────────────────────────────────
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function degToCompass(deg) { return COMPASS[Math.round(deg / 22.5) % 16] ?? null; }
function dirDistance(a, b) {
  const ia = COMPASS.indexOf(a), ib = COMPASS.indexOf(b);
  if (ia < 0 || ib < 0) return 99;
  const d = Math.abs(ia - ib);
  return Math.min(d, COMPASS.length - d);
}
function scoreFactor(dir, ideal, acceptable, avoid, pts) {
  if (!dir) return Math.round(pts * 0.5);
  if (ideal.includes(dir)) return pts;
  if (acceptable.includes(dir)) return Math.round(pts * 0.5);
  if (avoid.length && avoid.includes(dir)) return 0;
  const dist = Math.min(...ideal.map(d => dirDistance(dir, d)));
  return dist <= 1 ? Math.round(pts * 0.75) : Math.round(pts * 0.25);
}
function scoreTide(tide, breakTide) {
  if (!tide || !breakTide || breakTide.ideal === 'all') return 0;
  const h = tide.current, isLow = h < 0.5, isMid = h >= 0.5 && h < 1.2, isHigh = h >= 1.2;
  if (breakTide.ideal === 'low-mid') return (isLow || isMid) ? 1 : (breakTide.avoid === 'high' && isHigh) ? -1 : 0;
  if (breakTide.ideal === 'mid-high') return (isMid || isHigh) ? 1 : (breakTide.avoid === 'low' && isLow) ? -1 : 0;
  return 0;
}
function shortDir(text) {
  const map = {
    'north-northeasterly':'NNE','north-northwesterly':'NNW','south-southeasterly':'SSE','south-southwesterly':'SSW',
    'east-northeasterly':'ENE','east-southeasterly':'ESE','west-northwesterly':'WNW','west-southwesterly':'WSW',
    'northeasterly':'NE','northwesterly':'NW','southeasterly':'SE','southwesterly':'SW',
    'northerly':'N','southerly':'S','easterly':'E','westerly':'W',
    'north-northeast':'NNE','north-northwest':'NNW','south-southeast':'SSE','south-southwest':'SSW',
    'northeast':'NE','northwest':'NW','southeast':'SE','southwest':'SW',
    'north':'N','south':'S','east':'E','west':'W',
  };
  text = (text||'').replace(/\bmetres\b/gi,'m')
    .replace(/(\d+)\s*to\s*(\d+)\s*knots?/gi, (_,a,b) => `${Math.round(a*1.852)}-${Math.round(b*1.852)} km/h`)
    .replace(/(\d+)\s*knots?/gi, (_,k) => `${Math.round(k*1.852)} km/h`);
  return text.replace(/\b(north-northeasterly|north-northwesterly|south-southeasterly|south-southwesterly|east-northeasterly|east-southeasterly|west-northwesterly|west-southwesterly|northeasterly|northwesterly|southeasterly|southwesterly|northerly|southerly|easterly|westerly|north-northeast|north-northwest|south-southeast|south-southwest|northeast|northwest|southeast|southwest|north|south|east|west)\b/gi,
    m => map[m.toLowerCase()] || m);
}
function extractDir(text) {
  const dirs = ['NNE','NNW','SSE','SSW','ENE','ESE','WNW','WSW','NE','NW','SE','SW','N','S','E','W'];
  const s = shortDir(text);
  for (const d of dirs) if (s.startsWith(d+' ')||s.includes(' '+d+' ')||s===d) return d;
  return null;
}
function extractHeight(text) {
  if (!text) return null;
  const t = text.replace(/(?:with|and)\s+(?:moderate\s+)?cross[\s-]?swell[^.]*\.?/gi,'');
  const m = t.match(/(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)\s*m/i)||t.match(/around\s+(\d+\.?\d*)\s*m/i)||t.match(/(\d+\.?\d*)\s*m/i);
  if (!m) return null;
  return m[2] !== undefined ? (parseFloat(m[1])+parseFloat(m[2]))/2 : parseFloat(m[1]);
}
function extractWindSpeedKts(text) {
  const s = shortDir(text);
  const r = s.match(/(\d+)[–-](\d+)\s*km\/h/);
  if (r) return ((parseInt(r[1])+parseInt(r[2]))/2)/1.852;
  const s2 = s.match(/(\d+)\s*km\/h/);
  if (s2) return parseInt(s2[1])/1.852;
  return null;
}
function scoreBreak(br, fc) {
  if (!fc?.forecasts?.length) return 0;
  const cur = fc.forecasts[0];
  const swellText = shortDir(cur.swell||''), windText = shortDir(cur.winds||'');
  const swellDir = fc._swellDir ?? extractDir(swellText);
  const swellH   = extractHeight(swellText);
  let windDir  = extractDir(windText);
  const period   = fc._period ?? null;
  const tide     = fc._tide   ?? null;
  let windKts  = extractWindSpeedKts(cur.winds||'');
  // Prefer the live Tewantin observation over BOM's all-day forecast text
  // (mirrors index.html scoreBreak isCurrent behaviour — keep in sync)
  if (fc._obsWindDir) {
    windDir = fc._obsWindDir;
    if (fc._obsWindKmh != null) windKts = fc._obsWindKmh / 1.852;
  }

  let scoringH = swellH;
  if (swellH !== null && br.exposure) {
    let dm = 1.0;
    if (swellDir) {
      if (br.ideal.swellDirs.includes(swellDir)) dm = 1.0;
      else if (br.acceptable.swellDirs.includes(swellDir)) dm = 0.8;
      else { const md = Math.min(...br.ideal.swellDirs.map(d => dirDistance(swellDir,d))); dm = md<=2?0.6:0.4; }
    }
    scoringH = swellH * br.exposure * dm;
  }

  const swellPts = scoreFactor(swellDir, br.ideal.swellDirs, br.acceptable.swellDirs, br.avoid.swellDirs||[], 3);
  const windPts  = scoreFactor(windDir,  br.ideal.windDirs,  br.acceptable.windDirs,  br.avoid.windDirs||[],  3);
  let windPenalty = (windDir && (br.avoid.windDirs||[]).includes(windDir) && br.avoid.windPenalty) ? br.avoid.windPenalty : 0;
  // Light onshore barely hurts surface quality — scale the penalty by speed (mirrors index.html)
  if (windPenalty > 0 && windKts !== null) {
    const kmh = windKts * 1.852;
    if (kmh < 8) windPenalty = 0;
    else if (kmh < 12) windPenalty = Math.ceil(windPenalty / 2);
  }
  const windIsIdeal = windDir && br.ideal.windDirs.includes(windDir);
  let windSpeedPenalty = 0;
  if (!windIsIdeal && windKts !== null) windSpeedPenalty = windKts > 30 ? 2 : windKts > 20 ? 1 : 0;
  const crossPenalty = /cross.?swell|moderate cross|secondary swell|confused/i.test(cur.swell||'') ? 1 : 0;
  let periodPts = 0;
  if (period !== null) periodPts = period >= br.ideal.periodMin ? 1 : period >= (br.acceptable.periodMin||0) ? 0.5 : 0;
  const tidePts = scoreTide(tide, br.tide);
  const raw = swellPts + windPts + periodPts + tidePts - windPenalty - windSpeedPenalty - crossPenalty - (br.bankPenalty||0);

  let sizeCap = 10;
  if (scoringH !== null) {
    if (scoringH < 0.3) sizeCap=2; else if (scoringH < 0.45) sizeCap=4; else if (scoringH < 0.6) sizeCap=5;
    else if (scoringH < 0.75) sizeCap=6; else if (scoringH < 0.9) sizeCap=7; else if (scoringH < 1.2) sizeCap=8;
    else if (scoringH < 1.6) sizeCap=9;
  }
  if (br.sizeCap !== undefined) sizeCap = Math.min(sizeCap, br.sizeCap);
  return Math.min(Math.max(0, Math.round(raw)), sizeCap, br.maxScore ?? 10);
}

// ─── FORECAST ENRICHMENT FOR SCORING ─────────────────────────────────────────
function getBrisbaneDate(offsetHours = 0) {
  return new Date(Date.now() + (10 + offsetHours) * 3600000);
}
function enrichForecast(allData) {
  const fc = allData.forecast;
  if (!fc) return fc;

  // Open-Meteo swell data — prefer buoy when available
  if (allData.swell?.hourly) {
    const times = allData.swell.hourly.time;
    const now = getBrisbaneDate();
    const hourStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}`;
    const idx = times.findIndex(t => t.startsWith(hourStr));
    const perArr  = allData.swell.hourly.swell_wave_period || allData.swell.hourly.wave_period || null;
    const dirArr  = allData.swell.hourly.swell_wave_direction || null;
    const hArr    = allData.swell.hourly.swell_wave_height || allData.swell.hourly.wave_height || null;
    fc._period   = perArr && idx > -1 ? perArr[idx] : null;
    fc._swellDir = dirArr && idx > -1 ? degToCompass(dirArr[idx]) : null;
    fc._swellH   = hArr   && idx > -1 ? hArr[idx]   : null;
  }

  // Buoy overrides Open-Meteo
  const buoy = allData.buoy;
  if (buoy && !buoy.error && buoy.Hsig > 0) {
    fc._swellH = buoy.Hsig;
    if (buoy.Tp > 0) fc._period = buoy.Tp;
    if (buoy.Direction >= 0) fc._swellDir = degToCompass(buoy.Direction);
  }

  // Live observed wind (Tewantin AWS) — used by scoreBreak instead of BOM text
  const obs = allData.wind;
  if (obs && !obs.error && obs.wind_dir) {
    fc._obsWindDir = obs.wind_dir;
    fc._obsWindKmh = obs.wind_kmh ?? null;
  }

  // Tide interpolation
  fc._tide = getTideNow(allData.tides?.noosa);
  return fc;
}

// ─── BEST WINDOW (mirrors index.html computeBestWindow) ──────────────────────
function estimateSurfHeight(offshoreH, exposure, swellDir, br, period) {
  if (offshoreH === null || offshoreH === undefined || !exposure) return null;
  let dm = 1.0;
  if (swellDir && br) {
    const ideal = br.ideal?.swellDirs || [];
    const acceptable = br.acceptable?.swellDirs || [];
    if (ideal.includes(swellDir)) dm = 1.0;
    else if (acceptable.includes(swellDir)) dm = 0.8;
    else { const md = Math.min(...ideal.map(d => dirDistance(swellDir, d))); dm = md <= 2 ? 0.6 : 0.4; }
  }
  let pm = 1.0;
  if (period !== null && period !== undefined && (br?.pointBreak || br?.benefitsFromPeriod)) {
    if (period >= 14) pm = 1.15; else if (period >= 11) pm = 1.05; else if (period <= 8) pm = 0.85;
  }
  return Math.round(offshoreH * exposure * dm * pm * 10) / 10;
}

function bestWindowForBreak(swellHourly, br, dayOffset = 0) {
  if (!swellHourly || !br?.exposure) return null;
  const times = swellHourly.time;
  const waveH = swellHourly.wave_height || swellHourly.swell_wave_height || null;
  const waveP = swellHourly.swell_wave_period || swellHourly.wave_period || null;
  const waveD = swellHourly.wave_direction || swellHourly.swell_wave_direction || null;
  const d = getBrisbaneDate(dayOffset * 24);
  const dayStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const hourScores = [];
  (times || []).forEach((t, i) => {
    if (!t.startsWith(dayStr)) return;
    const hr = parseInt(t.split('T')[1]);
    if (hr < 5 || hr > 17) return;
    const h = waveH ? waveH[i] : null;
    const p = waveP ? waveP[i] : null;
    const dir = waveD ? degToCompass(waveD[i]) : null;
    const sH = h !== null ? estimateSurfHeight(h, br.exposure, dir, br, p) : null;
    if (sH === null) return;
    const pBonus = p !== null ? (p >= 14 ? 1.3 : p >= 10 ? 1.1 : 1.0) : 1.0;
    hourScores.push({ hr, score: sH * pBonus });
  });
  if (hourScores.length < 3) return null;
  let bestSum = -1, bestStart = null;
  for (let i = 0; i < hourScores.length - 2; i++) {
    const s = hourScores[i].score + hourScores[i+1].score + hourScores[i+2].score;
    if (s > bestSum) { bestSum = s; bestStart = hourScores[i].hr; }
  }
  return bestStart !== null ? { start: bestStart, end: bestStart + 3 } : null;
}

function fmtHour(h) { return h === 12 ? '12pm' : h > 12 ? (h - 12) + 'pm' : h + 'am'; }

function getTideNow(tidesData) {
  if (!tidesData?.tides?.length) return null;
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0'), mm = String(now.getMonth()+1).padStart(2,'0'), yyyy = now.getFullYear();
  const todayStr = `${dd}/${mm}/${yyyy}`;
  const todayTides = tidesData.tides.filter(t => t.date === todayStr);
  if (!todayTides.length) return null;
  const withDates = todayTides.map(t => {
    const [h, m] = t.time.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return { ...t, d };
  });
  const prev = [...withDates].filter(t => t.d <= now).pop();
  const next = withDates.find(t => t.d > now);
  if (!prev || !next) return null;
  const elapsed = (now - prev.d) / (next.d - prev.d);
  return { current: parseFloat(prev.height) + (parseFloat(next.height) - parseFloat(prev.height)) * elapsed, rising: next.type === 'High' };
}

// ─── WEB PUSH ─────────────────────────────────────────────────────────────────
function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function b64uDec(s) {
  const b = s.replace(/-/g,'+').replace(/_/g,'/');
  const raw = atob(b + '='.repeat((4 - b.length % 4) % 4));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'HKDF', hash:'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}
async function buildVapidJwt(audience, env) {
  const header  = b64u(new TextEncoder().encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now()/1000) + 43200, sub: 'mailto:sallyscott@gmail.com',
  })));
  const msg = `${header}.${payload}`;
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, new TextEncoder().encode(msg));
  return `${msg}.${b64u(sig)}`;
}
async function encryptPushPayload(subscription, data) {
  const p256dh = b64uDec(subscription.keys.p256dh);
  const auth   = b64uDec(subscription.keys.auth);
  const plain  = new TextEncoder().encode(JSON.stringify(data));

  const eph    = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, true, ['deriveBits']);
  const ephPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const bKey   = await crypto.subtle.importKey('raw', p256dh, {name:'ECDH',namedCurve:'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:bKey}, eph.privateKey, 256));

  // RFC 8291: IKM
  const keyInfo = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...p256dh, ...ephPub]);
  const ikm = await hkdf(auth, shared, keyInfo, 32);

  // RFC 8188: AES128GCM record
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, ikm, new Uint8Array([...new TextEncoder().encode('Content-Encoding: aes128gcm'), 0]), 16);
  const nonce = await hkdf(salt, ikm, new Uint8Array([...new TextEncoder().encode('Content-Encoding: nonce'), 0]), 12);

  const cekKey     = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce}, cekKey, new Uint8Array([...plain, 2])));

  const body = new Uint8Array(86 + ciphertext.length);
  body.set(salt, 0); body.set([0,0,16,0], 16); body.set([65], 20); body.set(ephPub, 21); body.set(ciphertext, 86);
  return body;
}
async function sendPush(subscription, payload, env) {
  const endpoint = subscription.endpoint;
  const jwt  = await buildVapidJwt(new URL(endpoint).origin, env);
  const body = await encryptPushPayload(subscription, payload);
  const res  = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200',
    },
    body,
  });
  // 201 = Created, 200 = OK — both are success. 410/404 = expired subscription.
  if (res.status === 410 || res.status === 404) throw new Error('subscription_expired');
  if (!res.ok && res.status !== 201) throw new Error(`push_failed:${res.status}`);
}

// ─── KV HELPERS ──────────────────────────────────────────────────────────────
async function subKey(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash)).slice(0,8).map(b => b.toString(16).padStart(2,'0')).join('');
}
// Merge-update so the daily report (preferredHour) and swell alerts (alerts)
// can be set independently without wiping each other.
async function storeSubscription(env, subscription, fields = {}) {
  const key = await subKey(subscription.endpoint);
  const existing = await env.PUSH_SUBSCRIPTIONS.get(key, 'json') || {};
  await env.PUSH_SUBSCRIPTIONS.put(key, JSON.stringify({ ...existing, subscription, ...fields }));
}
async function deleteSubscription(env, endpoint) {
  const key = await subKey(endpoint);
  await env.PUSH_SUBSCRIPTIONS.delete(key);
}

// ─── CRON: best break scoring + push send ────────────────────────────────────
async function buildAll() {
  const [forecast, tidesNoosa, tidesMooloolaba, swell, buoy, wind] = await Promise.all([
    fetchBOM(),
    fetchTides(MSQ_NOOSA_URL, 'noosa'),
    fetchTides(MSQ_MOOLOOLABA_URL, 'mooloolaba'),
    fetchSwell(),
    fetchWaveBuoy().catch(e => ({ error: e.message })),
    fetchWindObs().catch(e => ({ error: e.message })),
  ]);
  return { forecast, tides: { noosa: tidesNoosa, mooloolaba: tidesMooloolaba }, swell, buoy, wind };
}

const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // one alert per break per 6h per device
const APP_URL = 'https://scottqld.github.io/surf-sesh/';
const ICON = '/surf-sesh/icon-192.png';

async function handleCron(env) {
  const brisbaneHour = getBrisbaneDate().getUTCHours();

  // List all subscriptions
  const list = await env.PUSH_SUBSCRIPTIONS.list();
  const subs = [];
  for (const kv of list.keys) {
    const rec = await env.PUSH_SUBSCRIPTIONS.get(kv.name, 'json');
    if (rec) subs.push({ key: kv.name, ...rec });
  }

  const morningDue = subs.filter(r => r.preferredHour === brisbaneHour);
  // Swell alerts fire within each device's chosen window (default 5am–5pm),
  // always clamped to daylight surf hours.
  const alertSubs = subs.filter(r => {
    if (!r.alerts?.threshold) return false;
    if (!Object.values(r.alerts.breaks || {}).some(v => v !== false)) return false;
    const from = Math.max(5,  r.alerts.fromHour ?? 5);
    const to   = Math.min(17, r.alerts.toHour   ?? 17);
    return brisbaneHour >= from && brisbaneHour <= to;
  });
  if (!morningDue.length && !alertSubs.length) return;

  // Fetch + enrich surf data once for everyone
  const allData = await buildAll();
  const fc = enrichForecast(allData);
  const scored = BREAKS.map(br => ({ br, score: scoreBreak(br, fc) }));

  const swellDir = (fc._swellDir && fc._swellDir !== 'unknown') ? fc._swellDir : '';
  const period   = fc._period   ? `${Math.round(fc._period)}s` : '';
  const swellH   = fc._swellH   ? `${fc._swellH.toFixed(1)}m`  : (extractHeight(fc.forecasts?.[0]?.swell||'') ? `${extractHeight(fc.forecasts[0].swell).toFixed(1)}m` : '');
  const windShort = shortDir(fc.forecasts?.[0]?.winds||'').split(' ').slice(0, 3).join(' ');

  // Clean one-line conditions summary, e.g. "1.2m ENE @ 10s · wind S 9 km/h"
  // (each part omitted when missing, so no "unknown"/empty fragments).
  const condSummary = [
    [swellH, swellDir].filter(Boolean).join(' '),
    period ? `@ ${period}` : '',
  ].filter(Boolean).join(' ') + (windShort ? ` · wind ${windShort}` : '');

  const windowLabel = (br) => {
    const win = bestWindowForBreak(allData.swell?.hourly, br);
    return win && brisbaneHour < win.end ? `Best window ${fmtHour(win.start)}–${fmtHour(win.end)}` : '';
  };

  // ── Daily morning report ──
  if (morningDue.length) {
    const best = scored.reduce((a, b) => b.score > a.score ? b : a);

    // AI one-liner (conditions/advice only — title already has break + score)
    let line1 = condSummary || 'Conditions unavailable';
    if (env.ANTHROPIC_API_KEY) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'x-api-key':env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 60,
            messages: [{ role:'user', content:`Write one casual sentence (max 12 words) describing today's surf for a push notification. Conditions at ${best.br.name}, Noosa: ${condSummary || 'small/unknown'}, rated ${best.score}/10. Do NOT repeat the break name or the score. No hashtags, no emoji. If ${best.score} is 3 or less, say plainly it's not worth a surf.` }],
          }),
        });
        const aiJson = await aiRes.json();
        const text = aiJson?.content?.[0]?.text?.trim();
        if (text) line1 = text;
      } catch { /* fallback to condSummary */ }
    }

    const win = windowLabel(best.br);
    const payload = {
      title: `🏄 Best today: ${best.br.name} ${best.score}/10`,
      body: win ? `${line1}\n⏱ ${win}` : line1,
      icon: ICON,
      badge: ICON,
      url: APP_URL,
    };

    await Promise.allSettled(morningDue.map(async rec => {
      try {
        await sendPush(rec.subscription, payload, env);
      } catch (e) {
        if (e.message === 'subscription_expired') await env.PUSH_SUBSCRIPTIONS.delete(rec.key);
      }
    }));
  }

  // ── Swell alerts: push when a monitored break reaches the device threshold ──
  for (const rec of alertSubs) {
    const sent = rec.alertsSent || {};
    const now  = Date.now();
    const hits = scored.filter(({ br, score }) =>
      score >= rec.alerts.threshold &&
      rec.alerts.breaks?.[br.name] !== false &&
      now - (sent[br.name] || 0) >= ALERT_COOLDOWN_MS);
    if (!hits.length) continue;

    const top    = hits.reduce((a, b) => b.score > a.score ? b : a);
    const others = hits.filter(h => h !== top).map(h => `${h.br.name} ${h.score}/10`).join(', ');
    const win    = windowLabel(top.br);
    const line2  = [win ? `⏱ ${win}` : '', others ? `Also firing: ${others}` : ''].filter(Boolean).join(' · ');
    const payload = {
      title: `🔔 ${top.br.name} is firing — ${top.score}/10`,
      body: [condSummary, line2].filter(Boolean).join('\n'),
      icon: ICON,
      badge: ICON,
      url: APP_URL,
    };

    try {
      await sendPush(rec.subscription, payload, env);
      hits.forEach(h => { sent[h.br.name] = now; });
      const { key, ...stored } = rec;
      await env.PUSH_SUBSCRIPTIONS.put(key, JSON.stringify({ ...stored, alertsSent: sent }));
    } catch (e) {
      if (e.message === 'subscription_expired') await env.PUSH_SUBSCRIPTIONS.delete(rec.key);
    }
  }
}

const OPEN_METEO_URL = 'https://marine-api.open-meteo.com/v1/marine' +
  '?latitude=-26.4&longitude=153.1' +
  '&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature' +
  '&models=ecmwf_wam025' +
  '&forecast_days=7&timezone=Australia%2FBrisbane';

const QLD_WAVE_URL = 'https://apps.des.qld.gov.au/data-sets/waves/wave-7dayopdata.csv';
// Tewantin AWS — closest BOM automatic weather station to Noosa, updates every 10 min
const BOM_OBS_URL = 'https://www.bom.gov.au/fwo/IDQ60801/IDQ60801.94570.json';

const BOM_URL = 'https://www.bom.gov.au/qld/forecasts/sunshine-coast-waters.shtml';
const MSQ_NOOSA_URL = 'https://www.data.qld.gov.au/dataset/noosa-head-tide-gauge-predicted-high-low-data/resource/1977d083-3119-41aa-8758-3980f3eb8a3f/download/q048003a_noosa-head-storm-surge_2026_hilo.csv';
const MSQ_MOOLOOLABA_URL = 'https://www.data.qld.gov.au/dataset/fa4f1aca-3294-444a-ae7f-2a3fbfaf29ef/resource/58920636-0eb3-419f-bc28-68e1d0b88c82/download/q011008a_mooloolaba-storm-surge_2026_hilo.csv';

async function fetchWithCache(cache, cacheKey, fetchFn) {
  const cached = await cache.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    return data;
  }
  const data = await fetchFn();
  const response = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  });
  await cache.put(cacheKey, response);
  return data;
}

async function fetchBOM() {
  const res = await fetch(BOM_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal surf app)' }
  });
  const html = await res.text();

  // Extract weather situation synopsis
  const synopsisMatch = html.match(/<div class="synopsis">[\s\S]*?<p>([\s\S]*?)<\/p>/);
  const synopsis = synopsisMatch ? synopsisMatch[1].trim() : '';

  // Extract warning if present
  const warningMatch = html.match(/<strong class="warning"[^>]*>([\s\S]*?)<\/strong>/);
  const warning = warningMatch ? warningMatch[1].replace(/<[^>]+>/g, ' ').trim() : null;


  // Extract issue time
  const issuedMatch = html.match(/<p class="date">([\s\S]*?)<\/p>/);
  const issuedAt = issuedMatch ? issuedMatch[1].trim() : '';

  // Extract each day forecast
  const forecasts = [];
  const dayPattern = /<div class="day">([\s\S]*?)<\/div>(?=\s*<div class="day">|\s*<div id=|\s*<\/div>|\s*$)/g;
  let dayMatch;

  while ((dayMatch = dayPattern.exec(html)) !== null) {
    const block = dayMatch[1];

    const titleMatch = block.match(/<h2>([\s\S]*?)<\/h2>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const getField = (label) => {
      const pattern = new RegExp(`<dt>${label}<\/dt>\\s*<dd[^>]*>\\s*<span>([\\s\\S]*?)<\/span>`, 'i');
      const m = block.match(pattern);
      return m ? m[1].trim() : '';
    };

    forecasts.push({
      day: title,
      winds: getField('Winds'),
      seas: getField('Seas'),
      swell: getField('Swell'),
      weather: getField('Weather'),
    });
  }

  return { issuedAt, synopsis, warning, forecasts, source: 'BOM', fetchedAt: new Date().toISOString() };
}

async function fetchTides(url, location) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (personal surf app)' }
    });
    const text = await res.text();
    const lines = text.trim().split('\n');
    const tides = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDays = new Date(today);
    sevenDays.setDate(today.getDate() + 7);

    // Find the header row containing 'Date' and 'Reading'
    let dataStartIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Date') && lines[i].includes('Reading')) {
        dataStartIndex = i + 1;
        break;
      }
    }
    if (dataStartIndex === -1) dataStartIndex = 1; // fallback: skip first line

    for (let i = dataStartIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 4) continue;

      const dateParts = cols[0].split('/');
      if (dateParts.length !== 3) continue;
      const date = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);

      if (date < today || date >= sevenDays) continue;

      const time = cols[1].trim();
      const ind = parseInt(cols[2].trim());
      const height = parseFloat(cols[3].trim());

      if (isNaN(ind) || isNaN(height)) continue;

      tides.push({
        date: cols[0].trim(),
        time,
        type: ind === 1 ? 'High' : 'Low',
        height: height.toFixed(2)
      });
    }

    return { location, tides, fetchedAt: new Date().toISOString() };
  } catch (e) {
    return { location, tides: [], error: e.message };
  }
}
async function fetchWindObs() {
  const res = await fetch(BOM_OBS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal surf app)' }
  });
  const json = await res.json();
  const obs = json?.observations?.data?.[0];
  if (!obs) throw new Error('No BOM observation data');
  return {
    station:    obs.name,
    time:       obs.local_date_time_full,
    wind_dir:   obs.wind_dir   ?? null,
    wind_kmh:   obs.wind_spd_kmh ?? null,
    gust_kmh:   obs.gust_kmh   ?? null,
    fetchedAt:  new Date().toISOString(),
  };
}

async function fetchWaveBuoy() {
  const res = await fetch(QLD_WAVE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal surf app)' }
  });
  const text = await res.text();
  const lines = text.trim().split('\n');
  // First line is a metadata string — find the actual CSV header row
  const headerIdx = lines.findIndex(l => l.includes('Site') && l.includes('Hsig'));
  if (headerIdx === -1) throw new Error(`CSV header not found. First line: ${lines[0]?.substring(0, 80)}`);
  const header = lines[headerIdx].split(',').map(h => h.trim());
  const col = name => header.indexOf(name);

  const SITES = ['Mooloolaba', 'Caloundra']; // prefer closest to Noosa
  const latest = {};

  for (const line of lines.slice(headerIdx + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matchedSite = SITES.find(s => trimmed.startsWith(s + ','));
    if (!matchedSite) continue;
    // Later rows overwrite earlier ones — CSV is time-ascending
    latest[matchedSite] = trimmed.split(',').map(s => s.trim());
  }

  const row = latest['Mooloolaba'] || latest['Caloundra'];
  if (!row) throw new Error(`No buoy match. headerIdx=${headerIdx} lines=${lines.length} header="${lines[headerIdx]?.substring(0, 60)}"`);

  const Hsig      = parseFloat(row[col('Hsig')]);
  const Tp        = parseFloat(row[col('Tp')]);
  const Direction = parseFloat(row[col('Direction')]);
  const SST       = parseFloat(row[col('SST')]);
  const dateTime  = row[col('DateTime')];
  const site      = row[col('Site')];

  if (!Hsig || Hsig < 0) throw new Error(`Invalid buoy Hsig: ${Hsig}`);

  return {
    site,
    dateTime,
    Hsig,
    Tp:        Tp > 0 ? Tp : null,
    Direction: Direction >= 0 ? Direction : null,
    SST:       SST > 0 ? SST : null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchSwell() {
  const res = await fetch(OPEN_METEO_URL);
  const data = await res.json();
  // Don't return error responses — Open-Meteo sometimes returns transient errors
  if (data.reason || data.error || !data.hourly) {
    throw new Error(`Open-Meteo error: ${data.reason || data.error || 'no hourly data'}`);
  }
  return { ...data, fetchedAt: new Date().toISOString() };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const path = url.pathname;
    const noCache = url.searchParams.has('nocache');

    try {
      let data;

      if (path === '/forecast') {
        const cacheKey = new Request('https://cache.surf/forecast');
        data = noCache ? await fetchBOM() : await fetchWithCache(cache, cacheKey, fetchBOM);

      } else if (path === '/tides') {
        const station = url.searchParams.get('station') || 'noosa';
        const cacheKey = new Request(`https://cache.surf/tides/${station}`);
        const tideUrl = station === 'mooloolaba' ? MSQ_MOOLOOLABA_URL : MSQ_NOOSA_URL;
        data = noCache ? await fetchTides(tideUrl, station) : await fetchWithCache(cache, cacheKey, () => fetchTides(tideUrl, station));

      } else if (path === '/swell') {
        const cacheKey = new Request('https://cache.surf/swell');
        data = await fetchWithCache(cache, cacheKey, fetchSwell);

      } else if (path === '/all') {
        const cacheKey = new Request('https://cache.surf/all');
        data = noCache ? await buildAll() : await fetchWithCache(cache, cacheKey, buildAll);

      } else if (path === '/ai' && request.method === 'POST') {
        if (!env.ANTHROPIC_API_KEY) {
          return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 503, headers: corsHeaders });
        }
        const body = await request.json();
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
        const aiData = await aiRes.json();
        return new Response(JSON.stringify(aiData), { headers: corsHeaders });

      } else if (path === '/subscribe' && request.method === 'POST') {
        if (!env.PUSH_SUBSCRIPTIONS) {
          return new Response(JSON.stringify({ error: 'Push not configured' }), { status: 503, headers: corsHeaders });
        }
        const { subscription, preferredHour, alerts } = await request.json();
        const fields = {};
        if (preferredHour !== undefined) fields.preferredHour = preferredHour; // null = daily report off
        if (alerts !== undefined) fields.alerts = alerts; // { threshold, breaks: { name: bool } }
        await storeSubscription(env, subscription, fields);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

      } else if (path === '/subscribe' && request.method === 'DELETE') {
        if (!env.PUSH_SUBSCRIPTIONS) {
          return new Response(JSON.stringify({ error: 'Push not configured' }), { status: 503, headers: corsHeaders });
        }
        const { endpoint } = await request.json();
        await deleteSubscription(env, endpoint);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

      } else {
        return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify(data), { headers: corsHeaders });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  },
};