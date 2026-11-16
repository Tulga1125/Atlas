create or replace function public.finish_pipeline_failure(p_job uuid,p_token uuid,p_code text,p_message text,p_retry_seconds integer default null,p_review boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare j pipeline_jobs;
begin
  select * into j from pipeline_jobs where id=p_job and lease_token=p_token and status='running' and lease_until>now() for update;
  if not found then raise exception 'lost job lease'; end if;
  update pipeline_jobs set status=case when p_review then 'review' when p_retry_seconds is not null and attempts<5 then 'queued' else 'failed' end,
    available_at=now()+make_interval(secs=>greatest(coalesce(p_retry_seconds,0),0)),error_code=left(p_code,100),error_message=left(p_message,1000),lease_until=null,completed_at=case when p_retry_seconds is null then now() end where id=p_job;
  update collection_jobs set status=case when p_review then 'rejected'::job_status else 'failed'::job_status end,error_code=p_code,error_message=left(p_message,1000),completed_at=now() where id=j.collection_job_id;
  if p_review or p_retry_seconds is null or j.attempts>=5 then
    insert into anomaly_alerts(chart_id,anomaly_type,severity,summary,evidence) values('00000000-0000-0000-0000-000000000010',p_code,'critical',left(p_message,1000),jsonb_build_object('jobId',p_job,'businessDate',j.business_date));
  end if;
end $$;
