import { ImageResponse } from "next/og";
import { getArtistById } from "@/modules/artists/current";

export const alt = "Artist on Atlas Charts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ artistId: string }> }) {
  const artist = await getArtistById((await params).artistId).catch(() => null);
  const name = artist?.name ?? "Atlas Charts";
  const peak = artist?.stats.peakRank ? `Peak No. ${artist.stats.peakRank}` : "Apple Music Top 100: Mongolia";
  const days = artist ? `${artist.stats.chartingDays} days on the chart · ${artist.stats.songsCharted} songs` : "Daily chart history";
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: "#1f3bff", color: "#fffefa", padding: 80 }}>
        <div style={{ fontSize: 44, color: "#dfff45", fontWeight: 900 }}>atlas charts</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: name.length > 24 ? 72 : 104, fontWeight: 900, lineHeight: 1 }}>{name}</div>
          <div style={{ fontSize: 40, marginTop: 24, color: "#e42b3a", background: "#fffefa", padding: "8px 16px", alignSelf: "flex-start" }}>{peak}</div>
        </div>
        <div style={{ fontSize: 28 }}>{days}</div>
      </div>
    ),
    size,
  );
}
