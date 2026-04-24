from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMAResults

from backend.app.data_pipeline import load_temperature_data


PREPROCESSED_DIR = Path(__file__).resolve().parent.parent / "preprocessed_data"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

LONG_TERM_CSV = PREPROCESSED_DIR / "long_term_climate_data.csv"
SHORT_TERM_CSV = PREPROCESSED_DIR / "short_term_climate_data.csv"
MLR_MODEL_PATH = MODELS_DIR / "mlr_model.joblib"
ARIMA_MODEL_PATH = MODELS_DIR / "arima_model.pkl"

TARGET_COLUMN = "temperature_anomaly"
BASE_FEATURES = ["year", "co2"]
ADJUSTMENT_FEATURES = ["forest_loss_rate", "renewable_energy_gap"]
PROJECTION_END_YEAR = 2100
MONTE_CARLO_SIMULATIONS = 1000
MONTE_CARLO_SEED = 42
DEFAULT_SCENARIO_MODIFIERS = {
    "co2": 0.0,
    "forest_loss": 0.0,
    "renewables": 0.0,
}


def load_preprocessed_datasets() -> tuple[pd.DataFrame, pd.DataFrame]:
    missing = [path for path in [LONG_TERM_CSV, SHORT_TERM_CSV] if not path.exists()]
    if missing:
        names = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(
            f"Preprocessed dataset(s) not found: {names}. Run preprocessing first."
        )

    long_term = pd.read_csv(LONG_TERM_CSV).sort_values("year").reset_index(drop=True)
    short_term = pd.read_csv(SHORT_TERM_CSV).sort_values("year").reset_index(drop=True)
    return long_term, short_term


def prepare_short_term_features(short_term: pd.DataFrame) -> pd.DataFrame:
    prepared = short_term.copy()
    prepared["renewable_energy_gap"] = 100.0 - prepared["renewable_energy_share"]
    return prepared


def build_base_dataset(long_term: pd.DataFrame) -> pd.DataFrame:
    base_dataset = long_term.dropna(subset=BASE_FEATURES + [TARGET_COLUMN]).reset_index(drop=True)
    if base_dataset.empty:
        raise ValueError("Base dataset is empty after filtering required features.")
    return base_dataset


def build_adjustment_dataset(
    short_term: pd.DataFrame,
    base_model: LinearRegression,
) -> pd.DataFrame:
    prepared = prepare_short_term_features(short_term)
    adjustment_dataset = prepared.dropna(
        subset=BASE_FEATURES + ADJUSTMENT_FEATURES + [TARGET_COLUMN]
    ).reset_index(drop=True)
    if adjustment_dataset.empty:
        raise ValueError("Adjustment dataset is empty after filtering required features.")

    base_prediction = pd.Series(
        base_model.predict(adjustment_dataset[BASE_FEATURES]),
        index=adjustment_dataset.index,
        name="base_prediction",
    )
    adjustment_dataset["base_prediction"] = base_prediction
    adjustment_dataset["adjustment_target"] = (
        adjustment_dataset[TARGET_COLUMN] - adjustment_dataset["base_prediction"]
    )
    return adjustment_dataset


def summarize_feature_series(frame: pd.DataFrame, feature_name: str) -> dict[str, float]:
    recent = frame.sort_values("year").reset_index(drop=True)
    deltas = recent[feature_name].diff().dropna()
    mean_delta = float(deltas.mean()) if not deltas.empty else 0.0
    std_delta = float(deltas.std(ddof=1)) if len(deltas) > 1 else 0.0
    return {
        "last_value": float(recent[feature_name].iloc[-1]),
        "mean_delta": mean_delta,
        "std_delta": std_delta,
        "historical_min": float(recent[feature_name].min()),
        "historical_max": float(recent[feature_name].max()),
    }


def summarize_feature_dynamics(
    long_term: pd.DataFrame,
    short_term: pd.DataFrame,
) -> dict[str, dict[str, float]]:
    prepared_short_term = prepare_short_term_features(short_term)
    return {
        "co2": summarize_feature_series(long_term, "co2"),
        "forest_loss_rate": summarize_feature_series(prepared_short_term, "forest_loss_rate"),
        "renewable_energy_gap": summarize_feature_series(prepared_short_term, "renewable_energy_gap"),
    }


def build_feature_bounds(
    feature_name: str, stats: dict[str, float], horizon_years: int
) -> tuple[float, float]:
    last_value = stats["last_value"]
    historical_min = stats["historical_min"]
    historical_max = stats["historical_max"]
    drift = abs(stats["mean_delta"]) * max(horizon_years, 1)
    volatility = stats["std_delta"] * np.sqrt(max(horizon_years, 1))

    if feature_name == "renewable_energy_gap":
        lower = 0.0
        upper = 100.0
    elif feature_name == "forest_loss_rate":
        lower = 0.0
        upper = max(historical_max * 2.0, last_value + drift + (3.0 * volatility))
    elif feature_name == "co2":
        lower = 0.0
        upper = max(historical_max * 1.6, last_value + drift + (3.0 * volatility))
    else:
        lower = min(historical_min, last_value - drift - (3.0 * volatility))
        upper = max(historical_max, last_value + drift + (3.0 * volatility))

    return float(lower), float(upper)


def adjusted_feature_parameters(
    feature_name: str,
    stats: dict[str, float],
    modifiers: dict[str, float],
) -> tuple[float, float]:
    modifier_key = {
        "co2": "co2",
        "forest_loss_rate": "forest_loss",
        "renewable_energy_gap": "renewables",
    }.get(feature_name)

    modifier = modifiers.get(modifier_key, 0.0) if modifier_key is not None else 0.0
    scale = 1.0 + (modifier / 100.0)

    if feature_name == "renewable_energy_gap":
        adjusted_mean_delta = stats["mean_delta"] * (1.0 - (modifier / 100.0))
    else:
        adjusted_mean_delta = stats["mean_delta"] * scale

    adjusted_std_delta = stats["std_delta"]
    return float(adjusted_mean_delta), float(adjusted_std_delta)


def modifier_temperature_adjustment(
    modifiers: dict[str, float],
    year_index: int,
    total_years: int,
) -> float:
    progress = (year_index + 1) / max(total_years, 1)
    renewables_modifier = modifiers.get("renewables", 0.0) / 100.0
    return float(-0.18 * renewables_modifier * progress)


def run_monte_carlo_projection(
    base_model: LinearRegression,
    adjustment_model: LinearRegression,
    long_term: pd.DataFrame,
    short_term: pd.DataFrame,
    residual_std: float,
    simulations: int = MONTE_CARLO_SIMULATIONS,
    seed: int = MONTE_CARLO_SEED,
    end_year: int = PROJECTION_END_YEAR,
    scenario_modifiers: dict[str, float] | None = None,
) -> tuple[pd.DataFrame, dict[str, dict[str, float]], pd.DataFrame]:
    if simulations <= 0:
        raise ValueError("Monte Carlo simulations must be greater than zero.")

    scenario_modifiers = scenario_modifiers or DEFAULT_SCENARIO_MODIFIERS.copy()
    prepared_short_term = prepare_short_term_features(short_term)
    feature_dynamics = summarize_feature_dynamics(long_term, short_term)
    last_year = int(prepared_short_term["year"].max())
    if last_year >= end_year:
        empty_projection = pd.DataFrame(
            columns=["year", "p05", "p50", "p95", "mean", "simulations"]
        )
        empty_paths = pd.DataFrame(columns=["simulation", "year", "temperature_prediction"])
        return empty_projection, feature_dynamics, empty_paths

    years = np.arange(last_year + 1, end_year + 1)
    rng = np.random.default_rng(seed)
    simulation_matrix = np.zeros((simulations, len(years)), dtype=float)
    sample_path_rows: list[dict[str, float | int]] = []
    horizon_years = len(years)

    long_term_anchor = long_term[long_term["year"] <= last_year].sort_values("year").iloc[-1]
    short_term_anchor = prepared_short_term.sort_values("year").iloc[-1]
    base_anchor_input = pd.DataFrame(
        [{"year": float(last_year), "co2": float(long_term_anchor["co2"])}]
    )
    adjustment_anchor_input = pd.DataFrame(
        [
            {
                "forest_loss_rate": float(short_term_anchor["forest_loss_rate"]),
                "renewable_energy_gap": float(short_term_anchor["renewable_energy_gap"]),
            }
        ]
    )
    combined_last_prediction = float(base_model.predict(base_anchor_input)[0]) + float(
        adjustment_model.predict(adjustment_anchor_input)[0]
    )
    anchor_offset = float(short_term_anchor[TARGET_COLUMN]) - combined_last_prediction
    base_coefficients = {
        feature: float(coef) for feature, coef in zip(BASE_FEATURES, base_model.coef_)
    }
    adjustment_coefficients = {
        feature: float(coef)
        for feature, coef in zip(ADJUSTMENT_FEATURES, adjustment_model.coef_)
    }
    current_values = {
        "co2": np.full(simulations, float(long_term_anchor["co2"]), dtype=float),
        "forest_loss_rate": np.full(
            simulations, float(short_term_anchor["forest_loss_rate"]), dtype=float
        ),
        "renewable_energy_gap": np.full(
            simulations, float(short_term_anchor["renewable_energy_gap"]), dtype=float
        ),
    }

    for year_index, year in enumerate(years):
        base_prediction = np.full(simulations, float(base_model.intercept_), dtype=float)
        base_prediction += base_coefficients["year"] * float(year)
        adjustment_prediction = np.full(
            simulations, float(adjustment_model.intercept_), dtype=float
        )

        for feature in ["co2", "forest_loss_rate", "renewable_energy_gap"]:
            stats = feature_dynamics[feature]
            adjusted_mean_delta, adjusted_std_delta = adjusted_feature_parameters(
                feature,
                stats,
                scenario_modifiers,
            )
            feature_min, feature_max = build_feature_bounds(feature, stats, horizon_years)
            deltas = rng.normal(adjusted_mean_delta, adjusted_std_delta, size=simulations)
            next_values = current_values[feature] + deltas
            bounded_values = np.clip(next_values, feature_min, feature_max)
            current_values[feature] = bounded_values
            if feature == "co2":
                base_prediction += base_coefficients["co2"] * bounded_values
            else:
                adjustment_prediction += adjustment_coefficients[feature] * bounded_values

        prediction_vector = base_prediction + adjustment_prediction
        prediction_vector += anchor_offset
        prediction_vector += modifier_temperature_adjustment(
            scenario_modifiers,
            year_index,
            horizon_years,
        )
        prediction_vector += rng.normal(0.0, residual_std, size=simulations)
        simulation_matrix[:, year_index] = prediction_vector

        for sim_index in range(min(25, simulations)):
            sample_path_rows.append(
                {
                    "simulation": sim_index + 1,
                    "year": int(year),
                    "temperature_prediction": float(prediction_vector[sim_index]),
                }
            )

    projection = pd.DataFrame(
        {
            "year": years.astype(int),
            "p05": np.percentile(simulation_matrix, 5, axis=0),
            "p50": np.percentile(simulation_matrix, 50, axis=0),
            "p95": np.percentile(simulation_matrix, 95, axis=0),
            "mean": simulation_matrix.mean(axis=0),
            "simulations": int(simulations),
        }
    )
    sample_paths = pd.DataFrame(sample_path_rows)
    return projection, feature_dynamics, sample_paths


@lru_cache(maxsize=1)
def load_training_artifacts() -> dict[str, object]:
    long_term, short_term = load_preprocessed_datasets()
    base_dataset = build_base_dataset(long_term)
    model_bundle = joblib.load(MLR_MODEL_PATH)
    base_model = model_bundle["base_model"]
    adjustment_model = model_bundle["adjustment_model"]

    adjustment_dataset = build_adjustment_dataset(short_term, base_model)
    adjustment_predictions = pd.Series(
        adjustment_model.predict(adjustment_dataset[ADJUSTMENT_FEATURES]),
        index=adjustment_dataset.index,
        name="adjustment_prediction",
    )
    mlr_evaluation = adjustment_dataset.copy()
    mlr_evaluation["adjustment_prediction"] = adjustment_predictions
    mlr_evaluation["mlr_prediction"] = (
        mlr_evaluation["base_prediction"] + mlr_evaluation["adjustment_prediction"]
    )
    mlr_evaluation["mlr_residual"] = mlr_evaluation[TARGET_COLUMN] - mlr_evaluation["mlr_prediction"]
    residual_std = float(mlr_evaluation["mlr_residual"].std(ddof=1))
    return {
        "base_model": base_model,
        "adjustment_model": adjustment_model,
        "long_term": base_dataset,
        "short_term": short_term,
        "mlr_features": BASE_FEATURES + ADJUSTMENT_FEATURES,
        "residual_std": residual_std,
    }


def forecast_arima_to_2100(arima_results, last_year: int) -> pd.DataFrame:
    if last_year >= PROJECTION_END_YEAR:
        return pd.DataFrame(columns=["year", "arima_prediction"])

    steps = PROJECTION_END_YEAR - last_year
    forecast = arima_results.forecast(steps=steps)
    years = np.arange(last_year + 1, PROJECTION_END_YEAR + 1)
    return pd.DataFrame(
        {
            "year": years.astype(int),
            "arima_prediction": np.asarray(forecast, dtype=float),
        }
    )


def simulate_temperature_scenario(
    *,
    target_year: int,
    simulations: int = MONTE_CARLO_SIMULATIONS,
    co2_modifier: float = 0.0,
    forest_loss_modifier: float = 0.0,
    renewables_modifier: float = 0.0,
    seed: int = MONTE_CARLO_SEED,
) -> dict[str, object]:
    artifacts = load_training_artifacts()
    temperature_history = load_temperature_data()
    last_year = int(temperature_history["year"].max())
    if target_year <= last_year:
        raise ValueError(
            f"target_year must be greater than {last_year} because the future simulation starts after the last observed year."
        )
    if target_year > PROJECTION_END_YEAR:
        raise ValueError(f"target_year must be less than or equal to {PROJECTION_END_YEAR}.")

    scenario_modifiers = {
        "co2": float(co2_modifier),
        "forest_loss": float(forest_loss_modifier),
        "renewables": float(renewables_modifier),
    }
    projection, feature_dynamics, sample_paths = run_monte_carlo_projection(
        artifacts["base_model"],
        artifacts["adjustment_model"],
        artifacts["long_term"],
        artifacts["short_term"],
        float(artifacts["residual_std"]),
        simulations=simulations,
        seed=seed,
        end_year=target_year,
        scenario_modifiers=scenario_modifiers,
    )
    if projection.empty:
        raise ValueError("No projection rows were generated for the requested target year.")

    arima_results = ARIMAResults.load(str(ARIMA_MODEL_PATH))
    arima_forecast = forecast_arima_to_2100(arima_results, last_year)
    arima_at_target = arima_forecast.loc[arima_forecast["year"].eq(target_year), "arima_prediction"]
    selected_row = projection.iloc[-1]

    return {
        "target": TARGET_COLUMN,
        "requested": {
            "target_year": int(target_year),
            "simulations": int(simulations),
            "scenario_modifiers": scenario_modifiers,
            "seed": int(seed),
        },
        "historical_window": {
            "start_year": int(temperature_history["year"].min()),
            "end_year": last_year,
        },
        "target_year_summary": {
            "year": int(selected_row["year"]),
            "p05": float(selected_row["p05"]),
            "p50": float(selected_row["p50"]),
            "p95": float(selected_row["p95"]),
            "mean": float(selected_row["mean"]),
            "arima_benchmark": float(arima_at_target.iloc[0]) if not arima_at_target.empty else None,
        },
        "projection": projection.to_dict(orient="records"),
        "sample_paths": sample_paths.to_dict(orient="records"),
        "scenario_metadata": {
            "feature_dynamics": feature_dynamics,
            "mlr_features": artifacts["mlr_features"],
            "last_observed_year": last_year,
        },
    }
