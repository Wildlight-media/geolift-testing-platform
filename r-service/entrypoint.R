library(plumber)

source("R/utils/serialize.R")
source("R/utils/geo_data.R")
source("R/utils/patches.R")
source("R/endpoints/health.R")
source("R/endpoints/data.R")
source("R/endpoints/market_selection.R")
source("R/endpoints/power.R")
source("R/endpoints/analyze.R")

# Every non-health route takes a parsed JSON body and returns a plain list;
# this wraps them so an R error becomes a 400 JSON response instead of
# plumber's default 500 HTML error page.
wrap <- function(handler) {
  function(req, res) {
    tryCatch(
      handler(req$body),
      error = function(e) {
        res$status <- 400
        list(error = conditionMessage(e))
      }
    )
  }
}

root <- pr() |>
  pr_set_serializer(serializer_unboxed_json(na = "null")) |>
  pr_get("/health", function(req, res) health_handler()) |>
  pr_post("/data/read", wrap(data_read_handler)) |>
  pr_post("/market-selection/run", wrap(market_selection_run_handler)) |>
  pr_post("/market-selection/detail", wrap(market_selection_detail_handler)) |>
  pr_post("/power/run", wrap(power_run_handler)) |>
  pr_post("/analyze/run", wrap(analyze_run_handler))

root |> pr_run(host = "0.0.0.0", port = as.integer(Sys.getenv("PORT", 8001)))
