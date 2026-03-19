import { z } from "zod";

// Market data types
export const tickerQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  change: z.number(),
  changesPercentage: z.number(),
  previousClose: z.number(),
  dayLow: z.number(),
  dayHigh: z.number(),
  volume: z.number(),
  avgVolume: z.number(),
});

export type TickerQuote = z.infer<typeof tickerQuoteSchema>;

export const categoryScoreSchema = z.object({
  name: z.string(),
  score: z.number(),
  weight: z.number(),
  weightedScore: z.number(),
  interpretation: z.string(),
  details: z.array(z.object({
    label: z.string(),
    value: z.string(),
    direction: z.enum(["up", "down", "neutral"]),
    interpretation: z.enum(["healthy", "weakening", "risk-off", "neutral", "bullish", "bearish", "elevated", "low", "moderate"]),
  })),
});

export type CategoryScore = z.infer<typeof categoryScoreSchema>;

export const sectorDataSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  changesPercentage: z.number(),
  price: z.number(),
});

export type SectorData = z.infer<typeof sectorDataSchema>;

export const dashboardDataSchema = z.object({
  decision: z.enum(["YES", "CAUTION", "NO"]),
  marketQualityScore: z.number(),
  executionWindowScore: z.number(),
  summary: z.string(),
  categories: z.array(categoryScoreSchema),
  sectors: z.array(sectorDataSchema),
  tickers: z.array(tickerQuoteSchema),
  regime: z.string(),
  mode: z.enum(["swing", "day"]),
  alertBanner: z.string().nullable(),
  lastUpdated: z.string(),
  // Technical data
  spy20dma: z.number(),
  spy50dma: z.number(),
  spy200dma: z.number(),
  qqq50dma: z.number(),
  spyRsi14: z.number(),
  vixLevel: z.number(),
  vix5dSlope: z.number(),
  vixPercentile: z.number(),
  tnxLevel: z.number(),
  tnxTrend: z.string(),
  dxyLevel: z.number(),
  dxyTrend: z.string(),
  fedStance: z.string(),
  dataSource: z.enum(["live", "stale", "seed"]).optional(),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
