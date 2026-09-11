"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import {
  AiAssistPanel,
  type AiApplyRequest,
} from "@/components/command-platform/ai-assist-panel";
import { IntersectionControls } from "@/components/command-platform/intersection-controls";
import type {
  CommandNetworkNode,
  CommandNetworkPredictionSummary,
} from "@/components/command-platform/network-types";
import {
  connectionStateLabel,
  formatCommandLabel,
  formatControllerType,
} from "@/lib/command-platform-format";
import type {
  DistrictChipInfo,
  SelectedAreaSummary,
} from "@/components/command-platform/types";
import {
  EmptyState,
  LoadingPulse,
  PanelSectionHeader,
  StatusBadge,
  connectionColor as connectionColorToken,
  flowToHealth,
  healthColor as healthColorToken,
} from "@/components/ui";
import type {
  HardwareSnapshot,
  IntersectionHealth,
  IntersectionMode,
  IntersectionSnapshot,
  OperatorDirection,
  TrafficFlowState,
} from "@/types/command-platform";
import type { PredictionRunResult } from "@/types/prediction";

interface SelectedAreaPanelProps {
  summary: SelectedAreaSummary;
  hardware?: HardwareSnapshot;
  graphNode?: CommandNetworkNode;
  linkedControllers: LinkedControllerSummary[];
  prediction?: PredictionRunResult | null;
  predictionLoading?: boolean;
  networkPrediction: CommandNetworkPredictionSummary[];
  networkPredictionLoading?: boolean;
  priorityIntersections: IntersectionSnapshot[];
  districts: DistrictChipInfo[];
  selectedIntersectionId?: string;
  onSelectIntersection: (intersectionId: string) => void;
  onSelectDistrict?: (districtId: string) => void;
  onSetOverride: (intersectionId: string, engaged: boolean) => Promise<void>;
  onSetForcedGreen: (
    intersectionId: string,
    direction: OperatorDirection | null,
  ) => Promise<void>;
  onSetMode: (
    intersectionId: string,
    mode: IntersectionMode,
    confirmed: boolean,
  ) => Promise<void>;
  onAiRequestApply?: (request: AiApplyRequest) => void;
}

interface LinkedControllerSummary {
  intersectionId: string;
  label: string;
  controllerId: string;
  relationKind: string;
  travelTimeSeconds: number | null;
  equipmentStatus: string;
  trafficState: TrafficFlowState;
}

// Reuse shared tokens — kept as local aliases so the rest of this
// file (and its existing helpers) keep working without churn.
const congestionTone = flowToHealth;
const toneColor = healthColorToken;
// connectionColorToken is consumed via <StatusBadge tone={state} /> now;
// keep a re-export here in case future legacy callsites need it.
void connectionColorToken;

export function SelectedAreaPanel({
  summary,
  hardware,
  graphNode,
  linkedControllers,
  prediction,
  predictionLoading = false,
  networkPrediction,
  networkPredictionLoading = false,
  priorityIntersections,
  districts,
  selectedIntersectionId,
  onSelectIntersection,
  onSelectDistrict,
  onSetOverride,
  onSetForcedGreen,
  onSetMode,
  onAiRequestApply,
}: SelectedAreaPanelProps) {
  const congestionTotal =
    summary.congestionMix.smooth +
    summary.congestionMix.pressure +
    summary.congestionMix.congestion;
  const dominantTone: IntersectionHealth = summary.dominantCongestion
    ? congestionTone[summary.dominantCongestion]
    : "healthy";
  const transitionKey = `${summary.level}:${summary.name}`;
  const weather = useScopeWeather(summary.center);

  return (
    <section
      key={transitionKey}
      className="stls-fade-slide flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-white/6 bg-[#0a1014]/95 shadow-[0_20px_40px_rgba(0,0,0,0.32)]"
    >
      <header className="border-b border-white/6 px-5 py-5">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.3em] text-[#8fa39a]">
          {summary.typeLabel}
        </p>
        <h2 className="mt-3 text-[1.7rem] font-semibold leading-tight tracking-tight text-[#f6faf5]">
          {summary.name}
        </h2>
        {summary.nameAr ? (
          <p dir="rtl" lang="ar" className="mt-1 text-[0.95rem] font-medium text-[#a9b6af]">
            {summary.nameAr}
          </p>
        ) : null}

        <div className="mt-4 flex items-start justify-between gap-4">
          <StatusBadge
            tone={dominantTone}
            size="md"
            label={summary.dominantCongestion ?? "idle"}
          />
          <ScopeWeatherInline weather={weather} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <MetricGrid summary={summary} />

        {congestionTotal > 0 ? (
          <div className="px-5 pb-5">
            <MixBar
              label="Congestion mix"
              segments={[
                { value: summary.congestionMix.smooth, color: toneColor.healthy, label: "Smooth" },
                { value: summary.congestionMix.pressure, color: toneColor.watch, label: "Pressure" },
                { value: summary.congestionMix.congestion, color: toneColor.critical, label: "Congestion" },
              ]}
            />
          </div>
        ) : null}

        {summary.level === "city" && districts.length > 0 ? (
          <DistrictChips
            districts={districts}
            worstDistrictId={summary.worstDistrictId}
            onSelectDistrict={onSelectDistrict}
          />
        ) : null}

        {summary.level !== "intersection" ? (
          <NetworkPredictionSection
            entries={networkPrediction}
            loading={networkPredictionLoading}
            onSelectIntersection={onSelectIntersection}
          />
        ) : null}

        {summary.intersection ? (
          <>
            <IntersectionDetail
              intersection={summary.intersection}
              hardware={hardware}
              graphNode={graphNode}
              prediction={prediction}
              predictionLoading={predictionLoading}
              linkedControllers={linkedControllers}
            />
            <IntersectionControls
              key={summary.intersection.id}
              intersection={summary.intersection}
              onSetOverride={onSetOverride}
              onSetForcedGreen={onSetForcedGreen}
              onSetMode={onSetMode}
            />
            <AiAssistPanel
              key={`ai-${summary.intersection.id}`}
              intersectionCode={summary.intersection.id}
              intersectionName={summary.intersection.name}
              onRequestApply={onAiRequestApply}
            />
          </>
        ) : (
          <section className="border-t border-white/6 px-5 py-4">
            <EmptyState
              icon={
                <span aria-hidden className="text-[#ffb547]">
                  ●
                </span>
              }
              title="AI Assist"
              description={
                <>
                  Pick an intersection to get traffic-intelligence advice.{" "}
                  Click any marker on the map, or choose one from{" "}
                  <span className="font-semibold text-[#c3cdc6]">
                    Priority nodes
                  </span>{" "}
                  below.
                </>
              }
            />
          </section>
        )}

        {summary.level !== "intersection" && priorityIntersections.length > 0 ? (
          <section className="flex flex-col gap-3 border-t border-white/6 px-5 py-5">
            <PanelSectionHeader
              label="Priority nodes"
              hint={`${Math.min(priorityIntersections.length, 5)} shown`}
            />
            <ul className="space-y-1.5">
              {priorityIntersections.slice(0, 5).map((intersection) => (
                <li key={intersection.id}>
                  <button
                    type="button"
                    onClick={() => onSelectIntersection(intersection.id)}
                    className={clsx(
                      "group flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition duration-200 hover:-translate-y-px",
                      intersection.id === selectedIntersectionId
                        ? "border-[#3c2e10] bg-[#14100a]"
                        : "border-white/6 bg-[#0b1115] hover:border-white/14 hover:bg-[#0f161b]",
                      intersection.status === "critical" && intersection.id !== selectedIntersectionId
                        ? "border-[#4b1c1c]/60"
                        : "",
                    )}
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        "h-2.5 w-2.5 shrink-0 rounded-full",
                        intersection.status === "critical" ? "stls-soft-blink" : "",
                      )}
                      style={{
                        backgroundColor: toneColor[intersection.status],
                        boxShadow:
                          intersection.status === "critical"
                            ? `0 0 0 4px ${toneColor.critical}22`
                            : undefined,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9rem] font-semibold text-[#f1f6f2]">
                        {intersection.name}
                      </span>
                      <span className="block truncate text-[0.72rem] text-[#8fa69a]">
                        {intersection.district}
                      </span>
                    </span>
                    <span className="text-[0.8rem] font-semibold text-[#f1f6f2] tabular-nums">
                      {intersection.averageDelaySeconds}s
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

interface ScopeWeatherSnapshot {
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  windSpeedKph: number;
  precipitationMm: number;
  weatherCode: number;
  isDay: boolean;
}

function useScopeWeather(center: { lat: number; lng: number }) {
  const [weather, setWeather] = useState<{
    state: "loading" | "ready" | "error";
    data: ScopeWeatherSnapshot | null;
  }>({
    state: "loading",
    data: null,
  });

  const roundedLat = Number(center.lat.toFixed(3));
  const roundedLng = Number(center.lng.toFixed(3));

  useEffect(() => {
    if (!Number.isFinite(roundedLat) || !Number.isFinite(roundedLng)) {
      setWeather({ state: "error", data: null });
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,wind_speed_10m,weather_code&timezone=auto`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error(`weather ${response.status}`);
        const json = (await response.json()) as {
          current?: {
            temperature_2m?: number;
            relative_humidity_2m?: number;
            apparent_temperature?: number;
            is_day?: number;
            precipitation?: number;
            wind_speed_10m?: number;
            weather_code?: number;
          };
        };
        if (!json.current) throw new Error("missing weather");
        setWeather({
          state: "ready",
          data: {
            temperatureC: json.current.temperature_2m ?? 0,
            apparentTemperatureC: json.current.apparent_temperature ?? 0,
            humidityPercent: json.current.relative_humidity_2m ?? 0,
            windSpeedKph: json.current.wind_speed_10m ?? 0,
            precipitationMm: json.current.precipitation ?? 0,
            weatherCode: json.current.weather_code ?? 0,
            isDay: (json.current.is_day ?? 1) === 1,
          },
        });
      } catch {
        if (controller.signal.aborted) return;
        setWeather((current) => ({ state: "error", data: current.data }));
      }
    };

    void load();
    const interval = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [roundedLat, roundedLng]);

  return weather;
}

function ScopeWeatherInline({
  weather,
}: {
  weather: ReturnType<typeof useScopeWeather>;
}) {
  const summary = weather.data
    ? describeWeather(weather.data.weatherCode, weather.data.isDay)
    : null;

  return (
    <div className="min-w-[112px] rounded-[12px] border border-white/8 bg-[#0b1115] px-3 py-2 text-right">
      <p className="text-[0.56rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        Weather
      </p>
      {weather.state === "ready" && weather.data && summary ? (
        <>
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="text-lg" aria-hidden>
              {summary.emoji}
            </span>
            <span className="text-[1.1rem] font-semibold text-[#f6faf5]">
              {Math.round(weather.data.temperatureC)}°
            </span>
          </div>
          <p className="mt-1 text-[0.7rem] text-[#a9b6af]">{summary.label}</p>
          <p className="mt-1 text-[0.64rem] text-[#7f9189]">
            {Math.round(weather.data.windSpeedKph)} km/h · {Math.round(weather.data.humidityPercent)}%
          </p>
        </>
      ) : (
        <p className="mt-2 text-[0.68rem] text-[#7f9189]">
          {weather.state === "error" ? "Unavailable" : "Loading…"}
        </p>
      )}
    </div>
  );
}

function describeWeather(code: number, isDay: boolean) {
  if (code === 0) {
    return { emoji: isDay ? "☀️" : "🌙", label: isDay ? "Clear" : "Clear night" };
  }
  if (code === 1 || code === 2) return { emoji: "🌤️", label: "Mostly clear" };
  if (code === 3) return { emoji: "☁️", label: "Cloudy" };
  if (code === 45 || code === 48) return { emoji: "🌫️", label: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { emoji: "🌦️", label: "Drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { emoji: "🌧️", label: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { emoji: "❄️", label: "Snow" };
  if ([95, 96, 99].includes(code)) return { emoji: "⛈️", label: "Storm" };
  return { emoji: "⛅", label: "Variable" };
}

function NetworkPredictionSection({
  entries,
  loading,
  onSelectIntersection,
}: {
  entries: CommandNetworkPredictionSummary[];
  loading: boolean;
  onSelectIntersection: (intersectionId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-white/6 px-5 py-5">
      <PanelSectionHeader
        label="Prévision réseau"
        hint="H+15 hotspots"
        trailing={loading ? <LoadingPulse /> : null}
      />

      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.slice(0, 5).map((entry) => (
            <li key={entry.intersectionId}>
              <button
                type="button"
                onClick={() => onSelectIntersection(entry.intersectionId)}
                className="group flex w-full items-start justify-between gap-3 rounded-[10px] border border-white/6 bg-[#0b1115] px-3 py-2.5 text-left transition duration-200 hover:-translate-y-px hover:border-white/14 hover:bg-[#0f161b]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          entry.trafficState === "congestion"
                            ? toneColor.critical
                            : entry.trafficState === "pressure"
                              ? toneColor.watch
                              : toneColor.healthy,
                      }}
                    />
                    <span className="truncate text-[0.86rem] font-semibold text-[#f1f6f2]">
                      {entry.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[0.7rem] text-[#8fa69a]">
                    {entry.district} · {entry.equipmentStatus}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.74rem] font-semibold text-[#f1f6f2]">
                    {entry.saturationForecast.toFixed(2)}
                  </p>
                  <p className="mt-0.5 text-[0.64rem] text-[#8fa39a]">
                    {entry.queueLengthForecast}m · {entry.delaySecondsForecast}s
                  </p>
                  <p className="mt-0.5 text-[0.64rem] text-[#8fa39a]">
                    Conf. {Math.round(entry.confidence * 100)}%
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={
            loading
              ? "Calcul des prévisions réseau en cours."
              : "Aucune prévision réseau."
          }
          description={
            loading
              ? undefined
              : "Pas de hotspot pour cette zone à l'horizon H+15."
          }
        />
      )}
    </section>
  );
}

function MetricGrid({ summary }: { summary: SelectedAreaSummary }) {
  if (summary.level === "city" || summary.level === "district") {
    return (
      <div className="grid grid-cols-3 gap-2 px-5 py-5">
        <HeroMetric label="Nodes" value={summary.intersectionCount} />
        <HeroMetric
          label="Incidents"
          value={summary.incidentCount}
          tone={summary.incidentCount > 0 ? "critical" : "healthy"}
        />
        <HeroMetric
          label="Avg delay"
          value={`${summary.averageDelaySeconds ?? 0}s`}
          tone={
            (summary.averageDelaySeconds ?? 0) >= 70
              ? "critical"
              : (summary.averageDelaySeconds ?? 0) >= 45
                ? "watch"
                : "healthy"
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 px-5 py-5">
      <HeroMetric label="Nodes" value={summary.intersectionCount} />
      <HeroMetric
        label="Incidents"
        value={summary.incidentCount}
        tone={summary.incidentCount > 0 ? "critical" : "healthy"}
      />
      <HeroMetric
        label="Mode"
        value={summary.dominantMode ? toLabel(summary.dominantMode) : "—"}
        compact
      />
    </div>
  );
}

function DistrictChips({
  districts,
  worstDistrictId,
  onSelectDistrict,
}: {
  districts: DistrictChipInfo[];
  worstDistrictId?: string;
  onSelectDistrict?: (districtId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-white/6 px-5 py-5">
      <PanelSectionHeader
        label="Districts"
        trailing={
          worstDistrictId ? (
            <StatusBadge tone="critical" size="xs" label="Worst highlighted" />
          ) : null
        }
      />
      <ul className="grid grid-cols-2 gap-2">
        {districts.map((district) => {
          const isWorst = district.id === worstDistrictId;
          return (
            <li key={district.id}>
              <button
                type="button"
                disabled={!onSelectDistrict}
                onClick={() => onSelectDistrict?.(district.id)}
                className={clsx(
                  "group flex w-full flex-col rounded-[10px] border px-3 py-2.5 text-left transition duration-200 hover:-translate-y-px",
                  isWorst
                    ? "border-[#5a1d1d] bg-[#140808] shadow-[0_0_0_1px_rgba(255,95,95,0.2)]"
                    : "border-white/6 bg-[#0b1115] hover:border-white/14 hover:bg-[#0f161b]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      "truncate text-[0.86rem] font-semibold",
                      isWorst ? "text-[#ff9a9a]" : "text-[#f1f6f2]",
                    )}
                  >
                    {district.name}
                  </span>
                  <span
                    aria-hidden
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      district.worstStatus === "critical" ? "stls-soft-blink" : "",
                    )}
                    style={{ backgroundColor: toneColor[district.worstStatus] }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[0.7rem] text-[#8fa69a]">
                  <span>
                    {district.intersectionCount} node
                    {district.intersectionCount === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums">{district.averageDelaySeconds}s avg</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IntersectionDetail({
  intersection,
  hardware,
  graphNode,
  prediction,
  predictionLoading,
  linkedControllers,
}: {
  intersection: IntersectionSnapshot;
  hardware?: HardwareSnapshot;
  graphNode?: CommandNetworkNode;
  prediction?: PredictionRunResult | null;
  predictionLoading: boolean;
  linkedControllers: LinkedControllerSummary[];
}) {
  return (
    <section className="border-t border-white/6 px-5 py-5">
      <PanelSectionHeader label="Intersection detail" />

      <p className="mt-3 text-[0.86rem] leading-5 text-[#c3cdc6]">
        {intersection.address}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.82rem]">
        <DetailItem label="Queue" value={`${intersection.queueLength} veh`} />
        <DetailItem label="Avg delay" value={`${intersection.averageDelaySeconds}s`} />
        <DetailItem label="Mode" value={formatCommandLabel(intersection.mode)} />
        <DetailItem label="Liaison" value={connectionStateLabel(intersection.controllerConnectionState)} />
        <DetailItem
          label="État"
          value={graphNode?.equipmentStatus ?? "Non spécifié"}
        />
        <DetailItem
          label="Type ctrl"
          value={formatControllerType(graphNode?.controllerType)}
        />
      </dl>

      {hardware ? (
        <div className="mt-4 rounded-[12px] border border-white/6 bg-[#0c1216] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.24em] text-[#8fa39a]">
                Controller
              </p>
              <p className="mt-1 text-[0.95rem] font-semibold text-[#f1f6f2]">
                {hardware.controllerId}
              </p>
              <p className="mt-1 text-[0.72rem] text-[#8fa39a]">
                {formatControllerType(graphNode?.controllerType)} ·{" "}
                {graphNode?.equipmentStatus ?? "Non spécifié"}
              </p>
            </div>
            <StatusBadge
              tone={hardware.connectionState}
              size="sm"
              label={connectionStateLabel(hardware.connectionState)}
            />
          </div>
          <p className="mt-2 text-[0.78rem] text-[#a9b6af]">
            Firmware {hardware.firmwareVersion} · {hardware.uptimeHours} h uptime ·{" "}
            {hardware.batteryBacked ? "battery-backed" : "no battery"}
          </p>
        </div>
      ) : null}

      <PredictionBlock prediction={prediction} loading={predictionLoading} />

      {linkedControllers.length > 0 ? (
        <div className="mt-4 rounded-[12px] border border-white/6 bg-[#0c1216] px-4 py-3.5">
          <PanelSectionHeader
            label="Contrôleurs liés"
            hint={`${linkedControllers.length} liens`}
          />
          <ul className="mt-3 space-y-2">
            {linkedControllers.slice(0, 5).map((entry) => (
              <li
                key={`${entry.intersectionId}-${entry.controllerId}`}
                className="flex items-start justify-between gap-3 rounded-[10px] border border-white/6 bg-[#0a1014] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.82rem] font-semibold text-[#edf3ee]">
                    {entry.label}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-[#8fa39a]">
                    {entry.controllerId} · {formatCommandLabel(entry.relationKind)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.7rem] font-semibold text-[#cdd7d0]">
                    {entry.travelTimeSeconds != null
                      ? `${Math.round(entry.travelTimeSeconds / 60)} min`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-[0.64rem] text-[#8fa39a]">
                    {entry.equipmentStatus}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PredictionBlock({
  prediction,
  loading,
}: {
  prediction?: PredictionRunResult | null;
  loading: boolean;
}) {
  return (
    <div className="mt-4 rounded-[12px] border border-white/6 bg-[#0c1216] px-4 py-3.5">
      <PanelSectionHeader
        label="Prédiction trafic"
        hint="H+15 · H+60 · H+24"
        trailing={loading ? <LoadingPulse /> : null}
      />

      {prediction ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HeroMetric
              compact
              label="Saturation"
              value={prediction.baseline.saturation.toFixed(2)}
              tone={prediction.baseline.saturation >= 0.95 ? "critical" : prediction.baseline.saturation >= 0.72 ? "watch" : "healthy"}
            />
            <HeroMetric
              compact
              label="Queue"
              value={`${Math.round(prediction.baseline.queueMetres)}m`}
              tone={prediction.baseline.queueMetres >= 120 ? "critical" : prediction.baseline.queueMetres >= 55 ? "watch" : "healthy"}
            />
            <HeroMetric compact label="Capacité" value={prediction.baseline.capacityVph.toLocaleString()} />
          </div>
          <div className="mt-3 space-y-2">
            {prediction.forecasts.map((forecast) => (
              <div
                key={forecast.horizon}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-white/6 bg-[#0a1014] px-3 py-2"
              >
                <div>
                  <p className="text-[0.72rem] font-semibold text-[#edf3ee]">
                    {forecast.horizon}
                  </p>
                  <p className="mt-0.5 text-[0.66rem] text-[#8fa39a]">
                    Conf. {Math.round(forecast.confidence * 100)}%
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-right text-[0.72rem] text-[#cdd7d0]">
                  <span>{forecast.saturationForecast.toFixed(2)}</span>
                  <span>{forecast.queueLengthForecast}m</span>
                  <span>{forecast.delaySecondsForecast}s</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[0.76rem] text-[#8fa39a]">
          {loading
            ? "Calcul des flux et des files en cours."
            : "Sélectionnez un carrefour relié au graphe pour lancer la prédiction."}
        </p>
      )}
    </div>
  );
}

function HeroMetric({
  label,
  value,
  tone = "healthy",
  compact = false,
}: {
  label: string;
  value: number | string;
  tone?: IntersectionHealth;
  compact?: boolean;
}) {
  const criticalGlow = tone === "critical";

  return (
    <div
      className={clsx(
        "rounded-[12px] border px-3 py-3 text-center",
        criticalGlow
          ? "border-[#5a1d1d] bg-[#180d0d]/80 shadow-[0_0_0_1px_rgba(255,95,95,0.25)]"
          : "border-white/6 bg-[#0b1115]",
      )}
    >
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-[#8fa39a]">
        {label}
      </p>
      <p
        className={clsx(
          "mt-2 font-semibold tabular-nums",
          compact ? "text-[0.95rem]" : "text-[1.55rem] leading-none",
          criticalGlow ? "text-[#ff9a9a]" : "text-[#f3f7f1]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MixBar({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ value: number; color: string; label: string }>;
}) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  if (total === 0) return null;

  return (
    <div>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.3em] text-[#8fa39a]">
        {label}
      </p>
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-white/6">
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: seg.color,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#a9b6af]">
              {seg.label}
            </span>
            <span className="text-[0.82rem] font-semibold text-[#f1f6f2] tabular-nums">
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-[#8fa39a]">
        {label}
      </dt>
      <dd className="mt-1 text-[0.9rem] font-medium text-[#f1f6f2]">{value}</dd>
    </div>
  );
}

function toLabel(value: string) {
  return formatCommandLabel(value);
}
