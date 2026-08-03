# Installs everything the r-service needs. Run once at Docker build time.
# augsynth + GeoLift are not on CRAN, so they're installed from GitHub.

options(repos = c(CRAN = "https://cloud.r-project.org"))

# Only what entrypoint.R and R/ actually use — GeoLift/augsynth pull in
# their own dependencies (dplyr, future, etc.) transitively.
install.packages(c("remotes", "plumber", "jsonlite"))

remotes::install_github("ebenmichael/augsynth", upgrade = "never")
remotes::install_github("facebookincubator/GeoLift", upgrade = "never")

# install.packages()/install_github() only warn on failure rather than
# stopping the script, so without this check a broken install can silently
# produce a "successful" Docker build missing a package the service needs.
library(plumber)
library(jsonlite)
library(augsynth)
library(GeoLift)
cat("plumber, jsonlite, augsynth, and GeoLift all installed and loaded successfully.\n")
