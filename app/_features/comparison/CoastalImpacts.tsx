"use client";

import { useEffect, useMemo, useState } from "react";
import { ComparisonResponse } from "./types";

type CoastalProjectionRow = {
  lon: number;
  lat: number;
  process: string;
  confidence: string;
  scenario: "ssp119" | "ssp126" | "ssp245" | "ssp370" | "ssp585";
  quantile: 5 | 17 | 50 | 83 | 95;
  [year: string]: string | number;
};

type CoastalContextReference = {
  country: string;
  iso3c: string;
  world_region: string;
  latest_global_sea_level_year: number;
  latest_global_sea_level_average: number;
  latest_antarctic_year: number;
  latest_antarctic_mass_balance: number;
  floodpop_ghsl_tot: number;
  floodpop_hrsl_tot: number;
  fpop_rate_reference: number;
};

const AVAILABLE_YEARS = [
  2020, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100, 2110, 2120, 2130, 2140, 2150,
];
const SSP_SCORE_ANCHORS = {
  ssp119: -80,
  ssp126: -30,
  ssp245: 10,
  ssp370: 55,
  ssp585: 120,
} as const;
const ORDERED_SCENARIOS: CoastalProjectionRow["scenario"][] = [
  "ssp119",
  "ssp126",
  "ssp245",
  "ssp370",
  "ssp585",
];

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatCm(valueMeters: number) {
  return `${(valueMeters * 100).toFixed(1)} cm`;
}

function scenarioScore(result: ComparisonResponse) {
  const modifiers = result.request.scenario_modifiers;
  return modifiers.co2 + modifiers.forest_loss * 0.35 - modifiers.renewables * 0.7;
}

function riskMeta(seaLevelMeters: number) {
  const cm = seaLevelMeters * 100;
  if (cm < 20) {
    const ratio = Math.max(0, Math.min(1, cm / 20));
    return {
      label: "Elevated",
      percent: 18 + ratio * 16,
      details:
        "Coastal pressure is rising, but the local sea-level increase remains in a lower range relative to hotter pathways.",
    };
  }
  if (cm < 35) {
    const ratio = (cm - 20) / 15;
    return {
      label: "Moderate",
      percent: 34 + ratio * 18,
      details:
        "Coastal flooding pressure becomes more disruptive, especially during storm surge and high-tide events.",
    };
  }
  if (cm < 55) {
    const ratio = (cm - 35) / 20;
    return {
      label: "High",
      percent: 52 + ratio * 20,
      details:
        "Sea-level rise pushes more coastlines toward regular nuisance flooding and more expensive adaptation pressure.",
    };
  }
  const ratio = Math.max(0, Math.min(1, (cm - 55) / 45));
  return {
    label: "Severe",
    percent: 72 + ratio * 20,
    details:
      "This level of local sea-level rise implies much stronger long-term coastal disruption and higher adaptation pressure.",
  };
}

function improvementMeta(deltaMeters: number) {
  const cm = deltaMeters * 100;
  if (cm <= -20) {
    return {
      label: "Much lower than baseline",
      short: "Strong reduction",
    };
  }
  if (cm <= -8) {
    return {
      label: "Lower than baseline",
      short: "Clear reduction",
    };
  }
  if (cm < 8) {
    return {
      label: "Close to baseline",
      short: "Limited change",
    };
  }
  if (cm < 20) {
    return {
      label: "Higher than baseline",
      short: "Clear increase",
    };
  }
  return {
    label: "Much higher than baseline",
    short: "Strong increase",
  };
}

function getProjectionValue(row: CoastalProjectionRow, year: number) {
  const value = row[String(year)];
  return typeof value === "number" ? value : Number(value);
}

function interpolateYearValue(row: CoastalProjectionRow, targetYear: number) {
  if (targetYear <= AVAILABLE_YEARS[0]) {
    return getProjectionValue(row, AVAILABLE_YEARS[0]);
  }
  if (targetYear >= AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]) {
    return getProjectionValue(row, AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]);
  }

  const upperIndex = AVAILABLE_YEARS.findIndex((year) => year >= targetYear);
  const upperYear = AVAILABLE_YEARS[upperIndex];
  const lowerYear = AVAILABLE_YEARS[upperIndex - 1];
  if (lowerYear === upperYear) {
    return getProjectionValue(row, lowerYear);
  }

  const lowerValue = getProjectionValue(row, lowerYear);
  const upperValue = getProjectionValue(row, upperYear);
  const ratio = (targetYear - lowerYear) / (upperYear - lowerYear);
  return lowerValue + (upperValue - lowerValue) * ratio;
}

function surroundingScenarios(score: number) {
  const clamped = Math.max(
    SSP_SCORE_ANCHORS.ssp119,
    Math.min(SSP_SCORE_ANCHORS.ssp585, score),
  );

  for (let index = 0; index < ORDERED_SCENARIOS.length - 1; index += 1) {
    const lower = ORDERED_SCENARIOS[index];
    const upper = ORDERED_SCENARIOS[index + 1];
    const lowerScore = SSP_SCORE_ANCHORS[lower];
    const upperScore = SSP_SCORE_ANCHORS[upper];
    if (clamped >= lowerScore && clamped <= upperScore) {
      const ratio =
        upperScore === lowerScore ? 0 : (clamped - lowerScore) / (upperScore - lowerScore);
      return { lower, upper, ratio, clamped };
    }
  }

  return {
    lower: ORDERED_SCENARIOS[ORDERED_SCENARIOS.length - 1],
    upper: ORDERED_SCENARIOS[ORDERED_SCENARIOS.length - 1],
    ratio: 0,
    clamped,
  };
}

type Props = {
  result: ComparisonResponse;
};

export function CoastalImpacts({ result }: Props) {
  const [rows, setRows] = useState<CoastalProjectionRow[]>([]);
  const [context, setContext] = useState<CoastalContextReference | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [projectionResponse, contextResponse] = await Promise.all([
        fetch("/coastal_projection_local.json", { cache: "no-store" }),
        fetch("/coastal_context_reference.json", { cache: "no-store" }),
      ]);
      if (!projectionResponse.ok) {
        return;
      }
      const payload = (await projectionResponse.json()) as CoastalProjectionRow[];
      if (!cancelled) {
        setRows(payload);
      }
      if (contextResponse.ok) {
        const contextPayload = (await contextResponse.json()) as CoastalContextReference;
        if (!cancelled) {
          setContext(contextPayload);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (!rows.length) {
      return null;
    }

    const targetYear = result.request.target_year;
    const score = scenarioScore(result);
    const interpolation = surroundingScenarios(score);
    const filterRow = (scenarioName: CoastalProjectionRow["scenario"], quantile: 17 | 50 | 83) =>
      rows.find(
        (row) =>
          row.process === "total" &&
          row.confidence === "medium" &&
          row.scenario === scenarioName &&
          row.quantile === quantile,
      );

    const baselineMedianRow = filterRow("ssp245", 50);
    const lowerMedianRow = filterRow(interpolation.lower, 50);
    const upperMedianRow = filterRow(interpolation.upper, 50);
    const lowerLowRow = filterRow(interpolation.lower, 17);
    const upperLowRow = filterRow(interpolation.upper, 17);
    const lowerHighRow = filterRow(interpolation.lower, 83);
    const upperHighRow = filterRow(interpolation.upper, 83);
    if (
      !baselineMedianRow ||
      !lowerMedianRow ||
      !upperMedianRow ||
      !lowerLowRow ||
      !upperLowRow ||
      !lowerHighRow ||
      !upperHighRow
    ) {
      return null;
    }

    const lerp = (lowerValue: number, upperValue: number) =>
      lowerValue + (upperValue - lowerValue) * interpolation.ratio;

    const baselineMedian = interpolateYearValue(baselineMedianRow, targetYear);
    const scenarioMedian = lerp(
      interpolateYearValue(lowerMedianRow, targetYear),
      interpolateYearValue(upperMedianRow, targetYear),
    );
    const scenarioLow = lerp(
      interpolateYearValue(lowerLowRow, targetYear),
      interpolateYearValue(upperLowRow, targetYear),
    );
    const scenarioHigh = lerp(
      interpolateYearValue(lowerHighRow, targetYear),
      interpolateYearValue(upperHighRow, targetYear),
    );
    const delta = scenarioMedian - baselineMedian;
    const risk = riskMeta(scenarioMedian);
    const improvement = improvementMeta(delta);
    const riskPercent = Math.round(risk.percent);
    return {
      targetYear,
      baselineMedian,
      scenarioMedian,
      scenarioLow,
      scenarioHigh,
      delta,
      risk,
      riskPercent,
      improvement,
      location: `${lowerMedianRow.lon}, ${lowerMedianRow.lat}`,
    };
  }, [result, rows]);

  if (!content) {
    return null;
  }

  return (
    <section className="support-card impacts-card impacts-card-visual">
      <div className="impacts-topline">
        <div className="impacts-temperature">{formatCm(content.scenarioMedian)}</div>
        <div className="impacts-top-copy">
          <p className="eyebrow">Flooding &amp; Coasts</p>
          <h3>What this could mean for local sea-level pressure by {content.targetYear}</h3>
          <p className="impacts-summary">
            This card uses the localized IPCC AR6 sea-level projection nearest to your selected
            pathway and target year.
          </p>
        </div>
      </div>

      <article className="impact-focus-card">
        <div className="impact-focus-header">
          <div>
            <h4>Flooding &amp; coasts</h4>
            <p className="impact-subtitle">Compared with the default baseline pathway</p>
          </div>
          <div className="impact-badge-stack">
            <span className="impact-risk-badge coast">{content.risk.label}</span>
            <span className="impact-risk-badge coast secondary">{content.improvement.short}</span>
          </div>
        </div>

        <div className="impact-metric-grid">
          <div className="impact-metric-tile coast">
            <strong>{formatCm(content.scenarioMedian)}</strong>
            <span>Estimated local sea-level rise</span>
          </div>
          <div className="impact-metric-tile coast">
            <strong>{content.improvement.label}</strong>
            <span>{formatCm(content.delta)} difference vs baseline</span>
          </div>
          <div className="impact-metric-tile coast">
            <strong>
              {formatCm(content.scenarioLow)} to {formatCm(content.scenarioHigh)}
            </strong>
            <span>Likely local range</span>
          </div>
        </div>

        <p className="impact-body">{content.risk.details}</p>

        <div className="impact-reference-note coast-note">
          Based on the IPCC AR6 localized sea-level projection at lon/lat {content.location}. The
          website maps your slider scenario onto the nearest coastal pathways and interpolates
          between them for the selected year.
        </div>

        {context ? (
          <div className="impact-reference-block coast-note">
            <span>
              Historical sea-level context ({context.latest_global_sea_level_year}): global annual
              average at {context.latest_global_sea_level_average.toFixed(1)} mm.
            </span>
            <span>
              Antarctic mass balance ({context.latest_antarctic_year}):{" "}
              {formatWhole(context.latest_antarctic_mass_balance)} Gt mean annual balance.
            </span>
            <span>
              Philippines flood-exposure reference: {formatWhole(context.floodpop_hrsl_tot)} to{" "}
              {formatWhole(context.floodpop_ghsl_tot)} people across the provided estimates.
            </span>
          </div>
        ) : null}

        <div className="impact-risk-row">
          <div className="impact-risk-labels">
            <span>Coastal pressure</span>
            <span>{content.riskPercent}%</span>
          </div>
          <div className="impact-risk-track" aria-hidden="true">
            <span className="impact-risk-fill coast-fill" style={{ width: `${content.risk.percent}%` }} />
          </div>
        </div>
      </article>
    </section>
  );
}
