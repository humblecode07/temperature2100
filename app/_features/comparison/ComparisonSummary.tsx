import { ComparisonResponse } from "./types";
import { formatDegrees } from "./helpers";

type Props = {
  result: ComparisonResponse;
};

export function ComparisonSummary({ result }: Props) {
  return (
    <>
      <section className="summary-table desktop-only">
        <div className="summary-row heading">
          <span>Metric</span>
          <span>Baseline</span>
          <span>Your scenario</span>
          <span>Difference</span>
        </div>
        <div className="summary-row">
          <span>Median at {result.delta.target_year.year}</span>
          <span>{formatDegrees(result.baseline.target_year.p50)}</span>
          <span>{formatDegrees(result.scenario.target_year.p50)}</span>
          <span>{formatDegrees(result.delta.target_year.p50)}</span>
        </div>
        <div className="summary-row">
          <span>Likely range</span>
          <span>
            {formatDegrees(result.baseline.target_year.p05)} to{" "}
            {formatDegrees(result.baseline.target_year.p95)}
          </span>
          <span>
            {formatDegrees(result.scenario.target_year.p05)} to{" "}
            {formatDegrees(result.scenario.target_year.p95)}
          </span>
          <span>{result.interpretation_flags.range_change}</span>
        </div>
      </section>

      <section className="mobile-summary mobile-only">
        <div className="metric-card">
          <span>Baseline</span>
          <strong>{formatDegrees(result.baseline.target_year.p50)}</strong>
        </div>
        <div className="metric-card">
          <span>Your scenario</span>
          <strong>{formatDegrees(result.scenario.target_year.p50)}</strong>
        </div>
        <div className="metric-card">
          <span>Difference</span>
          <strong>{formatDegrees(result.delta.target_year.p50)}</strong>
        </div>
        <div className="metric-card">
          <span>Likely range</span>
          <strong>
            {formatDegrees(result.scenario.target_year.p05, 1)} to{" "}
            {formatDegrees(result.scenario.target_year.p95, 1)}
          </strong>
        </div>
      </section>
    </>
  );
}
