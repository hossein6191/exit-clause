import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the mark, white on a postal-red tile.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#D7263D" }}>
        <img src={markDataUri({ size: 180, tile: true })} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
