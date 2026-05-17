"use client";

import { useState } from "react";
import { ComparisonResponse } from "./types";
import { exportComparisonPdfReport } from "./report";

type Props = {
  result: ComparisonResponse;
};

export function ExportReportButton({ result }: Props) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      await exportComparisonPdfReport(result);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      type="button"
      className="export-report-button"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? "Preparing PDF..." : "Export PDF Report"}
    </button>
  );
}
