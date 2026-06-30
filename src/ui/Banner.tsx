import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";

/**
 * Transient broadcast banner over the field: scoring shouts, turnover calls,
 * and per-play result cards. Auto-dismisses; tap to dismiss early.
 */
export function Banner() {
  const banner = useGame((s) => s.banner);
  const homeColor = useGame((s) => s.homeColor);
  const awayColor = useGame((s) => s.awayColor);
  const [shownId, setShownId] = useState<number | null>(null);

  useEffect(() => {
    if (!banner) return;
    setShownId(banner.id);
    const ms = banner.tone === "info" ? 1500 : 2600;
    const t = setTimeout(() => setShownId(null), ms);
    return () => clearTimeout(t);
  }, [banner?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!banner || shownId !== banner.id) return null;

  const accent =
    banner.team === "home" ? homeColor : banner.team === "away" ? awayColor : "#2e6fdb";

  return (
    <div
      className={`banner banner-${banner.tone}`}
      key={banner.id}
      onClick={() => setShownId(null)}
      style={{ ["--accent" as string]: accent }}
      role="status"
    >
      <span className="banner-title">{banner.title}</span>
      {banner.sub && <span className="banner-sub">{banner.sub}</span>}
    </div>
  );
}
