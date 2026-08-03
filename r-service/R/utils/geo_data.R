# Every endpoint that runs an actual analysis (market selection, power,
# analyze) receives the raw uploaded records plus a column mapping, and
# re-applies GeoDataRead itself here rather than trusting a pre-processed
# dataset was passed in — this mirrors the real GeoLift workflow
# (GeoDataRead -> GeoLiftMarketSelection/GeoLift) and avoids storing a
# duplicated processed copy of the dataset outside the R service.
read_geo_data <- function(body) {
  df <- coerce_to_df(body$data)

  GeoLift::GeoDataRead(
    data = df,
    date_id = body$date_id %||% "date",
    location_id = body$location_id %||% "location",
    Y_id = body$Y_id %||% "Y",
    format = body$format %||% "yyyy-mm-dd",
    X = if (is.null(body$X)) c() else unlist(body$X),
    summary = FALSE,
    keep_unix_time = FALSE
  )
}
