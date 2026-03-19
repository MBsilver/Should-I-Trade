/**
 * Yahoo Finance API integration via direct HTTP calls.
 * Uses the public Yahoo Finance v8 API endpoints.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface YahooQuote {
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  previousClose: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  avgVolume: number;
}

// ---------------------------------------------------------------------------
// Cache layer
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  ts: number;
}

const quoteCache: CacheEntry<Record<string, YahooQuote>> = { data: {}, ts: 0 };
const historyCache: Record<string, CacheEntry<number[]>> = {};

const QUOTE_TTL_MS = 30_000;        // 30 s
const HISTORY_TTL_MS = 5 * 60_000;  // 5 min

// ---------------------------------------------------------------------------
// All tickers the dashboard needs
// ---------------------------------------------------------------------------
export const ALL_TICKERS = [
  "SPY", "QQQ", "^VIX", "DX-Y.NYB", "^TNX",
  "XLK", "XLF", "XLE", "XLV", "XLI",
  "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC",
];

const DISPLAY_NAMES: Record<string, string> = {
  "SPY": "SPDR S&P 500 ETF",
  "QQQ": "Invesco QQQ Trust",
  "^VIX": "CBOE VIX",
  "DX-Y.NYB": "US Dollar Index",
  "^TNX": "10Y Treasury Yield",
  "XLK": "Technology",
  "XLF": "Financials",
  "XLE": "Energy",
  "XLV": "Healthcare",
  "XLI": "Industrials",
  "XLY": "Cons. Discretionary",
  "XLP": "Cons. Staples",
  "XLU": "Utilities",
  "XLB": "Materials",
  "XLRE": "Real Estate",
  "XLC": "Communication Svcs",
};

// ---------------------------------------------------------------------------
// Yahoo Finance v8 API helpers
// ---------------------------------------------------------------------------
const YF_BASE = "https://query1.finance.yahoo.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a single ticker's current quote via the v8 chart API (meta field).
 */
async function fetchSingleQuote(symbol: string): Promise<{ symbol: string; quote: YahooQuote } | null> {
  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;

    const json = await res.json() as any;
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      quote: {
        name: DISPLAY_NAMES[symbol] || meta.shortName || meta.longName || symbol,
        price,
        change,
        changesPercentage: changePct,
        previousClose: prevClose,
        dayLow: meta.regularMarketDayLow ?? price,
        dayHigh: meta.regularMarketDayHigh ?? price,
        volume: meta.regularMarketVolume ?? 0,
        avgVolume: meta.averageDailyVolume3Month ?? 0,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Fetch real-time quotes for all tracked tickers using v8 chart API.
 * Fetches in parallel batches to avoid overwhelming the API.
 */
export async function fetchQuotes(): Promise<Record<string, YahooQuote>> {
  const now = Date.now();
  if (quoteCache.ts && now - quoteCache.ts < QUOTE_TTL_MS) {
    return quoteCache.data;
  }

  try {
    // Fetch all tickers in parallel
    const results = await Promise.all(ALL_TICKERS.map(sym => fetchSingleQuote(sym)));

    const mapped: Record<string, YahooQuote> = {};
    for (const r of results) {
      if (r) mapped[r.symbol] = r.quote;
    }

    if (Object.keys(mapped).length < 5) {
      throw new Error(`Only got ${Object.keys(mapped).length} quotes, expected at least 5`);
    }

    quoteCache.data = mapped;
    quoteCache.ts = now;
    console.log(`[Yahoo] Fetched ${Object.keys(mapped).length} live quotes`);
    return mapped;
  } catch (err) {
    console.error("[Yahoo] Quote fetch failed:", err);
    if (Object.keys(quoteCache.data).length > 0) {
      console.log("[Yahoo] Returning stale quote cache");
      return quoteCache.data;
    }
    throw err;
  }
}

/**
 * Fetch ~1 year of daily closing prices for a given ticker using Yahoo Finance v8 chart API.
 */
export async function fetchHistory(symbol: string): Promise<number[]> {
  const now = Date.now();
  const cached = historyCache[symbol];
  if (cached && now - cached.ts < HISTORY_TTL_MS) {
    return cached.data;
  }

  try {
    // Fetch 1 year + 1 week of daily data
    const period2 = Math.floor(now / 1000);
    const period1 = period2 - (365 + 7) * 86400;

    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`;

    const res = await fetchWithTimeout(url, 15_000);
    if (!res.ok) {
      throw new Error(`Yahoo chart HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json() as any;
    const chartResult = json?.chart?.result?.[0];
    if (!chartResult) {
      throw new Error("Invalid Yahoo chart response structure");
    }

    const closePrices = chartResult.indicators?.quote?.[0]?.close;
    if (!closePrices || !Array.isArray(closePrices)) {
      throw new Error("No close prices in Yahoo chart response");
    }

    // Filter out nulls
    const closes: number[] = closePrices.filter((c: any) => c != null) as number[];

    if (closes.length > 0) {
      historyCache[symbol] = { data: closes, ts: now };
      console.log(`[Yahoo] Fetched ${closes.length} daily bars for ${symbol}`);
    }

    return closes;
  } catch (err) {
    console.error(`[Yahoo] History fetch failed for ${symbol}:`, err);
    if (historyCache[symbol]?.data?.length) {
      console.log(`[Yahoo] Returning stale history cache for ${symbol}`);
      return historyCache[symbol].data;
    }
    return [];
  }
}

/**
 * Fetch all data the dashboard needs: quotes + historical prices.
 */
export async function fetchAllMarketData() {
  const [quotes, spyHistory, qqqHistory, vixHistory] = await Promise.all([
    fetchQuotes(),
    fetchHistory("SPY"),
    fetchHistory("QQQ"),
    fetchHistory("^VIX"),
  ]);

  const isLive = Object.keys(quotes).length >= 10 && spyHistory.length > 50;

  return {
    quotes,
    spyHistory,
    qqqHistory,
    vixHistory,
    dataSource: isLive ? "live" as const : "stale" as const,
  };
}

/**
 * Invalidate all caches — called when user triggers manual refresh.
 */
export function invalidateCache() {
  quoteCache.ts = 0;
  for (const key of Object.keys(historyCache)) {
    historyCache[key].ts = 0;
  }
  console.log("[Yahoo] Cache invalidated");
}
