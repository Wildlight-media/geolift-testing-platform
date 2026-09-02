# Wraps GeoLift::GeoLiftMarketSelection — the data-driven market/power-analysis
# search. Every user-adjustable parameter GeoLift exposes is passed through
# from the request body so the frontend form has full control.
market_selection_run_handler <- function(body) {
  df <- read_geo_data(body)

  args <- list(
    data = df,
    treatment_periods = unlist(body$treatment_periods),
    N = unlist(body$N),
    Y_id = "Y",
    location_id = "location",
    time_id = "time",
    effect_size = unlist(body$effect_size) %||% seq(-0.2, 0.2, 0.05),
    lookback_window = body$lookback_window %||% 3,
    include_markets = unlist(body$include_markets) %||% c(),
    exclude_markets = unlist(body$exclude_markets) %||% c(),
    holdout = unlist(body$holdout) %||% c(),
    cpic = body$cpic %||% 1,
    budget = body$budget,
    alpha = body$alpha %||% 0.1,
    normalize = body$normalize %||% FALSE,
    model = body$model %||% "none",
    fixed_effects = body$fixed_effects %||% TRUE,
    dtw = body$dtw %||% 0,
    Correlations = body$correlations %||% FALSE,
    ProgressBar = FALSE,
    print = FALSE,
    run_stochastic_process = body$run_stochastic_process %||% FALSE,
    parallel = TRUE,
    # "sequential" ignores the container's cores despite parallel=TRUE.
    # GeoLift only accepts "sequential"/"parallel" here (not a future
    # backend name directly) - it picks the actual future::plan() backend
    # internally once "parallel" is set.
    parallel_setup = "parallel",
    side_of_test = body$side_of_test %||% "two_sided"
  )

  result <- do.call(GeoLift::GeoLiftMarketSelection, args)

  list(
    best_markets = sanitize_df(result$BestMarkets),
    power_curves = sanitize_df(result$PowerCurves)
  )
}

# Recomputes the detail view (power curve + synthetic-control weights) for a
# single candidate market combination, rather than caching the (large)
# GeoLiftMarketSelection object between requests.
market_selection_detail_handler <- function(body) {
  df <- read_geo_data(body)
  locations <- unlist(body$locations)
  duration <- body$duration
  effect_size <- unlist(body$effect_size) %||% seq(-0.2, 0.2, 0.05)
  fixed_effects <- body$fixed_effects %||% TRUE

  power_df <- GeoLift::GeoLiftPower(
    data = df,
    locations = locations,
    effect_size = effect_size,
    treatment_periods = duration,
    lookback_window = body$lookback_window %||% 3,
    cpic = body$cpic %||% 1,
    Y_id = "Y",
    location_id = "location",
    time_id = "time",
    alpha = body$alpha %||% 0.1,
    model = body$model %||% "none",
    fixed_effects = fixed_effects,
    ProgressBar = FALSE,
    parallel = TRUE,
    # "sequential" ignores the container's cores despite parallel=TRUE.
    # GeoLift only accepts "sequential"/"parallel" here (not a future
    # backend name directly) - it picks the actual future::plan() backend
    # internally once "parallel" is set.
    parallel_setup = "parallel",
    side_of_test = body$side_of_test %||% "two_sided"
  )

  # GeoLiftPower returns one row PER LOOKBACK WINDOW - with lookback_window=3
  # that's 3 raw rows per effect size, each an individual pass/fail simulation
  # (power is strictly 0 or 1 on any single row, never fractional). Left
  # un-aggregated, both the chart and the "Recommended Plan" summary see a
  # meaningless step function and can key off a single window agreeing
  # rather than a genuine majority. GeoLiftMarketSelection's own bulk search
  # averages across windows internally (power = mean(significant)) before
  # reporting anything - mirror that here so the detail view for one
  # candidate is calibrated the same way the ranked list already is.
  power_df <- power_df %>%
    dplyr::group_by(EffectSize) %>%
    dplyr::summarize(
      power = mean(power),
      pvalue = mean(pvalue),
      Investment = mean(Investment),
      ScaledL2Imbalance = mean(ScaledL2Imbalance),
      cpic = dplyr::first(cpic),
      duration = dplyr::first(duration),
      .groups = "drop"
    ) %>%
    dplyr::arrange(EffectSize)

  weights <- tryCatch(
    GeoLift::GetWeights(
      Y_id = "Y",
      location_id = "location",
      time_id = "time",
      data = df,
      locations = locations,
      pretreatment_end_time = max(df$time) - duration,
      fixed_effects = fixed_effects
    ),
    error = function(e) NULL
  )

  list(
    power_curve = sanitize_df(power_df),
    weights = if (!is.null(weights)) sanitize_df(weights) else list()
  )
}
