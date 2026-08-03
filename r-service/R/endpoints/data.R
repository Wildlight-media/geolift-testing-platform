# Wraps GeoLift::GeoDataRead — validates and standardizes an uploaded panel
# (location, date, Y, optional covariates) into the location/time/Y format
# every other GeoLift function expects.
data_read_handler <- function(body) {
  result <- read_geo_data(body)
  locations <- sort(unique(result$location))

  # period <-> calendar date lookup, so the frontend can offer real date
  # pickers instead of making users count time-period numbers by hand.
  period_dates <- unique(result[, c("time", "date_unix")])
  period_dates <- period_dates[order(period_dates$time), ]
  period_dates$date <- as.character(as.Date(as.POSIXct(period_dates$date_unix, origin = "1970-01-01", tz = "UTC")))

  list(
    preview = sanitize_df(utils::head(result, 500)),
    row_count = nrow(result),
    location_count = length(locations),
    # I() forces a JSON array even when length 1 - without it, jsonlite's
    # auto_unbox collapses a single-location result to a bare string, which
    # breaks a `list[str]` response model on the Python side.
    locations = I(locations),
    time_period_count = length(unique(result$time)),
    time_range = list(min = min(result$time), max = max(result$time)),
    period_dates = sanitize_df(data.frame(period = period_dates$time, date = period_dates$date)),
    columns = I(names(result))
  )
}
