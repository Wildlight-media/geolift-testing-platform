# Wraps GeoLift::GeoLift — the real post-test inference. Reconstructs the
# same series plot.GeoLift() draws (Lift and ATT) as plain JSON arrays,
# reading straight from the GeoLift object's fields (inference, y_obs,
# y_hat, summary$att, df_weights) instead of rendering an image, so the
# frontend can chart them interactively.
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
    ConfidenceIntervals = body$confidence_intervals %||% FALSE
  )

  inference <- gl$inference
  att_series <- tryCatch(sanitize_df(gl$summary$att), error = function(e) list())

  n_test <- nrow(gl$test_id)
  treatment_end <- gl$TreatmentEnd

  lift_series <- tryCatch(
    {
      t_obs <- colMeans(matrix(gl$y_obs, nrow = n_test, ncol = treatment_end)) * n_test
      c_obs <- gl$y_hat * n_test
      sanitize_df(data.frame(
        time = seq_len(treatment_end),
        treatment_observed = as.numeric(t_obs),
        synthetic_control = as.numeric(c_obs)
      ))
    },
    error = function(e) list()
  )

  list(
    summary = list(
      att = unbox_scalar(gl$ATT),
      att_se = unbox_scalar(gl$ATT_se),
      percent_lift = unbox_scalar(inference$Perc.Lift),
      pvalue = unbox_scalar(inference$pvalue),
      lower_conf_int = unbox_scalar(inference$Lower.Conf.Int),
      upper_conf_int = unbox_scalar(inference$Upper.Conf.Int),
      incremental = unbox_scalar(sum(gl$incremental, na.rm = TRUE)),
      treatment_start = unbox_scalar(gl$TreatmentStart),
      treatment_end = unbox_scalar(gl$TreatmentEnd),
      test_locations = as.character(gl$test_id$name)
    ),
    att_series = att_series,
    lift_series = lift_series,
    weights = sanitize_df(gl$df_weights)
  )
}
