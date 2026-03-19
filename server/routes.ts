import type { Express } from "express";
import { createServer, type Server } from "http";
import { computeDashboard, buildRawDataFromQuotes } from "./scoring";
import { fetchAllMarketData, invalidateCache } from "./yahoo";

// Cache for the computed dashboard data
let cachedDashboard: any = null;
let cacheTimestamp = 0;
let lastDataSource: "live" | "stale" | "seed" = "seed";
const CACHE_TTL_MS = 30_000; // 30 second cache

// ---------------------------------------------------------------------------
// SEED DATA fallback (March 18, 2026) — used if Yahoo Finance fails
// ---------------------------------------------------------------------------
const SEED_QUOTES: Record<string, any> = {
  "SPY": { name: "SPDR S&P 500 ETF", price: 661.43, change: -9.36, changesPercentage: -1.40, previousClose: 670.79, dayLow: 661.23, dayHigh: 669.72, volume: 80910028, avgVolume: 81782240 },
  "QQQ": { name: "Invesco QQQ Trust", price: 594.90, change: -8.41, changesPercentage: -1.39, previousClose: 603.31, dayLow: 594.56, dayHigh: 603.15, volume: 55253316, avgVolume: 60203655 },
  "^VIX": { name: "CBOE VIX", price: 25.09, change: 2.72, changesPercentage: 12.16, previousClose: 22.37, dayLow: 21.47, dayHigh: 25.13, volume: 0, avgVolume: 0 },
  "DX-Y.NYB": { name: "US Dollar Index", price: 99.91, change: 0.34, changesPercentage: 0.34, previousClose: 99.58, dayLow: 99.80, dayHigh: 100.23, volume: 0, avgVolume: 0 },
  "^TNX": { name: "10Y Treasury Yield", price: 4.23, change: 0.03, changesPercentage: 0.76, previousClose: 4.20, dayLow: 4.20, dayHigh: 4.24, volume: 0, avgVolume: 0 },
  "XLK": { name: "Technology", price: 137.96, change: -1.58, changesPercentage: -1.13, previousClose: 139.54, dayLow: 137.94, dayHigh: 140.07, volume: 12567931, avgVolume: 18624274 },
  "XLF": { name: "Financials", price: 48.97, change: -0.59, changesPercentage: -1.19, previousClose: 49.56, dayLow: 48.92, dayHigh: 49.71, volume: 48710052, avgVolume: 51679927 },
  "XLE": { name: "Energy", price: 58.43, change: -0.08, changesPercentage: -0.14, previousClose: 58.51, dayLow: 58.43, dayHigh: 58.97, volume: 42786228, avgVolume: 53978572 },
  "XLV": { name: "Healthcare", price: 147.14, change: -2.50, changesPercentage: -1.67, previousClose: 149.64, dayLow: 147.01, dayHigh: 149.03, volume: 14562173, avgVolume: 13268254 },
  "XLI": { name: "Industrials", price: 165.18, change: -1.32, changesPercentage: -0.79, previousClose: 166.50, dayLow: 165.07, dayHigh: 167.17, volume: 10972647, avgVolume: 12281010 },
  "XLY": { name: "Cons. Discretionary", price: 110.57, change: -2.61, changesPercentage: -2.31, previousClose: 113.18, dayLow: 110.44, dayHigh: 112.99, volume: 10428900, avgVolume: 10947274 },
  "XLP": { name: "Cons. Staples", price: 82.64, change: -2.06, changesPercentage: -2.43, previousClose: 84.70, dayLow: 82.60, dayHigh: 84.03, volume: 18702048, avgVolume: 20643845 },
  "XLU": { name: "Utilities", price: 46.73, change: -0.40, changesPercentage: -0.85, previousClose: 47.13, dayLow: 46.73, dayHigh: 47.16, volume: 29799065, avgVolume: 26067461 },
  "XLB": { name: "Materials", price: 48.48, change: -1.04, changesPercentage: -2.10, previousClose: 49.52, dayLow: 48.48, dayHigh: 49.27, volume: 16056797, avgVolume: 16686674 },
  "XLRE": { name: "Real Estate", price: 42.02, change: -0.70, changesPercentage: -1.64, previousClose: 42.72, dayLow: 41.99, dayHigh: 42.59, volume: 6193157, avgVolume: 9334323 },
  "XLC": { name: "Communication Svcs", price: 113.66, change: -1.71, changesPercentage: -1.48, previousClose: 115.37, dayLow: 113.61, dayHigh: 115.16, volume: 6913133, avgVolume: 7360291 },
};

const SPY_HISTORY: number[] = [
  561.02, 567.13, 565.49, 563.07, 568.66, 572.13, 571.50, 568.99, 567.43, 560.63,
  554.15, 549.79, 548.42, 558.28, 563.81, 557.04, 560.44, 558.68, 560.04, 557.01,
  555.89, 545.34, 537.43, 535.01, 537.67, 540.20, 543.78, 547.93, 550.12, 553.45,
  548.67, 545.23, 550.89, 556.34, 559.78, 562.11, 557.45, 553.89, 558.23, 563.44,
  567.89, 571.23, 574.56, 578.12, 575.89, 572.34, 577.56, 582.11, 585.67, 588.23,
  591.45, 589.78, 586.34, 590.56, 594.12, 597.67, 595.34, 592.11, 596.45, 600.23,
  603.78, 607.12, 610.45, 608.23, 605.67, 609.34, 612.89, 616.23, 614.56, 611.34,
  615.78, 619.12, 622.45, 625.23, 623.67, 620.89, 624.34, 627.78, 630.12, 628.56,
  625.89, 629.34, 632.67, 635.23, 638.56, 636.89, 633.45, 637.12, 640.78, 643.23,
  645.67, 648.12, 646.56, 643.89, 647.34, 650.78, 653.12, 655.67, 658.23, 656.56,
  653.89, 657.34, 659.78, 661.00, 660.00, 661.78, 659.18, 662.26, 664.89, 663.21,
  660.45, 658.89, 661.34, 663.78, 666.12, 664.56, 662.34, 665.78, 668.12, 666.89,
  664.23, 667.56, 669.89, 672.12, 670.56, 668.34, 671.23, 673.67, 671.89, 669.45,
  672.78, 675.12, 673.56, 671.34, 674.67, 677.12, 675.56, 673.23, 676.56, 678.89,
  677.23, 675.45, 673.12, 676.34, 678.67, 680.12, 678.56, 676.34, 679.67, 682.12,
  680.45, 678.23, 681.56, 683.89, 682.23, 680.56, 678.34, 681.67, 684.12, 682.56,
  680.23, 683.67, 685.89, 684.23, 682.56, 680.34, 683.67, 686.12, 684.45, 682.23,
  685.56, 687.89, 686.23, 684.56, 682.34, 685.67, 688.12, 686.45, 684.23, 687.56,
  685.89, 683.23, 686.56, 688.89, 687.23, 685.56, 683.34, 686.67, 689.12, 687.45,
  685.23, 688.56, 686.89, 684.23, 687.56, 689.89, 688.23, 686.56, 684.34, 682.12,
  679.56, 677.23, 675.89, 678.12, 680.45, 678.23, 676.56, 674.89, 672.34, 670.12,
  668.45, 671.23, 673.56, 675.89, 674.23, 672.56, 670.34, 673.67, 676.12, 674.45,
  672.23, 670.56, 668.34, 666.12, 668.45, 670.78, 669.12, 667.45, 665.23, 668.56,
  670.89, 669.23, 667.56, 665.34, 668.67, 671.12, 669.45, 667.23, 665.56, 668.89,
  670.12, 668.45, 666.23, 669.56, 671.89, 670.23, 668.56, 666.34, 669.03, 670.79,
  661.43,
];

const QQQ_HISTORY: number[] = [
  474.54, 480.89, 479.26, 476.43, 482.11, 485.67, 484.23, 481.56, 479.89, 473.12,
  467.45, 463.78, 462.34, 470.56, 475.89, 470.12, 473.45, 471.78, 473.12, 470.45,
  468.89, 459.34, 452.67, 450.12, 453.45, 456.78, 460.12, 464.45, 467.78, 471.12,
  466.45, 463.12, 468.78, 474.34, 477.89, 480.12, 476.45, 473.12, 477.45, 482.34,
  486.78, 490.12, 493.45, 496.78, 494.12, 491.45, 495.78, 500.12, 503.45, 506.78,
  510.12, 508.45, 505.12, 509.45, 513.78, 517.12, 514.45, 511.78, 515.12, 518.45,
  521.78, 525.12, 528.45, 526.12, 523.78, 527.12, 530.45, 533.78, 531.12, 528.45,
  532.78, 536.12, 539.45, 542.78, 540.12, 537.45, 540.78, 544.12, 547.45, 545.78,
  543.12, 546.45, 549.78, 553.12, 556.45, 554.12, 551.78, 555.12, 558.45, 561.78,
  564.12, 567.45, 565.12, 562.78, 566.12, 569.45, 572.78, 575.12, 578.45, 576.12,
  573.78, 577.12, 580.45, 583.78, 581.12, 578.45, 581.78, 585.12, 588.45, 586.12,
  583.78, 587.12, 590.45, 591.18, 590.00, 591.75, 590.00, 595.32, 598.14, 595.89,
  593.12, 591.45, 594.78, 597.12, 599.45, 597.12, 594.78, 598.12, 601.45, 599.12,
  596.78, 600.12, 602.45, 604.78, 602.12, 599.78, 603.12, 605.45, 603.12, 600.78,
  604.12, 606.45, 604.78, 602.12, 605.45, 607.78, 606.12, 604.45, 607.78, 609.12,
  607.45, 605.12, 603.78, 606.12, 608.45, 610.78, 608.12, 605.78, 609.12, 611.45,
  609.78, 607.12, 610.45, 612.78, 611.12, 609.45, 607.12, 610.45, 612.78, 611.12,
  609.45, 612.78, 614.12, 612.45, 610.78, 608.45, 611.78, 614.12, 612.45, 610.12,
  613.45, 611.78, 609.12, 612.45, 614.78, 613.12, 611.45, 609.12, 612.45, 614.78,
  613.12, 611.45, 609.12, 607.78, 605.12, 603.45, 601.78, 604.12, 606.45, 604.12,
  602.45, 600.12, 597.78, 595.12, 597.45, 599.78, 601.12, 599.45, 597.78, 600.12,
  602.45, 600.78, 598.12, 596.45, 599.78, 602.12, 600.45, 598.12, 596.78, 599.12,
  601.45, 599.78, 598.12, 596.45, 599.78, 601.12, 599.45, 597.78, 596.12, 599.45,
  601.78, 600.12, 598.45, 596.12, 599.45, 601.78, 600.12, 598.45, 600.38, 603.31,
  594.90,
];

const VIX_HISTORY: number[] = [
  21.70, 19.90, 19.80, 20.50, 19.20, 18.40, 18.90, 19.60, 20.10, 22.30,
  24.50, 25.80, 26.20, 21.90, 19.80, 22.10, 20.60, 21.20, 20.40, 21.50,
  22.10, 26.50, 29.30, 30.20, 28.50, 26.80, 25.10, 23.40, 22.30, 21.10,
  23.40, 24.80, 22.10, 19.60, 18.40, 17.50, 19.20, 20.80, 18.90, 17.10,
  16.20, 15.40, 14.80, 13.90, 14.80, 15.90, 14.60, 13.20, 12.80, 12.10,
  11.90, 12.60, 13.40, 12.20, 11.40, 10.80, 11.60, 12.40, 11.20, 10.60,
  10.20, 9.80, 9.50, 10.20, 10.90, 10.10, 9.60, 9.20, 9.80, 10.60,
  10.10, 9.50, 9.10, 8.90, 9.40, 10.10, 9.60, 9.10, 8.80, 9.30,
  10.00, 9.50, 9.10, 8.70, 8.40, 8.90, 9.60, 9.10, 8.60, 8.30,
  8.10, 7.80, 8.20, 8.80, 8.40, 8.00, 7.60, 7.30, 7.00, 7.40,
  8.00, 7.50, 7.10, 7.60, 8.20, 8.50, 7.90, 7.40, 7.00, 7.50,
  8.10, 8.60, 7.90, 15.69, 16.36, 15.72, 17.20, 14.60, 13.80, 14.50,
  15.20, 15.80, 14.90, 14.20, 13.60, 14.30, 15.10, 14.40, 13.80, 14.60,
  15.30, 14.60, 13.90, 14.70, 15.40, 14.80, 14.10, 13.50, 14.20, 14.90,
  14.30, 13.60, 13.10, 13.80, 14.50, 13.90, 13.20, 14.10, 14.80, 14.20,
  13.50, 14.30, 15.00, 14.40, 13.70, 14.50, 15.20, 14.60, 13.90, 14.70,
  15.40, 14.80, 14.10, 15.00, 15.70, 15.10, 14.40, 15.20, 15.90, 15.30,
  14.60, 15.40, 16.10, 15.50, 14.80, 15.60, 16.30, 15.70, 15.00, 15.80,
  16.50, 15.90, 16.70, 17.40, 16.80, 17.60, 18.30, 17.70, 17.00, 17.80,
  18.50, 17.90, 18.70, 19.40, 18.80, 19.60, 20.30, 19.70, 19.00, 19.80,
  20.50, 21.20, 20.60, 21.40, 22.10, 21.50, 20.80, 21.60, 22.30, 21.70,
  22.50, 21.80, 22.60, 23.30, 22.70, 22.00, 22.80, 23.50, 22.90, 22.20,
  23.00, 23.70, 23.10, 22.40, 23.20, 23.90, 23.30, 22.60, 23.40, 24.10,
  23.50, 22.80, 23.60, 24.30, 23.70, 23.00, 23.80, 24.50, 23.90, 23.20,
  24.00, 24.70, 24.10, 23.40, 23.51, 22.37, 25.09,
];

// ---------------------------------------------------------------------------
// Dashboard builder — tries live Yahoo first, falls back to seed data
// ---------------------------------------------------------------------------
async function buildDashboardData(mode: "swing" | "day" = "swing", forceRefresh = false) {
  if (forceRefresh) {
    invalidateCache();
  }

  try {
    const { quotes, spyHistory, qqqHistory, vixHistory, dataSource } = await fetchAllMarketData();

    // Validate that we got the critical tickers
    if (!quotes["SPY"] || !quotes["QQQ"] || !quotes["^VIX"] || spyHistory.length < 50) {
      throw new Error("Incomplete Yahoo Finance data");
    }

    lastDataSource = dataSource;
    const rawData = buildRawDataFromQuotes(quotes, spyHistory, qqqHistory, vixHistory);
    return computeDashboard(rawData, mode);
  } catch (err) {
    console.error("[Routes] Live data fetch failed, falling back to seed data:", err);
    lastDataSource = "seed";
    const rawData = buildRawDataFromQuotes(SEED_QUOTES, SPY_HISTORY, QQQ_HISTORY, VIX_HISTORY);
    return computeDashboard(rawData, mode);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/dashboard", async (req, res) => {
    const mode = (req.query.mode as "swing" | "day") || "swing";
    const forceRefresh = req.query.refresh === "true";

    const now = Date.now();
    if (!forceRefresh && cachedDashboard && (now - cacheTimestamp) < CACHE_TTL_MS && cachedDashboard.mode === mode) {
      return res.json({ ...cachedDashboard, dataSource: lastDataSource });
    }

    try {
      const data = await buildDashboardData(mode, forceRefresh);
      cachedDashboard = data;
      cacheTimestamp = Date.now();
      res.json({ ...data, dataSource: lastDataSource });
    } catch (err) {
      console.error("[Routes] Dashboard build failed:", err);
      res.status(500).json({ error: "Failed to build dashboard data" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      dataSource: lastDataSource,
      timestamp: new Date().toISOString(),
    });
  });

  return httpServer;
}
