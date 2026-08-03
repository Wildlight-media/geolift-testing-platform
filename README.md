# Geo Lift Testing Platform

A self-hosted platform wrapping Meta's open-source [GeoLift](https://github.com/facebookincubator/GeoLift) R package
(synthetic-control-method geo-experiments) in a full web interface: design tests with complete control over every
GeoLift parameter, run the real post-test inference, and export client-ready results (interactive dashboard + branded
PDF).

## Architecture

```
r-service/   Plumber (R) API — the only place GeoLift actually runs
backend/     FastAPI (Python) — auth, datasets, experiments, job orchestration, PDF reports
frontend/    Next.js (TypeScript) — the UI
```

Requests flow: **frontend → backend → r-service**. Long-running GeoLift simulations (market selection, post-test
inference) run as background jobs via Redis/RQ so the UI can poll instead of blocking on an HTTP request for minutes.

## Running locally

Requires Docker + Docker Compose (nothing else — R, Node, and Python all run inside containers).

```bash
docker compose up --build
```

First build is slow (`r-service` compiles `augsynth` and `GeoLift` from source — this can take 15–30+ minutes; later
builds are cached). Once it's up:

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs
- r-service health check: http://localhost:8001/health

Create a workspace at `/register` (this becomes your organization + first admin user), upload a dataset, and create
an experiment.

## Workflow

1. **Datasets** — upload a CSV of location/date/outcome (+ optional covariates) data. It's validated against
   `GeoLift::GeoDataRead` on upload. If your data is at zip-code level, check "convert zip codes to DMA" during
   upload — rows are aggregated (summed) to Nielsen DMA before validation, since DMA is the level media is actually
   bought at. The bundled crosswalk (`backend/app/data/zip_to_dma.tsv`, ~41k zips / 210 DMAs) is a public
   approximation (zip centroid plotted against DMA boundaries, from
   [this gist](https://gist.github.com/clarkenheim/023882f8d77741f4d5347f80d95bc259)), not licensed Nielsen data —
   swap in your organization's own crosswalk in that file if you have one (same `zip_code\tdma_code\tdma_description`
   TSV format) for the most accurate mapping to your actual media buys. Every upload also gets its panel "densified":
   `GeoDataRead` silently drops any location missing even one date in the range, and most sales/conversion exports
   only record days something actually happened — so any missing (location, date) combination is filled with `Y=0`
   (and covariates=0) before validation, and the count of filled gaps is shown on the dataset card. If a location
   still doesn't appear after upload, check the raw file for that location entirely — densifying only helps when the
   location has *some* rows to begin with.
2. **Design** — run `GeoLiftMarketSelection` with full control over every parameter (treatment durations, candidate
   market counts, effect sizes, budget, cpic, alpha, include/exclude markets, holdout range, etc.), then drill into
   any ranked candidate for its pre-treatment fit and power curve.
3. **Analyze** — once the real-world test has actually run, enter the real test window and markets and run
   `GeoLift()` for the actual post-test inference (lift, ATT over time, significance, synthetic-control weights).
4. **Report** — generate a branded PDF and/or a signed read-only share link for clients.

## Environment variables

Copy `.env.example` to `.env` at the repo root before deploying anywhere real — it sets `JWT_SECRET` (auth signing
key) and `FRONTEND_URL` (used to build share links). Docker Compose picks these up automatically.

## Verified working end to end

The full flow — register → upload dataset → run market selection → run post-test analysis → generate PDF → create
share link — has been exercised against a real synthetic dataset through both the API directly and the actual
browser UI, with real GeoLift computations (not mocked) at every step.

Along the way this surfaced and fixed:
- **An upstream `augsynth` bug** (confirmed via [ebenmichael/augsynth#118](https://github.com/ebenmichael/augsynth/issues/118),
  filed against the same GeoLift/augsynth versions used here): `augsynth:::treated_table()` crashes
  `GeoLift()` for any test with more than one treated location, because it assumes exactly one treated row instead
  of averaging across treated units. `r-service/R/utils/patches.R` monkey-patches the function with the correct
  averaging logic at service startup — GeoLift itself isn't modified, and this can be removed once upstream ships a
  fix. Single-location tests were never affected.
- `weasyprint` needed pinning to 69.0 (a version mismatch with `pydyf` broke PDF generation on the initially pinned
  62.3).
- `passlib` 1.7.4's bcrypt self-test breaks on `bcrypt>=4.1` ("password cannot be longer than 72 bytes" on every
  hash) — pinned `bcrypt==4.0.1`.
- GeoLift's `Perc.Lift` field is already a percentage value (`-0.7` means "-0.7%", not a 0–1 fraction) — watch for
  this if you add more places that display it.

## Notes / known gaps

- Auth is JWT email/password for your team; clients don't get accounts — they get a signed, expiring share link
  instead (`SHARE_LINK_EXPIRE_DAYS` in `backend/app/core/config.py`).
- File storage is local disk (a Docker volume). Swap `backend/app/services/storage.py` for S3/GCS before running
  on more than one backend instance.
- Not yet hardened: limited error/empty states beyond the basics, no seed/demo dataset script, no deployment
  guide for a remote host (this README covers local Docker Compose only).
