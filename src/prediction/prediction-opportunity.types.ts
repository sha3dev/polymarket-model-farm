/**
 * @section types
 */

export type EvaluationCheckpoint = {
  progress: number;
  upPrice: number | null;
  downPrice: number | null;
};

export type HitRateSummary = {
  resolvedPredictionCount: number;
  hitRatePercent: number | null;
};

export type PredictionDecision = {
  shouldExecute: boolean;
  skipReason: string | null;
};
