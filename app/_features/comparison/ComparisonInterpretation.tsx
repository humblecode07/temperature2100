import { ComparisonResponse } from "./types";

type Props = {
  result: ComparisonResponse;
};

export function ComparisonInterpretation({ result }: Props) {
  const direction = result.interpretation_flags.direction;
  const rangeChange = result.interpretation_flags.range_change;

  let summary =
    "This comparison keeps the scenario close to the default pathway, so the projected effect stays limited in this model.";
  if (direction === "cooler") {
    summary =
      "This scenario is cooler than the baseline. The selected changes shift the long-term pathway downward relative to the default track.";
  } else if (direction === "warmer") {
    summary =
      "This scenario is warmer than the baseline. The selected changes push the long-term pathway upward relative to the default track.";
  }

  const rangeNote =
    rangeChange === "similar"
      ? "The likely range stays broadly similar to baseline."
      : rangeChange === "wider"
        ? "The likely range is wider than the baseline, so the modeled spread increases."
        : "The likely range is narrower than the baseline, so the modeled spread decreases.";

  return (
    <section className="support-card">
      <p className="eyebrow">Interpretation</p>
      <h3>How to read this run</h3>
      <p>{summary}</p>
      <p>{rangeNote}</p>
      <p>
        This comparison is mainly shaped by the combined changes to emissions, forest loss, and
        renewable adoption rather than a single ranked driver.
      </p>
    </section>
  );
}
