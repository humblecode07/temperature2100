"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";

const DEGREE_LABEL = "\u00B0C";
const API_BASE = "/api";

type Metrics = {
  mae: number;
  rmse: number;
  r2: number;
};

type HistoricalMlrRow = {
  year: number;
  temperature_anomaly: number;
  mlr_prediction: number;
};

type HistoricalArimaRow = {
  year: number;
  temperature_anomaly: number;
  arima_fitted: number;
};

type ArimaForecastRow = {
  year: number;
  arima_prediction: number;
};

type ScenarioControls = {
  target_year: { min: number; max: number; default: number };
  simulations: { min: number; max: number; default: number };
  modifiers: {
    co2: { min: number; max: number; default: number };
    forest_loss: { min: number; max: number; default: number };
    renewables: { min: number; max: number; default: number };
  };
};

type ModelData = {
  generated_at: string;
  target: string;
  datasets: {
    long_term_rows: number;
    short_term_rows: number;
    long_term_range: { start: number; end: number };
    short_term_range: { start: number; end: number };
  };
  model_notes: {
    mlr_role: string;
    arima_role: string;
    monte_carlo_role: string;
  };
  metrics: {
    mlr_full_period: Metrics;
    mlr_recent_period: Metrics;
    arima_full_series: Metrics;
    arima_recent_period: Metrics;
  };
  scenario_controls: ScenarioControls;
  historical_series: {
    mlr: HistoricalMlrRow[];
    arima_benchmark: HistoricalArimaRow[];
  };
  future_projection: {
    arima_benchmark: ArimaForecastRow[];
  };
  scenario_metadata: {
    api_path: string;
  };
};

type ProjectionRow = {
  year: number;
  p05: number;
  p50: number;
  p95: number;
  mean: number;
};

type ScenarioResponse = {
  requested: {
    target_year: number;
    simulations: number;
    scenario_modifiers: {
      co2: number;
      forest_loss: number;
      renewables: number;
    };
  };
  historical_window: {
    start_year: number;
    end_year: number;
  };
  target_year_summary: {
    year: number;
    p05: number;
    p50: number;
    p95: number;
    mean: number;
    arima_benchmark: number | null;
  };
  projection: ProjectionRow[];
};

type ScenarioInputs = {
  targetYear: number;
  simulations: number;
  co2Modifier: number;
  forestLossModifier: number;
  renewablesModifier: number;
};

type Insight = {
  title: string;
  text: string;
};

type ScenarioInterpretation = {
  label: string;
  tone: string;
  summary: string;
  advice: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDegrees(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${DEGREE_LABEL}`;
}

function formatRange(low: number, high: number) {
  return `${formatDegrees(low, 2)} to ${formatDegrees(high, 2)}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function formatIsoDate(isoDate: string) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
}

function resolveScenarioApiUrl(apiPath: string) {
  if (!API_BASE) {
    return null;
  }
  return `${API_BASE.replace(/\/$/, "")}${apiPath}`;
}

function buildInsights(modelData: ModelData, scenario: ScenarioResponse | null): Insight[] {
  return [
    { title: "MLR Role", text: modelData.model_notes.mlr_role },
    { title: "ARIMA Benchmark", text: modelData.model_notes.arima_role },
    { title: "Monte Carlo Role", text: modelData.model_notes.monte_carlo_role },
    {
      title: "Live Scenario",
      text: scenario
        ? `The chart is using a live Python simulation for ${scenario.requested.target_year} with ${scenario.requested.simulations} Monte Carlo runs.`
        : "Waiting for the Python scenario simulation to run.",
    },
  ];
}

function interpretScenario(scenario: ScenarioResponse | null): ScenarioInterpretation | null {
  if (!scenario) {
    return null;
  }

  const median = scenario.target_year_summary.p50;

  if (median < 1.5) {
    return {
      label: "Lower-risk path",
      tone: "stable",
      summary:
        "The projected median stays in a comparatively lower warming range for the selected year.",
      advice:
        "This scenario suggests current mitigation assumptions are helping, but continued emissions control is still needed to avoid drifting upward later.",
    };
  }

  if (median < 2) {
    return {
      label: "Watch closely",
      tone: "watch",
      summary:
        "The median projection is moving into a range where climate impacts become harder to manage.",
      advice:
        "This is a warning zone. Cutting emissions and improving renewable adoption would be the clearest policy response.",
    };
  }

  if (median < 3) {
    return {
      label: "High concern",
      tone: "alert",
      summary:
        "The median projection indicates strong warming pressure by the selected target year.",
      advice:
        "This result supports stronger intervention, especially on emissions and long-term adaptation planning.",
    };
  }

  return {
    label: "Severe pathway",
    tone: "danger",
    summary:
      "The median projection is in a very high warming range, which points to severe long-term risk.",
    advice:
      "This scenario should be treated as a strong signal for urgent mitigation and adaptation decisions.",
  };
}

export default function Home() {
  const currentYear = new Date().getFullYear();
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  const [isHydrated, setIsHydrated] = useState(false);
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [inputs, setInputs] = useState<ScenarioInputs | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [showHistorical, setShowHistorical] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadModelData() {
      try {
        const response = await fetch("/model_data.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Unable to load model_data.json (${response.status})`);
        }

        const payload = (await response.json()) as ModelData;
        if (cancelled) {
          return;
        }

        setModelData(payload);
        const projectionStartYear = Math.max(payload.scenario_controls.target_year.min, currentYear);
        setInputs({
          targetYear: clamp(
            payload.scenario_controls.target_year.default,
            projectionStartYear,
            payload.scenario_controls.target_year.max,
          ),
          simulations: payload.scenario_controls.simulations.default,
          co2Modifier: payload.scenario_controls.modifiers.co2.default,
          forestLossModifier: payload.scenario_controls.modifiers.forest_loss.default,
          renewablesModifier: payload.scenario_controls.modifiers.renewables.default,
        });
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unknown error while loading model data.",
        );
      }
    }

    loadModelData();

    return () => {
      cancelled = true;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [currentYear]);

  useEffect(() => {
    if (!modelData || !inputs) {
      return;
    }

    const currentModelData = modelData;
    const currentInputs = inputs;
    const controller = new AbortController();

    async function runScenario() {
      setIsRunning(true);
      try {
        const apiUrl = resolveScenarioApiUrl(currentModelData.scenario_metadata.api_path);
        if (!apiUrl) {
          throw new Error(
            "Scenario API is not configured. Set SCENARIO_API_BASE in the frontend deployment so the Next.js /api proxy can reach the backend.",
          );
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target_year: currentInputs.targetYear,
            simulations: currentInputs.simulations,
            co2_modifier: currentInputs.co2Modifier,
            forest_loss_modifier: currentInputs.forestLossModifier,
            renewables_modifier: currentInputs.renewablesModifier,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = `Scenario request failed (${response.status})`;
          try {
            const payload = (await response.json()) as { detail?: string };
            if (payload.detail) {
              detail = payload.detail;
            }
          } catch {
            // Keep the fallback message.
          }
          throw new Error(detail);
        }

        const payload = (await response.json()) as ScenarioResponse;
        setScenarioResult(payload);
        setError(null);
      } catch (requestError) {
        if ((requestError as Error).name === "AbortError") {
          return;
        }

        setScenarioResult(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unknown error while running the Python simulation.",
        );
      } finally {
        setIsRunning(false);
      }
    }

    runScenario();
    return () => controller.abort();
  }, [inputs, modelData]);

  const insights = useMemo(() => {
    if (!modelData) {
      return [];
    }
    return buildInsights(modelData, scenarioResult);
  }, [modelData, scenarioResult]);

  const scenarioInterpretation = useMemo(
    () => interpretScenario(scenarioResult),
    [scenarioResult],
  );

  useEffect(() => {
    if (!chartRef.current || !modelData || !scenarioResult) {
      return;
    }

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const latestHistoricalYear = Math.max(
      ...modelData.historical_series.arima_benchmark.map((row) => row.year),
    );
    const projectionDisplayStartYear = Math.max(latestHistoricalYear + 1, currentYear);
    const visibleProjection = scenarioResult.projection.filter(
      (row) => row.year >= projectionDisplayStartYear,
    );
    const historicalData = showHistorical
      ? modelData.historical_series.arima_benchmark
          .filter((row) => row.year <= latestHistoricalYear)
          .map((row) => ({
            x: row.year,
            y: row.temperature_anomaly,
          }))
      : [];
    const monteCarloBandHigh = visibleProjection.map((row) => ({ x: row.year, y: row.p95 }));
    const monteCarloBandLow = visibleProjection.map((row) => ({ x: row.year, y: row.p05 }));
    const monteCarloMedian = visibleProjection.map((row) => ({ x: row.year, y: row.p50 }));
    const arimaFuture = modelData.future_projection.arima_benchmark
      .filter(
        (row) =>
          row.year >= projectionDisplayStartYear &&
          row.year <= scenarioResult.requested.target_year,
      )
      .map((row) => ({ x: row.year, y: row.arima_prediction }));

    chartInstanceRef.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Monte Carlo high (95th)",
            data: monteCarloBandHigh,
            borderColor: "rgba(61, 139, 104, 0)",
            backgroundColor: "rgba(61, 139, 104, 0.18)",
            pointRadius: 0,
            borderWidth: 0,
            fill: false,
          },
          {
            label: "Monte Carlo range",
            data: monteCarloBandLow,
            borderColor: "rgba(61, 139, 104, 0)",
            backgroundColor: "rgba(61, 139, 104, 0.18)",
            pointRadius: 0,
            borderWidth: 0,
            fill: "-1",
          },
          {
            label: "Monte Carlo median",
            data: monteCarloMedian,
            borderColor: "#3d8b68",
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.24,
            fill: false,
          },
          {
            label: "ARIMA benchmark",
            data: arimaFuture,
            borderColor: "#ea7c54",
            borderDash: [8, 6],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.22,
            fill: false,
          },
          {
            label: "Historical actual",
            data: historicalData,
            borderColor: "#173126",
            borderWidth: 2,
            pointRadius: showHistorical ? 1.5 : 0,
            tension: 0.18,
            fill: false,
            hidden: !showHistorical,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        animation: {
          duration: 400,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: {
            labels: {
              usePointStyle: true,
              color: "#173126",
              font: {
                family: "Candara, Trebuchet MS, sans-serif",
                size: 13,
              },
              filter: (item) => item.text !== "Monte Carlo high (95th)",
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = typeof context.parsed.y === "number" ? context.parsed.y : 0;
                return `${context.dataset.label}: ${formatDegrees(value, 2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: showHistorical
              ? modelData.datasets.long_term_range.start
              : projectionDisplayStartYear,
            max: scenarioResult.requested.target_year,
            grid: {
              color: "rgba(23, 49, 38, 0.06)",
            },
            ticks: {
              color: "#587468",
              maxTicksLimit: 12,
              callback: (value) => `${value}`,
            },
            title: {
              display: true,
              text: "Year",
              color: "#587468",
            },
          },
          y: {
            title: {
              display: true,
              text: `Temperature anomaly (${DEGREE_LABEL})`,
              color: "#587468",
            },
            grid: {
              color: "rgba(23, 49, 38, 0.06)",
            },
            ticks: {
              color: "#587468",
              callback: (value) => `${Number(value) >= 0 ? "+" : ""}${value}${DEGREE_LABEL}`,
            },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [currentYear, modelData, scenarioResult, showHistorical]);

  function updateInput(name: keyof ScenarioInputs, rawValue: string) {
    if (!modelData || !inputs) {
      return;
    }

    const projectionStartYear = Math.max(modelData.scenario_controls.target_year.min, currentYear);
    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) {
      return;
    }

    const nextValue =
      name === "targetYear"
        ? clamp(
            numericValue,
            projectionStartYear,
            modelData.scenario_controls.target_year.max,
          )
        : name === "simulations"
          ? clamp(
              numericValue,
              modelData.scenario_controls.simulations.min,
              modelData.scenario_controls.simulations.max,
            )
          : name === "co2Modifier"
            ? clamp(
                numericValue,
                modelData.scenario_controls.modifiers.co2.min,
                modelData.scenario_controls.modifiers.co2.max,
              )
            : name === "forestLossModifier"
              ? clamp(
                  numericValue,
                  modelData.scenario_controls.modifiers.forest_loss.min,
                  modelData.scenario_controls.modifiers.forest_loss.max,
                )
              : clamp(
                  numericValue,
                  modelData.scenario_controls.modifiers.renewables.min,
                  modelData.scenario_controls.modifiers.renewables.max,
                );

    setInputs({ ...inputs, [name]: nextValue });
  }

  const longTermStart = modelData?.datasets.long_term_range.start ?? 1880;
  const historicalSeriesEnd =
    modelData?.historical_series.arima_benchmark.at(-1)?.year ??
    modelData?.datasets.long_term_range.end ??
    2024;
  const shortTermStart = modelData?.datasets.short_term_range.start ?? 2000;
  const shortTermEnd = modelData?.datasets.short_term_range.end ?? 2020;
  const projectionStartYear = Math.max(modelData?.scenario_controls.target_year.min ?? 2021, currentYear);
  const controlsReady = isHydrated && !!inputs;

  if (!isHydrated) {
    return (
      <div className="page-shell">
        <header className="hero" id="top">
          <nav className="topbar">
            <div className="brand">
              <span className="brand-mark" />
              <span>Temperature Projection</span>
            </div>
          </nav>

          <div className="hero-content">
            <div className="hero-copy">
              <p className="eyebrow">Climate Future Simulator</p>
              <h1>Temperature Projection</h1>
              <p className="subtitle">Loading interactive simulator...</p>
              <p className="description">Preparing the client-side scenario controls.</p>
            </div>

            <div className="hero-card">
              <div className="hero-stat">
                <span className="stat-label">Projected median</span>
                <strong>...</strong>
              </div>
            </div>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="hero" id="top">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark" />
            <span>Temperature Projection</span>
          </div>
          <a className="ghost-link" href="#simulation">
            Simulation
          </a>
        </nav>

        <div className="hero-content">
          <div className="hero-copy reveal">
            <p className="eyebrow">Climate Future Simulator</p>
            <h1>Temperature Projection</h1>
            <p className="subtitle">Live Python Scenario Runs</p>
            <p className="description">
              Change the climate variables, send them to the Python scenario engine, and compare
              the Monte Carlo forecast against the ARIMA benchmark for any supported target year.
            </p>
            <a className="primary-button" href="#simulation">
              Open Simulator
            </a>
          </div>

          <div className="hero-card reveal">
            <div className="hero-stat">
              <span className="stat-label">
                Projected median at {scenarioResult?.target_year_summary.year ?? inputs?.targetYear ?? "..." }
              </span>
              <strong>
                {scenarioResult
                  ? formatDegrees(scenarioResult.target_year_summary.p50, 1)
                  : "+1.1\u00B0C"}
              </strong>
            </div>
            <div className="hero-mini-chart" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p>
              Historical observations run through {historicalSeriesEnd}. The future curve now comes from a
              live Python simulation request instead of a browser-only adjustment layer.
            </p>
          </div>
        </div>
      </header>

      <main>
        <section className="simulation-section" id="simulation">
          <div className="section-heading reveal">
            <p className="eyebrow">Scenario Controls</p>
            <h2>Run a Climate Scenario</h2>
            <p>
              These controls now map to the Python scenario engine. Each change reruns the Monte
              Carlo simulation with your selected modifiers and target year.
            </p>
          </div>

          <div className="simulation-grid">
            <aside className="control-panel reveal">
              <div className="control-card">
                <label htmlFor="co2Modifier">
                  <span>CO2 Emissions Modifier</span>
                  <strong>{formatSignedPercent(inputs?.co2Modifier ?? 0)}</strong>
                </label>
                <p className="helper">Shifts the future CO2 trajectory relative to the baseline path.</p>
                <div className="control-inputs">
                  <input
                    id="co2Modifier"
                    type="range"
                    min={modelData?.scenario_controls.modifiers.co2.min ?? -100}
                    max={modelData?.scenario_controls.modifiers.co2.max ?? 200}
                    value={controlsReady ? (inputs?.co2Modifier ?? 0) : 0}
                    step="1"
                    onChange={(event) => updateInput("co2Modifier", event.target.value)}
                    disabled={!controlsReady}
                  />
                  <div className="manual-input">
                    <input
                      type="number"
                      value={controlsReady ? (inputs?.co2Modifier ?? 0) : 0}
                      step="1"
                      onChange={(event) => updateInput("co2Modifier", event.target.value)}
                      disabled={!controlsReady}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <label htmlFor="forestLossModifier">
                  <span>Forest-Loss Modifier</span>
                  <strong>{formatSignedPercent(inputs?.forestLossModifier ?? 0)}</strong>
                </label>
                <p className="helper">Raises or lowers projected forest-loss pressure in the simulation.</p>
                <div className="control-inputs">
                  <input
                    id="forestLossModifier"
                    type="range"
                    min={modelData?.scenario_controls.modifiers.forest_loss.min ?? -100}
                    max={modelData?.scenario_controls.modifiers.forest_loss.max ?? 200}
                    value={controlsReady ? (inputs?.forestLossModifier ?? 0) : 0}
                    step="1"
                    onChange={(event) => updateInput("forestLossModifier", event.target.value)}
                    disabled={!controlsReady}
                  />
                  <div className="manual-input">
                    <input
                      type="number"
                      value={controlsReady ? (inputs?.forestLossModifier ?? 0) : 0}
                      step="1"
                      onChange={(event) => updateInput("forestLossModifier", event.target.value)}
                      disabled={!controlsReady}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <label htmlFor="renewablesModifier">
                  <span>Renewable-Energy Modifier</span>
                  <strong>{formatSignedPercent(inputs?.renewablesModifier ?? 0)}</strong>
                </label>
                <p className="helper">Changes the renewable-energy trajectory used by the future simulation.</p>
                <div className="control-inputs">
                  <input
                    id="renewablesModifier"
                    type="range"
                    min={modelData?.scenario_controls.modifiers.renewables.min ?? -100}
                    max={modelData?.scenario_controls.modifiers.renewables.max ?? 200}
                    value={controlsReady ? (inputs?.renewablesModifier ?? 0) : 0}
                    step="1"
                    onChange={(event) => updateInput("renewablesModifier", event.target.value)}
                    disabled={!controlsReady}
                  />
                  <div className="manual-input">
                    <input
                      type="number"
                      value={controlsReady ? (inputs?.renewablesModifier ?? 0) : 0}
                      step="1"
                      onChange={(event) => updateInput("renewablesModifier", event.target.value)}
                      disabled={!controlsReady}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <label htmlFor="targetYear">
                  <span>Target Year</span>
                  <strong>{inputs?.targetYear ?? modelData?.scenario_controls.target_year.default ?? 2035}</strong>
                </label>
                <p className="helper">Choose the future year to forecast.</p>
                <div className="control-inputs">
                  <input
                    id="targetYear"
                    type="range"
                    min={projectionStartYear}
                    max={modelData?.scenario_controls.target_year.max ?? 2100}
                    value={controlsReady ? (inputs?.targetYear ?? modelData?.scenario_controls.target_year.default ?? 2035) : (modelData?.scenario_controls.target_year.default ?? 2035)}
                    step="1"
                    onChange={(event) => updateInput("targetYear", event.target.value)}
                    disabled={!controlsReady}
                  />
                  <div className="manual-input">
                    <input
                      type="number"
                      value={controlsReady ? (inputs?.targetYear ?? modelData?.scenario_controls.target_year.default ?? 2035) : (modelData?.scenario_controls.target_year.default ?? 2035)}
                      min={projectionStartYear}
                      step="1"
                      onChange={(event) => updateInput("targetYear", event.target.value)}
                      disabled={!controlsReady}
                    />
                    <span>yr</span>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <label htmlFor="simulations">
                  <span>Monte Carlo Iterations</span>
                  <strong>{inputs?.simulations ?? modelData?.scenario_controls.simulations.default ?? 1000}</strong>
                </label>
                <p className="helper">
                  Higher values make the simulation more stable, but slower. This changes the Python run itself.
                </p>
                <div className="control-inputs">
                  <input
                    id="simulations"
                    type="range"
                    min={modelData?.scenario_controls.simulations.min ?? 25}
                    max={Math.min(modelData?.scenario_controls.simulations.max ?? 10000, 5000)}
                    value={controlsReady ? (inputs?.simulations ?? modelData?.scenario_controls.simulations.default ?? 1000) : (modelData?.scenario_controls.simulations.default ?? 1000)}
                    step="25"
                    onChange={(event) => updateInput("simulations", event.target.value)}
                    disabled={!controlsReady}
                  />
                  <div className="manual-input">
                    <input
                      type="number"
                      value={controlsReady ? (inputs?.simulations ?? modelData?.scenario_controls.simulations.default ?? 1000) : (modelData?.scenario_controls.simulations.default ?? 1000)}
                      step="25"
                      onChange={(event) => updateInput("simulations", event.target.value)}
                      disabled={!controlsReady}
                    />
                    <span>runs</span>
                  </div>
                </div>
              </div>

              <div className="control-card">
                <label htmlFor="showHistorical">
                  <span>Historical Data</span>
                  <strong>{showHistorical ? "Shown" : "Hidden"}</strong>
                </label>
                <p className="helper">Toggle the observed historical series on the chart.</p>
                <label className="checkbox-line" htmlFor="showHistorical">
                  <input
                    id="showHistorical"
                    type="checkbox"
                    checked={showHistorical}
                    onChange={(event) => setShowHistorical(event.target.checked)}
                  />
                  <span>Include historical observations in the graph</span>
                </label>
              </div>

              <div className={`loading-state${isRunning ? " active" : ""}`}>
                {isRunning ? "Running Python simulation..." : "Simulation ready."}
              </div>
            </aside>

            <section className="results-panel reveal">
              <div className="result-summary">
                <div className="metric-card">
                  <span>Median at {scenarioResult?.target_year_summary.year ?? inputs?.targetYear ?? "..."}</span>
                  <strong>
                    {scenarioResult ? formatDegrees(scenarioResult.target_year_summary.p50, 2) : "Loading..."}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Likely range</span>
                  <strong>
                    {scenarioResult
                      ? formatRange(scenarioResult.target_year_summary.p05, scenarioResult.target_year_summary.p95)
                      : "Loading..."}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>ARIMA benchmark</span>
                  <strong>
                    {scenarioResult?.target_year_summary.arima_benchmark !== null &&
                    scenarioResult?.target_year_summary.arima_benchmark !== undefined
                      ? formatDegrees(scenarioResult.target_year_summary.arima_benchmark, 2)
                      : "N/A"}
                  </strong>
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-header">
                  <div>
                    <p className="eyebrow">Visualization</p>
                    <h3>Global Temperature Projection</h3>
                  </div>
                  <div className="chart-actions">
                    <span className="chart-note">
                      {showHistorical
                        ? `${longTermStart} to ${scenarioResult?.requested.target_year ?? inputs?.targetYear ?? "..."}`
                        : `${projectionStartYear} to ${scenarioResult?.requested.target_year ?? inputs?.targetYear ?? "..."}`}
                    </span>
                    <button
                      type="button"
                      className="ghost-link"
                      onClick={() => setShowDebug((current) => !current)}
                      aria-pressed={showDebug}
                    >
                      {showDebug ? "Hide Debug" : "Show Debug"}
                    </button>
                  </div>
                </div>
                <div className="chart-stage">
                  <canvas ref={chartRef} aria-label="Temperature chart" />
                </div>
                <p className="chart-note">
                  Green line: Monte Carlo median. Green band: 5th to 95th percentile. Orange line: ARIMA benchmark.
                </p>
              </div>

              <div className={`interpretation-card${scenarioInterpretation ? ` ${scenarioInterpretation.tone}` : ""}`}>
                <p className="eyebrow">Interpretation</p>
                <h3>{scenarioInterpretation?.label ?? "Waiting for scenario result"}</h3>
                <p>
                  {scenarioInterpretation?.summary ??
                    "Run the scenario to generate a plain-language reading of the forecast."}
                </p>
                <p className="interpretation-advice">
                  {scenarioInterpretation?.advice ??
                    "The advice panel will update automatically after the simulation finishes."}
                </p>
              </div>

              {showDebug && (
                <div className="about-card">
                  <p>Generated: {modelData ? formatIsoDate(modelData.generated_at) : "Loading..."}</p>
                  <p>
                    API endpoint:{" "}
                    {modelData
                      ? (resolveScenarioApiUrl(modelData.scenario_metadata.api_path) ?? "Not configured")
                      : (API_BASE || "Not configured")}
                  </p>
                  <p>Live target year: {scenarioResult?.requested.target_year ?? inputs?.targetYear ?? "..."}</p>
                  <p>Live simulations: {scenarioResult?.requested.simulations ?? inputs?.simulations ?? "..."}</p>
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="insights-section reveal">
          <div className="section-heading">
            <p className="eyebrow">Insights</p>
            <h2>How to Read the Models</h2>
          </div>
          <div className="insight-grid">
            {error ? (
              <article>
                <h3>Simulation unavailable</h3>
                <p>{error}</p>
              </article>
            ) : (
              insights.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="about-section reveal">
          <div className="section-heading">
            <p className="eyebrow">About the Project</p>
            <h2>Website + Python API</h2>
          </div>
          <div className="about-card">
            <p>
              The website now uses the static export for historical context and model metadata, but the future scenario itself comes from the Python API.
            </p>
            <p>
              This keeps the frontend controls aligned with the actual model instead of applying browser-only climate adjustments.
            </p>
            <p>
              {error
                ? "If the simulation is unavailable, make sure the FastAPI server is running and reachable from the frontend."
                : modelData
                  ? `MLR recent R2: ${modelData.metrics.mlr_recent_period.r2.toFixed(3)}, ARIMA recent R2: ${modelData.metrics.arima_recent_period.r2.toFixed(3)}.`
                  : "Loading exported model metadata..."}
            </p>
            <ul>
              {error ? (
                <li>{error}</li>
              ) : (
                <>
                  <li>Long-term dataset: {longTermStart}-{modelData?.datasets.long_term_range.end ?? 2024} ({modelData?.datasets.long_term_rows ?? 0} rows)</li>
                  <li>Historical benchmark shown: {longTermStart}-{historicalSeriesEnd}</li>
                  <li>Short-term dataset: {shortTermStart}-{shortTermEnd} ({modelData?.datasets.short_term_rows ?? 0} rows)</li>
                  <li>Current API base: {API_BASE || "Not configured"}</li>
                  <li>Current target year: {scenarioResult?.requested.target_year ?? inputs?.targetYear ?? "..."}</li>
                </>
              )}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
