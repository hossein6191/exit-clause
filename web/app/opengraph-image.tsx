import { ImageResponse } from "next/og";

import { DEMO_PLANS } from "@/lib/demo-plans";
import { markDataUri } from "@/lib/mark";
import { MESSAGE_CHIPS } from "@/lib/suggestions";
import { plexFonts } from "@/lib/og-fonts";

export const alt = "Exit Clause: cancel anytime, enforced. A provider whose reply stalls a cancellation gives the month back.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#111827";
const SOFT = "#5B6472";
const LINE = "#D5DAE1";
const STALLED = "#A3122A";

// The card shared links show: the mail-client frame, a cancellation and the provider's "please call
// us" reply with its stamp, beside the one sentence the site is about.
export default async function OpengraphImage() {
  const stream = DEMO_PLANS[1];
  const message = MESSAGE_CHIPS[1].value;
  const headline = "Cancel anytime, enforced.";
  const sub = "The month's fee is held until the month ends. A reply that stalls a cancellation gives that month back, in the same transaction.";
  const stamp = "STALLED · MONTH REFUNDED";
  const fonts = await plexFonts(["Exit Clause", headline, sub, stamp, stream.name, stream.reply, message, "Member Provider to the provider of Cancellation 0.3 GEN back to the member"].join(" "));
  const sans = fonts.length ? "Plex Sans" : undefined;
  const mono = fonts.length ? "Plex Mono" : undefined;
  const card = (who: string, tint: string, text: string, extra?: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#FFFFFF", border: `1.5px solid ${LINE}`, borderRadius: 12, padding: extra ? "18px 22px 42px" : "18px 22px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: INK }}>
          {who[0]}
        </div>
        <div style={{ marginLeft: 12, fontSize: 19, fontWeight: 600, color: INK }}>{who}</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 19, lineHeight: 1.42, color: INK }}>{text}</div>
      {extra}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: "#EEF1F4", fontFamily: sans, color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", width: 84, backgroundColor: "#E3E7EC", borderRight: `1.5px solid ${LINE}`, alignItems: "center", paddingTop: 30 }}>
          <img src={markDataUri({ size: 52, tile: true })} width={52} height={52} alt="" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: 34, height: 8, borderRadius: 4, backgroundColor: i === 0 ? "#D7263D" : "#C9CFD7", marginTop: i === 0 ? 40 : 20 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470, padding: "54px 40px 50px 46px" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>Exit Clause</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 58, fontWeight: 600, lineHeight: 1.06, letterSpacing: -1.5 }}>{headline}</div>
            <div style={{ marginTop: 22, fontSize: 24, lineHeight: 1.4, color: SOFT }}>{sub}</div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: SOFT }}>An Intelligent Contract on GenLayer</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, margin: "34px 34px 34px 0", backgroundColor: "#FFFFFF", border: `1.5px solid ${LINE}`, borderRadius: 14, padding: 26 }}>
          <div style={{ display: "flex", fontSize: 15, color: SOFT, fontFamily: mono }}>CANCELLATION · {stream.name.toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
            {card("Member", "#E3E7EC", message)}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 18, marginLeft: 34 }}>
              {card(
                "Provider",
                "#FCEBED",
                stream.reply,
                <div
                  style={{
                    position: "absolute",
                    right: 18,
                    bottom: -26,
                    display: "flex",
                    padding: 3,
                    border: `3px solid ${STALLED}`,
                    borderRadius: 7,
                    backgroundColor: "#FFFFFF",
                    transform: "rotate(-6deg)",
                  }}
                >
                  <div style={{ display: "flex", border: `1.5px solid ${STALLED}`, borderRadius: 4, padding: "6px 14px", fontFamily: mono, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: STALLED }}>
                    {stamp}
                  </div>
                </div>,
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
