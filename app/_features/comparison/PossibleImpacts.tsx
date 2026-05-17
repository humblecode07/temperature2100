import { ComparisonResponse } from "./types";

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatSignedTemperature(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}\u00B0C`;
}

function formatSignedWhole(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatWhole(value)}`;
}

function deltaLabel(result: ComparisonResponse) {
  if (!result.interpretation_flags.meaningful_change) {
    return "Close to baseline";
  }
  if (result.interpretation_flags.direction === "cooler") {
    return "Lower than baseline";
  }
  if (result.interpretation_flags.direction === "warmer") {
    return "Higher than baseline";
  }
  return "Close to baseline";
}

function buildRiskMeta(warming: number) {
  if (warming < 1.5) {
    const ratio = Math.max(0, Math.min(1, warming / 1.5));
    return {
      label: "Elevated",
      percent: 18 + ratio * 16,
      summary:
        "A lower-warming pathway still increases heat pressure, but severe disruption stays more limited than in hotter futures.",
      details:
        "Heat extremes still become more frequent, especially in already warm regions, but adaptation remains more manageable.",
    };
  }

  if (warming < 2) {
    const ratio = (warming - 1.5) / 0.5;
    return {
      label: "Moderate",
      percent: 34 + ratio * 18,
      summary:
        "A moderate warming pathway keeps some room for adaptation, but heat risk compounds across cities, labor, and health systems.",
      details:
        "Dangerous heat becomes harder to manage. Outdoor work strain rises and heat-related illness becomes more disruptive.",
    };
  }

  if (warming < 3) {
    const ratio = (warming - 2) / 1;
    return {
      label: "High",
      percent: 52 + ratio * 20,
      summary:
        "This is a high-impact heat pathway. Heat pressure becomes broad and structural rather than occasional or local.",
      details:
        "Extreme heat becomes a major systems problem for exposed workers, urban livability, hospital load, and electricity demand.",
    };
  }

  const ratio = Math.max(0, Math.min(1, (warming - 3) / 1.5));
  return {
    label: "Severe",
    percent: 72 + ratio * 20,
    summary:
      "This pathway points to severe heat stress, where chronic dangerous conditions spread across more regions and populations.",
    details:
      "Mortality pressure, work-loss pressure, and persistent urban heat stress all rise sharply in this range.",
  };
}

type Props = {
  result: ComparisonResponse;
};

export function PossibleImpacts({ result }: Props) {
  const warming = result.scenario.target_year.p50;
  const risk = buildRiskMeta(warming);
  const heatImpact = result.heat_impact;
  const year = result.request.target_year;
  const comparisonText = deltaLabel(result);

  const baselineMortalityRate = heatImpact?.baseline.heat_mortality_rate ?? null;
  const mortalityRate = heatImpact?.scenario.heat_mortality_rate ?? null;
  const baselineWorkLossPressure = heatImpact?.baseline.heat_work_loss_pp ?? null;
  const workLossPressure = heatImpact?.scenario.heat_work_loss_pp ?? null;
  const baselineDeaths = heatImpact?.baseline.annual_heat_deaths ?? null;
  const deaths = heatImpact?.scenario.annual_heat_deaths ?? null;
  const deathDelta = heatImpact?.delta.annual_heat_deaths ?? null;
  const trainingYears = heatImpact?.training_years ?? null;

  return (
    <section className="support-card impacts-card impacts-card-visual">
      <div className="impacts-topline">
        <div className="impacts-temperature">{formatSignedTemperature(warming)}</div>
        <div className="impacts-top-copy">
          <p className="eyebrow">Heat Impact Outlook</p>
          <h3>What this could mean for heat and health by {year}</h3>
          <p className="impacts-summary">{risk.summary}</p>
        </div>
      </div>

      <article className="impact-focus-card">
        <div className="impact-focus-header">
          <div>
            <h4>Heat &amp; health</h4>
            <p className="impact-subtitle">Compared with the default baseline pathway</p>
          </div>
          <span className="impact-risk-badge">{risk.label}</span>
        </div>

        <div className="impact-metric-grid">
          <div className="impact-metric-tile">
            <strong>{mortalityRate !== null ? mortalityRate.toFixed(2) : "N/A"}</strong>
            <span>
              Estimated heat mortality rate
              {baselineMortalityRate !== null ? ` · baseline ${baselineMortalityRate.toFixed(2)}` : ""}
            </span>
          </div>
          <div className="impact-metric-tile">
            <strong>{deaths !== null ? formatWhole(deaths) : "N/A"}</strong>
            <span>
              Estimated annual heat deaths
              {baselineDeaths !== null ? ` · baseline ${formatWhole(baselineDeaths)}` : ""}
            </span>
          </div>
          <div className="impact-metric-tile">
            <strong>{workLossPressure !== null ? formatWhole(workLossPressure) : "N/A"}</strong>
            <span>
              Estimated heat work-loss pressure
              {baselineWorkLossPressure !== null ? ` · baseline ${formatWhole(baselineWorkLossPressure)}` : ""}
            </span>
          </div>
          <div className="impact-metric-tile">
            <strong>{deathDelta !== null ? formatSignedWhole(deathDelta) : comparisonText}</strong>
            <span>
              {deathDelta !== null
                ? "Estimated deaths vs baseline"
                : `${Math.abs(result.delta.target_year.p50).toFixed(2)}\u00B0C ${comparisonText.toLowerCase()}`}
            </span>
          </div>
        </div>

        <p className="impact-body">{risk.details}</p>

        <div className="impact-reference-note">
          {trainingYears
            ? `These heat metrics are estimated from the historical heat-impact relationship learned from ${trainingYears.start} to ${trainingYears.end}, using the projected warming level and target year.`
            : "Heat-impact estimates are unavailable, so this card uses warming-band interpretation only."}
        </div>
      </article>
    </section>
  );
}
