from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from statsmodels.tsa.arima.model import ARIMA, ARIMAResults

from python_backend.app.data_pipeline import load_temperature_data

try:
    import matplotlib

    matplotlib.use("Agg")

    import matplotlib.pyplot as plt
except ModuleNotFoundError:
    matplotlib = None
    plt = None


PREPROCESSED_DIR = Path(__file__).resolve().parent.parent / "preprocessed_data"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
PROJECT_ROOT = Path(__file__).resolve().parent.parent

LONG_TERM_CSV = PREPROCESSED_DIR / "long_term_climate_data.csv"
SHORT_TERM_CSV = PREPROCESSED_DIR / "short_term_climate_data.csv"
MLR_MODEL_PATH = MODELS_DIR / "mlr_model.joblib"
ARIMA_MODEL_PATH = MODELS_DIR / "arima_model.pkl"
TRAINING_SUMMARY_PATH = MODELS_DIR / "training_summary.json"
MODEL_DATA_PATH = PROJECT_ROOT / "model_data.json"

MLR_PLOT_PATH = MODELS_DIR / "mlr_actual_vs_predicted.png"
ARIMA_PLOT_PATH = MODELS_DIR / "arima_benchmark_forecast.png"
MONTE_CARLO_PLOT_PATH = MODELS_DIR / "monte_carlo_temperature_projection.png"

TARGET_COLUMN = "temperature_anomaly"
BASE_FEATURES = ["year", "co2"]
ADJUSTMENT_FEATURES = ["forest_loss_rate", "renewable_energy_gap"]
ARIMA_ORDER = (1, 1, 1)
PROJECTION_END_YEAR = 2100
MONTE_CARLO_SIMULATIONS = 1000
MONTE_CARLO_SEED = 42
DEFAULT_SCENARIO_MODIFIERS = {
    "co2": 0.0,
    "forest_loss": 0.0,
    "renewables": 0.0,
}
WORKSPACE_ROOT = PROJECT_ROOT.parent.parent
HEAT_IMPACT_SUMMARY_CSV = WORKSPACE_ROOT / "python" / "preprocessed_data" / "heat_impact_summary.csv"
HEAT_IMPACT_FEATURES = ["temperature_anomaly", "year"]
HEAT_IMPACT_TARGETS = {
    "heat_mortality_rate": "heat_health_af",
    "annual_heat_deaths": "heat_health_an",
    "heat_work_loss_pp": "heat_labor_loss_pp",
}
FOOD_AGRICULTURE_SUMMARY_CSV = (
    WORKSPACE_ROOT / "python" / "preprocessed_data" / "food_agriculture_summary.csv"
)
FOOD_AGRICULTURE_FEATURES = ["temperature_anomaly", "year"]
FOOD_AGRICULTURE_TARGETS = {
    "undernourishment_pct": "undernourishment_pct",
    "food_price_index": "food_price_index",
    "agricultural_water_stress_pct": "agricultural_water_stress_pct",
}


def load_preprocessed_datasets() -> tuple[pd.DataFrame, pd.DataFrame]:
    missing = [path for path in [LONG_TERM_CSV, SHORT_TERM_CSV] if not path.exists()]
    if missing:
        names = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(
            f"Preprocessed dataset(s) not found: {names}. Run app/preprocess.py first."
        )

    long_term = pd.read_csv(LONG_TERM_CSV).sort_values("year").reset_index(drop=True)
    short_term = pd.read_csv(SHORT_TERM_CSV).sort_values("year").reset_index(drop=True)

    _validate_columns(long_term, ["year", "co2", TARGET_COLUMN], "long-term")
    _validate_columns(
        short_term,
        ["year", "forest_loss_rate", "renewable_energy_share", TARGET_COLUMN],
        "short-term",
    )

    return long_term, short_term


def load_heat_impact_training_data() -> pd.DataFrame:
    if not HEAT_IMPACT_SUMMARY_CSV.exists():
        raise FileNotFoundError(
            f"Heat impact summary not found: {HEAT_IMPACT_SUMMARY_CSV}. "
            "Run python/app/preprocess_heat_impact.py first."
        )

    heat = pd.read_csv(HEAT_IMPACT_SUMMARY_CSV).sort_values("year").reset_index(drop=True)
    _validate_columns(
        heat,
        ["year", "heat_health_af", "heat_health_an", "heat_labor_loss_pp"],
        "heat-impact",
    )

    long_term, _ = load_preprocessed_datasets()
    merged = heat.merge(long_term[["year", TARGET_COLUMN]], on="year", how="inner")
    merged = merged.rename(columns={TARGET_COLUMN: "temperature_anomaly"})
    merged = merged.dropna(
        subset=["year", "temperature_anomaly", "heat_health_af", "heat_health_an", "heat_labor_loss_pp"]
    ).reset_index(drop=True)
    if merged.empty:
        raise ValueError("Heat impact training data is empty after joining historical temperatures.")
    return merged


def load_food_agriculture_training_data() -> pd.DataFrame:
    if not FOOD_AGRICULTURE_SUMMARY_CSV.exists():
        raise FileNotFoundError(
            f"Food/agriculture summary not found: {FOOD_AGRICULTURE_SUMMARY_CSV}. "
            "Run python/app/preprocess_food_agriculture.py first."
        )

    food = pd.read_csv(FOOD_AGRICULTURE_SUMMARY_CSV).sort_values("year").reset_index(drop=True)
    _validate_columns(
        food,
        ["year", "undernourishment_pct", "food_price_index", "agricultural_water_stress_pct"],
        "food-agriculture",
    )

    long_term, _ = load_preprocessed_datasets()
    merged = food.merge(long_term[["year", TARGET_COLUMN]], on="year", how="inner")
    merged = merged.rename(columns={TARGET_COLUMN: "temperature_anomaly"})
    merged = merged.dropna(
        subset=[
            "year",
            "temperature_anomaly",
            "undernourishment_pct",
            "food_price_index",
            "agricultural_water_stress_pct",
        ]
    ).reset_index(drop=True)
    if merged.empty:
        raise ValueError(
            "Food/agriculture training data is empty after joining historical temperatures."
        )
    return merged


def _validate_columns(frame: pd.DataFrame, required: list[str], label: str) -> None:
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"Missing columns in {label} dataset: {missing}")


def evaluate_predictions(actual: pd.Series, predicted: pd.Series) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def print_metrics(label: str, metrics: dict[str, float]) -> None:
    print(
        f"{label}: "
        f"MAE={metrics['mae']:.4f} "
        f"RMSE={metrics['rmse']:.4f} "
        f"R2={metrics['r2']:.4f}"
    )


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


def fit_base_model(
    base_dataset: pd.DataFrame,
) -> tuple[LinearRegression, pd.DataFrame, dict[str, float], float]:
    model = LinearRegression(positive=True)
    X = base_dataset[BASE_FEATURES]
    y = base_dataset[TARGET_COLUMN]
    model.fit(X, y)

    predicted = pd.Series(model.predict(X), index=base_dataset.index, name="mlr_prediction")
    evaluation_frame = base_dataset.copy()
    evaluation_frame["mlr_prediction"] = predicted
    evaluation_frame["mlr_residual"] = evaluation_frame[TARGET_COLUMN] - predicted
    metrics = evaluate_predictions(evaluation_frame[TARGET_COLUMN], predicted)
    residual_std = float(evaluation_frame["mlr_residual"].std(ddof=1))
    return model, evaluation_frame, metrics, residual_std


def fit_adjustment_model(
    adjustment_dataset: pd.DataFrame,
) -> tuple[LinearRegression, pd.DataFrame, dict[str, float], float]:
    model = LinearRegression(positive=True)
    X = adjustment_dataset[ADJUSTMENT_FEATURES]
    y = adjustment_dataset["adjustment_target"]
    model.fit(X, y)

    adjustment_prediction = pd.Series(
        model.predict(X),
        index=adjustment_dataset.index,
        name="adjustment_prediction",
    )
    evaluation_frame = adjustment_dataset.copy()
    evaluation_frame["adjustment_prediction"] = adjustment_prediction
    evaluation_frame["mlr_prediction"] = (
        evaluation_frame["base_prediction"] + evaluation_frame["adjustment_prediction"]
    )
    evaluation_frame["mlr_residual"] = (
        evaluation_frame[TARGET_COLUMN] - evaluation_frame["mlr_prediction"]
    )
    metrics = evaluate_predictions(
        evaluation_frame[TARGET_COLUMN],
        evaluation_frame["mlr_prediction"],
    )
    residual_std = float(evaluation_frame["mlr_residual"].std(ddof=1))
    return model, evaluation_frame, metrics, residual_std


@lru_cache(maxsize=1)
def load_heat_impact_models() -> dict[str, object]:
    training = load_heat_impact_training_data()
    fitted_models: dict[str, LinearRegression] = {}
    fit_metrics: dict[str, dict[str, float]] = {}

    X = training[HEAT_IMPACT_FEATURES]
    for public_name, source_column in HEAT_IMPACT_TARGETS.items():
        y = training[source_column]
        model = LinearRegression()
        model.fit(X, y)
        predicted = pd.Series(model.predict(X), index=training.index)
        fitted_models[public_name] = model
        fit_metrics[public_name] = evaluate_predictions(y, predicted)

    return {
        "models": fitted_models,
        "metrics": fit_metrics,
        "year_range": {
            "start": int(training["year"].min()),
            "end": int(training["year"].max()),
        },
    }


@lru_cache(maxsize=1)
def load_food_agriculture_models() -> dict[str, object]:
    training = load_food_agriculture_training_data()
    fitted_models: dict[str, LinearRegression] = {}
    fit_metrics: dict[str, dict[str, float]] = {}

    X = training[FOOD_AGRICULTURE_FEATURES]
    for public_name, source_column in FOOD_AGRICULTURE_TARGETS.items():
        y = training[source_column]
        model = LinearRegression()
        model.fit(X, y)
        predicted = pd.Series(model.predict(X), index=training.index)
        fitted_models[public_name] = model
        fit_metrics[public_name] = evaluate_predictions(y, predicted)

    return {
        "models": fitted_models,
        "metrics": fit_metrics,
        "year_range": {
            "start": int(training["year"].min()),
            "end": int(training["year"].max()),
        },
    }


def _predict_heat_metric(
    model: LinearRegression,
    *,
    year: int,
    temperature_anomaly: float,
) -> float:
    frame = pd.DataFrame(
        [{"temperature_anomaly": float(temperature_anomaly), "year": float(year)}]
    )
    return max(0.0, float(model.predict(frame)[0]))


def predict_heat_impacts_for_temperature(
    *,
    year: int,
    baseline_temperature: float,
    scenario_temperature: float,
) -> dict[str, object]:
    artifacts = load_heat_impact_models()
    models = artifacts["models"]
    baseline: dict[str, float] = {}
    scenario: dict[str, float] = {}
    delta: dict[str, float] = {}

    for metric_name, model in models.items():
        baseline_value = _predict_heat_metric(
            model,
            year=year,
            temperature_anomaly=baseline_temperature,
        )
        scenario_value = _predict_heat_metric(
            model,
            year=year,
            temperature_anomaly=scenario_temperature,
        )
        baseline[metric_name] = baseline_value
        scenario[metric_name] = scenario_value
        delta[metric_name] = scenario_value - baseline_value

    return {
        "training_years": artifacts["year_range"],
        "baseline": baseline,
        "scenario": scenario,
        "delta": delta,
        "fit_metrics": artifacts["metrics"],
    }


def _predict_food_metric(
    model: LinearRegression,
    *,
    year: int,
    temperature_anomaly: float,
) -> float:
    frame = pd.DataFrame(
        [{"temperature_anomaly": float(temperature_anomaly), "year": float(year)}]
    )
    return max(0.0, float(model.predict(frame)[0]))


def _predict_food_price_index_with_baseline_anchor(
    model: LinearRegression,
    *,
    year: int,
    baseline_temperature: float,
    scenario_temperature: float,
) -> tuple[float, float]:
    baseline_value = _predict_food_metric(
        model,
        year=year,
        temperature_anomaly=baseline_temperature,
    )
    temp_delta = float(scenario_temperature) - float(baseline_temperature)
    temperature_coef = 0.0
    if hasattr(model, "coef_") and len(model.coef_) >= 1:
        temperature_coef = float(abs(model.coef_[0]))

    scenario_value = max(
        0.0,
        baseline_value + (temperature_coef * temp_delta),
    )
    return baseline_value, scenario_value


def predict_food_agriculture_impacts_for_temperature(
    *,
    year: int,
    baseline_temperature: float,
    scenario_temperature: float,
) -> dict[str, object]:
    artifacts = load_food_agriculture_models()
    models = artifacts["models"]
    baseline: dict[str, float] = {}
    scenario: dict[str, float] = {}
    delta: dict[str, float] = {}

    for metric_name, model in models.items():
        if metric_name == "food_price_index":
            baseline_value, scenario_value = _predict_food_price_index_with_baseline_anchor(
                model,
                year=year,
                baseline_temperature=baseline_temperature,
                scenario_temperature=scenario_temperature,
            )
        else:
            baseline_value = _predict_food_metric(
                model,
                year=year,
                temperature_anomaly=baseline_temperature,
            )
            scenario_value = _predict_food_metric(
                model,
                year=year,
                temperature_anomaly=scenario_temperature,
            )
        baseline[metric_name] = baseline_value
        scenario[metric_name] = scenario_value
        delta[metric_name] = scenario_value - baseline_value

    return {
        "training_years": artifacts["year_range"],
        "baseline": baseline,
        "scenario": scenario,
        "delta": delta,
        "fit_metrics": artifacts["metrics"],
    }


def fit_arima_model(temperature_history: pd.DataFrame):
    model = ARIMA(temperature_history[TARGET_COLUMN], order=ARIMA_ORDER)
    fitted = model.fit()

    evaluation_frame = temperature_history.copy()
    evaluation_frame["arima_fitted"] = np.asarray(fitted.fittedvalues)
    metrics = evaluate_predictions(evaluation_frame[TARGET_COLUMN], evaluation_frame["arima_fitted"])
    return fitted, evaluation_frame, metrics


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
        # More renewables should reduce the gap, not enlarge it.
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

    # The short recent fit can still zero the renewables coefficient. Keep a
    # small directional scenario effect so the renewables control remains active.
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

    if not hasattr(base_model, "coef_") or not hasattr(adjustment_model, "coef_"):
        raise ValueError("Loaded model artifacts do not expose coefficients.")

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
        "mlr_dataset": mlr_evaluation,
        "mlr_features": BASE_FEATURES + ADJUSTMENT_FEATURES,
        "residual_std": residual_std,
    }


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


def _projection_rows_to_series(projection: pd.DataFrame) -> list[dict[str, float | int]]:
    return [
        {
            "year": int(row["year"]),
            "p05": float(row["p05"]),
            "p50": float(row["p50"]),
            "p95": float(row["p95"]),
            "mean": float(row["mean"]),
        }
        for row in projection.to_dict(orient="records")
    ]


def _projection_target_year_summary(projection: pd.DataFrame) -> dict[str, float | int]:
    selected_row = projection.iloc[-1]
    return {
        "year": int(selected_row["year"]),
        "p05": float(selected_row["p05"]),
        "p50": float(selected_row["p50"]),
        "p95": float(selected_row["p95"]),
        "mean": float(selected_row["mean"]),
    }


def _build_delta_projection(
    baseline_projection: pd.DataFrame,
    scenario_projection: pd.DataFrame,
) -> pd.DataFrame:
    merged = baseline_projection.merge(
        scenario_projection,
        on="year",
        how="inner",
        suffixes=("_baseline", "_scenario"),
    )
    if merged.empty:
        raise ValueError("Unable to build comparison delta because no overlapping projection years were found.")

    delta_projection = pd.DataFrame({"year": merged["year"].astype(int)})
    for column in ["p05", "p50", "p95", "mean"]:
        delta_projection[column] = merged[f"{column}_scenario"] - merged[f"{column}_baseline"]
    return delta_projection


def _range_change_flag(
    baseline_summary: dict[str, float | int],
    scenario_summary: dict[str, float | int],
) -> str:
    baseline_width = float(baseline_summary["p95"]) - float(baseline_summary["p05"])
    scenario_width = float(scenario_summary["p95"]) - float(scenario_summary["p05"])
    width_delta = scenario_width - baseline_width

    if abs(width_delta) < 0.05:
        return "similar"
    if width_delta > 0:
        return "wider"
    return "narrower"


def compare_temperature_scenarios(
    *,
    target_year: int,
    co2_modifier: float = 0.0,
    forest_loss_modifier: float = 0.0,
    renewables_modifier: float = 0.0,
    simulations: int = MONTE_CARLO_SIMULATIONS,
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

    baseline_modifiers = DEFAULT_SCENARIO_MODIFIERS.copy()
    scenario_modifiers = {
        "co2": float(co2_modifier),
        "forest_loss": float(forest_loss_modifier),
        "renewables": float(renewables_modifier),
    }

    baseline_projection, _, _ = run_monte_carlo_projection(
        artifacts["base_model"],
        artifacts["adjustment_model"],
        artifacts["long_term"],
        artifacts["short_term"],
        float(artifacts["residual_std"]),
        simulations=simulations,
        seed=seed,
        end_year=target_year,
        scenario_modifiers=baseline_modifiers,
    )
    scenario_projection, _, _ = run_monte_carlo_projection(
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
    if baseline_projection.empty or scenario_projection.empty:
        raise ValueError("No projection rows were generated for the requested target year.")

    baseline_target = _projection_target_year_summary(baseline_projection)
    scenario_target = _projection_target_year_summary(scenario_projection)
    delta_projection = _build_delta_projection(baseline_projection, scenario_projection)
    delta_target = _projection_target_year_summary(delta_projection)

    meaningful_threshold = 0.05
    delta_median = float(delta_target["p50"])
    if abs(delta_median) < meaningful_threshold:
        direction = "negligible"
    elif delta_median > 0:
        direction = "warmer"
    else:
        direction = "cooler"

    heat_impact = predict_heat_impacts_for_temperature(
        year=int(target_year),
        baseline_temperature=float(baseline_target["p50"]),
        scenario_temperature=float(scenario_target["p50"]),
    )
    food_agriculture_impact = predict_food_agriculture_impacts_for_temperature(
        year=int(target_year),
        baseline_temperature=float(baseline_target["p50"]),
        scenario_temperature=float(scenario_target["p50"]),
    )

    return {
        "target": TARGET_COLUMN,
        "request": {
            "target_year": int(target_year),
            "scenario_modifiers": scenario_modifiers,
            "developer_overrides": {
                "simulations": int(simulations),
                "seed": int(seed),
            },
        },
        "baseline": {
            "label": "default_pathway",
            "target_year": baseline_target,
            "series": _projection_rows_to_series(baseline_projection),
        },
        "scenario": {
            "label": "user_scenario",
            "target_year": scenario_target,
            "series": _projection_rows_to_series(scenario_projection),
        },
        "delta": {
            "target_year": delta_target,
            "series": _projection_rows_to_series(delta_projection),
        },
        "projection_start_year": last_year + 1,
        "historical_window": {
            "start_year": int(temperature_history["year"].min()),
            "end_year": last_year,
        },
        "interpretation_flags": {
            "direction": direction,
            "meaningful_change": abs(delta_median) >= meaningful_threshold,
            "range_change": _range_change_flag(baseline_target, scenario_target),
        },
        "heat_impact": heat_impact,
        "food_agriculture_impact": food_agriculture_impact,
        "run_metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def compare_recent_benchmarks(
    mlr_evaluation: pd.DataFrame,
    arima_evaluation: pd.DataFrame,
    recent_start_year: int | None = None,
) -> dict[str, dict[str, float]]:
    arima_recent = arima_evaluation[["year", "arima_fitted"]]
    merged = mlr_evaluation.merge(arima_recent, on="year", how="inner")
    if recent_start_year is not None:
        merged = merged[merged["year"] >= recent_start_year]
    if merged.empty:
        raise ValueError("Unable to compare MLR and ARIMA because no overlapping years were found.")

    return {
        "mlr_recent_period": evaluate_predictions(merged[TARGET_COLUMN], merged["mlr_prediction"]),
        "arima_recent_period": evaluate_predictions(merged[TARGET_COLUMN], merged["arima_fitted"]),
    }


def plot_mlr(evaluation_frame: pd.DataFrame) -> None:
    if plt is None:
        return
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(
        evaluation_frame["year"],
        evaluation_frame[TARGET_COLUMN],
        label="Actual temperature anomaly",
        linewidth=2,
    )
    ax.plot(
        evaluation_frame["year"],
        evaluation_frame["mlr_prediction"],
        label="MLR prediction",
        linestyle="--",
    )
    ax.set_title("Long-History Base + Scenario Adjustment Fit")
    ax.set_xlabel("Year")
    ax.set_ylabel("Temperature anomaly")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(MLR_PLOT_PATH, dpi=150)
    plt.close(fig)


def plot_arima(arima_evaluation: pd.DataFrame, forecast_frame: pd.DataFrame) -> None:
    if plt is None:
        return
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(
        arima_evaluation["year"],
        arima_evaluation[TARGET_COLUMN],
        label="Historical actual",
        linewidth=2,
    )
    ax.plot(
        arima_evaluation["year"],
        arima_evaluation["arima_fitted"],
        label="ARIMA fitted",
        linestyle="--",
    )
    if not forecast_frame.empty:
        ax.plot(
            forecast_frame["year"],
            forecast_frame["arima_prediction"],
            label="ARIMA forecast",
        )
    ax.set_title("ARIMA Benchmark Forecast")
    ax.set_xlabel("Year")
    ax.set_ylabel("Temperature anomaly")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(ARIMA_PLOT_PATH, dpi=150)
    plt.close(fig)


def plot_monte_carlo(
    mlr_evaluation: pd.DataFrame,
    monte_carlo_projection: pd.DataFrame,
) -> None:
    if plt is None or monte_carlo_projection.empty:
        return
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(
        mlr_evaluation["year"],
        mlr_evaluation[TARGET_COLUMN],
        label="Historical actual",
        linewidth=2,
    )
    ax.plot(
        mlr_evaluation["year"],
        mlr_evaluation["mlr_prediction"],
        label="MLR fitted",
        linestyle="--",
    )
    ax.plot(
        monte_carlo_projection["year"],
        monte_carlo_projection["p50"],
        label="Monte Carlo median",
    )
    ax.fill_between(
        monte_carlo_projection["year"],
        monte_carlo_projection["p05"],
        monte_carlo_projection["p95"],
        alpha=0.25,
        label="Monte Carlo 5th-95th percentile",
    )
    ax.set_title("Monte Carlo Projection From Long-History CO2 Base")
    ax.set_xlabel("Year")
    ax.set_ylabel("Temperature anomaly")
    ax.legend()
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(MONTE_CARLO_PLOT_PATH, dpi=150)
    plt.close(fig)


def train_hybrid_pipeline(output_path: Path = MODEL_DATA_PATH) -> Path:
    print("Loading separated datasets...")
    long_term, short_term = load_preprocessed_datasets()
    temperature_history = load_temperature_data()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    base_dataset = build_base_dataset(long_term)
    recent_start_year = int(short_term["year"].min())

    print("Training long-history base model on year + CO2...")
    base_model, _, _, base_residual_std = fit_base_model(base_dataset)

    print("Training recent adjustment model on forest loss + renewables...")
    adjustment_dataset = build_adjustment_dataset(short_term, base_model)
    adjustment_model, mlr_eval, mlr_metrics, residual_std = fit_adjustment_model(adjustment_dataset)
    joblib.dump(
        {"base_model": base_model, "adjustment_model": adjustment_model},
        MLR_MODEL_PATH,
    )
    print_metrics("Hybrid MLR", mlr_metrics)

    print("Training ARIMA benchmark on the full temperature series...")
    arima_results, arima_eval, arima_metrics = fit_arima_model(temperature_history)
    arima_results.save(str(ARIMA_MODEL_PATH))
    print_metrics("ARIMA benchmark", arima_metrics)

    print("Running Monte Carlo simulations from the hybrid model...")
    monte_carlo_projection, feature_dynamics, monte_carlo_sample_paths = run_monte_carlo_projection(
        base_model,
        adjustment_model,
        base_dataset,
        short_term,
        residual_std,
    )
    benchmark_metrics = compare_recent_benchmarks(
        mlr_eval,
        arima_eval,
        recent_start_year=recent_start_year,
    )
    print_metrics("Hybrid MLR recent-period benchmark", benchmark_metrics["mlr_recent_period"])
    print_metrics("ARIMA recent-period benchmark", benchmark_metrics["arima_recent_period"])

    forecast_frame = forecast_arima_to_2100(arima_results, int(temperature_history["year"].max()))

    plot_mlr(mlr_eval)
    plot_arima(arima_eval, forecast_frame)
    plot_monte_carlo(mlr_eval, monte_carlo_projection)

    generated_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "generated_at": generated_at,
        "datasets": {
            "long_term_csv": str(LONG_TERM_CSV),
            "short_term_csv": str(SHORT_TERM_CSV),
            "long_term_rows": int(len(long_term)),
            "short_term_rows": int(len(short_term)),
            "long_term_range": {
                "start": int(long_term["year"].min()),
                "end": int(long_term["year"].max()),
            },
            "short_term_range": {
                "start": int(short_term["year"].min()),
                "end": int(short_term["year"].max()),
            },
        },
        "mlr_model": {
            "type": "two_layer_regression",
            "features": {
                "base": BASE_FEATURES,
                "adjustment": ADJUSTMENT_FEATURES,
            },
            "target": TARGET_COLUMN,
            "metrics": mlr_metrics,
            "recent_period_metrics": benchmark_metrics["mlr_recent_period"],
            "base_model": {
                "coefficients": {
                    feature: float(coef) for feature, coef in zip(BASE_FEATURES, base_model.coef_)
                },
                "intercept": float(base_model.intercept_),
                "residual_standard_deviation": base_residual_std,
            },
            "adjustment_model": {
                "coefficients": {
                    feature: float(coef)
                    for feature, coef in zip(ADJUSTMENT_FEATURES, adjustment_model.coef_)
                },
                "intercept": float(adjustment_model.intercept_),
                "residual_standard_deviation": residual_std,
            },
            "notes": [
                "The main forecast uses the long temperature + CO2 history.",
                "Forest loss and renewable-energy gap are recent scenario adjustments layered on top.",
            ],
        },
        "arima_benchmark": {
            "type": "arima",
            "order": list(ARIMA_ORDER),
            "target": TARGET_COLUMN,
            "metrics_full_series": arima_metrics,
            "metrics_recent_period": benchmark_metrics["arima_recent_period"],
            "notes": [
                "ARIMA is kept as a benchmark model rather than mixed into the final MLR forecast.",
                "The benchmark uses only historical temperature anomaly values.",
            ],
        },
        "monte_carlo": {
            "type": "simulation",
            "based_on_model": "hybrid_two_layer_regression",
            "simulations": MONTE_CARLO_SIMULATIONS,
            "seed": MONTE_CARLO_SEED,
            "projection_end_year": PROJECTION_END_YEAR,
            "feature_dynamics": feature_dynamics,
            "notes": [
                "CO2 follows the long-history base trajectory while forest loss and renewables act as scenario adjustments.",
                "Projected feature values are clipped to bounded ranges to keep the simulation stable.",
            ],
        },
        "plots": {
            "mlr": str(MLR_PLOT_PATH) if plt is not None else None,
            "arima_benchmark": str(ARIMA_PLOT_PATH) if plt is not None else None,
            "monte_carlo": str(MONTE_CARLO_PLOT_PATH) if plt is not None else None,
        },
    }
    TRAINING_SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    model_data = {
        "generated_at": generated_at,
        "target": TARGET_COLUMN,
        "datasets": summary["datasets"],
        "model_notes": {
            "mlr_role": (
                "The main forecast uses the long temperature and CO2 history, while forest loss "
                "and renewable-energy gap act as recent scenario adjustments."
            ),
            "arima_role": (
                "ARIMA is a benchmark that forecasts temperature anomaly from its own historical pattern only."
            ),
            "monte_carlo_role": (
                "Monte Carlo simulates future CO2, forest-loss, and renewable-gap paths and combines the long-history base forecast with recent scenario adjustments."
            ),
        },
        "metrics": {
            "mlr_full_period": mlr_metrics,
            "mlr_recent_period": benchmark_metrics["mlr_recent_period"],
            "arima_full_series": arima_metrics,
            "arima_recent_period": benchmark_metrics["arima_recent_period"],
        },
        "scenario_controls": {
            "target_year": {
                "min": int(temperature_history["year"].max()) + 1,
                "max": PROJECTION_END_YEAR,
                "default": min(int(temperature_history["year"].max()) + 10, PROJECTION_END_YEAR),
            },
            "simulations": {
                "default": MONTE_CARLO_SIMULATIONS,
                "min": 25,
                "max": 10000,
            },
            "modifiers": {
                "co2": {"default": 0.0, "min": -100.0, "max": 200.0},
                "forest_loss": {"default": 0.0, "min": -100.0, "max": 200.0},
                "renewables": {"default": 0.0, "min": -100.0, "max": 200.0},
            },
        },
        "historical_series": {
            "mlr": mlr_eval[
                [
                    "year",
                    TARGET_COLUMN,
                    "mlr_prediction",
                    "mlr_residual",
                    "base_prediction",
                    "adjustment_prediction",
                    "co2",
                    "forest_loss_rate",
                    "renewable_energy_gap",
                ]
            ].to_dict(orient="records"),
            "arima_benchmark": arima_eval[
                ["year", TARGET_COLUMN, "arima_fitted"]
            ].to_dict(orient="records"),
        },
        "future_projection": {
            "arima_benchmark": forecast_frame.to_dict(orient="records"),
            "monte_carlo_summary": monte_carlo_projection.to_dict(orient="records"),
            "monte_carlo_sample_paths": monte_carlo_sample_paths.to_dict(orient="records"),
        },
        "scenario_metadata": {
            "feature_dynamics": feature_dynamics,
            "default_modifiers": DEFAULT_SCENARIO_MODIFIERS,
            "api_path": "/simulate",
        },
    }
    output_path.write_text(json.dumps(model_data, indent=2), encoding="utf-8")
    print(f"Wrote model data: {output_path}")
    return output_path


def export_model_data(output_path: Path = MODEL_DATA_PATH) -> Path:
    return train_hybrid_pipeline(output_path=output_path)


if __name__ == "__main__":
    export_path = export_model_data()
    print(f"Done: {export_path}")
