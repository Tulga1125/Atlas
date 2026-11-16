import { ImageResponse } from "next/og";
export const alt = "Atlas Charts — Mongolia’s daily chart history";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#0a1029",
          color: "#f4f1e8",
          padding: 80,
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 100, color: "#e42b3a", fontWeight: 900 }}>
          atlas charts
        </div>
        <div style={{ fontSize: 56 }}>The pulse, charted.</div>
        <div style={{ fontSize: 28 }}>
          Apple Music Top 100: Mongolia · Daily history
        </div>
      </div>
    ),
    size,
  );
}
