const CACHE_TTL = 1800; // 30 minutes in seconds

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

    // CORS headers for browser requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        const buildAll = async () => {
          const [forecast, tidesNoosa, tidesMooloolaba, swell, buoy, wind] = await Promise.all([
            fetchBOM(),
            fetchTides(MSQ_NOOSA_URL, 'noosa'),
            fetchTides(MSQ_MOOLOOLABA_URL, 'mooloolaba'),
            fetchSwell(),
            fetchWaveBuoy().catch(e => ({ error: e.message })),
            fetchWindObs().catch(e => ({ error: e.message })),
          ]);
          return { forecast, tides: { noosa: tidesNoosa, mooloolaba: tidesMooloolaba }, swell, buoy, wind };
        };
        data = noCache ? await buildAll() : await fetchWithCache(cache, cacheKey, buildAll);

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
};