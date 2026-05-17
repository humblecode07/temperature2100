export type Metrics = {
  mae: number;
  rmse: number;
  r2: number;
};

export type HistoricalArimaRow = {
  year: number;
  temperature_anomaly: number;
  arima_fitted: number;
};

export type ScenarioControls = {
  target_year: { min: number; max: number; default: number };
  simulations: { min: number; max: number; default: number };
  modifiers: {
    co2: { min: number; max: number; default: number };
    forest_loss: { min: number; max: number; default: number };
    renewables: { min: number; max: number; default: number };
  };
};

export type ModelData = {
  generated_at: string;
  target: string;
  datasets: {
    long_term_rows: number;
    short_term_rows: number;
    long_term_range: { start: number; end: number };
    short_term_range: { start: number; end: number };
  };
  metrics: {
    mlr_full_period: Metrics;
    mlr_recent_period: Metrics;
    arima_full_series: Metrics;
    arima_recent_period: Metrics;
  };
  scenario_controls: ScenarioControls;
  historical_series: {
    arima_benchmark: HistoricalArimaRow[];
  };
};

export type DraftScenario = {
  targetYear: number;
  simulations: number;
  co2: number;
  forestLoss: number;
  renewables: number;
};

export type ComparisonRequest = {
  target_year: number;
  simulations?: number;
  seed?: number;
  scenario_modifiers: {
    co2: number;
    forest_loss: number;
    renewables: number;
  };
};

export type ProjectionRow = {
  year: number;
  p05: number;
  p50: number;
  p95: number;
  mean: number;
};

export type ComparisonResponse = {
  target: string;
  request: ComparisonRequest & {
    developer_overrides?: {
      simulations: number;
      seed: number;
    };
  };
  baseline: {
    label: string;
    target_year: ProjectionRow;
    series: ProjectionRow[];
  };
  scenario: {
    label: string;
    target_year: ProjectionRow;
    series: ProjectionRow[];
  };
  delta: {
    target_year: ProjectionRow;
    series: ProjectionRow[];
  };
  projection_start_year: number;
  historical_window: {
    start_year: number;
    end_year: number;
  };
  interpretation_flags: {
    direction: "warmer" | "cooler" | "negligible";
    meaningful_change: boolean;
    range_change: "wider" | "narrower" | "similar";
  };
  heat_impact?: {
    training_years: {
      start: number;
      end: number;
    };
    baseline: {
      heat_mortality_rate: number;
      annual_heat_deaths: number;
      heat_work_loss_pp: number;
    };
    scenario: {
      heat_mortality_rate: number;
      annual_heat_deaths: number;
      heat_work_loss_pp: number;
    };
    delta: {
      heat_mortality_rate: number;
      annual_heat_deaths: number;
      heat_work_loss_pp: number;
    };
    fit_metrics: {
      heat_mortality_rate: Metrics;
      annual_heat_deaths: Metrics;
      heat_work_loss_pp: Metrics;
    };
  };
  food_agriculture_impact?: {
    training_years: {
      start: number;
      end: number;
    };
    baseline: {
      undernourishment_pct: number;
      food_price_index: number;
      agricultural_water_stress_pct: number;
    };
    scenario: {
      undernourishment_pct: number;
      food_price_index: number;
      agricultural_water_stress_pct: number;
    };
    delta: {
      undernourishment_pct: number;
      food_price_index: number;
      agricultural_water_stress_pct: number;
    };
    fit_metrics: {
      undernourishment_pct: Metrics;
      food_price_index: Metrics;
      agricultural_water_stress_pct: Metrics;
    };
  };
  ecosystem_impact?: {
    training_years: { start: number; end: number };
    disclaimer: string;
    coral_regions: string[];
    baseline: {
      red_list_index: number;
      ocean_ph: number;
      tree_cover_loss_ha: number;
      burned_total_ha: number;
      fish_capture_tonnes: number;
      coral_dhw: number;
      coral_baa_max: number;
    };
    scenario: {
      red_list_index: number;
      ocean_ph: number;
      tree_cover_loss_ha: number;
      burned_total_ha: number;
      fish_capture_tonnes: number;
      coral_dhw: number;
      coral_baa_max: number;
    };
    delta: {
      red_list_index: number;
      ocean_ph: number;
      tree_cover_loss_ha: number;
      burned_total_ha: number;
      fish_capture_tonnes: number;
      coral_dhw: number;
      coral_baa_max: number;
    };
    fit_metrics: {
      red_list_index: Metrics;
      ocean_ph: Metrics;
      tree_cover_loss_ha: Metrics;
      burned_total_ha: Metrics;
      fish_capture_tonnes: Metrics;
      coral_dhw: Metrics;
      coral_baa_max: Metrics;
    };
    species_threatened: Array<{ entity: string; year: number; threatened_species: number }>;
  };
  run_metadata: {
    generated_at: string;
  };
};
