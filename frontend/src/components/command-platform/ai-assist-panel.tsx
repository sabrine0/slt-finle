"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import {
  actionLabel,
  analyzeIntersection,
  congestionDotBg,
  congestionTone,
  fetchIntelligenceContext,
  fetchRecommendations,
  riskTone,
  sourceLabel,
  type AiRecommendation,
  type IntersectionIntelligenceContext,
  type StoredRecommendation,
} from "@/lib/traffic-intelligence-api";

/**
 * AI Assist panel — operator-facing surface for the STLS Traffic
 * Intelligence backend. Reads the fused context, runs an analysis on
 * demand, and shows recent recommendations. It NEVER applies the
 * recommendation itself: the "Apply via override" button hands off to
 * the existing reason-coded override flow, which is the only path
 * that can mutate the intersection.
 */

export interface AiApplyRequest {
  intersectionCode: string;
  recommendation: AiRecommendation;
}

interface AiAssistPanelProps {
  /** Intersection code (e.g. int-001) — this is the runtime id. */
  intersectionCode: string;
  intersectionName?: string;
  /** Invoked when the operator chooses "Apply via override" — caller
   * owns the reason modal + override endpoint call. */
  onRequestApply?: (request: AiApplyRequest) => void;
}

type Tab = "recommendation" | "context" | "history";

export function AiAssistPanel({
  intersectionCode,
  intersectionName,
  onRequestApply,
}: AiAssistPanelProps) {
  const [tab, setTab] = useState<Tab>("recommendation");
  const [ctx, setCtx] = useState<IntersectionIntelligenceContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);

  const [recommendation, setRecommendation] =
    useState<AiRecommendation | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [history, setHistory] = useState<StoredRecommendation[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [reasonHint, setReasonHint] = useState("");

  const loadContext = useCallback(async () => {
    setCtxLoading(true);
    try {
      const next = await fetchIntelligenceContext(intersectionCode);
      setCtx(next);
      setCtxError(null);
    } catch (error) {
      setCtx(null);
      setCtxError(
        error instanceof Error ? error.message : "Failed to load AI context",
      );
    } finally {
      setCtxLoading(false);
    }
  }, [intersectionCode]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const next = await fetchRecommendations(intersectionCode);
      setHistory(next);
      setHistoryError(null);
    } catch (error) {
      setHistory(null);
      setHistoryError(
        error instanceof Error ? error.message : "Failed to load history",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [intersectionCode]);

  useEffect(() => {
    setRecommendation(null);
    setAnalyzeError(null);
    setReasonHint("");
    void loadContext();
  }, [intersectionCode, loadContext]);

  useEffect(() => {
    if (tab !== "history") return;
    void loadHistory();
  }, [tab, loadHistory]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const next = await analyzeIntersection(intersectionCode, {
        reasonHint: reasonHint.trim() || undefined,
      });
      setRecommendation(next);
      // Also refresh context so the operator sees any new override
      // state produced during analysis.
      void loadContext();
      if (tab === "history") {
        void loadHistory();
      }
    } catch (error) {
      setAnalyzeError(
        error instanceof Error ? error.message : "Analysis failed",
      );
    } finally {
      setAnalyzing(false);
    }
  }, [intersectionCode, reasonHint, tab, loadContext, loadHistory]);

  return (
    <section className="border-t border-white/6 px-5 pb-5 pt-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-[#ffb547]">
            AI Assist
          </p>
          <p className="mt-0.5 text-[0.72rem] text-[#8fa39a]">
            Advisory only · every action requires operator approval
          </p>
        </div>
        <ContextModeBadge ctx={ctx} />
      </header>

      <div className="mt-3 flex items-center gap-1 rounded-[8px] border border-white/8 bg-[#0b1115] p-0.5">
        <TabButton active={tab === "recommendation"} onClick={() => setTab("recommendation")}>
          Recommendation
        </TabButton>
        <TabButton active={tab === "context"} onClick={() => setTab("context")}>
          Context
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          History
        </TabButton>
      </div>

      {tab === "recommendation" ? (
        <RecommendationTab
          intersectionCode={intersectionCode}
          intersectionName={intersectionName}
          ctx={ctx}
          ctxLoading={ctxLoading}
          ctxError={ctxError}
          recommendation={recommendation}
          analyzing={analyzing}
          analyzeError={analyzeError}
          reasonHint={reasonHint}
          onReasonHintChange={setReasonHint}
          onAnalyze={handleAnalyze}
          onRetryContext={() => void loadContext()}
          onRequestApply={onRequestApply}
        />
      ) : null}

      {tab === "context" ? (
        <ContextTab
          ctx={ctx}
          loading={ctxLoading}
          error={ctxError}
          onRetry={() => void loadContext()}
        />
      ) : null}

      {tab === "history" ? (
        <HistoryTab
          history={history}
          loading={historyLoading}
          error={historyError}
          onRetry={() => void loadHistory()}
          onRequestApply={onRequestApply}
          intersectionCode={intersectionCode}
        />
      ) : null}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex-1 rounded-[6px] px-2.5 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition",
        active
          ? "bg-[#14100a] text-[#ffb547] ring-1 ring-[#3c2e10]"
          : "text-[#8fa39a] hover:text-[#edf3ee]",
      )}
    >
      {children}
    </button>
  );
}

function ContextModeBadge({
  ctx,
}: {
  ctx: IntersectionIntelligenceContext | null;
}) {
  if (!ctx) {
    return (
      <span className="rounded-full border border-white/10 bg-[#0b1014] px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        …
      </span>
    );
  }
  const mode = ctx.aiControlMode;
  if (mode === "disabled") {
    return (
      <span className="rounded-full border border-white/10 bg-[#0b1014] px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        AI disabled
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em]",
        mode === "advisory"
          ? "border-[#5c4418] bg-[#141008] text-[#ffd089]"
          : "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]",
      )}
    >
      {mode === "advisory" ? "Advisory" : "Supervised"}
    </span>
  );
}

function GoogleTrafficBadge({
  ctx,
}: {
  ctx: IntersectionIntelligenceContext | null;
}) {
  if (!ctx) return null;
  const src = ctx.googleTraffic.source;
  const tone =
    src === "google"
      ? "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]"
      : src === "fallback"
        ? "border-[#5c4418] bg-[#141008] text-[#ffd089]"
        : "border-white/10 bg-[#0b1014] text-[#8fa39a]";
  const label =
    src === "google"
      ? "Google traffic · live"
      : src === "fallback"
        ? "Heuristic fallback"
        : "Traffic key disabled";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em]",
        tone,
      )}
    >
      <span aria-hidden className="h-1 w-1 rounded-full bg-current" />
      {label}
    </span>
  );
}

function RecommendationTab({
  intersectionCode,
  intersectionName,
  ctx,
  ctxLoading,
  ctxError,
  recommendation,
  analyzing,
  analyzeError,
  reasonHint,
  onReasonHintChange,
  onAnalyze,
  onRetryContext,
  onRequestApply,
}: {
  intersectionCode: string;
  intersectionName?: string;
  ctx: IntersectionIntelligenceContext | null;
  ctxLoading: boolean;
  ctxError: string | null;
  recommendation: AiRecommendation | null;
  analyzing: boolean;
  analyzeError: string | null;
  reasonHint: string;
  onReasonHintChange: (value: string) => void;
  onAnalyze: () => void;
  onRetryContext: () => void;
  onRequestApply?: (request: AiApplyRequest) => void;
}) {
  const disabled = ctx?.aiControlMode === "disabled";
  const applyable =
    recommendation != null &&
    recommendation.action !== "no_action" &&
    !!onRequestApply;

  return (
    <div className="mt-3 space-y-3">
      {ctxLoading ? (
        <LoadingRow label="Loading AI context…" />
      ) : ctxError ? (
        <ErrorRow message={ctxError} onRetry={onRetryContext} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <GoogleTrafficBadge ctx={ctx} />
          {ctx?.intersection?.systemMode === "real" ? (
            <span className="rounded-full border border-[#5a1d1d] bg-[#180d0d] px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#ff9a9a]">
              Real mode · manual apply only
            </span>
          ) : null}
          {ctx?.operator.manualOverride || ctx?.operator.modeOverride ? (
            <span className="rounded-full border border-[#5a1d1d] bg-[#180d0d] px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#ff9a9a]">
              Override active · AI suppressed
            </span>
          ) : null}
        </div>
      )}

      <label className="block">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
          Operator hint (optional)
        </span>
        <input
          type="text"
          value={reasonHint}
          onChange={(event) => onReasonHintChange(event.target.value)}
          placeholder="Eg. ambulance convoy northbound in 2 min"
          maxLength={200}
          disabled={disabled || analyzing}
          className="mt-1.5 w-full rounded-[8px] border border-white/10 bg-[#070b0e] px-3 py-2 text-[0.78rem] text-[#edf3ee] outline-none transition focus:border-[#ffb547] disabled:opacity-60"
        />
      </label>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={disabled || analyzing}
        className="w-full rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-4 py-2.5 text-[0.78rem] font-semibold uppercase tracking-[0.2em] text-[#120a02] shadow-[0_6px_18px_rgba(255,181,71,0.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
      >
        {analyzing ? "Analyzing…" : "Analyze traffic"}
      </button>

      {disabled ? (
        <p className="rounded-[8px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.72rem] text-[#8fa39a]">
          AI Assist is disabled on this server. Set{" "}
          <span className="font-mono text-[#c3cdc6]">AI_CONTROL_MODE</span> to
          <span className="font-mono text-[#c3cdc6]"> advisory</span> or{" "}
          <span className="font-mono text-[#c3cdc6]">supervised</span> to enable.
        </p>
      ) : null}

      {analyzeError ? <ErrorRow message={analyzeError} /> : null}

      {recommendation ? (
        <RecommendationCard
          recommendation={recommendation}
          intersectionCode={intersectionCode}
          intersectionName={intersectionName}
          onRequestApply={onRequestApply}
          applyable={applyable}
        />
      ) : !ctxLoading && !analyzing ? (
        <div className="rounded-[10px] border border-dashed border-white/10 bg-[#070b0e] px-3 py-4 text-center text-[0.72rem] text-[#8fa39a]">
          No recommendation yet — click <span className="font-semibold text-[#c3cdc6]">Analyze traffic</span> to ask the assistant.
        </div>
      ) : null}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  intersectionCode,
  intersectionName,
  onRequestApply,
  applyable,
}: {
  recommendation: AiRecommendation;
  intersectionCode: string;
  intersectionName?: string;
  onRequestApply?: (request: AiApplyRequest) => void;
  applyable: boolean;
}) {
  const confidencePct = Math.round(recommendation.confidence * 100);
  return (
    <article className="rounded-[12px] border border-white/8 bg-[#0a1014] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[8px] border border-[#3c2e10] bg-[#14100a] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547]">
          {actionLabel[recommendation.action]}
        </span>
        <span
          className={clsx(
            "rounded-[8px] border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em]",
            riskTone[recommendation.riskLevel],
          )}
        >
          Risk · {recommendation.riskLevel}
        </span>
        <span className="rounded-[8px] border border-white/10 bg-[#0b1014] px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6]">
          {sourceLabel[recommendation.source]}
        </span>
        {recommendation.requiresHumanApproval ? (
          <span className="ml-auto rounded-[8px] border border-[#5a1d1d] bg-[#180d0d] px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a]">
            Human approval required
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.72rem]">
        <KV label="Target phase" value={recommendation.targetPhaseId ?? "—"} mono />
        <KV
          label="Duration"
          value={
            recommendation.durationSeconds != null
              ? `${recommendation.durationSeconds}s`
              : "—"
          }
          mono
        />
        <KV label="Confidence" value={`${confidencePct}%`} mono />
        <KV label="Generated" value={formatRelative(recommendation.generatedAt)} />
      </dl>

      <div className="mt-3">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
          Reason
        </p>
        <p className="mt-1 text-[0.78rem] leading-5 text-[#edf3ee]">
          {recommendation.reason}
        </p>
      </div>

      {recommendation.safetyWarnings.length > 0 ? (
        <div className="mt-3 rounded-[8px] border border-[#5a1d1d]/60 bg-[#180d0d]/60 px-3 py-2">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#ff9a9a]">
            Safety notes
          </p>
          <ul className="mt-1 space-y-0.5 text-[0.7rem] text-[#ffb0b0]">
            {recommendation.safetyWarnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {onRequestApply ? (
        <button
          type="button"
          disabled={!applyable}
          onClick={() =>
            onRequestApply({
              intersectionCode,
              recommendation: {
                ...recommendation,
                intersectionId: intersectionName ?? intersectionCode,
              },
            })
          }
          className="mt-3 w-full rounded-[8px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recommendation.action === "no_action"
            ? "Nothing to apply"
            : "Apply via reason-coded override"}
        </button>
      ) : null}
    </article>
  );
}

function ContextTab({
  ctx,
  loading,
  error,
  onRetry,
}: {
  ctx: IntersectionIntelligenceContext | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <div className="mt-3"><LoadingRow label="Loading AI context…" /></div>;
  if (error) return <div className="mt-3"><ErrorRow message={error} onRetry={onRetry} /></div>;
  if (!ctx) return null;

  const corridors = ctx.googleTraffic.corridors;
  const runtimeState = ctx.runtimeState;

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-[10px] border border-white/8 bg-[#0a1014] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
            Google traffic
          </p>
          <GoogleTrafficBadge ctx={ctx} />
        </div>
        {ctx.googleTraffic.note ? (
          <p className="mt-1 text-[0.66rem] italic text-[#8fa39a]">
            {ctx.googleTraffic.note}
          </p>
        ) : null}
        {corridors.length === 0 ? (
          <p className="mt-2 text-[0.72rem] text-[#8fa39a]">
            No corridor signal available.
          </p>
        ) : (
          <dl className="mt-2 grid grid-cols-4 gap-2 text-[0.68rem]">
            {corridors.map((corridor) => (
              <div
                key={corridor.label}
                className="rounded-[8px] border border-white/8 bg-[#070b0e] px-2 py-1.5"
              >
                <dt className="flex items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a]">
                  <span
                    className={clsx(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      congestionDotBg[corridor.congestionLevel],
                    )}
                  />
                  {corridor.label}
                </dt>
                <dd
                  className={clsx(
                    "mt-0.5 font-mono text-[0.72rem] font-semibold",
                    congestionTone[corridor.congestionLevel],
                  )}
                >
                  ×{corridor.delayFactor.toFixed(2)}
                </dd>
                <dd className="text-[0.58rem] uppercase tracking-[0.18em] text-[#6b7c74]">
                  {corridor.congestionLevel}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="rounded-[10px] border border-white/8 bg-[#0a1014] p-3">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
          Runtime state
        </p>
        {runtimeState ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[0.72rem]">
            <KV label="Active phase" value={runtimeState.activePhaseLabel} />
            <KV label="Phase state" value={runtimeState.phaseState} />
            <KV
              label="Cycle"
              value={`${runtimeState.cycleSecond}s / ${runtimeState.cycleSeconds}s`}
              mono
            />
            <KV
              label="Forced phase"
              value={runtimeState.commands.forcedPhaseId ?? "—"}
              mono
            />
            <KV
              label="Forced direction"
              value={runtimeState.commands.forcedDirection ?? "—"}
            />
            <KV
              label="Mode override"
              value={runtimeState.commands.modeOverride ?? "—"}
            />
          </dl>
        ) : (
          <p className="mt-2 text-[0.72rem] text-[#8fa39a]">
            Runtime state unavailable for this intersection.
          </p>
        )}
      </div>

      <div className="rounded-[10px] border border-white/8 bg-[#0a1014] p-3">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
          Operator override
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[0.72rem]">
          <KV
            label="Manual"
            value={ctx.operator.manualOverride ? "engaged" : "—"}
          />
          <KV
            label="Mode"
            value={ctx.operator.modeOverride ?? "—"}
          />
          <KV
            label="Forced direction"
            value={ctx.operator.forcedDirection ?? "—"}
          />
          <KV
            label="System mode"
            value={ctx.intersection?.systemMode ?? "—"}
          />
        </dl>
      </div>
    </div>
  );
}

function HistoryTab({
  history,
  loading,
  error,
  onRetry,
  onRequestApply,
  intersectionCode,
}: {
  history: StoredRecommendation[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRequestApply?: (request: AiApplyRequest) => void;
  intersectionCode: string;
}) {
  if (loading) return <div className="mt-3"><LoadingRow label="Loading history…" /></div>;
  if (error) return <div className="mt-3"><ErrorRow message={error} onRetry={onRetry} /></div>;
  if (!history || history.length === 0) {
    return (
      <div className="mt-3 rounded-[10px] border border-dashed border-white/10 bg-[#070b0e] px-3 py-4 text-center text-[0.72rem] text-[#8fa39a]">
        No recommendations recorded yet for this intersection.
      </div>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {history.map((entry) => (
        <li
          key={`${entry.generatedAt}-${entry.action}`}
          className="rounded-[10px] border border-white/8 bg-[#0a1014] p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[6px] border border-[#3c2e10] bg-[#14100a] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547]">
              {actionLabel[entry.action]}
            </span>
            <span
              className={clsx(
                "rounded-[6px] border px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.18em]",
                riskTone[entry.riskLevel],
              )}
            >
              {entry.riskLevel}
            </span>
            <span className="rounded-[6px] border border-white/10 bg-[#0b1014] px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6]">
              {sourceLabel[entry.source]}
            </span>
            <span className="ml-auto text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[#6b7c74]">
              {formatRelative(entry.generatedAt)}
            </span>
          </div>
          <p className="mt-2 text-[0.72rem] leading-5 text-[#edf3ee]">{entry.reason}</p>
          {entry.operatorHint ? (
            <p className="mt-1 text-[0.66rem] italic text-[#8fa39a]">
              operator hint: {entry.operatorHint}
            </p>
          ) : null}
          {entry.safetyWarnings.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[0.64rem] text-[#ff9a9a]">
              {entry.safetyWarnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          ) : null}
          {onRequestApply && entry.action !== "no_action" ? (
            <button
              type="button"
              onClick={() =>
                onRequestApply({
                  intersectionCode,
                  recommendation: entry,
                })
              }
              className="mt-2 rounded-[6px] border border-white/10 bg-[#0b1014] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
            >
              Re-apply via override
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-white/6 bg-[#070b0e] px-2.5 py-1.5">
      <dt className="text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-[#6b7c74]">
        {label}
      </dt>
      <dd
        className={clsx(
          "mt-0.5 font-semibold text-[#edf3ee]",
          mono ? "font-mono" : "",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-white/8 bg-[#070b0e] px-3 py-2 text-[0.72rem] text-[#8fa39a]">
      <span
        aria-hidden
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ffb547]"
      />
      {label}
    </div>
  );
}

function ErrorRow({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[#5a1d1d]/60 bg-[#180d0d]/60 px-3 py-2 text-[0.72rem] text-[#ff9a9a]">
      <span className="truncate">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-[6px] border border-[#5a1d1d] bg-[#180d0d] px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[#ff9a9a] transition hover:brightness-110"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function formatRelative(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = Date.now() - then;
  if (delta < 0) return "just now";
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
