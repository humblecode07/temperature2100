import { ComparisonRequest, ComparisonResponse } from "./types";

const HEAT_IMPACT_MODEL = {
  training_years: { start: 2000, end: 2021 },
  params: {
    heat_mortality_rate: {
      intercept: 25.7813,
      temperature_anomaly: 1.2739,
      year: -0.0128,
    },
    annual_heat_deaths: {
      intercept: 4564867.4571,
      temperature_anomaly: 668634.5869,
      year: -2273.9737,
    },
    heat_work_loss_pp: {
      intercept: 1945.9448,
      temperature_anomaly: 55.8316,
      year: -0.9166,
    },
  },
} as const;

const FOOD_AGRICULTURE_IMPACT_MODEL = {
  training_years: { start: 2000, end: 2022 },
  params: {
    undernourishment_pct: {
      intercept: 634.6895,
      temperature_anomaly: 2.1852,
      year: -0.3117,
    },
    food_price_index: {
      intercept: -12676.2811,
      temperature_anomaly: -160.512,
      year: 6.4081,
    },
    agricultural_water_stress_pct: {
      intercept: -110.0196,
      temperature_anomaly: 0.2848,
      year: 0.0608,
    },
  },
} as const;

const ECOSYSTEM_IMPACT_MODEL = {
  training_years: { start: 1985, end: 2024 },
  disclaimer:
    "Coral bleaching data (coral_dhw, coral_baa_max, and associated SST metrics) are " +
    "region-specific to the Philippines (Central, Northern, and Western stations from " +
    "NOAA Coral Reef Watch). All other ecosystem datasets (wildfire burned area, " +
    "fisheries/fish capture, species threatened, ocean pH, red list index, and tree " +
    "cover loss) are global in scope.",
  coral_regions: ["central", "northern", "western"],
  params: {
    red_list_index: {
      intercept: 7.3621,
      temperature_anomaly: 0.0015,
      year: -0.0033,
    },
    ocean_ph: {
      intercept: 11.4802,
      temperature_anomaly: -0.0098,
      year: -0.0017,
    },
    tree_cover_loss_ha: {
      intercept: -707547058.9549,
      temperature_anomaly: 9175641.7311,
      year: 358691.6584,
    },
    burned_total_ha: {
      intercept: 4101584764.3822,
      temperature_anomaly: -303170407.4455,
      year: -1728209.5968,
    },
    fish_capture_tonnes: {
      intercept: -3450094329.4224,
      temperature_anomaly: -48518265.2068,
      year: 1780529.8505,
    },
    coral_dhw: {
      intercept: 228.6948,
      temperature_anomaly: 15.945,
      year: -0.1169,
    },
    coral_baa_max: {
      intercept: 19.4097,
      temperature_anomaly: 2.6603,
      year: -0.0093,
    },
  },
  species_threatened: [
    { entity: "All groups", year: 2025, threatened_species: 48646 },
    { entity: "All plants", year: 2025, threatened_species: 29748 },
    { entity: "All vertebrates", year: 2025, threatened_species: 11494 },
    { entity: "Fishes", year: 2025, threatened_species: 4085 },
    { entity: "Amphibians", year: 2025, threatened_species: 2930 },
    { entity: "Insects", year: 2025, threatened_species: 2680 },
    { entity: "Mammals", year: 2025, threatened_species: 1364 },
    { entity: "Birds", year: 2025, threatened_species: 1256 },
    { entity: "Reptiles", year: 2025, threatened_species: 1859 },
    { entity: "Molluscs", year: 2025, threatened_species: 2616 },
    { entity: "Corals", year: 2025, threatened_species: 333 },
    { entity: "All fungi", year: 2025, threatened_species: 417 },
  ],
  fit_metrics: {
    red_list_index: { mae: 0.0026, rmse: 0.003, r2: 0.99 },
    ocean_ph: { mae: 0.0034, rmse: 0.004, r2: 0.9605 },
    tree_cover_loss_ha: { mae: 1692906.3, rmse: 2265966.1, r2: 0.7729 },
    burned_total_ha: { mae: 38796293.8, rmse: 60715367.1, r2: 0.5701 },
    fish_capture_tonnes: { mae: 5635087.6, rmse: 7129166.4, r2: 0.9112 },
    coral_dhw: { mae: 2.2914, rmse: 2.696, r2: 0.5775 },
    coral_baa_max: { mae: 0.5309, rmse: 0.6271, r2: 0.5029 },
  },
} as const;

async function postComparison(url: string, request: ComparisonRequest) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}

function predictEcosystemMetric(
  metric: keyof typeof ECOSYSTEM_IMPACT_MODEL.params,
  temperature: number,
  year: number,
) {
  const params = ECOSYSTEM_IMPACT_MODEL.params[metric];
  return params.intercept + params.temperature_anomaly * temperature + params.year * year;
}

function buildEcosystemImpact(
  baselineTemp: number,
  scenarioTemp: number,
  targetYear: number,
) {
  const metrics = [
    "red_list_index",
    "ocean_ph",
    "tree_cover_loss_ha",
    "burned_total_ha",
    "fish_capture_tonnes",
    "coral_dhw",
    "coral_baa_max",
  ] as const;

  const baseline = Object.fromEntries(
    metrics.map((m) => [m, predictEcosystemMetric(m, baselineTemp, targetYear)]),
  ) as Record<typeof metrics[number], number>;

  const scenario = Object.fromEntries(
    metrics.map((m) => [m, predictEcosystemMetric(m, scenarioTemp, targetYear)]),
  ) as Record<typeof metrics[number], number>;

  const delta = Object.fromEntries(
    metrics.map((m) => [m, scenario[m] - baseline[m]]),
  ) as Record<typeof metrics[number], number>;

  return {
    training_years: ECOSYSTEM_IMPACT_MODEL.training_years,
    disclaimer: ECOSYSTEM_IMPACT_MODEL.disclaimer,
    coral_regions: [...ECOSYSTEM_IMPACT_MODEL.coral_regions],
    baseline,
    scenario,
    delta,
    fit_metrics: ECOSYSTEM_IMPACT_MODEL.fit_metrics,
    species_threatened: [...ECOSYSTEM_IMPACT_MODEL.species_threatened],
  };
}

type LegacyScenarioResponse = {
  historical_window: {
    start_year: number;
    end_year: number;
  };
  requested: {
    target_year: number;
    simulations: number;
    seed: number;
    scenario_modifiers: {
      co2: number;
      forest_loss: number;
      renewables: number;
    };
  };
  target_year_summary: {
    year: number;
    p05: number;
    p50: number;
    p95: number;
    mean: number;
  };
  projection: Array<{
    year: number;
    p05: number;
    p50: number;
    p95: number;
    mean: number;
  }>;
};

async function postLegacySimulation(body: {
  target_year: number;
  simulations: number;
  co2_modifier: number;
  forest_loss_modifier: number;
  renewables_modifier: number;
}) {
  return fetch("/api/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function buildClientComparison(
  request: ComparisonRequest,
  baseline: LegacyScenarioResponse,
  scenario: LegacyScenarioResponse,
): ComparisonResponse {
  const deltaSeries = baseline.projection.map((baselineRow, index) => {
    const scenarioRow = scenario.projection[index];
    return {
      year: baselineRow.year,
      p05: scenarioRow.p05 - baselineRow.p05,
      p50: scenarioRow.p50 - baselineRow.p50,
      p95: scenarioRow.p95 - baselineRow.p95,
      mean: scenarioRow.mean - baselineRow.mean,
    };
  });

  const baselineTarget = baseline.target_year_summary;
  const scenarioTarget = scenario.target_year_summary;
  const deltaTarget = deltaSeries.at(-1);
  if (!deltaTarget) {
    throw new Error("Unable to compute comparison delta from legacy simulation responses.");
  }

  const baselineWidth = baselineTarget.p95 - baselineTarget.p05;
  const scenarioWidth = scenarioTarget.p95 - scenarioTarget.p05;
  const widthDelta = scenarioWidth - baselineWidth;
  const rangeChange =
    Math.abs(widthDelta) < 0.05 ? "similar" : widthDelta > 0 ? "wider" : "narrower";
  const meaningfulThreshold = 0.05;
  const direction =
    Math.abs(deltaTarget.p50) < meaningfulThreshold
      ? "negligible"
      : deltaTarget.p50 > 0
        ? "warmer"
        : "cooler";

  const predictHeatMetric = (
    metric: keyof typeof HEAT_IMPACT_MODEL.params,
    temperature: number,
    year: number,
  ) => {
    const params = HEAT_IMPACT_MODEL.params[metric];
    return Math.max(
      0,
      params.intercept +
        params.temperature_anomaly * temperature +
        params.year * year,
    );
  };

  const targetYear = request.target_year;
  const baselineHeat = {
    heat_mortality_rate: predictHeatMetric("heat_mortality_rate", baselineTarget.p50, targetYear),
    annual_heat_deaths: predictHeatMetric("annual_heat_deaths", baselineTarget.p50, targetYear),
    heat_work_loss_pp: predictHeatMetric("heat_work_loss_pp", baselineTarget.p50, targetYear),
  };
  const scenarioHeat = {
    heat_mortality_rate: predictHeatMetric("heat_mortality_rate", scenarioTarget.p50, targetYear),
    annual_heat_deaths: predictHeatMetric("annual_heat_deaths", scenarioTarget.p50, targetYear),
    heat_work_loss_pp: predictHeatMetric("heat_work_loss_pp", scenarioTarget.p50, targetYear),
  };

  const predictFoodMetric = (
    metric: keyof typeof FOOD_AGRICULTURE_IMPACT_MODEL.params,
    temperature: number,
    year: number,
  ) => {
    const params = FOOD_AGRICULTURE_IMPACT_MODEL.params[metric];
    return Math.max(
      0,
      params.intercept +
        params.temperature_anomaly * temperature +
        params.year * year,
    );
  };

  const baselineFood = {
    undernourishment_pct: predictFoodMetric("undernourishment_pct", baselineTarget.p50, targetYear),
    food_price_index: predictFoodMetric("food_price_index", baselineTarget.p50, targetYear),
    agricultural_water_stress_pct: predictFoodMetric(
      "agricultural_water_stress_pct",
      baselineTarget.p50,
      targetYear,
    ),
  };
  const scenarioFood = {
    undernourishment_pct: predictFoodMetric("undernourishment_pct", scenarioTarget.p50, targetYear),
    food_price_index: predictFoodMetric("food_price_index", scenarioTarget.p50, targetYear),
    agricultural_water_stress_pct: predictFoodMetric(
      "agricultural_water_stress_pct",
      scenarioTarget.p50,
      targetYear,
    ),
  };

  return {
    target: "temperature_anomaly",
    request: {
      ...request,
      developer_overrides: {
        simulations: scenario.requested.simulations,
        seed: scenario.requested.seed,
      },
    },
    baseline: {
      label: "default_pathway",
      target_year: baselineTarget,
      series: baseline.projection,
    },
    scenario: {
      label: "user_scenario",
      target_year: scenarioTarget,
      series: scenario.projection,
    },
    delta: {
      target_year: deltaTarget,
      series: deltaSeries,
    },
    projection_start_year: baseline.historical_window.end_year + 1,
    historical_window: baseline.historical_window,
    interpretation_flags: {
      direction,
      meaningful_change: Math.abs(deltaTarget.p50) >= meaningfulThreshold,
      range_change: rangeChange,
    },
    heat_impact: {
      training_years: HEAT_IMPACT_MODEL.training_years,
      baseline: baselineHeat,
      scenario: scenarioHeat,
      delta: {
        heat_mortality_rate:
          scenarioHeat.heat_mortality_rate - baselineHeat.heat_mortality_rate,
        annual_heat_deaths:
          scenarioHeat.annual_heat_deaths - baselineHeat.annual_heat_deaths,
        heat_work_loss_pp:
          scenarioHeat.heat_work_loss_pp - baselineHeat.heat_work_loss_pp,
      },
      fit_metrics: {
        heat_mortality_rate: { mae: 0.1107, rmse: 0.1419, r2: 0.4927 },
        annual_heat_deaths: { mae: 55664.8137, rmse: 67117.6426, r2: 0.6467 },
        heat_work_loss_pp: { mae: 3.0445, rmse: 3.8911, r2: 0.5642 },
      },
    },
    food_agriculture_impact: {
      training_years: FOOD_AGRICULTURE_IMPACT_MODEL.training_years,
      baseline: baselineFood,
      scenario: scenarioFood,
      delta: {
        undernourishment_pct:
          scenarioFood.undernourishment_pct - baselineFood.undernourishment_pct,
        food_price_index: scenarioFood.food_price_index - baselineFood.food_price_index,
        agricultural_water_stress_pct:
          scenarioFood.agricultural_water_stress_pct -
          baselineFood.agricultural_water_stress_pct,
      },
      fit_metrics: {
        undernourishment_pct: { mae: 0.9221, rmse: 1.0492, r2: 0.7379 },
        food_price_index: { mae: 9.5461, rmse: 11.7081, r2: 0.7991 },
        agricultural_water_stress_pct: { mae: 0.1398, rmse: 0.1602, r2: 0.8854 },
      },
    },
    ecosystem_impact: buildEcosystemImpact(
      baselineTarget.p50,
      scenarioTarget.p50,
      targetYear,
    ),
    run_metadata: {
      generated_at: new Date().toISOString(),
    },
  };
}

function withDerivedImpacts(response: ComparisonResponse): ComparisonResponse {
  const targetYear = response.request.target_year;
  const baselineTarget = response.baseline.target_year;
  const scenarioTarget = response.scenario.target_year;

  const predictHeatMetric = (
    metric: keyof typeof HEAT_IMPACT_MODEL.params,
    temperature: number,
    year: number,
  ) => {
    const params = HEAT_IMPACT_MODEL.params[metric];
    return Math.max(
      0,
      params.intercept +
        params.temperature_anomaly * temperature +
        params.year * year,
    );
  };

  const predictFoodMetric = (
    metric: keyof typeof FOOD_AGRICULTURE_IMPACT_MODEL.params,
    temperature: number,
    year: number,
  ) => {
    const params = FOOD_AGRICULTURE_IMPACT_MODEL.params[metric];
    return Math.max(
      0,
      params.intercept +
        params.temperature_anomaly * temperature +
        params.year * year,
    );
  };

  const heatImpact =
    response.heat_impact ??
    (() => {
      const baselineHeat = {
        heat_mortality_rate: predictHeatMetric("heat_mortality_rate", baselineTarget.p50, targetYear),
        annual_heat_deaths: predictHeatMetric("annual_heat_deaths", baselineTarget.p50, targetYear),
        heat_work_loss_pp: predictHeatMetric("heat_work_loss_pp", baselineTarget.p50, targetYear),
      };
      const scenarioHeat = {
        heat_mortality_rate: predictHeatMetric("heat_mortality_rate", scenarioTarget.p50, targetYear),
        annual_heat_deaths: predictHeatMetric("annual_heat_deaths", scenarioTarget.p50, targetYear),
        heat_work_loss_pp: predictHeatMetric("heat_work_loss_pp", scenarioTarget.p50, targetYear),
      };
      return {
        training_years: HEAT_IMPACT_MODEL.training_years,
        baseline: baselineHeat,
        scenario: scenarioHeat,
        delta: {
          heat_mortality_rate:
            scenarioHeat.heat_mortality_rate - baselineHeat.heat_mortality_rate,
          annual_heat_deaths:
            scenarioHeat.annual_heat_deaths - baselineHeat.annual_heat_deaths,
          heat_work_loss_pp:
            scenarioHeat.heat_work_loss_pp - baselineHeat.heat_work_loss_pp,
        },
        fit_metrics: {
          heat_mortality_rate: { mae: 0.1107, rmse: 0.1419, r2: 0.4927 },
          annual_heat_deaths: { mae: 55664.8137, rmse: 67117.6426, r2: 0.6467 },
          heat_work_loss_pp: { mae: 3.0445, rmse: 3.8911, r2: 0.5642 },
        },
      };
    })();

  const foodImpact =
    response.food_agriculture_impact ??
    (() => {
      const baselineFood = {
        undernourishment_pct: predictFoodMetric("undernourishment_pct", baselineTarget.p50, targetYear),
        food_price_index: predictFoodMetric("food_price_index", baselineTarget.p50, targetYear),
        agricultural_water_stress_pct: predictFoodMetric(
          "agricultural_water_stress_pct",
          baselineTarget.p50,
          targetYear,
        ),
      };
      const scenarioFood = {
        undernourishment_pct: predictFoodMetric("undernourishment_pct", scenarioTarget.p50, targetYear),
        food_price_index: predictFoodMetric("food_price_index", scenarioTarget.p50, targetYear),
        agricultural_water_stress_pct: predictFoodMetric(
          "agricultural_water_stress_pct",
          scenarioTarget.p50,
          targetYear,
        ),
      };
      return {
        training_years: FOOD_AGRICULTURE_IMPACT_MODEL.training_years,
        baseline: baselineFood,
        scenario: scenarioFood,
        delta: {
          undernourishment_pct:
            scenarioFood.undernourishment_pct - baselineFood.undernourishment_pct,
          food_price_index: scenarioFood.food_price_index - baselineFood.food_price_index,
          agricultural_water_stress_pct:
            scenarioFood.agricultural_water_stress_pct -
            baselineFood.agricultural_water_stress_pct,
        },
        fit_metrics: {
          undernourishment_pct: { mae: 0.9221, rmse: 1.0492, r2: 0.7379 },
          food_price_index: { mae: 9.5461, rmse: 11.7081, r2: 0.7991 },
          agricultural_water_stress_pct: { mae: 0.1398, rmse: 0.1602, r2: 0.8854 },
        },
      };
    })();

  const ecosystemImpact =
    response.ecosystem_impact ??
    buildEcosystemImpact(baselineTarget.p50, scenarioTarget.p50, targetYear);

  return {
    ...response,
    heat_impact: heatImpact,
    food_agriculture_impact: foodImpact,
    ecosystem_impact: ecosystemImpact,
  };
}

export async function runComparison(
  request: ComparisonRequest,
): Promise<ComparisonResponse> {
  const response = await postComparison("/api/compare", request);
  if (response.status === 404) {
    const [baselineResponse, scenarioResponse] = await Promise.all([
      postLegacySimulation({
        target_year: request.target_year,
        simulations: request.simulations ?? 1000,
        co2_modifier: 0,
        forest_loss_modifier: 0,
        renewables_modifier: 0,
      }),
      postLegacySimulation({
        target_year: request.target_year,
        simulations: request.simulations ?? 1000,
        co2_modifier: request.scenario_modifiers.co2,
        forest_loss_modifier: request.scenario_modifiers.forest_loss,
        renewables_modifier: request.scenario_modifiers.renewables,
      }),
    ]);

    if (!baselineResponse.ok || !scenarioResponse.ok) {
      const failed = !scenarioResponse.ok ? scenarioResponse : baselineResponse;
      let detail = `Comparison request failed (${failed.status})`;
      try {
        const payload = (await failed.json()) as { detail?: string };
        if (payload.detail) {
          detail = payload.detail;
        }
      } catch {
        // Keep fallback error.
      }
      throw new Error(detail);
    }

    const baselinePayload = (await baselineResponse.json()) as LegacyScenarioResponse;
    const scenarioPayload = (await scenarioResponse.json()) as LegacyScenarioResponse;
    return buildClientComparison(request, baselinePayload, scenarioPayload);
  }

  if (!response.ok) {
    let detail = `Comparison request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
      }
    } catch {
      // Keep fallback.
    }
    throw new Error(detail);
  }

  const payload = (await response.json()) as ComparisonResponse;
  return withDerivedImpacts(payload);
}
