import type { GameMetadata as GameMetadataDetails } from "@launcher/core";
interface GameMetadataProps {
  metadata: GameMetadataDetails;
}

export function GameMetadata({ metadata }: GameMetadataProps) {
  const credits = [
    metadata.developers.length > 0
      ? { label: "Desarrollo", value: metadata.developers.join(", ") }
      : null,
    metadata.publishers.length > 0
      ? { label: "Publicación", value: metadata.publishers.join(", ") }
      : null,
    metadata.releaseDate ? { label: "Lanzamiento", value: metadata.releaseDate } : null,
  ].filter((credit): credit is { label: string; value: string } => credit !== null);

  if (!metadata.description && metadata.genres.length === 0 && credits.length === 0) {
    return null;
  }

  return (
    <aside
      className={
        "game-metadata [position:absolute] [z-index:1] [right:34px] [bottom:34px] [width:clamp(220px,_31%,_390px)] [padding:18px] [border:1px_solid_#ffffff0c] [border-radius:16px] [background:linear-gradient(160deg,_#191b2852,_#0b0d1466)] [box-shadow:0_12px_30px_#0000001a] [backdrop-filter:blur(10px)]"
      }
    >
      <span
        className={
          "[margin-bottom:9px] [color:var(--accent-a)] [font-size:9px] [font-weight:800] [letter-spacing:1.6px]"
        }
      >
        FICHA DEL JUEGO
      </span>
      <h2 className={"[margin:0_0_12px] [font-size:17px] [letter-spacing:-.35px]"}>
        Acerca del juego
      </h2>
      {metadata.description && (
        <p
          className={
            "[margin:0] [overflow:hidden] [color:#c4c6cd] [font-size:12px] [line-height:1.55] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
          }
        >
          {metadata.description}
        </p>
      )}
      {metadata.genres.length > 0 && (
        <div
          className={
            "[display:flex] [flex-wrap:wrap] [gap:6px] [margin-top:14px] [&_span]:[padding:4px_7px] [&_span]:[border:1px_solid_#ffffff0d] [&_span]:[border-radius:999px] [&_span]:[background:#ffffff08] [&_span]:[color:#c7c9d1] [&_span]:[font-size:10px]"
          }
        >
          {metadata.genres.slice(0, 4).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
          {metadata.genres.length > 4 && <span>+{metadata.genres.length - 4}</span>}
        </div>
      )}
      {credits.length > 0 && (
        <dl
          className={
            "[display:grid] [gap:7px] [margin:15px_0_0] [padding-top:12px] [border-top:1px_solid_#ffffff0d] [&_div]:[display:grid] [&_div]:[grid-template-columns:78px_minmax(0,_1fr)] [&_div]:[gap:9px] [&_dt]:[color:#8c8f99] [&_dt]:[font-size:9px] [&_dt]:[font-weight:800] [&_dt]:[letter-spacing:1px] [&_dd]:[margin:0] [&_dd]:[overflow:hidden] [&_dd]:[color:#ececf0] [&_dd]:[font-size:11px] [&_dd]:[text-align:right] [&_dd]:[text-overflow:ellipsis] [&_dd]:[white-space:nowrap]"
          }
        >
          {credits.map((credit) => (
            <div key={credit.label}>
              <dt>{credit.label}</dt>
              <dd>{credit.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
