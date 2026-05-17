"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { ComparisonResponse, HistoricalArimaRow } from "./types";
import { DEGREE_LABEL, formatDegrees } from "./helpers";

type Props = {
  result: ComparisonResponse;
  historical: HistoricalArimaRow[];
};

export function ComparisonCharts({ result, historical }: Props) {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deltaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainChartRef = useRef<Chart | null>(null);
  const deltaChartRef = useRef<Chart | null>(null);
  const zoomRegistered = useRef(false);

  const [mainIsZoomed, setMainIsZoomed] = useState(false);
  const [deltaIsZoomed, setDeltaIsZoomed] = useState(false);
  const simulationCount =
    result.request.developer_overrides?.simulations ?? null;
  const simulationLabel = simulationCount
    ? `Based on ${simulationCount.toLocaleString()} simulations`
    : "Monte Carlo projection";

  const resetMainZoom = useCallback(() => {
    if (mainChartRef.current) {
      mainChartRef.current.resetZoom();
      setMainIsZoomed(false);
    }
  }, []);

  const resetDeltaZoom = useCallback(() => {
    if (deltaChartRef.current) {
      deltaChartRef.current.resetZoom();
      setDeltaIsZoomed(false);
    }
  }, []);

  useEffect(() => {
    if (!mainCanvasRef.current || !deltaCanvasRef.current) {
      return;
    }

    // Dynamically import chartjs-plugin-zoom so Hammer.js only loads
    // in the browser (it accesses `window` at module evaluation time).
    let cancelled = false;

    async function initCharts() {
      if (!zoomRegistered.current) {
        const { default: zoomPlugin } = await import("chartjs-plugin-zoom");
        Chart.register(zoomPlugin);
        zoomRegistered.current = true;
      }

      if (cancelled || !mainCanvasRef.current || !deltaCanvasRef.current) {
        return;
      }

      buildCharts();
    }

    function buildCharts() {
      if (!mainCanvasRef.current || !deltaCanvasRef.current) {
        return;
      }

    const historyPoints = historical.map((row) => ({ x: row.year, y: row.temperature_anomaly }));
    const projectionStart = Math.max(result.projection_start_year, 2026);
    const visibleBaseline = result.baseline.series.filter((row) => row.year >= projectionStart);
    const visibleScenario = result.scenario.series.filter((row) => row.year >= projectionStart);
    const visibleDelta = result.delta.series.filter((row) => row.year >= projectionStart);
    const gapHigh = [...visibleScenario.map((row) => ({ x: row.year, y: row.p50 }))];
    const gapLow = [...visibleBaseline.map((row) => ({ x: row.year, y: row.p50 }))];

    const baselineMedian = visibleBaseline.map((row) => ({ x: row.year, y: row.p50 }));
    const scenarioMedian = visibleScenario.map((row) => ({ x: row.year, y: row.p50 }));
    const scenarioHigh = visibleScenario.map((row) => ({ x: row.year, y: row.p95 }));
    const scenarioLow = visibleScenario.map((row) => ({ x: row.year, y: row.p05 }));
    const deltaSeries = visibleDelta.map((row) => ({ x: row.year, y: row.p50 }));
    const lastHistory = historyPoints.length > 0 ? historyPoints[historyPoints.length - 1] : null;
    const baselineConnector =
      lastHistory && baselineMedian.length > 0
        ? [lastHistory, baselineMedian[0]]
        : [];
    const scenarioConnector =
      lastHistory && scenarioMedian.length > 0
        ? [lastHistory, scenarioMedian[0]]
        : [];
    const projectionBoundary = [
      { x: projectionStart, y: -5 },
      { x: projectionStart, y: 6 },
    ];

    // Compute the full x-range for the main chart
    const allMainYears = [
      ...historyPoints.map((p) => p.x),
      ...baselineMedian.map((p) => p.x),
      ...scenarioMedian.map((p) => p.x),
    ];
    const mainXMin = Math.min(...allMainYears);
    const mainXMax = Math.max(...allMainYears);

    // Compute the full x-range for the delta chart
    const allDeltaYears = deltaSeries.map((p) => p.x);
    const deltaXMin = allDeltaYears.length > 0 ? Math.min(...allDeltaYears) : projectionStart;
    const deltaXMax = allDeltaYears.length > 0 ? Math.max(...allDeltaYears) : projectionStart + 50;

    // Shared zoom/pan plugin config generator
    const makeZoomOpts = (
      xMin: number,
      xMax: number,
      onZoomChange: (zoomed: boolean) => void,
    ) => ({
      pan: {
        enabled: true,
        mode: "x" as const,
        modifierKey: undefined,
        onPanComplete: ({ chart }: { chart: Chart }) => {
          const scale = chart.scales.x;
          const isZoomed =
            Math.abs(scale.min - xMin) > 1 || Math.abs(scale.max - xMax) > 1;
          onZoomChange(isZoomed);
        },
      },
      zoom: {
        wheel: {
          enabled: true,
          modifierKey: undefined,
        },
        pinch: {
          enabled: true,
        },
        mode: "x" as const,
        onZoomComplete: ({ chart }: { chart: Chart }) => {
          const scale = chart.scales.x;
          const isZoomed =
            Math.abs(scale.min - xMin) > 1 || Math.abs(scale.max - xMax) > 1;
          onZoomChange(isZoomed);
        },
      },
      limits: {
        x: {
          min: xMin,
          max: xMax,
          minRange: 20,
        },
      },
    });

    if (mainChartRef.current) {
      mainChartRef.current.destroy();
    }
    if (deltaChartRef.current) {
      deltaChartRef.current.destroy();
    }

    mainChartRef.current = new Chart(mainCanvasRef.current, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Gap high",
            data: gapHigh,
            borderColor: "rgba(0, 0, 0, 0)",
            backgroundColor: "rgba(184, 154, 73, 0.14)",
            pointRadius: 0,
            borderWidth: 0,
            fill: false,
          },
          {
            label: "Gap between paths",
            data: gapLow,
            borderColor: "rgba(0, 0, 0, 0)",
            backgroundColor: "rgba(184, 154, 73, 0.14)",
            pointRadius: 0,
            borderWidth: 0,
            fill: "-1",
          },
          {
            label: "Scenario high",
            data: scenarioHigh,
            borderColor: "rgba(0, 0, 0, 0)",
            backgroundColor: "rgba(34, 110, 74, 0.16)",
            pointRadius: 0,
            borderWidth: 0,
            fill: false,
          },
          {
            label: "Scenario range",
            data: scenarioLow,
            borderColor: "rgba(0, 0, 0, 0)",
            backgroundColor: "rgba(34, 110, 74, 0.16)",
            pointRadius: 0,
            borderWidth: 0,
            fill: "-1",
          },
          {
            label: "Historical actual",
            data: historyPoints,
            borderColor: "#6d736f",
            pointRadius: 0,
            borderWidth: 2.5,
            tension: 0.24,
          },
          {
            label: "Baseline connector",
            data: baselineConnector,
            borderColor: "rgba(36, 51, 65, 0.45)",
            pointRadius: 0,
            borderDash: [3, 4],
            borderWidth: 1.5,
            tension: 0,
          },
          {
            label: "Scenario connector",
            data: scenarioConnector,
            borderColor: "rgba(34, 110, 74, 0.45)",
            pointRadius: 0,
            borderDash: [3, 4],
            borderWidth: 1.5,
            tension: 0,
          },
          {
            label: "Baseline",
            data: baselineMedian,
            borderColor: "#243341",
            pointRadius: 0,
            borderDash: [8, 6],
            borderWidth: 2,
            tension: 0.24,
          },
          {
            label: "Your scenario",
            data: scenarioMedian,
            borderColor: "#226e4a",
            pointRadius: 0,
            borderWidth: 3,
            tension: 0.24,
          },
          {
            label: "Projection boundary",
            data: projectionBoundary,
            borderColor: "#b56b3f",
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [5, 5],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        clip: true as unknown as number,
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
        transitions: {
          active: {
            animation: {
              duration: 0,
            },
          },
          resize: {
            animation: {
              duration: 0,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            titleFont: {
              family: '"Courier New", Courier, monospace',
              size: 13,
            },
            bodyFont: {
              family: '"Courier New", Courier, monospace',
              size: 13,
            },
            callbacks: {
              label: (context) => {
                if (context.dataset.label === "Projection boundary") {
                  return "Projection begins: scenarios diverge here";
                }
                if (
                  context.dataset.label === "Baseline connector" ||
                  context.dataset.label === "Scenario connector"
                ) {
                  return "Transition from historical observation to projected pathway";
                }
                const value = typeof context.parsed.y === "number" ? context.parsed.y : 0;
                return `${context.dataset.label}: ${formatDegrees(value)}`;
              },
            },
          },
          zoom: makeZoomOpts(mainXMin, mainXMax, setMainIsZoomed),
        },
        scales: {
          x: {
            type: "linear",
            grid: {
              color: "rgba(17, 33, 24, 0.08)",
            },
            ticks: {
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 14,
              },
            },
            title: {
              display: true,
              text: "Year",
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 15,
                weight: "bold",
              },
            },
          },
          y: {
            grid: {
              color: "rgba(17, 33, 24, 0.08)",
            },
            ticks: {
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 14,
              },
              callback: (value) =>
                `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}${DEGREE_LABEL}`,
            },
            title: {
              display: true,
              text: `Temperature anomaly (${DEGREE_LABEL})`,
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 15,
                weight: "bold",
              },
            },
          },
        },
      },
    });

    deltaChartRef.current = new Chart(deltaCanvasRef.current, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Zero reference",
            data: [
              { x: projectionStart, y: 0 },
              { x: result.delta.target_year.year, y: 0 },
            ],
            borderColor: "#8a8f91",
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [4, 4],
          },
          {
            label: "Difference",
            data: deltaSeries,
            borderColor: "#7f3f1f",
            pointRadius: 0,
            borderWidth: 3,
            tension: 0.24,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        clip: true as unknown as number,
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
        transitions: {
          active: {
            animation: {
              duration: 0,
            },
          },
          resize: {
            animation: {
              duration: 0,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            titleFont: {
              family: '"Courier New", Courier, monospace',
              size: 13,
            },
            bodyFont: {
              family: '"Courier New", Courier, monospace',
              size: 13,
            },
            callbacks: {
              label: (context) => {
                const value = typeof context.parsed.y === "number" ? context.parsed.y : 0;
                const meaning =
                  value < 0 ? "cooler than baseline" : value > 0 ? "warmer than baseline" : "no change";
                return `Difference: ${formatDegrees(value)} (${meaning})`;
              },
            },
          },
          zoom: makeZoomOpts(deltaXMin, deltaXMax, setDeltaIsZoomed),
        },
        scales: {
          x: {
            type: "linear",
            grid: {
              color: "rgba(17, 33, 24, 0.08)",
            },
            ticks: {
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 14,
              },
            },
            title: {
              display: true,
              text: "Year",
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 15,
                weight: "bold",
              },
            },
          },
          y: {
            grid: {
              color: "rgba(17, 33, 24, 0.08)",
            },
            ticks: {
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 14,
              },
              callback: (value) =>
                `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}${DEGREE_LABEL}`,
            },
            title: {
              display: true,
              text: `Difference (${DEGREE_LABEL})`,
              color: "#112118",
              font: {
                family: '"Courier New", Courier, monospace',
                size: 15,
                weight: "bold",
              },
            },
          },
        },
      },
    });

    // Reset zoom tracking state
    setMainIsZoomed(false);
    setDeltaIsZoomed(false);
    } // end buildCharts

    initCharts();

    return () => {
      cancelled = true;
      if (mainChartRef.current) {
        mainChartRef.current.destroy();
        mainChartRef.current = null;
      }
      if (deltaChartRef.current) {
        deltaChartRef.current.destroy();
        deltaChartRef.current = null;
      }
    };
  }, [historical, result]);

  return (
    <div className="charts-stack">
      <section className="chart-card">
        <div className="chart-copy">
          <div>
            <p className="eyebrow">Comparison Chart</p>
            <h3>Baseline and your scenario</h3>
            <p>Projection begins: scenarios diverge here. Historical context stays visible but quieter.</p>
            <p className="chart-sim-label">{simulationLabel}</p>
          </div>
          <div className="chart-direct-labels" aria-hidden="true">
            <span className="chart-label baseline">Baseline</span>
            <span className="chart-label scenario">Your scenario</span>
            <span className="chart-label gap">Gap = impact</span>
          </div>
        </div>
        <div className="chart-toolbar">
          <span className="chart-interaction-hint" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M11 5l3 3-3 3M5 5L2 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Drag to pan · Scroll to zoom
          </span>
          {mainIsZoomed && (
            <button
              type="button"
              className="chart-reset-btn"
              onClick={resetMainZoom}
              aria-label="Reset zoom on comparison chart"
            >
              Reset view
            </button>
          )}
        </div>
        <div className="chart-stage tall">
          <canvas ref={mainCanvasRef} aria-label="Comparison chart" />
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-copy">
          <div>
            <p className="eyebrow">Delta Chart</p>
            <h3>Difference over time</h3>
            <p>Negative values mean cooler than the baseline pathway.</p>
            <p className="chart-sim-label">{simulationLabel}</p>
          </div>
          <div className="chart-direct-labels" aria-hidden="true">
            <span className="chart-label delta">Below zero = cooler</span>
          </div>
        </div>
        <div className="chart-toolbar">
          <span className="chart-interaction-hint" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M11 5l3 3-3 3M5 5L2 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Drag to pan · Scroll to zoom
          </span>
          {deltaIsZoomed && (
            <button
              type="button"
              className="chart-reset-btn"
              onClick={resetDeltaZoom}
              aria-label="Reset zoom on delta chart"
            >
              Reset view
            </button>
          )}
        </div>
        <div className="chart-stage short">
          <canvas ref={deltaCanvasRef} aria-label="Delta chart" />
        </div>
      </section>
    </div>
  );
}
