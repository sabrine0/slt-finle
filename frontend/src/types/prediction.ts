export type PredictionHorizon = "H+15" | "H+60" | "H+24";

export interface PredictionForecast {
  horizon: PredictionHorizon;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  notes: string[];
}

export interface PredictionRunResult {
  carrefourId: string;
  generatedAt: string;
  baseline: {
    saturation: number;
    queueMetres: number;
    capacityVph: number;
    criticality: number;
    criticalityLevel: string;
  };
  forecasts: PredictionForecast[];
  agentSlots: Array<{ agentName: string; pendingOutputs: number }>;
}
