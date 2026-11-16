"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Rank history of an artist's songs over time, one line per song (C2).
// Days without an approved chart entry stay empty: lines break, never bridge.

const COLORS = ["#e42b3a", "#1f3bff", "#0a1029", "#7a8a00", "#a1462b"];

export function ArtistRankHistory({
  songs,
  milestones,
  label,
}: {
  songs: { id: string; title: string; history: { date: string; rank: number }[] }[];
  milestones: { date: string; rank: number; label: string }[];
  label: string;
}) {
  const shown = [...songs].sort((a, b) => b.history.length - a.history.length || a.title.localeCompare(b.title)).slice(0, COLORS.length);
  const dates = [...new Set(shown.flatMap((s) => s.history.map((h) => h.date)))].sort();
  if (dates.length === 0) return null;
  const all: string[] = [];
  for (let d = new Date(`${dates[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= dates.at(-1)!; d.setUTCDate(d.getUTCDate() + 1))
    all.push(d.toISOString().slice(0, 10));
  const data = all.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const s of shown) row[s.id] = s.history.find((h) => h.date === date)?.rank ?? null;
    return row;
  });
  return (
    <figure aria-label={label} className="rank-history">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="#0a10291a" vertical={false} />
          <XAxis dataKey="date" minTickGap={60} />
          <YAxis reversed domain={[1, 100]} width={32} />
          <Tooltip />
          <Legend />
          {shown.map((s, i) => (
            <Line key={s.id} type="linear" dataKey={s.id} name={s.title} stroke={COLORS[i]} dot={false} connectNulls={false} />
          ))}
          {milestones
            .filter((m) => all.includes(m.date))
            .map((m) => (
              <ReferenceDot key={`${m.date}-${m.label}`} x={m.date} y={m.rank} r={5} fill="#dfff45" stroke="#0a1029" ifOverflow="extendDomain" />
            ))}
        </LineChart>
      </ResponsiveContainer>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
