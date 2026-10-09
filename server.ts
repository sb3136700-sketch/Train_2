import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Initialize Gemini client if API key is present
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  try {
    aiClient = new GoogleGenAI({ apiKey });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
  }
}

// Live train tracking proxy. Provider credentials stay server-side.
// When live data is unavailable, return an explicit error instead of synthetic GPS.
type JsonRecord = Record<string, any>;
const trainStatusCache = new Map<string, { fetchedAtMs: number; payload: JsonRecord }>();
const LIVE_TRAIN_CACHE_MS = 20_000;
const TRAIN_STATUS_TIMEOUT_MS = 8_000;

app.get('/api/trains/:trainNumber/live', async (req, res) => {
  const trainNumber = String(req.params.trainNumber || '').trim();
  if (!/^\d{5}$/.test(trainNumber)) {
    res.status(400).json({ ok: false, status: 'invalid', error: 'Train number must contain exactly 5 digits.' });
    return;
  }

  const providerKey = process.env.RAILRADAR_API_KEY;
  const baseUrl = (process.env.RAILRADAR_BASE_URL || 'https://api.railradar.in/v1').replace(/\/$/, '');
  if (!providerKey) {
    res.status(503).json({
      ok: false,
      status: 'unavailable',
      provider: null,
      message: 'Live tracking is not configured. Set RAILRADAR_API_KEY in the server environment. No simulated location is shown as live.'
    });
    return;
  }

  const cacheKey = `${trainNumber}:${String(req.query.date || '')}`;
  const cached = trainStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < LIVE_TRAIN_CACHE_MS && req.query.refresh !== 'true') {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...cached.payload, cacheAgeSeconds: Math.floor((Date.now() - cached.fetchedAtMs) / 1000) });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRAIN_STATUS_TIMEOUT_MS);
  try {
    const url = new URL(`${baseUrl}/trains/${encodeURIComponent(trainNumber)}/live`);
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
      url.searchParams.set('date', String(req.query.date));
    }
    url.searchParams.set('authoritative', 'true');
    url.searchParams.set('includeCoordinates', 'true');
    url.searchParams.set('geometry', 'true');
    url.searchParams.set('format', 'geojson');

    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${providerKey}`, Accept: 'application/json' },
      signal: controller.signal
    });
    const body = await upstream.json().catch(() => ({} as JsonRecord)) as JsonRecord;
    if (!upstream.ok || body.success === false) {
      const status = upstream.status === 401 || upstream.status === 403 ? 'provider_auth_error' :
        upstream.status === 404 ? 'not_found' :
        upstream.status === 429 ? 'rate_limited' : 'provider_error';
      res.status(upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : 502).json({
        ok: false, status, provider: 'RailRadar',
        message: body?.error?.message || `Live status provider returned HTTP ${upstream.status}.`
      });
      return;
    }

    const data = body.data || body;
    const payload = {
      ok: true,
      status: data.isLive === true ? 'live' : 'stale',
      provider: 'RailRadar',
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: data.lastUpdatedAt || null,
      providerResponseAt: body.meta?.timestamp || null,
      trainNumber: data.trainNumber || trainNumber,
      trainName: data.trainName || data.train?.name || null,
      runDate: data.startDate || null,
      runningStatus: data.status || null,
      delayMinutes: Number.isFinite(data.delayMinutes) ? data.delayMinutes : null,
      currentLocation: data.currentLocation || null,
      previousHalt: data.previousHalt || null,
      nextHalt: data.nextHalt || null,
      route: Array.isArray(data.route) ? data.route : [],
      geometry: data.geometry || data.geojson || null,
      isLive: data.isLive === true
    };
    trainStatusCache.set(cacheKey, { fetchedAtMs: Date.now(), payload });
    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    res.status(502).json({
      ok: false,
      status: timedOut ? 'timeout' : 'provider_unavailable',
      provider: 'RailRadar',
      message: timedOut ? 'Live status request timed out. Try again shortly.' : 'Unable to retrieve live train status right now.'
    });
  } finally {
    clearTimeout(timeout);
  }
});

// Rail Travel AI Assistant endpoint
app.post('/api/rail-assistant', async (req, res) => {
  try {
    const { question, currentTrain, currentStation } = req.body;
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    const trimmedQ = question.trim().toLowerCase();

    // Check if we can use Gemini
    if (aiClient) {
      try {
        const prompt = `You are the expert Indian Railways digital travel companion for "TRAVELLING GUIDE".
User Question: "${question}"
Context:
- Current active train: ${currentTrain || 'Not specified'}
- Current station: ${currentStation || 'Not specified'}

Provide a helpful, precise, friendly answer (under 160 words). Include practical advice, station food tips, platform etiquette, or IRCTC rules where applicable. Avoid fluff or generic boilerplate.`;

        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        });

        if (response && response.text) {
          res.json({ answer: response.text });
          return;
        }
      } catch (geminiError) {
        console.warn('Gemini API call failed, falling back to local railway knowledge base:', geminiError);
      }
    }

    // Smart local knowledge base matching
    let bestAnswer = "Indian Railways trains offer great connectivity across 7,000+ stations. For live train status, check the 'Live Tracking' tab. For station food specialties, explore the 'Route & Stations' tab. You can also dial 139 (RailMadad) for 24x7 official assistance.";
    
    for (const [key, answer] of Object.entries(FALLBACK_ANSWERS)) {
      if (trimmedQ.includes(key)) {
        bestAnswer = answer;
        break;
      }
    }

    res.json({ answer: bestAnswer });
  } catch (error) {
    console.error('Error in /api/rail-assistant:', error);
    res.status(500).json({
      answer: "Indian Railways 24x7 Universal Helpline is 139 (RailMadad). For security issues dial 182. For live status tracking, select your train in the tracking tab above."
    });
  }
});

// Fallback Indian Railways Knowledge Base
const FALLBACK_ANSWERS: Record<string, string> = {
  tatkal: "Tatkal booking opens 1 day in advance of the train origin departure date. AC classes (1A, 2A, 3A, 3E, CC, EC) open at 10:00 AM IST sharp, while Non-AC classes (Sleeper SL, 2S) open at 11:00 AM IST. Tip: Add passenger details to your IRCTC Master List 24 hours prior to 1-click fill!",
  rac: "RAC (Reservation Against Cancellation) guarantees travel on the train! Two RAC ticket holders share one Side Lower berth for sitting during daytime and sleeping. If any confirmed passenger cancels or doesn't show up, RAC 1 is automatically upgraded to full confirmed berth.",
  refund: "If your train is delayed by more than 3 hours at your boarding station, you are entitled to a 100% full refund without cancellation charges by filing a TDR (Ticket Deposit Receipt) before the actual departure of the train.",
  luggage: "Free luggage allowance on Indian Railways: 1st AC allows 70 kg, 2nd AC allows 50 kg, 3rd AC & Chair Car allow 40 kg, and Sleeper class allows 40 kg. Maximum dimensions should not exceed 100cm x 60cm x 25cm to fit safely under berths.",
  food: "You can pre-book e-catering meals via IRCTC eCatering app or dial 1323 with your 10-digit PNR. Meals from reputed brands (Haldiram, Domino's, Saravana Bhavan, Bikanervala) are delivered right to your train seat at designated halts!",
  berth: "Lower Berths (LB) are ideal for senior citizens. Middle Berths (MB) should be folded up during daytime (6:00 AM to 10:00 PM) to allow Lower and Upper berth passengers to sit comfortably, as per official IRCTC rules."
};

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Travelling Guide server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
