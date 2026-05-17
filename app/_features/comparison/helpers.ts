import { ComparisonResponse, DraftScenario, ModelData } from "./types";

export const DEGREE_LABEL = "\u00B0C";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createInitialDraft(modelData: ModelData): DraftScenario {
  return {
    targetYear: modelData.scenario_controls.target_year.default,
    simulations: modelData.scenario_controls.simulations.default,
    co2: modelData.scenario_controls.modifiers.co2.default,
    forestLoss: modelData.scenario_controls.modifiers.forest_loss.default,
    renewables: modelData.scenario_controls.modifiers.renewables.default,
  };
}

export function formatDegrees(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${DEGREE_LABEL}`;
}

export function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

export function formatIsoDate(isoDate: string) {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime())
    ? isoDate
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function draftToRequest(draft: DraftScenario) {
  return {
    target_year: draft.targetYear,
    simulations: draft.simulations,
    scenario_modifiers: {
      co2: draft.co2,
      forest_loss: draft.forestLoss,
      renewables: draft.renewables,
    },
  };
}

export function draftsEqual(left: DraftScenario, right: DraftScenario) {
  return (
    left.targetYear === right.targetYear &&
    left.simulations === right.simulations &&
    left.co2 === right.co2 &&
    left.forestLoss === right.forestLoss &&
    left.renewables === right.renewables
  );
}

export function comparisonRequestEqualsDraft(
  draft: DraftScenario,
  request: ComparisonResponse["request"],
) {
  return (
    draft.targetYear === request.target_year &&
    draft.simulations === (request.developer_overrides?.simulations ?? 1000) &&
    draft.co2 === request.scenario_modifiers.co2 &&
    draft.forestLoss === request.scenario_modifiers.forest_loss &&
    draft.renewables === request.scenario_modifiers.renewables
  );
}

export function applyPreset(
  draft: DraftScenario,
  type: "lower-emissions" | "higher-forest-loss" | "stronger-renewables" | "reset",
  modelData: ModelData,
) {
  if (type === "reset") {
    return {
      nextDraft: { ...draft, co2: 0, forestLoss: 0, renewables: 0 },
      feedback: "Preset applied: Reset to baseline",
    };
  }

  const step = 20;
  if (type === "lower-emissions") {
    const nextValue = clamp(
      draft.co2 - step,
      modelData.scenario_controls.modifiers.co2.min,
      modelData.scenario_controls.modifiers.co2.max,
    );
    return {
      nextDraft: { ...draft, co2: nextValue },
      feedback: `Preset applied: Lower emissions (${formatSignedPercent(nextValue)})`,
    };
  }

  if (type === "higher-forest-loss") {
    const nextValue = clamp(
      draft.forestLoss + step,
      modelData.scenario_controls.modifiers.forest_loss.min,
      modelData.scenario_controls.modifiers.forest_loss.max,
    );
    return {
      nextDraft: { ...draft, forestLoss: nextValue },
      feedback: `Preset applied: Higher forest loss (${formatSignedPercent(nextValue)})`,
    };
  }

  const nextValue = clamp(
    draft.renewables + step,
    modelData.scenario_controls.modifiers.renewables.min,
    modelData.scenario_controls.modifiers.renewables.max,
  );
  return {
    nextDraft: { ...draft, renewables: nextValue },
    feedback: `Preset applied: Stronger renewables (${formatSignedPercent(nextValue)})`,
  };
}

export function buildDraftSummary(draft: DraftScenario) {
  const changed: string[] = [];
  if (draft.co2 !== 0) {
    changed.push(`CO2 emissions ${formatSignedPercent(draft.co2)} relative to baseline`);
  }
  if (draft.forestLoss !== 0) {
    changed.push(`forest loss pressure ${formatSignedPercent(draft.forestLoss)}`);
  }
  if (draft.renewables !== 0) {
    changed.push(`renewable adoption ${formatSignedPercent(draft.renewables)}`);
  }

  if (changed.length === 0) {
    return "This draft matches the baseline pathway. Adjust a lever or use a preset to explore a different outcome.";
  }
  if (changed.length === 1) {
    return `Compared with the baseline, this draft changes ${changed[0]}.`;
  }
  if (changed.length === 2) {
    return `Compared with the baseline, this draft changes ${changed[0]} and ${changed[1]}.`;
  }
  return `Compared with the baseline, this draft changes ${changed[0]}, ${changed[1]}, and ${changed[2]}.`;
}

export function buildPendingSummary(draft: DraftScenario, current: DraftScenario) {
  const changes: string[] = [];
  if (draft.co2 !== current.co2) {
    changes.push(`CO2 ${formatSignedPercent(draft.co2)}`);
  }
  if (draft.forestLoss !== current.forestLoss) {
    changes.push(`forest loss ${formatSignedPercent(draft.forestLoss)}`);
  }
  if (draft.renewables !== current.renewables) {
    changes.push(`renewables ${formatSignedPercent(draft.renewables)}`);
  }
  if (draft.targetYear !== current.targetYear) {
    changes.push(`target year ${draft.targetYear}`);
  }
  if (draft.simulations !== current.simulations) {
    changes.push(`${draft.simulations.toLocaleString()} simulations`);
  }
  return changes.length === 0
    ? "Draft matches the last completed comparison."
    : `Draft changed: ${changes.join(", ")}. Run comparison to update results.`;
}

export function buildHeroMessage(result: ComparisonResponse) {
  const delta = result.delta.target_year.p50;
  const magnitude = Math.abs(delta);
  const year = result.delta.target_year.year;

  if (result.interpretation_flags.direction === "cooler") {
    return `${magnitude.toFixed(2)}${DEGREE_LABEL} avoided warming by ${year}`;
  }
  if (result.interpretation_flags.direction === "warmer") {
    return `${magnitude.toFixed(2)}${DEGREE_LABEL} added warming by ${year}`;
  }
  return `${magnitude.toFixed(2)}${DEGREE_LABEL} change by ${year}`;
}

export function buildTakeaway(result: ComparisonResponse) {
  const direction = result.interpretation_flags.direction;
  const meaningful = result.interpretation_flags.meaningful_change;
  if (direction === "negligible" || !meaningful) {
    return "This draft changes the projected outcome only slightly relative to the default pathway.";
  }
  if (direction === "cooler") {
    return "This draft produces a meaningfully cooler outcome than the default pathway.";
  }
  return "This draft produces a meaningfully warmer outcome than the default pathway.";
}
