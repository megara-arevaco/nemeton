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
    <section
      className={
        "game-metadata [margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119] [&_h2]:[margin:0_0_15px] [&_h2]:[font-size:15px] [&_p]:[margin:0] [&_p]:[color:#a5a7b0] [&_p]:[font-size:13px] [&_p]:[line-height:1.6]"
      }
    >
      <h2>Acerca del juego</h2>
      {metadata.description && <p>{metadata.description}</p>}
      {metadata.genres.length > 0 && (
        <div
          className={
            "[display:flex] [flex-wrap:wrap] [gap:7px] [margin-top:18px] [&_span]:[padding:5px_9px] [&_span]:[border-radius:999px] [&_span]:[background:#ffffff0a] [&_span]:[color:#c0c3cd] [&_span]:[font-size:11px]"
          }
        >
          {metadata.genres.map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
      )}
      {credits.length > 0 && (
        <dl
          className={
            "[display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:16px] [margin:22px_0_0] [&_dt]:[margin-bottom:4px] [&_dt]:[color:#777a86] [&_dt]:[font-size:10px] [&_dt]:[font-weight:700] [&_dt]:[letter-spacing:1px] [&_dd]:[margin:0] [&_dd]:[color:#e1e2e7] [&_dd]:[font-size:12px]"
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
    </section>
  );
}
