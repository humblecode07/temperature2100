import { ComparisonResponse } from "./types";
import { buildHeroMessage, buildTakeaway, formatDegrees, formatIsoDate } from "./helpers";
import { ExportReportButton } from "./ExportReportButton";

type Props = {
  result: ComparisonResponse;
};

export function ComparisonHero({ result }: Props) {
  const delta = result.delta.target_year.p50;
  const directionLabel =
    result.interpretation_flags.direction === "cooler"
      ? "Cooler than baseline"
      : result.interpretation_flags.direction === "warmer"
        ? "Warmer than baseline"
        : "Near baseline";

  return (
    <section className="hero-card comparison-hero">
      <p className="eyebrow">Last Comparison Run</p>
      <div className="hero-topline">
        <h2>{buildHeroMessage(result)}</h2>
        <div className={`delta-badge ${delta < 0 ? "cooler" : delta > 0 ? "warmer" : "neutral"}`}>
          {directionLabel}
        </div>
      </div>
      <div className="hero-metrics">
        <div className="hero-metric">
          <span>Baseline</span>
          <strong>{formatDegrees(result.baseline.target_year.p50)}</strong>
        </div>
        <div className="hero-metric active">
          <span>Your scenario</span>
          <strong>{formatDegrees(result.scenario.target_year.p50)}</strong>
        </div>
        <div className="hero-metric delta">
          <span>Difference</span>
          <strong>{formatDegrees(result.delta.target_year.p50)}</strong>
        </div>
      </div>
      <p className="hero-support">
        Compared with the default baseline pathway at {result.delta.target_year.year}.
      </p>
      <p className="takeaway">{buildTakeaway(result)}</p>
      <div className="hero-meta">
        <span>Your scenario is shown against the default baseline pathway.</span>
        <span>Last updated {formatIsoDate(result.run_metadata.generated_at)}</span>
      </div>
      <div className="hero-actions">
        <ExportReportButton result={result} />
      </div>
    </section>
  );
}
