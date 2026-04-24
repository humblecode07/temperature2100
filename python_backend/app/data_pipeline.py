from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd


DATASET_DIR = Path(__file__).resolve().parent.parent / "dataset"


@dataclass
class AlignmentResult:
    merged: pd.DataFrame
    dataset_ranges: Dict[str, tuple[int, int]]
    common_range: tuple[int, int]


@dataclass
class ClimateDatasetBundle:
    long_term: pd.DataFrame
    short_term: pd.DataFrame
    dataset_ranges: Dict[str, tuple[int, int]]
    long_term_range: tuple[int, int]
    short_term_range: tuple[int, int]


def _finalize_yearly_series(
    frame: pd.DataFrame, year_col: str, value_col: str, target_name: str
) -> pd.DataFrame:
    series = frame[[year_col, value_col]].copy()
    series = series.rename(columns={year_col: "year", value_col: target_name})
    series["year"] = pd.to_numeric(series["year"], errors="coerce")
    series[target_name] = pd.to_numeric(series[target_name], errors="coerce")
    series = series.dropna(subset=["year", target_name]).copy()
    series["year"] = series["year"].astype(int)
    series = series.sort_values("year").drop_duplicates(subset=["year"], keep="last")
    return series.reset_index(drop=True)


def _select_global_or_aggregate(
    frame: pd.DataFrame,
    value_col: str,
    target_name: str,
    fallback_agg: str,
) -> pd.DataFrame:
    global_mask = pd.Series(False, index=frame.index)

    if "country" in frame.columns:
        global_mask = global_mask | frame["country"].astype(str).str.lower().eq("world")
    if "iso_code" in frame.columns:
        global_mask = global_mask | frame["iso_code"].astype(str).isin(["OWID_WRL", "WLD"])

    if global_mask.any():
        selected = frame.loc[global_mask, ["year", value_col]].copy()
        return _finalize_yearly_series(selected, "year", value_col, target_name)

    usable = frame[["year", value_col]].copy()
    usable["year"] = pd.to_numeric(usable["year"], errors="coerce")
    usable[value_col] = pd.to_numeric(usable[value_col], errors="coerce")
    usable = usable.dropna(subset=["year", value_col])
    usable["year"] = usable["year"].astype(int)

    if usable.empty:
        return pd.DataFrame(columns=["year", target_name])

    if fallback_agg == "sum":
        aggregated = usable.groupby("year", as_index=False)[value_col].sum()
    elif fallback_agg == "mean":
        aggregated = usable.groupby("year", as_index=False)[value_col].mean()
    else:
        raise ValueError(f"Unsupported fallback aggregation: {fallback_agg}")

    return _finalize_yearly_series(aggregated, "year", value_col, target_name)


def load_temperature_data() -> pd.DataFrame:
    path = DATASET_DIR / "temperature.csv"
    frame = pd.read_csv(path, skiprows=1)
    frame = frame.rename(columns=lambda col: str(col).strip())
    frame["J-D"] = frame["J-D"].replace("***", np.nan)
    return _finalize_yearly_series(frame, "Year", "J-D", "temperature_anomaly")


def load_co2_data() -> pd.DataFrame:
    path = DATASET_DIR / "co2.csv"
    frame = pd.read_csv(path)
    return _select_global_or_aggregate(frame, "co2", "co2", fallback_agg="sum")


def load_energy_data() -> pd.DataFrame:
    path = DATASET_DIR / "energy.csv"
    frame = pd.read_csv(path)
    return _select_global_or_aggregate(
        frame,
        "renewables_share_energy",
        "renewable_energy_share",
        fallback_agg="mean",
    )


def load_deforestation_data() -> pd.DataFrame:
    path = DATASET_DIR / "deforestation.csv"
    frame = pd.read_csv(path)

    numeric = frame[["forests_2000", "forests_2020"]].apply(
        pd.to_numeric, errors="coerce"
    )
    avg_2000 = numeric["forests_2000"].mean()
    avg_2020 = numeric["forests_2020"].mean()

    years = np.arange(2000, 2021)
    forest_cover = np.linspace(avg_2000, avg_2020, len(years))

    derived = pd.DataFrame({"year": years, "forest_cover_pct": forest_cover})
    derived["forest_loss_rate"] = (
        (derived["forest_cover_pct"].shift(1) - derived["forest_cover_pct"])
        / derived["forest_cover_pct"].shift(1)
        * 100.0
    )
    derived.loc[derived.index[0], "forest_loss_rate"] = 0.0
    return _finalize_yearly_series(
        derived, "year", "forest_loss_rate", "forest_loss_rate"
    )


def load_all_series() -> Dict[str, pd.DataFrame]:
    return {
        "temperature": load_temperature_data(),
        "co2": load_co2_data(),
        "forest_loss": load_deforestation_data(),
        "renewable_energy": load_energy_data(),
    }


def detect_dataset_ranges(series_map: Dict[str, pd.DataFrame]) -> Dict[str, tuple[int, int]]:
    ranges: Dict[str, tuple[int, int]] = {}
    for name, frame in series_map.items():
        if frame.empty:
            raise ValueError(f"Dataset '{name}' has no usable yearly rows.")
        ranges[name] = (int(frame["year"].min()), int(frame["year"].max()))
    return ranges


def _merge_series(frames: list[pd.DataFrame], how: str = "inner") -> pd.DataFrame:
    merged: pd.DataFrame | None = None
    for frame in frames:
        merged = frame if merged is None else merged.merge(frame, on="year", how=how)

    if merged is None or merged.empty:
        raise ValueError("Merged dataset is empty after alignment.")

    return merged.sort_values("year").reset_index(drop=True)


def build_climate_datasets() -> ClimateDatasetBundle:
    series_map = load_all_series()
    dataset_ranges = detect_dataset_ranges(series_map)

    # Long-term data keeps the full temperature/CO2 overlap and does not drop
    # early years just because short-term features start later.
    long_term = _merge_series(
        [series_map["temperature"], series_map["co2"]],
        how="inner",
    )

    # Short-term data isolates recent features and only requires overlap among
    # the recent variables plus the target. CO2 is attached when available.
    short_term_core = _merge_series(
        [
            series_map["temperature"],
            series_map["forest_loss"],
            series_map["renewable_energy"],
        ],
        how="inner",
    )
    short_term = short_term_core.merge(series_map["co2"], on="year", how="left")
    short_term = short_term.sort_values("year").reset_index(drop=True)

    return ClimateDatasetBundle(
        long_term=long_term,
        short_term=short_term,
        dataset_ranges=dataset_ranges,
        long_term_range=(int(long_term["year"].min()), int(long_term["year"].max())),
        short_term_range=(int(short_term["year"].min()), int(short_term["year"].max())),
    )


def compute_common_range(
    dataset_ranges: Dict[str, tuple[int, int]]
) -> tuple[int, int]:
    start_year = max(year_range[0] for year_range in dataset_ranges.values())
    end_year = min(year_range[1] for year_range in dataset_ranges.values())
    if start_year > end_year:
        raise ValueError(
            "No overlapping year range exists across the loaded datasets."
        )
    return start_year, end_year


def trim_to_common_range(
    series_map: Dict[str, pd.DataFrame], common_range: tuple[int, int]
) -> Dict[str, pd.DataFrame]:
    start_year, end_year = common_range
    trimmed: Dict[str, pd.DataFrame] = {}
    for name, frame in series_map.items():
        trimmed[name] = frame.loc[
            frame["year"].between(start_year, end_year)
        ].reset_index(drop=True)
    return trimmed


def merge_aligned_series(series_map: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    return _merge_series(list(series_map.values()), how="inner")


def build_aligned_dataset() -> AlignmentResult:
    # Compatibility helper for older scripts that still expect a single
    # overlap-only dataset.
    series_map = load_all_series()
    dataset_ranges = detect_dataset_ranges(series_map)
    common_range = compute_common_range(dataset_ranges)
    trimmed = trim_to_common_range(series_map, common_range)
    merged = merge_aligned_series(trimmed)
    return AlignmentResult(
        merged=merged,
        dataset_ranges=dataset_ranges,
        common_range=common_range,
    )


if __name__ == "__main__":
    result = build_climate_datasets()
    print("Dataset ranges:")
    for name, year_range in result.dataset_ranges.items():
        print(f"  {name}: {year_range[0]}-{year_range[1]}")
    print(f"Long-term range: {result.long_term_range[0]}-{result.long_term_range[1]}")
    print(f"Short-term range: {result.short_term_range[0]}-{result.short_term_range[1]}")
    print()
    print("Long-term sample:")
    print(result.long_term.head().to_string(index=False))
    print()
    print("Short-term sample:")
    print(result.short_term.head().to_string(index=False))
