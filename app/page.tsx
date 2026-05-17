"use client";

import { useEffect, useMemo, useState } from "react";
import { runComparison } from "./_features/comparison/api";
import { ComparisonCharts } from "./_features/comparison/ComparisonCharts";
import { ComparisonHero } from "./_features/comparison/ComparisonHero";
import { ComparisonInterpretation } from "./_features/comparison/ComparisonInterpretation";
import { CoastalImpacts } from "./_features/comparison/CoastalImpacts";
import { DataSourcesSection } from "./_features/comparison/DataSourcesSection";
import { EcosystemImpacts } from "./_features/comparison/EcosystemImpacts";
import { FoodAgricultureImpacts } from "./_features/comparison/FoodAgricultureImpacts";
import { PossibleImpacts } from "./_features/comparison/PossibleImpacts";
import { ComparisonSummary } from "./_features/comparison/ComparisonSummary";
import { CredibilitySection } from "./_features/comparison/CredibilitySection";
import { HowItWorks } from "./_features/comparison/HowItWorks";
import { ScenarioControls } from "./_features/comparison/ScenarioControls";
import {
  applyPreset,
  buildDraftSummary,
  buildPendingSummary,
  clamp,
  comparisonRequestEqualsDraft,
  createInitialDraft,
  draftToRequest,
  draftsEqual,
} from "./_features/comparison/helpers";
import {
  ComparisonResponse,
  DraftScenario,
  ModelData,
} from "./_features/comparison/types";

export default function Home() {
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [draft, setDraft] = useState<DraftScenario | null>(null);
  const [initialDraft, setInitialDraft] = useState<DraftScenario | null>(null);
  const [lastRunResult, setLastRunResult] = useState<ComparisonResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModelData() {
      try {
        const modelResponse = await fetch("/model_data.json", { cache: "no-store" });
        if (!modelResponse.ok) {
          throw new Error(`Unable to load model_data.json (${modelResponse.status})`);
        }

        const payload = (await modelResponse.json()) as ModelData;
        if (cancelled) {
          return;
        }

        const nextDraft = createInitialDraft(payload);
        setModelData(payload);
        setDraft(nextDraft);
        setInitialDraft(nextDraft);
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
    };
  }, []);

  const hasPendingChanges = useMemo(() => {
    if (!draft) {
      return false;
    }
    if (lastRunResult) {
      return !comparisonRequestEqualsDraft(draft, lastRunResult.request);
    }
    if (!initialDraft) {
      return false;
    }
    return !draftsEqual(draft, initialDraft);
  }, [draft, initialDraft, lastRunResult]);

  const draftSummary = draft ? buildDraftSummary(draft) : "";
  const pendingSummary =
    draft && hasPendingChanges
      ? buildPendingSummary(
          draft,
          lastRunResult
            ? {
                targetYear: lastRunResult.request.target_year,
                simulations: lastRunResult.request.developer_overrides?.simulations ?? 1000,
                co2: lastRunResult.request.scenario_modifiers.co2,
                forestLoss: lastRunResult.request.scenario_modifiers.forest_loss,
                renewables: lastRunResult.request.scenario_modifiers.renewables,
              }
            : (initialDraft ?? draft),
        )
      : null;

  function updateDraft(name: keyof DraftScenario, value: number) {
    if (!modelData || !draft) {
      return;
    }

    const nextValue =
      name === "targetYear"
        ? clamp(
            value,
            modelData.scenario_controls.target_year.min,
            modelData.scenario_controls.target_year.max,
          )
        : name === "simulations"
          ? clamp(
              value,
              modelData.scenario_controls.simulations.min,
              modelData.scenario_controls.simulations.max,
            )
        : name === "co2"
          ? clamp(
              value,
              modelData.scenario_controls.modifiers.co2.min,
              modelData.scenario_controls.modifiers.co2.max,
            )
          : name === "forestLoss"
            ? clamp(
                value,
                modelData.scenario_controls.modifiers.forest_loss.min,
                modelData.scenario_controls.modifiers.forest_loss.max,
              )
            : clamp(
                value,
                modelData.scenario_controls.modifiers.renewables.min,
                modelData.scenario_controls.modifiers.renewables.max,
              );

    setDraft({ ...draft, [name]: nextValue });
  }

  function handlePreset(
    preset: "lower-emissions" | "higher-forest-loss" | "stronger-renewables" | "reset",
  ) {
    if (!modelData || !draft) {
      return;
    }

    const { nextDraft, feedback } = applyPreset(draft, preset, modelData);
    setDraft(nextDraft);
    setPresetFeedback(feedback);
  }

  async function handleRun() {
    if (!draft || !hasPendingChanges) {
      return;
    }

    setIsRunning(true);
    setError(null);
    try {
      const result = await runComparison(draftToRequest(draft));
      setLastRunResult(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Comparison failed.");
    } finally {
      setIsRunning(false);
    }
  }

  if (!modelData || !draft) {
    return (
      <main className="compare-page">
        <section className="page-intro">
          <p className="eyebrow">Climate Scenario Comparison</p>
          <h1>Compare climate futures</h1>
          <p className="lede">Loading comparison controls and historical climate context.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="compare-page">
      <section className="page-intro">
        <div className="intro-copy">
          <p className="eyebrow">Temperature 2100</p>
          <h1>Temperature 2100</h1>
          <p className="intro-kicker">See the impact of climate choices</p>
          <p className="lede">
            Build one scenario against a locked baseline pathway, then compare the temperature gap
            over time and at your selected target year.
          </p>
        </div>
        <div className="intro-panel">
          <p className="eyebrow">Scenario Comparison</p>
          <h3>One baseline. One draft. One clear delta.</h3>
          <p>
            Change the levers, run the comparison, and read the difference as avoided warming or
            added warming instead of scanning disconnected curves.
          </p>
        </div>
      </section>

      <section className="compare-layout">
        <ScenarioControls
          draft={draft}
          modelData={modelData}
          summary={draftSummary}
          pendingSummary={pendingSummary}
          hasPendingChanges={hasPendingChanges}
          isRunning={isRunning}
          presetFeedback={presetFeedback}
          onChange={updateDraft}
          onPreset={handlePreset}
          onRun={handleRun}
          onReset={() => handlePreset("reset")}
        />

        <div className="results-column">
          {error ? <section className="support-card error-card">{error}</section> : null}

          {lastRunResult ? (
            <>
              <ComparisonHero result={lastRunResult} />
              <ComparisonCharts
                result={lastRunResult}
                historical={modelData.historical_series.arima_benchmark}
              />
              <ComparisonSummary result={lastRunResult} />
              <ComparisonInterpretation result={lastRunResult} />
              <PossibleImpacts result={lastRunResult} />
              <CoastalImpacts result={lastRunResult} />
              <FoodAgricultureImpacts result={lastRunResult} />
              <EcosystemImpacts result={lastRunResult} />
            </>
          ) : (
            <section className="empty-state">
              <p className="eyebrow">Build Your First Run</p>
              <h2>Create a scenario to see its impact</h2>
              <p>
                Start from the default baseline, change one or more levers, then run the
                comparison to see avoided warming or added warming over time.
              </p>
              <p className="empty-state-note">Suggested first action: try Lower emissions.</p>
            </section>
          )}

          <HowItWorks />
          <CredibilitySection modelData={modelData} />
          <DataSourcesSection />
        </div>
      </section>
    </main>
  );
}
