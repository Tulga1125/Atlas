"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
export function RankHistory({
  history,
  label,
}: {
  history: Array<{ date: string; rank: number }>;
  label: string;
}) {
  const ordered = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const points: Array<{ date: string; rank: number | null }> = [];
  for (const point of ordered) {
    const previous = points.at(-1);
    if (
      previous &&
      Date.parse(point.date) - Date.parse(previous.date) > 86400000
    )
      points.push({
        date: new Date(Date.parse(previous.date) + 86400000)
          .toISOString()
          .slice(0, 10),
        rank: null,
      });
    points.push(point);
  }
  return (
    <figure aria-label={label} className="rank-history">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points}>
          <XAxis dataKey="date" minTickGap={60} />
          <YAxis reversed domain={[1, 100]} />
          <Tooltip />
          <Line
            type="linear"
            dataKey="rank"
            stroke="#e42b3a"
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
