# Wraps GeoLift::GeoDataRead — validates and standardizes an uploaded panel
# (location, date, Y, optional covariates) into the location/time/Y format
# every other GeoLift function expects.
data_read_handler <- function(body) {
  result <- read_geo_data(body)
  locations <- sort(unique(result$location))

  list(
    preview = sanitize_df(utils::head(result, 500)),
    row_count = nrow(result),
    location_count = length(locations),
    locations = locations,
    time_period_count = length(unique(result$time)),
    time_range = list(min = min(result$time), max = max(result$time)),
    columns = names(result)
  )
}
