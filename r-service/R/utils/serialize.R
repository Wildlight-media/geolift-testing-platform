`%||%` <- function(a, b) if (is.null(a)) b else a

# Request bodies arrive as parsed JSON. When the "data" field is an array of
# uniform row objects, plumber's JSON parser usually simplifies it into a
# data.frame already; this is a defensive fallback for when it doesn't.
coerce_to_df <- function(x) {
  if (is.null(x)) stop("`data` is required")
  if (is.data.frame(x)) return(x)
  jsonlite::fromJSON(jsonlite::toJSON(x, auto_unbox = TRUE), simplifyVector = TRUE)
}

# JSON has no representation for NaN/Inf; convert them to NA so they
# serialize as null instead of breaking the response.
sanitize_df <- function(df) {
  if (is.null(df) || nrow(df) == 0) return(list())
  for (col in names(df)) {
    if (is.numeric(df[[col]])) {
      df[[col]][!is.finite(df[[col]])] <- NA
    }
  }
  df
}

# Always returns a length-1 numeric (or NA_real_), never a bare NULL - jsonlite
# serializes a NULL sitting inside a list() inconsistently (sometimes "{}"
# instead of "null" depending on how it got there), whereas NA_real_ reliably
# serializes to JSON null.
unbox_scalar <- function(x) {
  if (is.null(x) || length(x) == 0) return(NA_real_)
  v <- suppressWarnings(as.numeric(x[[1]]))
  if (length(v) != 1 || !is.finite(v)) return(NA_real_)
  v
}
