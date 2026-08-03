# Fixes a confirmed upstream bug in augsynth 0.2.0's treated_table() that
# crashes GeoLift() for any test with more than one treated location:
# https://github.com/ebenmichael/augsynth/issues/118
#
# The original does `t(df[trt_index, ])`, which assumes exactly one treated
# row. With N test locations that produces a Yobs vector of length
# N * n_periods, which can't sit in a tibble next to a `time` column of
# length n_periods ("Tibble columns must have compatible sizes"). This
# patch averages across treated units first, the same way the function
# already averages the control units into `raw_average` - so a single-market
# test still behaves identically (mean of one value = that value).
library(augsynth)

patched_treated_table <- function(augsynth) {
  if (augsynth:::is_summary_augsynth(augsynth)) {
    return(augsynth$treated_table)
  }
  trt_index <- which(augsynth$data$trt == 1)
  df <- dplyr::bind_cols(augsynth$data$X, augsynth$data$y)
  synth_unit <- stats::predict(augsynth)
  average_unit <- colMeans(df[-trt_index, , drop = FALSE])
  treated_unit <- colMeans(df[trt_index, , drop = FALSE])

  lvls <- tibble::tibble(
    time = as.numeric(colnames(df)),
    Yobs = as.numeric(treated_unit),
    Yhat = as.numeric(synth_unit),
    raw_average = as.numeric(average_unit)
  )
  t0 <- ncol(augsynth$data$X)
  tpost <- ncol(augsynth$data$y)
  lvls$tx <- rep(c(0, 1), c(t0, tpost))
  lvls$ATT <- lvls$Yobs - lvls$Yhat
  lvls$rstat <- lvls$ATT / sqrt(mean(lvls$ATT[lvls$tx == 0]^2))
  lvls <- dplyr::relocate(lvls, time, tx, Yobs, Yhat, raw_average, ATT, rstat)
  lvls
}

assignInNamespace("treated_table", patched_treated_table, ns = "augsynth")
