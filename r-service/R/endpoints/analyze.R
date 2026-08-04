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
    ConfidenceIntervals = body$confidence_intervals %||% FALSE,
    # "Total" (two-sided, default) | "Positive" | "Negative" - a one-sided
    # test gives more power to detect a real effect in the expected
    # direction, which "Total" doesn't take advantage of.
    stat_test = body$stat_test %||% "Total"
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

  # One-sided confidence the true effect is positive (P(ATT > 0), assuming the
  # estimate is approximately normal around the true effect with sd = ATT_se).
  # Since ROI = incremental / spend with spend > 0, this is also "confidence
  # iROAS > 0" - no separate calculation needed for that stat. ATT_se comes
  # back NA for some configs (e.g. a single test market with model="none"),
  # so fall back to backing out an implied SE from the overall CI width -
  # same technique used for the cumulative band's per-period SE below.
  prob_positive_effect <- tryCatch(
    {
      se <- gl$ATT_se
      if (is.null(se) || length(se) == 0 || is.na(se) || se <= 0) {
        lower <- inference$Lower.Conf.Int
        upper <- inference$Upper.Conf.Int
        z <- qnorm(1 - (body$alpha %||% 0.1) / 2)
        implied_se <- if (is.null(lower) || is.null(upper) || is.na(lower) || is.na(upper)) NA_real_ else (upper - lower) / (2 * z)
        if (is.na(implied_se) || implied_se <= 0) NA_real_ else pnorm(gl$ATT / implied_se)
      } else {
        pnorm(gl$ATT / se)
      }
    },
    error = function(e) NA_real_
  )

  # Cumulative incremental effect over the treatment window, for a
  # CausalImpact-style running-total chart. Scales the same per-period
  # average-ATT data frame att_series is built from up to totals (* n_test),
  # the same way lift_series already scales averages to totals above. The
  # band (only when confidence_intervals was on) backs out each period's SE
  # from its reported CI width, then sums variances assuming independence
  # across periods - a standard approximation for this kind of chart.
  cumulative_effect_series <- tryCatch(
    {
      # att_series (gl$summary$att) spans the whole panel like lift_series
      # does, not just the treatment window - restrict to treatment periods
      # only, so the cumulative sum starts fresh at treatment start instead
      # of accumulating pre-period noise from period 1.
      att_df <- gl$summary$att
      att_df <- att_df[att_df$Time >= gl$TreatmentStart & att_df$Time <= gl$TreatmentEnd, ]
      cum_estimate <- cumsum(att_df$Estimate) * n_test
      out <- data.frame(time = att_df$Time, cumulative_estimate = as.numeric(cum_estimate))
      has_bounds <- all(c("lower_bound", "upper_bound") %in% names(att_df)) &&
        !anyNA(att_df$lower_bound) && !anyNA(att_df$upper_bound)
      if (has_bounds) {
        z <- qnorm(1 - (body$alpha %||% 0.1) / 2)
        se_period <- (att_df$upper_bound - att_df$lower_bound) / (2 * z)
        cum_var <- cumsum((se_period * n_test)^2)
        out$lower_bound <- as.numeric(cum_estimate - z * sqrt(cum_var))
        out$upper_bound <- as.numeric(cum_estimate + z * sqrt(cum_var))
      } else {
        out$lower_bound <- NA_real_
        out$upper_bound <- NA_real_
      }
      sanitize_df(out)
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
      prob_positive_effect = unbox_scalar(prob_positive_effect),
      # I() forces a JSON array even for a single-market test - see data.R
      test_locations = I(as.character(gl$test_id$name))
    ),
    att_series = att_series,
    lift_series = lift_series,
    cumulative_effect_series = cumulative_effect_series,
    weights = sanitize_df(gl$df_weights)
  )
}
