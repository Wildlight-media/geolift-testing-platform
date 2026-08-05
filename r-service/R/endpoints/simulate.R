# Pre-test "what would this look like" preview for a single candidate market
# combination, before any real campaign has run. Injects a hypothetical
# effect into the candidate's own real historical data using the exact same
# convention GeoLift's own internal power simulation uses (pvalueCalc,
# called by GeoLiftPower/GeoLiftMarketSelection):
#   Y_inc[D==1] <- Y[D==1] * (1 + effect_size)
# then runs the real GeoLift() pipeline on the modified panel - so the
# result is a genuine GeoLift() output, not a synthetic mockup, and reuses
# the same extraction (and the same frontend charts) as a real analyze run.
simulate_run_handler <- function(body) {
  df <- read_geo_data(body)

  locations <- tolower(unlist(body$locations))
  duration <- body$duration
  treatment_end <- max(df$time)
  treatment_start <- treatment_end - duration + 1

  df$location <- tolower(df$location)
  in_treatment <- df$location %in% locations & df$time >= treatment_start & df$time <= treatment_end

  effect_sizes <- unlist(body$effect_sizes) %||% c(0)

  scenarios <- lapply(effect_sizes, function(es) {
    df_sim <- df
    if (es != 0) {
      df_sim$Y[in_treatment] <- df_sim$Y[in_treatment] * (1 + es)
    }

    gl <- GeoLift::GeoLift(
      Y_id = "Y",
      time_id = "time",
      location_id = "location",
      X = if (is.null(body$X)) c() else unlist(body$X),
      data = df_sim,
      locations = locations,
      treatment_start_time = treatment_start,
      treatment_end_time = treatment_end,
      alpha = body$alpha %||% 0.1,
      model = body$model %||% "none",
      fixed_effects = body$fixed_effects %||% TRUE,
      ConfidenceIntervals = TRUE,
      stat_test = "Total"
    )

    list(effect_size = unbox_scalar(es), result = extract_geolift_result(gl, body))
  })

  list(scenarios = scenarios)
}
