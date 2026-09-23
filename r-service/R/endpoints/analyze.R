# Wraps GeoLift::GeoLift — the real post-test inference. Reconstructs the
# same series plot.GeoLift() draws (Lift and ATT) as plain JSON arrays,
# reading straight from the GeoLift object's fields (inference, y_obs,
# y_hat, summary$att, df_weights) instead of rendering an image, so the
# frontend can chart them interactively. Result extraction itself lives in
# geolift_extract.R, shared with the pre-test simulate.R endpoint.
analyze_run_handler <- function(body) {
  df <- read_geo_data(body)

  gl <- GeoLift::GeoLift(
    Y_id = "Y",
    time_id = "time",
    location_id = "location",
    X = if (is.null(body$X)) c() else unlist(body$X),
    data = df,
    locations = unlist(body$locations),
    treatment_start_time = body$treatment_start_time,
    treatment_end_time = body$treatment_end_time,
    alpha = body$alpha %||% 0.1,
    model = body$model %||% "none",
    fixed_effects = body$fixed_effects %||% TRUE,
    ConfidenceIntervals = body$confidence_intervals %||% FALSE,
    # "Total" (two-sided, default) | "Positive" | "Negative" - a one-sided
    # test gives more power to detect a real effect in the expected
    # direction, which "Total" doesn't take advantage of.
    stat_test = body$stat_test %||% "Total"
  )

  extract_geolift_result(gl, body)
}
