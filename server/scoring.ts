import type { CategoryScore, SectorData, DashboardData } from "@shared/schema";

interface RawMarketData {
  spyPrice: number;
  spyPrevClose: number;
  spyChange: number;
  spyChangesPct: number;
  qqqPrice: number;
  qqqPrevClose: number;
  qqqChange: number;
  qqqChangesPct: number;
  vixLevel: number;
  vixPrevClose: number;
  vixChange: number;
  tnxLevel: number;
  tnxPrevClose: number;
  dxyLevel: number;
  dxyPrevClose: number;
  
  // Historical derived
  spy20dma: number;
  spy50dma: number;
  spy200dma: number;
  qqq50dma: number;
  spyRsi14: number;
  
  // VIX stats
  vix5dSlope: number;
  vixPercentile: number; // 1-year percentile
  
  // Sectors
  sectors: SectorData[];
  
  // All tickers for ticker bar
  allTickers: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changesPercentage: number;
    previousClose: number;
    dayLow: number;
    dayHigh: number;
    volume: number;
    avgVolume: number;
  }>;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function scoreVolatility(data: RawMarketData): CategoryScore {
  const { vixLevel, vix5dSlope, vixPercentile } = data;
  
  let score = 100;
  
  // VIX level scoring
  if (vixLevel < 12) score -= 0;
  else if (vixLevel < 16) score -= 5;
  else if (vixLevel < 20) score -= 15;
  else if (vixLevel < 25) score -= 30;
  else if (vixLevel < 30) score -= 50;
  else if (vixLevel < 35) score -= 65;
  else score -= 80;
  
  // VIX trend (5d slope)
  if (vix5dSlope > 2) score -= 15; // rising fast
  else if (vix5dSlope > 0.5) score -= 8;
  else if (vix5dSlope < -1) score += 5; // falling = good
  
  // VIX percentile penalty
  if (vixPercentile > 90) score -= 15;
  else if (vixPercentile > 75) score -= 8;
  else if (vixPercentile < 25) score += 5;
  
  // Put/call ratio estimate from VIX regime
  const estimatedPCR = vixLevel > 25 ? 1.1 : vixLevel > 20 ? 0.95 : 0.8;
  if (estimatedPCR > 1.0) score -= 5;
  
  score = clamp(score, 0, 100);
  
  const interpretation = score >= 70 ? "Low volatility, favorable" 
    : score >= 40 ? "Elevated volatility, caution" 
    : "High volatility, risk-off";

  return {
    name: "Volatility",
    score,
    weight: 0.25,
    weightedScore: score * 0.25,
    interpretation,
    details: [
      { label: "VIX Level", value: vixLevel.toFixed(2), direction: data.vixChange > 0 ? "up" : data.vixChange < 0 ? "down" : "neutral", interpretation: vixLevel < 18 ? "low" : vixLevel < 25 ? "elevated" : "risk-off" },
      { label: "VIX 5d Trend", value: `${vix5dSlope > 0 ? '+' : ''}${vix5dSlope.toFixed(2)}`, direction: vix5dSlope > 0 ? "up" : vix5dSlope < 0 ? "down" : "neutral", interpretation: vix5dSlope > 1 ? "risk-off" : vix5dSlope < -0.5 ? "healthy" : "neutral" },
      { label: "VIX Percentile", value: `${vixPercentile.toFixed(0)}%`, direction: vixPercentile > 50 ? "up" : "down", interpretation: vixPercentile > 75 ? "elevated" : vixPercentile < 30 ? "low" : "moderate" },
      { label: "Est. Put/Call", value: estimatedPCR.toFixed(2), direction: estimatedPCR > 1 ? "up" : "down", interpretation: estimatedPCR > 1 ? "bearish" : "neutral" },
    ],
  };
}

function scoreTrend(data: RawMarketData): CategoryScore {
  const { spyPrice, spy20dma, spy50dma, spy200dma, qqqPrice, qqq50dma, spyRsi14 } = data;
  
  let score = 0;
  
  // SPY vs MAs (max 40 pts)
  if (spyPrice > spy200dma) score += 15;
  if (spyPrice > spy50dma) score += 13;
  if (spyPrice > spy20dma) score += 12;
  
  // QQQ vs 50dma (max 15 pts)
  if (qqqPrice > qqq50dma) score += 15;
  
  // MA alignment (max 15 pts): 20 > 50 > 200 = bullish
  if (spy20dma > spy50dma && spy50dma > spy200dma) score += 15;
  else if (spy20dma > spy50dma) score += 8;
  else if (spy50dma > spy200dma) score += 5;
  
  // RSI (max 15 pts)
  if (spyRsi14 >= 40 && spyRsi14 <= 70) score += 15; // healthy
  else if (spyRsi14 >= 30 && spyRsi14 <= 80) score += 8;
  else score += 2; // extreme

  score = clamp(score, 0, 100);
  
  // Regime classification
  let regime = "chop";
  if (spyPrice > spy50dma && spy50dma > spy200dma && spyRsi14 > 45) regime = "uptrend";
  else if (spyPrice < spy50dma && spy50dma < spy200dma && spyRsi14 < 45) regime = "downtrend";

  const interpretation = score >= 70 ? "Strong uptrend structure"
    : score >= 40 ? "Mixed trend signals"
    : "Downtrend or choppy";

  return {
    name: "Trend",
    score,
    weight: 0.20,
    weightedScore: score * 0.20,
    interpretation,
    details: [
      { label: "SPY vs 20d MA", value: `${((spyPrice / spy20dma - 1) * 100).toFixed(2)}%`, direction: spyPrice > spy20dma ? "up" : "down", interpretation: spyPrice > spy20dma ? "healthy" : "weakening" },
      { label: "SPY vs 50d MA", value: `${((spyPrice / spy50dma - 1) * 100).toFixed(2)}%`, direction: spyPrice > spy50dma ? "up" : "down", interpretation: spyPrice > spy50dma ? "healthy" : "weakening" },
      { label: "SPY vs 200d MA", value: `${((spyPrice / spy200dma - 1) * 100).toFixed(2)}%`, direction: spyPrice > spy200dma ? "up" : "down", interpretation: spyPrice > spy200dma ? "bullish" : "bearish" },
      { label: "QQQ vs 50d MA", value: `${((qqqPrice / qqq50dma - 1) * 100).toFixed(2)}%`, direction: qqqPrice > qqq50dma ? "up" : "down", interpretation: qqqPrice > qqq50dma ? "healthy" : "weakening" },
      { label: "SPY 14d RSI", value: spyRsi14.toFixed(1), direction: spyRsi14 > 50 ? "up" : "down", interpretation: spyRsi14 > 70 ? "elevated" : spyRsi14 < 30 ? "risk-off" : "neutral" },
      { label: "Regime", value: regime.toUpperCase(), direction: regime === "uptrend" ? "up" : regime === "downtrend" ? "down" : "neutral", interpretation: regime === "uptrend" ? "bullish" : regime === "downtrend" ? "bearish" : "neutral" },
    ],
  };
}

function scoreBreadth(data: RawMarketData): CategoryScore {
  // Estimate breadth from sector participation
  const { sectors, spyPrice, spy50dma, spy200dma } = data;
  
  const positiveCount = sectors.filter(s => s.changesPercentage > 0).length;
  const totalSectors = sectors.length;
  const advDeclineRatio = positiveCount / Math.max(totalSectors - positiveCount, 1);
  
  let score = 0;
  
  // Sector participation (max 40 pts)
  const pctPositive = positiveCount / totalSectors;
  score += Math.round(pctPositive * 40);
  
  // A/D ratio estimate (max 25 pts)
  if (advDeclineRatio > 2) score += 25;
  else if (advDeclineRatio > 1.5) score += 20;
  else if (advDeclineRatio > 1) score += 12;
  else if (advDeclineRatio > 0.7) score += 6;
  
  // SPY above key MAs as breadth proxy (max 20 pts)
  if (spyPrice > spy200dma) score += 10;
  if (spyPrice > spy50dma) score += 10;
  
  // Spread of sector returns - tight = healthy breadth (max 15 pts)
  const returns = sectors.map(s => s.changesPercentage);
  const maxRet = Math.max(...returns);
  const minRet = Math.min(...returns);
  const spread = maxRet - minRet;
  if (spread < 1.5) score += 15;
  else if (spread < 3) score += 10;
  else if (spread < 5) score += 5;
  
  score = clamp(score, 0, 100);

  const interpretation = score >= 70 ? "Broad participation, healthy breadth"
    : score >= 40 ? "Narrowing breadth, selective"
    : "Poor breadth, risk-off";

  return {
    name: "Breadth",
    score,
    weight: 0.20,
    weightedScore: score * 0.20,
    interpretation,
    details: [
      { label: "Sectors Positive", value: `${positiveCount}/${totalSectors}`, direction: pctPositive > 0.5 ? "up" : "down", interpretation: pctPositive > 0.7 ? "healthy" : pctPositive > 0.4 ? "weakening" : "risk-off" },
      { label: "Adv/Dec Ratio", value: advDeclineRatio.toFixed(2), direction: advDeclineRatio > 1 ? "up" : "down", interpretation: advDeclineRatio > 1.5 ? "healthy" : advDeclineRatio > 0.8 ? "neutral" : "weakening" },
      { label: "Sector Spread", value: `${spread.toFixed(2)}%`, direction: spread < 2 ? "down" : "up", interpretation: spread < 2 ? "healthy" : spread < 4 ? "moderate" : "risk-off" },
    ],
  };
}

function scoreMomentum(data: RawMarketData): CategoryScore {
  const { sectors, spyChangesPct } = data;
  
  const sorted = [...sectors].sort((a, b) => b.changesPercentage - a.changesPercentage);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3);
  const top3Avg = top3.reduce((s, x) => s + x.changesPercentage, 0) / 3;
  const bot3Avg = bottom3.reduce((s, x) => s + x.changesPercentage, 0) / 3;
  const relStrengthSpread = top3Avg - bot3Avg;
  
  let score = 0;
  
  // Top 3 performance (max 30 pts)
  if (top3Avg > 1) score += 30;
  else if (top3Avg > 0.5) score += 22;
  else if (top3Avg > 0) score += 15;
  else score += 5;
  
  // Relative strength spread (max 25 pts): tighter = better breadth momentum
  if (relStrengthSpread < 1.5) score += 25;
  else if (relStrengthSpread < 3) score += 18;
  else if (relStrengthSpread < 5) score += 10;
  else score += 3;
  
  // Overall market direction (max 25 pts)
  if (spyChangesPct > 1) score += 25;
  else if (spyChangesPct > 0.3) score += 20;
  else if (spyChangesPct > 0) score += 15;
  else if (spyChangesPct > -0.5) score += 8;
  else score += 2;
  
  // Number of sectors outperforming (max 20 pts)
  const outperformingCount = sectors.filter(s => s.changesPercentage > spyChangesPct).length;
  score += Math.round((outperformingCount / sectors.length) * 20);
  
  score = clamp(score, 0, 100);

  const interpretation = score >= 70 ? "Strong broad-based momentum"
    : score >= 40 ? "Selective momentum, narrow leadership"
    : "Weak momentum, defensive";

  return {
    name: "Momentum",
    score,
    weight: 0.25,
    weightedScore: score * 0.25,
    interpretation,
    details: [
      { label: "Top 3 Avg", value: `${top3Avg > 0 ? '+' : ''}${top3Avg.toFixed(2)}%`, direction: top3Avg > 0 ? "up" : "down", interpretation: top3Avg > 0.5 ? "bullish" : top3Avg > 0 ? "neutral" : "bearish" },
      { label: "Bottom 3 Avg", value: `${bot3Avg > 0 ? '+' : ''}${bot3Avg.toFixed(2)}%`, direction: bot3Avg > 0 ? "up" : "down", interpretation: bot3Avg > -0.5 ? "neutral" : "weakening" },
      { label: "RS Spread", value: `${relStrengthSpread.toFixed(2)}%`, direction: relStrengthSpread < 2 ? "down" : "up", interpretation: relStrengthSpread < 2 ? "healthy" : relStrengthSpread < 4 ? "moderate" : "risk-off" },
      { label: "Leaders", value: top3.map(s => s.symbol).join(", "), direction: "up", interpretation: "bullish" },
      { label: "Laggards", value: bottom3.map(s => s.symbol).join(", "), direction: "down", interpretation: "bearish" },
    ],
  };
}

function scoreMacro(data: RawMarketData): CategoryScore {
  const { tnxLevel, tnxPrevClose, dxyLevel, dxyPrevClose } = data;
  
  let score = 50; // start neutral
  
  const tnxChange = tnxLevel - tnxPrevClose;
  const dxyChange = dxyLevel - dxyPrevClose;
  
  // 10Y yield level (max +/- 20 pts)
  if (tnxLevel < 3.5) score += 15;
  else if (tnxLevel < 4.0) score += 10;
  else if (tnxLevel < 4.5) score += 0;
  else if (tnxLevel < 5.0) score -= 10;
  else score -= 20;
  
  // Yield trend
  if (tnxChange > 0.05) score -= 10; // yields rising fast
  else if (tnxChange > 0) score -= 3;
  else if (tnxChange < -0.05) score += 10; // yields falling
  
  // Dollar strength
  if (dxyLevel > 105) score -= 8;
  else if (dxyLevel < 100) score += 5;
  
  if (dxyChange > 0.3) score -= 5;
  else if (dxyChange < -0.3) score += 5;
  
  // Fed stance estimate (based on yield level and trend)
  let fedStance = "neutral";
  if (tnxLevel > 4.5 && tnxChange > 0) fedStance = "hawkish";
  else if (tnxLevel < 3.8 && tnxChange < 0) fedStance = "dovish";
  
  // FOMC proximity check (hardcode next FOMC dates for 2026)
  const now = new Date();
  const fomcDates = [
    new Date("2026-01-28"), new Date("2026-03-18"), new Date("2026-05-06"),
    new Date("2026-06-17"), new Date("2026-07-29"), new Date("2026-09-16"),
    new Date("2026-11-04"), new Date("2026-12-16"),
  ];
  
  let fomcAlert: string | null = null;
  for (const fd of fomcDates) {
    const diffHours = (fd.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours >= -24 && diffHours <= 72) {
      if (diffHours >= -24 && diffHours <= 0) {
        fomcAlert = "FOMC DECISION TODAY";
        score -= 8;
      } else if (diffHours <= 24) {
        fomcAlert = "FOMC TOMORROW";
        score -= 5;
      } else {
        fomcAlert = `FOMC IN ${Math.ceil(diffHours / 24)} DAYS`;
        score -= 3;
      }
      break;
    }
  }
  
  score = clamp(score, 0, 100);

  const tnxTrend = tnxChange > 0.03 ? "rising" : tnxChange < -0.03 ? "falling" : "stable";
  const dxyTrend = dxyChange > 0.2 ? "strengthening" : dxyChange < -0.2 ? "weakening" : "stable";

  const interpretation = score >= 70 ? "Supportive macro backdrop"
    : score >= 40 ? "Mixed macro signals"
    : "Headwind macro environment";

  return {
    name: "Macro",
    score,
    weight: 0.10,
    weightedScore: score * 0.10,
    interpretation,
    details: [
      { label: "10Y Yield", value: `${tnxLevel.toFixed(2)}%`, direction: tnxChange > 0 ? "up" : tnxChange < 0 ? "down" : "neutral", interpretation: tnxLevel > 4.5 ? "risk-off" : tnxLevel < 3.5 ? "bullish" : "neutral" },
      { label: "10Y Trend", value: tnxTrend.toUpperCase(), direction: tnxChange > 0 ? "up" : tnxChange < 0 ? "down" : "neutral", interpretation: tnxTrend === "rising" ? "weakening" : tnxTrend === "falling" ? "healthy" : "neutral" },
      { label: "DXY", value: dxyLevel.toFixed(2), direction: dxyChange > 0 ? "up" : dxyChange < 0 ? "down" : "neutral", interpretation: dxyLevel > 105 ? "risk-off" : dxyLevel < 100 ? "bullish" : "neutral" },
      { label: "Fed Stance", value: fedStance.toUpperCase(), direction: fedStance === "hawkish" ? "up" : fedStance === "dovish" ? "down" : "neutral", interpretation: fedStance === "hawkish" ? "risk-off" : fedStance === "dovish" ? "bullish" : "neutral" },
      ...(fomcAlert ? [{ label: "FOMC Alert", value: fomcAlert, direction: "neutral" as const, interpretation: "elevated" as const }] : []),
    ],
  };
}

function scoreExecutionWindow(data: RawMarketData): number {
  const { sectors, spyChangesPct, vixLevel, vix5dSlope, spyRsi14 } = data;
  
  let score = 50;
  
  // Are breakouts holding? Proxy: SPY daily range relative to change
  const spyRange = Math.abs(spyChangesPct);
  if (spyChangesPct > 0 && spyRange < 1.5) score += 15; // clean green day
  else if (spyChangesPct > 0) score += 8;
  else if (spyChangesPct > -0.5) score += 3;
  else score -= 10;
  
  // Multi-day follow-through proxy: VIX declining means buyers stepping in
  if (vix5dSlope < -1) score += 15;
  else if (vix5dSlope < 0) score += 8;
  else if (vix5dSlope > 2) score -= 15;
  
  // Pullbacks being bought: RSI in healthy range
  if (spyRsi14 >= 45 && spyRsi14 <= 65) score += 12;
  else if (spyRsi14 >= 35 && spyRsi14 <= 75) score += 5;
  
  // Sector follow-through
  const strongSectors = sectors.filter(s => s.changesPercentage > 0.5).length;
  score += strongSectors * 2;
  
  // Low VIX helps execution
  if (vixLevel < 16) score += 8;
  else if (vixLevel < 20) score += 4;
  else if (vixLevel > 28) score -= 10;
  
  return clamp(score, 0, 100);
}

export function computeDashboard(data: RawMarketData, mode: "swing" | "day" = "swing"): DashboardData {
  const volatility = scoreVolatility(data);
  const trend = scoreTrend(data);
  const breadth = scoreBreadth(data);
  const momentum = scoreMomentum(data);
  const macro = scoreMacro(data);
  
  const categories = [volatility, trend, breadth, momentum, macro];
  
  let marketQualityScore = Math.round(
    categories.reduce((sum, c) => sum + c.weightedScore, 0)
  );
  
  // Day trading mode adjusts thresholds tighter
  if (mode === "day") {
    // Day trading penalizes high VIX more, rewards tight ranges
    if (data.vixLevel > 22) marketQualityScore -= 5;
    if (Math.abs(data.spyChangesPct) > 2) marketQualityScore -= 3;
  }
  
  marketQualityScore = clamp(marketQualityScore, 0, 100);
  
  const executionWindowScore = scoreExecutionWindow(data);
  
  // Decision
  let decision: "YES" | "CAUTION" | "NO";
  if (marketQualityScore >= 80) decision = "YES";
  else if (marketQualityScore >= 60) decision = "CAUTION";
  else decision = "NO";
  
  // Regime
  const trendScore = trend.score;
  let regime = "CHOP";
  if (trendScore >= 65) regime = "UPTREND";
  else if (trendScore <= 30) regime = "DOWNTREND";
  
  // Alert banner
  const macroDetails = macro.details;
  const fomcDetail = macroDetails.find(d => d.label === "FOMC Alert");
  let alertBanner = fomcDetail ? fomcDetail.value : null;
  if (data.vixLevel > 30 && !alertBanner) alertBanner = "EXTREME VOLATILITY — VIX > 30";
  
  // Summary generation
  const summary = generateSummary(decision, marketQualityScore, executionWindowScore, regime, categories, data);
  
  const tnxChange = data.tnxLevel - data.tnxPrevClose;
  const dxyChange = data.dxyLevel - data.dxyPrevClose;
  
  return {
    decision,
    marketQualityScore,
    executionWindowScore,
    summary,
    categories,
    sectors: data.sectors,
    tickers: data.allTickers,
    regime,
    mode,
    alertBanner,
    lastUpdated: new Date().toISOString(),
    spy20dma: data.spy20dma,
    spy50dma: data.spy50dma,
    spy200dma: data.spy200dma,
    qqq50dma: data.qqq50dma,
    spyRsi14: data.spyRsi14,
    vixLevel: data.vixLevel,
    vix5dSlope: data.vix5dSlope,
    vixPercentile: data.vixPercentile,
    tnxLevel: data.tnxLevel,
    tnxTrend: tnxChange > 0.03 ? "rising" : tnxChange < -0.03 ? "falling" : "stable",
    dxyLevel: data.dxyLevel,
    dxyTrend: dxyChange > 0.2 ? "strengthening" : dxyChange < -0.2 ? "weakening" : "stable",
    fedStance: data.tnxLevel > 4.5 ? "hawkish" : data.tnxLevel < 3.8 ? "dovish" : "neutral",
  };
}

function generateSummary(
  decision: string,
  mqScore: number,
  ewScore: number,
  regime: string,
  categories: CategoryScore[],
  data: RawMarketData,
): string {
  const volScore = categories[0].score;
  const trendS = categories[1].score;
  const breadthS = categories[2].score;
  const momS = categories[3].score;
  
  const sorted = [...data.sectors].sort((a, b) => b.changesPercentage - a.changesPercentage);
  const leaders = sorted.slice(0, 2).map(s => s.name.replace(/State Street |Select Sector SPDR ETF| Select Sector SPDR ETF/g, '').trim());
  
  let summary = "";
  
  if (decision === "YES") {
    summary = `Strong trading environment. ${regime === "UPTREND" ? "The market is in a confirmed uptrend" : "Conditions are favorable"} with ${volScore >= 70 ? "low" : "manageable"} volatility (VIX ${data.vixLevel.toFixed(2)}).`;
    summary += ` Breadth is ${breadthS >= 70 ? "expanding" : "adequate"} and momentum is ${momS >= 70 ? "broad-based" : "selective"}.`;
    summary += ` Sector leadership in ${leaders.join(" and ")}. Full position sizing, press risk on A+ setups.`;
  } else if (decision === "CAUTION") {
    summary = `Mixed signals — proceed with discipline. ${regime === "CHOP" ? "Market is in a choppy range" : regime === "UPTREND" ? "Uptrend intact but showing fatigue" : "Downtrend pressure present"}.`;
    summary += ` VIX at ${data.vixLevel.toFixed(2)} ${volScore >= 50 ? "is manageable" : "is elevated"}.`;
    summary += ` ${breadthS >= 50 ? "Breadth holding" : "Breadth narrowing"}, ${momS >= 50 ? "selective momentum available" : "momentum fading"}.`;
    summary += ` Half size only. A+ setups only. Tight risk management.`;
  } else {
    summary = `Defensive posture recommended. ${regime === "DOWNTREND" ? "Market is in a confirmed downtrend" : "Conditions are deteriorating"} with ${volScore < 30 ? "extreme" : "high"} volatility (VIX ${data.vixLevel.toFixed(2)}).`;
    summary += ` ${breadthS < 30 ? "Breadth is poor" : "Breadth is narrowing"} and ${momS < 30 ? "momentum is absent" : "momentum is fading"}.`;
    summary += ` Avoid new positions. Preserve capital. Wait for conditions to improve.`;
  }
  
  if (ewScore >= 70) {
    summary += ` Execution window is strong — setups are following through.`;
  } else if (ewScore < 40) {
    summary += ` Execution window is weak — breakouts failing, pullbacks not being bought.`;
  }
  
  return summary;
}

// Build RawMarketData from the actual fetched market data
export function buildRawDataFromQuotes(
  quotes: Record<string, any>,
  spyHistory: number[],
  qqqHistory: number[],
  vixHistory: number[],
): RawMarketData {
  const spy = quotes["SPY"];
  const qqq = quotes["QQQ"];
  const vix = quotes["^VIX"];
  const tnx = quotes["^TNX"];
  const dxy = quotes["DX-Y.NYB"];
  
  // Calculate MAs from history
  const spy20dma = average(spyHistory.slice(-20));
  const spy50dma = average(spyHistory.slice(-50));
  const spy200dma = average(spyHistory.slice(-200));
  const qqq50dma = average(qqqHistory.slice(-50));
  
  // RSI
  const spyRsi14 = calculateRSI(spyHistory, 14);
  
  // VIX stats
  const vix5d = vixHistory.slice(-5);
  const vix5dSlope = vix5d.length >= 2 ? (vix5d[vix5d.length - 1] - vix5d[0]) / vix5d.length : 0;
  const vixSorted = [...vixHistory].sort((a, b) => a - b);
  const vixPercentile = (vixSorted.findIndex(v => v >= vix.price) / vixSorted.length) * 100;
  
  // Sector data
  const sectorSymbols = ["XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "XLRE", "XLC"];
  const sectorNames: Record<string, string> = {
    XLK: "Technology", XLF: "Financials", XLE: "Energy", XLV: "Healthcare",
    XLI: "Industrials", XLY: "Cons. Disc.", XLP: "Cons. Staples",
    XLU: "Utilities", XLB: "Materials", XLRE: "Real Estate", XLC: "Communication",
  };
  
  const sectors: SectorData[] = sectorSymbols.map(sym => ({
    symbol: sym,
    name: sectorNames[sym] || sym,
    changesPercentage: quotes[sym]?.changesPercentage || 0,
    price: quotes[sym]?.price || 0,
  }));
  
  const allTickerSymbols = ["SPY", "QQQ", "^VIX", "DX-Y.NYB", "^TNX", ...sectorSymbols];
  const allTickers = allTickerSymbols.map(sym => ({
    symbol: sym,
    name: quotes[sym]?.name || sym,
    price: quotes[sym]?.price || 0,
    change: quotes[sym]?.change || 0,
    changesPercentage: quotes[sym]?.changesPercentage || 0,
    previousClose: quotes[sym]?.previousClose || 0,
    dayLow: quotes[sym]?.dayLow || 0,
    dayHigh: quotes[sym]?.dayHigh || 0,
    volume: quotes[sym]?.volume || 0,
    avgVolume: quotes[sym]?.avgVolume || 0,
  }));
  
  return {
    spyPrice: spy.price,
    spyPrevClose: spy.previousClose,
    spyChange: spy.change,
    spyChangesPct: spy.changesPercentage,
    qqqPrice: qqq.price,
    qqqPrevClose: qqq.previousClose,
    qqqChange: qqq.change,
    qqqChangesPct: qqq.changesPercentage,
    vixLevel: vix.price,
    vixPrevClose: vix.previousClose,
    vixChange: vix.change,
    tnxLevel: tnx.price,
    tnxPrevClose: tnx.previousClose,
    dxyLevel: dxy.price,
    dxyPrevClose: dxy.previousClose,
    spy20dma,
    spy50dma,
    spy200dma,
    qqq50dma,
    spyRsi14,
    vix5dSlope,
    vixPercentile,
    sectors,
    allTickers,
  };
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const recentChanges = changes.slice(-period);
  let gains = 0, losses = 0;
  for (const c of recentChanges) {
    if (c > 0) gains += c;
    else losses += Math.abs(c);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
