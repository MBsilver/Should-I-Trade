import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useMemo } from "react";
import type { DashboardData, CategoryScore, SectorData, TickerQuote } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

// --- Utility ---
function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function directionArrow(dir: string): string {
  if (dir === "up") return "▲";
  if (dir === "down") return "▼";
  return "►";
}

function interpretationColor(interp: string): string {
  const green = ["healthy", "bullish", "low"];
  const red = ["risk-off", "bearish", "elevated"];
  const amber = ["weakening", "moderate"];
  if (green.includes(interp)) return "text-terminal-green";
  if (red.includes(interp)) return "text-terminal-red";
  if (amber.includes(interp)) return "text-terminal-amber";
  return "text-muted-foreground";
}

// --- Loading Skeleton ---
function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="h-10 skeleton mb-4 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-1 h-64 skeleton" />
        <div className="lg:col-span-2 h-64 skeleton" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-48 skeleton" />)}
      </div>
      <div className="h-32 skeleton mb-4" />
      <div className="h-48 skeleton" />
    </div>
  );
}

// --- Ticker Bar ---
function TickerBar({ tickers }: { tickers: TickerQuote[] }) {
  const displayNames: Record<string, string> = {
    "^VIX": "VIX", "^TNX": "TNX", "DX-Y.NYB": "DXY",
  };

  const items = tickers.map(t => ({
    symbol: displayNames[t.symbol] || t.symbol,
    price: t.price,
    change: t.changesPercentage,
  }));

  return (
    <div className="overflow-hidden whitespace-nowrap border-b border-border bg-card" data-testid="ticker-bar">
      <div className="ticker-scroll inline-flex gap-0">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-4 py-1.5 text-xs">
            <span className="text-muted-foreground font-medium">{item.symbol}</span>
            <span className="text-foreground">{formatNum(item.price)}</span>
            <span className={item.change >= 0 ? "text-terminal-green" : "text-terminal-red"}>
              {item.change >= 0 ? "+" : ""}{formatNum(item.change)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Refresh interval type ---
type RefreshInterval = "15min" | "off";

// --- Top Header ---
function TopBar({ lastUpdated, onRefresh, mode, onModeChange, isRefreshing, refreshInterval, onRefreshIntervalChange, dataSource }: {
  lastUpdated: string;
  onRefresh: () => void;
  mode: "swing" | "day";
  onModeChange: (m: "swing" | "day") => void;
  isRefreshing: boolean;
  refreshInterval: RefreshInterval;
  onRefreshIntervalChange: (r: RefreshInterval) => void;
  dataSource?: "live" | "stale" | "seed";
}) {
  const [ago, setAgo] = useState(timeAgo(lastUpdated));
  useEffect(() => {
    setAgo(timeAgo(lastUpdated));
    const iv = setInterval(() => setAgo(timeAgo(lastUpdated)), 5000);
    return () => clearInterval(iv);
  }, [lastUpdated]);

  const statusColor = dataSource === "live"
    ? "bg-terminal-green"
    : dataSource === "stale"
    ? "bg-terminal-amber"
    : "bg-terminal-dim";
  const statusTextColor = dataSource === "live"
    ? "text-terminal-green"
    : dataSource === "stale"
    ? "text-terminal-amber"
    : "text-terminal-dim";
  const statusLabel = isRefreshing
    ? "UPDATING"
    : dataSource === "live"
    ? "LIVE"
    : dataSource === "stale"
    ? "CACHED"
    : "SEED";

  return (
    <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-border bg-card gap-2" data-testid="top-bar">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", statusColor, dataSource === "live" && !isRefreshing && "pulse-green")} />
          <span className={cn("text-[10px] font-medium tracking-wider uppercase", statusTextColor)}>
            {statusLabel}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Updated {ago}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Auto-Refresh Toggle */}
        <div className="flex items-center border border-border rounded text-[10px]" data-testid="refresh-toggle">
          <button
            onClick={() => onRefreshIntervalChange("15min")}
            className={cn(
              "px-2 py-1 transition-colors",
              refreshInterval === "15min" ? "bg-terminal-cyan/15 text-terminal-cyan" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="refresh-15min"
          >
            15 MIN
          </button>
          <button
            onClick={() => onRefreshIntervalChange("off")}
            className={cn(
              "px-2 py-1 transition-colors",
              refreshInterval === "off" ? "bg-terminal-red/15 text-terminal-red" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="refresh-off"
          >
            OFF
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center border border-border rounded text-[10px]" data-testid="mode-toggle">
          <button
            onClick={() => onModeChange("swing")}
            className={cn(
              "px-3 py-1 transition-colors",
              mode === "swing" ? "bg-terminal-green/15 text-terminal-green" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="mode-swing"
          >
            SWING
          </button>
          <button
            onClick={() => onModeChange("day")}
            className={cn(
              "px-3 py-1 transition-colors",
              mode === "day" ? "bg-terminal-amber/15 text-terminal-amber" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="mode-day"
          >
            DAY
          </button>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={cn(
            "text-[10px] border border-border rounded px-3 py-1 transition-colors",
            isRefreshing
              ? "text-terminal-dim cursor-not-allowed"
              : "text-muted-foreground hover:text-terminal-cyan hover:border-terminal-cyan/30"
          )}
          data-testid="refresh-button"
        >
          {isRefreshing ? "↻ ..." : "↻ REFRESH"}
        </button>
      </div>
    </div>
  );
}

// --- Alert Banner ---
function AlertBanner({ message }: { message: string }) {
  return (
    <div className="bg-terminal-amber/10 border-b border-terminal-amber/30 px-4 py-1.5 alert-flash" data-testid="alert-banner">
      <span className="text-terminal-amber text-[11px] font-medium tracking-wider">
        ⚠ {message}
      </span>
    </div>
  );
}

// --- Score Circle ---
function ScoreCircle({ score, size = 160, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  
  const color = score >= 80 ? "#00d26a" : score >= 60 ? "#ffa502" : "#ff4757";
  const fontSize = size >= 120 ? "text-2xl" : "text-lg";

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} data-testid="score-circle">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="hsl(220, 20%, 12%)" strokeWidth="5" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth="5" fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn(fontSize, "font-bold")} style={{ color }}>{score}%</span>
        <span className="text-[8px] text-muted-foreground uppercase tracking-widest mt-0.5 text-center leading-tight px-2">{label}</span>
      </div>
    </div>
  );
}

// --- Hero Decision Panel ---
function HeroPanel({ data }: { data: DashboardData }) {
  const decisionColors = {
    YES: { bg: "bg-terminal-green/10", border: "border-terminal-green/40", text: "text-terminal-green", label: "FULL SIZE — PRESS RISK" },
    CAUTION: { bg: "bg-terminal-amber/10", border: "border-terminal-amber/40", text: "text-terminal-amber", label: "HALF SIZE — A+ SETUPS ONLY" },
    NO: { bg: "bg-terminal-red/10", border: "border-terminal-red/40", text: "text-terminal-red", label: "AVOID — PRESERVE CAPITAL" },
  };

  const dc = decisionColors[data.decision];

  return (
    <div className={cn("border rounded-sm p-6", dc.border, dc.bg)} data-testid="hero-panel">
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-3">
        Should I Be Trading?
      </div>
      
      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Decision Badge */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={cn("text-5xl lg:text-6xl font-black tracking-tight", dc.text)} data-testid="decision-badge">
            {data.decision}
          </div>
          <div className={cn("text-[10px] mt-2 font-medium tracking-wider", dc.text)}>
            {dc.label}
          </div>
        </div>

        {/* Score Circles */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <ScoreCircle score={data.marketQualityScore} size={120} label="MARKET QUALITY" />
          <ScoreCircle score={data.executionWindowScore} size={96} label="EXECUTION" />
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-2">
            Terminal Analysis
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed" data-testid="summary-text">
            {data.summary}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[10px]">
            <span className="text-muted-foreground">REGIME:</span>
            <span className={cn(
              "font-medium",
              data.regime === "UPTREND" ? "text-terminal-green" : data.regime === "DOWNTREND" ? "text-terminal-red" : "text-terminal-amber"
            )}>
              {data.regime}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">VIX:</span>
            <span className={data.vixLevel > 25 ? "text-terminal-red" : data.vixLevel > 18 ? "text-terminal-amber" : "text-terminal-green"}>
              {data.vixLevel.toFixed(2)}
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">RSI:</span>
            <span className="text-foreground">{data.spyRsi14.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Category Panel ---
function CategoryPanel({ category }: { category: CategoryScore }) {
  const scoreColor = category.score >= 70 ? "text-terminal-green" : category.score >= 40 ? "text-terminal-amber" : "text-terminal-red";
  const barColor = category.score >= 70 ? "bg-terminal-green" : category.score >= 40 ? "bg-terminal-amber" : "bg-terminal-red";
  
  return (
    <div className="border border-border rounded-sm bg-card p-3" data-testid={`panel-${category.name.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-medium">
          {category.name}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn("text-lg font-bold", scoreColor)}>{category.score}</span>
          <span className="text-[9px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      
      {/* Score bar */}
      <div className="h-1 bg-muted rounded-full mb-3 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barColor)}
          style={{ width: `${category.score}%` }}
        />
      </div>
      
      <div className="text-[10px] text-foreground/60 mb-2 italic">
        {category.interpretation}
      </div>
      
      {/* Details */}
      <div className="space-y-1">
        {category.details.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground truncate mr-2">{d.label}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={cn("text-[10px]", d.direction === "up" ? "text-terminal-green" : d.direction === "down" ? "text-terminal-red" : "text-terminal-dim")}>
                {directionArrow(d.direction)}
              </span>
              <span className="text-foreground font-medium">{d.value}</span>
              <span className={cn("text-[9px] px-1 rounded", interpretationColor(d.interpretation))}>
                {d.interpretation.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Weight */}
      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>WEIGHT: {(category.weight * 100).toFixed(0)}%</span>
        <span>CONTRIB: {category.weightedScore.toFixed(1)} pts</span>
      </div>
    </div>
  );
}

// --- Sector Heatmap ---
function SectorHeatmap({ sectors }: { sectors: SectorData[] }) {
  const sorted = useMemo(() => [...sectors].sort((a, b) => b.changesPercentage - a.changesPercentage), [sectors]);
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.changesPercentage)), 0.01);
  
  return (
    <div className="border border-border rounded-sm bg-card p-3" data-testid="sector-heatmap">
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-3 font-medium">
        Sector Performance
      </div>
      <div className="space-y-1">
        {sorted.map(s => {
          const pct = s.changesPercentage;
          const width = Math.min(Math.abs(pct) / maxAbs * 100, 100);
          const isPos = pct >= 0;
          
          return (
            <div key={s.symbol} className="flex items-center gap-2 text-[11px]">
              <span className="w-10 text-muted-foreground flex-shrink-0">{s.symbol}</span>
              <span className="w-24 text-foreground/70 truncate flex-shrink-0 text-[10px]">{s.name}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-sm transition-all duration-500",
                    isPos ? "bg-terminal-green/40" : "bg-terminal-red/40"
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={cn("w-16 text-right flex-shrink-0 font-medium", isPos ? "text-terminal-green" : "text-terminal-red")}>
                {isPos ? "+" : ""}{formatNum(pct)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Scoring Breakdown ---
function ScoringBreakdown({ categories, totalScore }: { categories: CategoryScore[]; totalScore: number }) {
  const totalColor = totalScore >= 80 ? "text-terminal-green" : totalScore >= 60 ? "text-terminal-amber" : "text-terminal-red";
  
  return (
    <div className="border border-border rounded-sm bg-card p-3" data-testid="scoring-breakdown">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-medium">
          Scoring Breakdown
        </span>
        <div className="flex items-center gap-1">
          <span className={cn("text-lg font-bold", totalColor)}>{totalScore}</span>
          <span className="text-[9px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      
      <div className="space-y-2">
        {categories.map(cat => {
          const color = cat.score >= 70 ? "bg-terminal-green" : cat.score >= 40 ? "bg-terminal-amber" : "bg-terminal-red";
          return (
            <div key={cat.name} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 text-muted-foreground flex-shrink-0">{cat.name}</span>
              <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
                <div className={cn("h-full rounded-sm", color)} style={{ width: `${cat.score}%` }} />
              </div>
              <span className="w-8 text-right text-foreground font-medium">{cat.score}</span>
              <span className="w-12 text-right text-muted-foreground text-[9px]">
                ×{(cat.weight * 100).toFixed(0)}%
              </span>
              <span className="w-10 text-right text-foreground/80 text-[10px]">
                = {cat.weightedScore.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">TOTAL (WEIGHTED)</span>
        <span className={cn("font-bold", totalColor)}>{totalScore} / 100</span>
      </div>
    </div>
  );
}

// --- Key Levels Panel ---
function KeyLevels({ data }: { data: DashboardData }) {
  const items = [
    { label: "SPY 20d MA", value: formatNum(data.spy20dma), above: data.tickers.find(t => t.symbol === "SPY")!.price > data.spy20dma },
    { label: "SPY 50d MA", value: formatNum(data.spy50dma), above: data.tickers.find(t => t.symbol === "SPY")!.price > data.spy50dma },
    { label: "SPY 200d MA", value: formatNum(data.spy200dma), above: data.tickers.find(t => t.symbol === "SPY")!.price > data.spy200dma },
    { label: "QQQ 50d MA", value: formatNum(data.qqq50dma), above: data.tickers.find(t => t.symbol === "QQQ")!.price > data.qqq50dma },
  ];

  return (
    <div className="border border-border rounded-sm bg-card p-3" data-testid="key-levels">
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mb-3 font-medium">
        Key Levels
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between text-[11px] px-2 py-1.5 bg-muted/20 rounded-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-foreground font-medium">{item.value}</span>
              <span className={cn("text-[9px] px-1 rounded font-medium", item.above ? "text-terminal-green" : "text-terminal-red")}>
                {item.above ? "ABOVE" : "BELOW"}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="text-center px-2 py-1.5 bg-muted/20 rounded-sm">
          <div className="text-[9px] text-muted-foreground mb-0.5">10Y YIELD</div>
          <div className="text-xs text-foreground font-medium">{data.tnxLevel.toFixed(2)}%</div>
          <div className={cn("text-[9px]", data.tnxTrend === "rising" ? "text-terminal-red" : data.tnxTrend === "falling" ? "text-terminal-green" : "text-terminal-dim")}>
            {data.tnxTrend.toUpperCase()}
          </div>
        </div>
        <div className="text-center px-2 py-1.5 bg-muted/20 rounded-sm">
          <div className="text-[9px] text-muted-foreground mb-0.5">DXY</div>
          <div className="text-xs text-foreground font-medium">{data.dxyLevel.toFixed(2)}</div>
          <div className={cn("text-[9px]", data.dxyTrend === "strengthening" ? "text-terminal-red" : data.dxyTrend === "weakening" ? "text-terminal-green" : "text-terminal-dim")}>
            {data.dxyTrend.toUpperCase()}
          </div>
        </div>
        <div className="text-center px-2 py-1.5 bg-muted/20 rounded-sm">
          <div className="text-[9px] text-muted-foreground mb-0.5">FED</div>
          <div className={cn("text-xs font-medium", data.fedStance === "hawkish" ? "text-terminal-red" : data.fedStance === "dovish" ? "text-terminal-green" : "text-terminal-amber")}>
            {data.fedStance.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Dashboard ---
const REFRESH_INTERVALS: Record<RefreshInterval, number | false> = {
  "15min": 15 * 60 * 1000, // 15 minutes
  "off": false,
};

export default function Dashboard() {
  const [mode, setMode] = useState<"swing" | "day">("swing");
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>("off");
  
  const { data, isLoading, isRefetching, refetch } = useQuery<DashboardData>({
    queryKey: [`/api/dashboard?mode=${mode}`],
    refetchInterval: REFRESH_INTERVALS[refreshInterval],
    staleTime: 20000,
  });
  
  const handleRefresh = async () => {
    // Force refresh bypasses server-side cache
    try {
      const res = await apiRequest("GET", `/api/dashboard?mode=${mode}&refresh=true`);
      const freshData = await res.json();
      // Manually update query cache
      const { queryClient } = await import("@/lib/queryClient");
      queryClient.setQueryData([`/api/dashboard?mode=${mode}`], freshData);
    } catch {
      refetch();
    }
  };
  
  const handleModeChange = (m: "swing" | "day") => {
    setMode(m);
  };
  
  const handleRefreshIntervalChange = (r: RefreshInterval) => {
    setRefreshInterval(r);
  };

  if (isLoading || !data) return <DashboardSkeleton />;

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="dashboard">
      {/* Ticker Bar */}
      <TickerBar tickers={data.tickers} />
      
      {/* Alert Banner */}
      {data.alertBanner && <AlertBanner message={data.alertBanner} />}
      
      {/* Top Bar */}
      <TopBar
        lastUpdated={data.lastUpdated}
        onRefresh={handleRefresh}
        mode={mode}
        onModeChange={handleModeChange}
        isRefreshing={isRefetching}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={handleRefreshIntervalChange}
        dataSource={data.dataSource}
      />
      
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4">
        {/* Hero Panel */}
        <HeroPanel data={data} />
        
        {/* Category Panels Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.categories.map(cat => (
            <CategoryPanel key={cat.name} category={cat} />
          ))}
        </div>
        
        {/* Bottom Grid: Sectors + Scoring + Key Levels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <SectorHeatmap sectors={data.sectors} />
          <ScoringBreakdown categories={data.categories} totalScore={data.marketQualityScore} />
          <KeyLevels data={data} />
        </div>
        
        {/* Footer */}
        <div className="pt-2 pb-8 flex flex-col sm:flex-row items-center justify-between text-[9px] text-muted-foreground border-t border-border/30">
          <div className="flex items-center gap-4 flex-wrap">
            <span>SHOULD I BE TRADING? v1.1</span>
            <span>|</span>
            <span>Yahoo Finance {data.dataSource === "live" ? "LIVE" : data.dataSource === "stale" ? "CACHED" : "SEED DATA"}</span>
            <span>|</span>
            <span>Auto: {refreshInterval === "off" ? "OFF" : "15 MIN"}</span>
            <span>|</span>
            <span>Mode: {mode.toUpperCase()}</span>
          </div>
          <PerplexityAttribution />
        </div>
      </div>
    </div>
  );
}
