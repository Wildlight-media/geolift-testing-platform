# Wraps GeoLift::GeoLiftPower — an ad-hoc power curve for a specific,
# already-chosen set of markets (used for what-if tuning after a market
# combination has been picked from market selection results).
power_run_handler <- function(body) {
  df <- read_geo_data(body)

  result <- GeoLift::GeoLiftPower(
    data = df,
    locations = unlist(body$locations),
    effect_size = unlist(body$effect_size) %||% seq(0, 1, 0.05),
    treatment_periods = unlist(body$treatment_periods),
    lookback_window = body$lookback_window %||% 1,
    cpic = body$cpic %||% 0,
    Y_id = "Y",
    location_id = "location",
    time_id = "time",
    alpha = body$alpha %||% 0.1,
    model = body$model %||% "none",
    fixed_effects = body$fixed_effects %||% TRUE,
    ProgressBar = FALSE,
    parallel = TRUE,
    # "sequential" ignores the container's cores despite parallel=TRUE.
    # GeoLift only accepts "sequential"/"parallel" here (not a future
    # backend name directly) - it picks the actual future::plan() backend
    # internally once "parallel" is set.
    parallel_setup = "parallel",
    side_of_test = body$side_of_test %||% "two_sided"
  )

  list(power_curve = sanitize_df(result))
}
