begin;
select plan(3);
select ok((select parameters ? 'breakoutMinGain' from methodology_configuration where code = 'signals-v3'), 'signal thresholds are configuration');
select ok(exists (select 1 from methodology_versions where code = 'signals-v3'), 'the rule set is a methodology version');
select ok((select prosrc like '%coalesce(e->>''ruleVersion'',''signals-v2'')%' from pg_proc where proname = 'complete_analysis'), 'each signal keeps its own rule version');
select * from finish();
rollback;
