import { notFound } from "next/navigation";
import { z } from "zod";
import { OperationsShell } from "@/components/operations/shell";
import { staffContext } from "@/modules/operations/data";
import { getLocale } from "@/modules/i18n/server";
import { label } from "@/modules/operations/labels";
export default async function JobEvidence({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params,
    context = await staffContext(),
    locale = await getLocale();
  if (!context.db || !z.uuid().safeParse(jobId).success) notFound();
  const [job, attempts, reviews] = await Promise.all([
    context.db.from("pipeline_jobs").select("*").eq("id", jobId).maybeSingle(),
    context.db
      .from("collection_attempts")
      .select("*")
      .eq("job_id", jobId)
      .order("received_at", { ascending: false })
      .limit(50),
    context.db
      .from("attempt_reviews")
      .select("id,reason,created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (job.error || attempts.error || reviews.error)
    throw new Error("Evidence unavailable");
  if (!job.data) notFound();
  return (
    <OperationsShell section="data-health" currentPath={`/dashboard/data-health/${jobId}`}>
      <h2>
        {job.data.business_date} · {label(job.data.status, locale)}
      </h2>
      <p>{job.data.error_message}</p>
      <h3>{label("attempts", locale)}</h3>
      {attempts.data?.map((a) => (
        <article key={a.id}>
          <p>
            {a.received_at} · HTTP {a.http_status ?? "—"}
          </p>
          <p>
            <code>{a.checksum ?? a.error_code}</code>
          </p>
          <details>
            <summary>{label("evidence", locale)}</summary>
            <pre className="evidence-block">
              {a.raw_body?.slice(0, 50000) ?? "—"}
            </pre>
            {(a.raw_body?.length ?? 0) > 50000 && (
              <p>
                {locale === "mn"
                  ? "Эхний 50,000 тэмдэгт. Бүрэн эх нь хадгалагдсан."
                  : "First 50,000 characters. The complete response is retained in the database."}
              </p>
            )}
          </details>
        </article>
      ))}
      <h3>{label("history", locale)}</h3>
      {reviews.data?.map((r) => (
        <p key={r.id}>
          {r.created_at} · {r.reason}
        </p>
      ))}
    </OperationsShell>
  );
}
