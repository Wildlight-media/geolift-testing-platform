export type User = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  org_id: string;
};

export type Dataset = {
  id: string;
  name: string;
  filename: string;
  location_col: string;
  date_col: string;
  y_col: string;
  date_format: string;
  covariate_cols: string[];
  outcome_type: string;
  converted_from_zip: boolean;
  dropped_zip_row_count: number;
  dropped_zip_codes: string[];
  filled_missing_row_count: number;
  row_count: number | null;
  location_count: number | null;
  time_period_count: number | null;
  locations: string[];
  period_dates: { period: number; date: string }[];
  summary_json: Record<string, unknown>;
  created_at: string;
};

export type Experiment = {
  id: string;
  name: string;
  status: string;
  dataset_id: string;
  created_at: string;
  updated_at: string;
};

export type MarketSelectionParams = {
  treatment_periods: number[];
  N: number[];
  effect_size: number[];
  lookback_window: number;
  include_markets: string[];
  exclude_markets: string[];
  holdout: number[];
  cpic: number;
  budget: number | null;
  alpha: number;
  normalize: boolean;
  model: string;
  fixed_effects: boolean;
  dtw: number;
  correlations: boolean;
  side_of_test: string;
  run_stochastic_process: boolean;
};

export type MarketSelectionRun = {
  id: string;
  experiment_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  params_json: MarketSelectionParams;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type BestMarketRow = {
  ID: number;
  location: string;
  duration: number;
  EffectSize: number;
  Power: number;
  AvgScaledL2Imbalance: number;
  Investment: number;
  AvgATT: number;
  Average_MDE: number;
  ProportionTotal_Y: number;
  Holdout: number;
  rank: number;
  correlation?: number;
};

export type MarketSelectionResult = {
  id: string;
  run_id: string;
  best_markets_json: BestMarketRow[];
  power_curves_json: Record<string, unknown>[];
};

export type TestConfig = {
  id: string;
  experiment_id: string;
  locations: string[];
  treatment_start_time: number;
  treatment_end_time: number;
  model: string;
  fixed_effects: boolean;
  alpha: number;
  confidence_intervals: boolean;
  spend: number | null;
  created_at: string;
};

export type AnalysisResult = {
  summary: {
    att: number | null;
    att_se: number | null;
    percent_lift: number | null;
    pvalue: number | null;
    lower_conf_int: number | null;
    upper_conf_int: number | null;
    incremental: number | null;
    treatment_start: number | null;
    treatment_end: number | null;
    prob_positive_effect: number | null;
    test_locations: string[];
  };
  att_series: { Time: number; Estimate: number; lower_bound: number | null; upper_bound: number | null }[];
  lift_series: { time: number; treatment_observed: number; synthetic_control: number }[];
  cumulative_effect_series: { time: number; cumulative_estimate: number; lower_bound: number | null; upper_bound: number | null }[];
  weights: { location: string; weight: number }[];
};

export type Analysis = {
  id: string;
  experiment_id: string;
  test_config_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result_json: AnalysisResult | Record<string, never>;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type Report = {
  id: string;
  experiment_id: string;
  analysis_id: string | null;
  pdf_storage_path: string | null;
  share_token: string | null;
  share_expires_at: string | null;
  generated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
};
