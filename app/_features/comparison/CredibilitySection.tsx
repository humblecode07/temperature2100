import { ModelData } from "./types";

type Props = {
  modelData: ModelData;
};

export function CredibilitySection({ modelData }: Props) {
  return (
    <section className="support-card muted-card">
      <p className="eyebrow">Project Credibility</p>
      <h3>Historical data plus simulation modeling</h3>
      <p>
        This page combines historical climate records with a simulation-based comparison workflow.
        The interface highlights differences between a default pathway and a user-adjusted scenario.
      </p>
      <p>
        Historical benchmark shown: {modelData.datasets.long_term_range.start}-
        {modelData.datasets.long_term_range.end}. Recent ARIMA R2:{" "}
        {modelData.metrics.arima_recent_period.r2.toFixed(3)}.
      </p>
    </section>
  );
}
