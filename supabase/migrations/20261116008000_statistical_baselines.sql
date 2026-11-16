-- B3: statistical baselines (spec §9.4), stats-v1. Computed in
-- src/modules/analytics/baselines.ts once 30 approved daily charts exist and
-- stored with each song's metrics in chart_metrics; signals keep stats-v1.

insert into public.methodology_versions (code, title, notes, effective_from)
values ('stats-v1', 'Statistical baselines v1',
  'Active from 30 approved daily charts. Rolling 7- and 30-day median ranks; expected band per song = median ± 2·MAD of the previous 30 days (at least 10 observations); robust z-score of the daily move against the moves of its rank zone (1–10, 11–40, 41–100; MAD, falling back to 1.2533 × mean absolute deviation when MAD is 0), outlier above 3.5; one-sided CUSUM (slack 1, threshold 15) for sustained shifts. Signals: movement_outlier, outside_expected_band, trend_shift.',
  '2026-11-16') on conflict (code) do nothing;
insert into public.methodology_configuration (code, parameters)
values ('stats-v1', '{"minimumDays":30,"shortWindow":7,"longWindow":30,"outlierZ":3.5,"bandK":2,"bandMinimumObservations":10,"cusumSlack":1,"cusumThreshold":15}'::jsonb) on conflict (code) do nothing;
