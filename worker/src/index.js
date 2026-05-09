const CACHE_TTL = 3600; // 1 hour in seconds

const OPEN_METEO_URL = 'https://marine-api.open-meteo.com/v1/marine' +
  '?latitude=-26.4&longitude=153.1' +
  '&hourly=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period' +
  '&forecast_days=7&timezone=Australia%2FBrisbane';

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
        data = noCache ? await (async () => {
          const [forecast, tidesNoosa, tidesMooloolaba, swell] = await Promise.all([
            fetchBOM(),
            fetchTides(MSQ_NOOSA_URL, 'noosa'),
            fetchTides(MSQ_MOOLOOLABA_URL, 'mooloolaba'),
            fetchSwell(),
          ]);
          return { forecast, tides: { noosa: tidesNoosa, mooloolaba: tidesMooloolaba }, swell };
        })() : await fetchWithCache(cache, cacheKey, async () => {
          const [forecast, tidesNoosa, tidesMooloolaba, swell] = await Promise.all([
            fetchBOM(),
            fetchTides(MSQ_NOOSA_URL, 'noosa'),
            fetchTides(MSQ_MOOLOOLABA_URL, 'mooloolaba'),
            fetchSwell(),
          ]);
          return { forecast, tides: { noosa: tidesNoosa, mooloolaba: tidesMooloolaba }, swell };
        });

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