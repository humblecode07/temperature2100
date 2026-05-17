import { DraftScenario, ModelData } from "./types";
import { formatSignedPercent } from "./helpers";

type Props = {
  draft: DraftScenario;
  modelData: ModelData;
  summary: string;
  pendingSummary: string | null;
  hasPendingChanges: boolean;
  isRunning: boolean;
  presetFeedback: string | null;
  onChange: (name: keyof DraftScenario, value: number) => void;
  onPreset: (
    preset: "lower-emissions" | "higher-forest-loss" | "stronger-renewables" | "reset",
  ) => void;
  onRun: () => void;
  onReset: () => void;
};

export function ScenarioControls({
  draft,
  modelData,
  summary,
  pendingSummary,
  hasPendingChanges,
  isRunning,
  presetFeedback,
  onChange,
  onPreset,
  onRun,
  onReset,
}: Props) {
  const modifiers = modelData.scenario_controls.modifiers;

  return (
    <aside className="controls-panel">
      <div className="panel-heading">
        <p className="eyebrow">Set Scenario</p>
        <h2>Draft scenario for {draft.targetYear}</h2>
        <p className="panel-copy">{summary}</p>
      </div>

      <div className="baseline-chip">Baseline: default pathway</div>

      <div className="preset-explainer">
        <p className="eyebrow">Quick Scenario Nudges</p>
        <p>Each preset changes one lever by 20% so you can see the effect immediately.</p>
      </div>

      <div className="preset-row">
        <button type="button" className="preset good" onClick={() => onPreset("lower-emissions")}>
          <span>Lower emissions</span>
          <small>Quicker path to a cooler scenario</small>
        </button>
        <button
          type="button"
          className="preset warm"
          onClick={() => onPreset("higher-forest-loss")}
        >
          <span>Higher forest loss</span>
          <small>Push the scenario warmer</small>
        </button>
        <button
          type="button"
          className="preset good"
          onClick={() => onPreset("stronger-renewables")}
        >
          <span>Stronger renewables</span>
          <small>Improve the long-term pathway</small>
        </button>
      </div>
      <button type="button" className="preset neutral" onClick={onReset}>
        <span>Reset to baseline</span>
        <small>Clear all draft changes</small>
      </button>

      {presetFeedback ? <p className="preset-feedback">{presetFeedback}</p> : null}

      <div className="control-card">
        <label htmlFor="co2">
          <span>CO2 emissions</span>
          <strong>{formatSignedPercent(draft.co2)}</strong>
        </label>
        <p>
          Adjusts how much carbon dioxide is released into the atmosphere compared with the
          baseline pathway. Higher values intensify long-term warming.
        </p>
        <input
          id="co2"
          type="range"
          min={modifiers.co2.min}
          max={modifiers.co2.max}
          value={draft.co2}
          step="1"
          onChange={(event) => onChange("co2", Number(event.target.value))}
        />
      </div>

      <div className="control-card">
        <label htmlFor="forestLoss">
          <span>Forest loss pressure</span>
          <strong>{formatSignedPercent(draft.forestLoss)}</strong>
        </label>
        <p>
          Adjusts how quickly forests are lost compared with the baseline pathway. Higher values
          weaken carbon storage and make warming pressure harder to offset.
        </p>
        <input
          id="forestLoss"
          type="range"
          min={modifiers.forest_loss.min}
          max={modifiers.forest_loss.max}
          value={draft.forestLoss}
          step="1"
          onChange={(event) => onChange("forestLoss", Number(event.target.value))}
        />
      </div>

      <div className="control-card">
        <label htmlFor="renewables">
          <span>Renewable adoption</span>
          <strong>{formatSignedPercent(draft.renewables)}</strong>
        </label>
        <p>
          Adjusts how strongly renewable energy replaces fossil-heavy energy compared with the
          baseline pathway. Higher values help slow the warming trend.
        </p>
        <input
          id="renewables"
          type="range"
          min={modifiers.renewables.min}
          max={modifiers.renewables.max}
          value={draft.renewables}
          step="1"
          onChange={(event) => onChange("renewables", Number(event.target.value))}
        />
      </div>

      <div className="control-card">
        <label htmlFor="targetYear">
          <span>Target year</span>
          <strong>{draft.targetYear}</strong>
        </label>
        <p>Selected comparison horizon.</p>
        <input
          id="targetYear"
          type="range"
          min={modelData.scenario_controls.target_year.min}
          max={modelData.scenario_controls.target_year.max}
          value={draft.targetYear}
          step="1"
          onChange={(event) => onChange("targetYear", Number(event.target.value))}
        />
      </div>

      <div className="control-card">
        <label htmlFor="simulations">
          <span>Monte Carlo iterations</span>
          <strong>{draft.simulations.toLocaleString()}</strong>
        </label>
        <p>How many simulation runs are used to build the projection band.</p>
        <input
          id="simulations"
          type="range"
          min={modelData.scenario_controls.simulations.min}
          max={modelData.scenario_controls.simulations.max}
          value={draft.simulations}
          step="25"
          onChange={(event) => onChange("simulations", Number(event.target.value))}
        />
      </div>

      <div className="action-block">
        <button
          type="button"
          className="primary-action"
          onClick={onRun}
          disabled={!hasPendingChanges || isRunning}
        >
          {isRunning ? "Running comparison..." : "Run Comparison"}
        </button>
      </div>

      {pendingSummary ? <div className="pending-banner">{pendingSummary}</div> : null}
    </aside>
  );
}
