import { ComparisonResponse } from "./types";

function formatLargeNumber(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toFixed(1);
}

function formatSigned(value: number, formatter: (v: number) => string) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatter(value)}`;
}

function ecosystemRiskMeta(warming: number) {
  if (warming < 1.5) {
    const ratio = Math.max(0, Math.min(1, warming / 1.5));
    return {
      label: "Elevated",
      percent: 18 + ratio * 16,
      summary:
        "Lower warming still stresses ecosystems, but keeps biodiversity loss, ocean acidification, and coral bleaching more manageable than hotter pathways.",
      details:
        "Deforestation pressures and ocean pH decline continue, but slower warming reduces the probability of major reef bleaching events and species-loss acceleration.",
    };
  }

  if (warming < 2) {
    const ratio = (warming - 1.5) / 0.5;
    return {
      label: "Moderate",
      percent: 34 + ratio * 18,
      summary:
        "Ecosystem pressure becomes more persistent as rising seas, ocean acidification, and thermal stress compound across land, freshwater, and marine habitats.",
      details:
        "At this range, coral bleaching events become more frequent and severe, tree cover loss accelerates, and marine fisheries face growing thermal and acidification stress.",
    };
  }

  if (warming < 3) {
    const ratio = warming - 2;
    return {
      label: "High",
      percent: 52 + ratio * 20,
      summary:
        "This is a high-impact ecosystem pathway. Biodiversity loss accelerates, coral systems face repeated bleaching, and ocean chemistry shifts become harder to reverse.",
      details:
        "The Red List Index decline steepens, Philippine reefs experience sustained high DHW events, and global fisheries face compounding pressures from warming and acidification.",
    };
  }

  const ratio = Math.max(0, Math.min(1, (warming - 3) / 1.5));
  return {
    label: "Severe",
    percent: 72 + ratio * 20,
    summary:
      "This pathway points to severe ecosystem degradation, where chronic thermal stress, habitat loss, and ocean acidification push multiple systems toward tipping points.",
    details:
      "Coral bleaching becomes near-annual and catastrophic. Marine food webs fracture under combined heat and pH stress. Species extinction rates sharply accelerate.",
  };
}

const SPECIES_DISPLAY = [
  "All groups",
  "All plants",
  "All vertebrates",
  "Fishes",
  "Corals",
  "Amphibians",
  "Mammals",
  "Birds",
];

type Props = {
  result: ComparisonResponse;
};

export function EcosystemImpacts({ result }: Props) {
  const impact = result.ecosystem_impact;
  if (!impact) return null;

  const year = result.request.target_year;
  const warming = result.scenario.target_year.p50;
  const risk = ecosystemRiskMeta(warming);
  const riskPercent = Math.round(risk.percent);

  const { scenario, delta, training_years } = impact;

  const displaySpecies = impact.species_threatened.filter((s) =>
    SPECIES_DISPLAY.includes(s.entity),
  );

  const rliDelta = delta.red_list_index;
  const phDelta = delta.ocean_ph;
  const coralDhwVal = scenario.coral_dhw;
  const coralbaaVal = scenario.coral_baa_max;
  const treeLossDelta = delta.tree_cover_loss_ha;
  const fishDelta = delta.fish_capture_tonnes;
  const burnedVal = scenario.burned_total_ha;

  const bleachingLabel =
    coralbaaVal < 1 ? "No stress" :
    coralbaaVal < 2 ? "Watch" :
    coralbaaVal < 3 ? "Warning" :
    coralbaaVal < 4 ? "Alert Level 1" : "Alert Level 2";

  return (
    <section className="support-card impacts-card impacts-card-visual eco-card">
      {/* Top banner */}
      <div className="impacts-topline">
        <div className="impacts-temperature eco">{risk.label}</div>
        <div className="impacts-top-copy">
          <p className="eyebrow">Ecosystem Impact</p>
          <h3>What this could mean for ecosystems by {year}</h3>
          <p className="impacts-summary">{risk.summary}</p>
        </div>
      </div>

      {/* Biodiversity & Ocean section */}
      <article className="impact-focus-card">
        <div className="impact-focus-header">
          <div>
            <h4>Biodiversity &amp; Ocean Chemistry</h4>
            <p className="impact-subtitle">Global · estimated relative to baseline</p>
          </div>
          <span className="impact-risk-badge eco">{risk.label}</span>
        </div>

        <div className="impact-metric-grid eco">
          <div className="impact-metric-tile eco">
            <strong>{scenario.red_list_index.toFixed(3)}</strong>
            <span>Red List Index</span>
            <em className={rliDelta < 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(rliDelta, (v) => Math.abs(v).toFixed(3))} vs baseline
            </em>
          </div>
          <div className="impact-metric-tile eco">
            <strong>{scenario.ocean_ph.toFixed(3)}</strong>
            <span>Ocean pH</span>
            <em className={phDelta < 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(phDelta, (v) => Math.abs(v).toFixed(3))} vs baseline
            </em>
          </div>
          <div className="impact-metric-tile eco">
            <strong>{formatLargeNumber(scenario.tree_cover_loss_ha)} ha</strong>
            <span>Tree cover loss</span>
            <em className={treeLossDelta > 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(treeLossDelta, formatLargeNumber)} ha vs baseline
            </em>
          </div>
          <div className="impact-metric-tile eco">
            <strong>{formatLargeNumber(burnedVal)} ha</strong>
            <span>Wildfire burned area</span>
            <em className="eco-delta neutral">Global annual total</em>
          </div>
          <div className="impact-metric-tile eco">
            <strong>{formatLargeNumber(scenario.fish_capture_tonnes)} t</strong>
            <span>Fish capture (global)</span>
            <em className={fishDelta < 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(fishDelta, formatLargeNumber)} t vs baseline
            </em>
          </div>
        </div>

        <p className="impact-body">{risk.details}</p>

        <div className="impact-reference-note">
          Estimates use historical ecosystem–temperature relationships from {training_years.start}–
          {training_years.end}. Red List Index (R²=0.99), Ocean pH (R²=0.96), and Fish Capture
          (R²=0.91) have strong fits. Burned area (R²=0.57) and coral DHW (R²=0.58) have moderate
          fits and should be read directionally.
        </div>
      </article>

      {/* Coral Reef section — Philippines specific */}
      <article className="impact-focus-card eco-coral">
        <div className="impact-focus-header">
          <div>
            <h4>🇵🇭 Coral Reef Thermal Stress</h4>
            <p className="impact-subtitle">
              Philippines · Central, Northern &amp; Western stations · NOAA Coral Reef Watch
            </p>
          </div>
          <span className={`impact-risk-badge ${coralbaaVal >= 3 ? "eco-alert" : coralbaaVal >= 1 ? "eco" : "eco-ok"}`}>
            {bleachingLabel}
          </span>
        </div>

        <div className="impact-metric-grid eco">
          <div className="impact-metric-tile eco coral">
            <strong>{coralDhwVal.toFixed(1)} °C·wk</strong>
            <span>Peak Degree Heating Weeks</span>
            <em className={delta.coral_dhw > 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(delta.coral_dhw, (v) => Math.abs(v).toFixed(2))} °C·wk vs baseline
            </em>
          </div>
          <div className="impact-metric-tile eco coral">
            <strong>{coralbaaVal.toFixed(1)}</strong>
            <span>Bleaching Alert Level (0–4)</span>
            <em className={delta.coral_baa_max > 0 ? "eco-delta negative" : "eco-delta positive"}>
              {formatSigned(delta.coral_baa_max, (v) => Math.abs(v).toFixed(2))} vs baseline
            </em>
          </div>
        </div>

        <div className="eco-bleach-scale">
          <span className="eco-bleach-label">DHW bleaching thresholds:</span>
          <span className="eco-bleach-item ok">0–4 Low</span>
          <span className="eco-bleach-item warn">4–8 Moderate</span>
          <span className="eco-bleach-item alert">8+ Severe</span>
        </div>

        <div className="impact-reference-note eco-disclaimer">
          ⚠️ {impact.disclaimer}
        </div>
      </article>

      {/* Species threatened reference */}
      <article className="impact-focus-card eco-species">
        <div className="impact-focus-header">
          <div>
            <h4>Currently Threatened Species</h4>
            <p className="impact-subtitle">IUCN Red List snapshot · 2025 · Global</p>
          </div>
          <span className="impact-risk-badge eco">Reference</span>
        </div>

        <div className="eco-species-grid">
          {displaySpecies.map((s) => (
            <div key={s.entity} className="eco-species-tile">
              <strong>{s.threatened_species.toLocaleString()}</strong>
              <span>{s.entity}</span>
            </div>
          ))}
        </div>

        <div className="impact-reference-note">
          Species threatened counts are a static 2025 IUCN snapshot and are not projected forward
          by this model. They provide context for the scale of current biodiversity stress.
        </div>
      </article>

      {/* Risk bar */}
      <div className="impact-risk-row">
        <div className="impact-risk-labels">
          <span>Ecosystem risk level</span>
          <span>{riskPercent}%</span>
        </div>
        <div className="impact-risk-track" aria-hidden="true">
          <span className="impact-risk-fill eco" style={{ width: `${risk.percent}%` }} />
        </div>
      </div>
    </section>
  );
}
