import { ComparisonResponse } from "./types";

function foodRiskMeta(warming: number) {
  if (warming < 1.5) {
    const ratio = Math.max(0, Math.min(1, warming / 1.5));
    return {
      label: "Elevated",
      percent: 18 + ratio * 16,
      summary:
        "Food-system pressure still rises, but lower warming keeps supply shocks and water stress more manageable than hotter pathways.",
      details:
        "Lower warming does not remove food vulnerability, but it reduces the chance of larger price shocks, deeper agricultural strain, and broader undernourishment pressure.",
    };
  }

  if (warming < 2) {
    const ratio = (warming - 1.5) / 0.5;
    return {
      label: "Moderate",
      percent: 34 + ratio * 18,
      summary:
        "Food and agriculture pressure becomes more persistent as heat, water stress, and market volatility start compounding each other.",
      details:
        "This range points to tighter margins for food security, especially where households are already exposed to price shocks or water limits.",
    };
  }

  if (warming < 3) {
    const ratio = warming - 2;
    return {
      label: "High",
      percent: 52 + ratio * 20,
      summary:
        "This is a high-pressure food pathway, where climate stress starts pushing harder on affordability, agricultural water demand, and undernourishment risk.",
      details:
        "Food systems become more fragile under repeated disruptions, with water pressure and price instability making resilience harder to sustain.",
    };
  }

  const ratio = Math.max(0, Math.min(1, (warming - 3) / 1.5));
  return {
    label: "Severe",
    percent: 72 + ratio * 20,
    summary:
      "This pathway points to severe food-system stress, where persistent climate pressure is more likely to amplify hunger, market instability, and water competition.",
    details:
      "At this warming level, food insecurity pressure is more likely to spread through both production stress and affordability stress at the same time.",
  };
}

type Props = {
  result: ComparisonResponse;
};

export function FoodAgricultureImpacts({ result }: Props) {
  const impact = result.food_agriculture_impact;
  if (!impact) {
    return null;
  }

  const year = result.request.target_year;
  const warming = result.scenario.target_year.p50;
  const risk = foodRiskMeta(warming);
  const foodPriceIndex = impact.scenario.food_price_index;
  const baselineFoodPriceIndex = impact.baseline.food_price_index;
  const waterStress = impact.scenario.agricultural_water_stress_pct;
  const baselineWaterStress = impact.baseline.agricultural_water_stress_pct;

  return (
    <section className="support-card impacts-card impacts-card-visual">
      <div className="impacts-topline">
        <div className="impacts-temperature">{risk.label}</div>
        <div className="impacts-top-copy">
          <p className="eyebrow">Food &amp; Agriculture</p>
          <h3>What this could mean for food-system pressure by {year}</h3>
          <p className="impacts-summary">{risk.summary}</p>
        </div>
      </div>

      <article className="impact-focus-card">
        <div className="impact-focus-header">
          <div>
            <h4>Food &amp; agriculture</h4>
            <p className="impact-subtitle">Compared with the default baseline pathway</p>
          </div>
          <span className="impact-risk-badge food">{risk.label}</span>
        </div>

        <div className="impact-metric-grid">
          <div className="impact-metric-tile food">
            <strong>{foodPriceIndex.toFixed(1)}</strong>
            <span>Estimated food price index · baseline {baselineFoodPriceIndex.toFixed(1)}</span>
          </div>
          <div className="impact-metric-tile food">
            <strong>{waterStress.toFixed(1)}%</strong>
            <span>Estimated agricultural water stress · baseline {baselineWaterStress.toFixed(1)}%</span>
          </div>
        </div>

        <p className="impact-body">{risk.details}</p>

        <div className="impact-reference-note">
          This card emphasizes scenario-responsive food-system pressure estimates rather than a
          fake precise hunger percentage. The estimates are anchored in historical global
          relationships from {impact.training_years.start} to {impact.training_years.end}.
        </div>
      </article>
    </section>
  );
}
