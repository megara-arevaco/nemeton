import { StrictMode, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { ArrowCounterClockwise, CalendarBlank, ChartDonut, Clock, FloppyDisk, FolderOpen, GameController, Gear, Image, ImageSquare, LockKey, MagnifyingGlass, Minus, Palette, PencilSimple, Play, Plus, Square, SteamLogo, Trash, Trophy, X } from "@phosphor-icons/react";
import type { ArtworkSuggestion, FolderSyncSettings, GameAchievements, GameSession, LibraryGame, LibrarySnapshot, SteamAccountSettings } from "@launcher/core";

import "./styles.scss";

type AccentTheme = "forest" | "aurora" | "ember" | "amethyst" | "glacier";

const accentThemes: Array<{ id: AccentTheme; name: string; description: string; colors: [string, string] }> = [
  { id: "forest", name: "Bosque", description: "Verde y cian", colors: ["#b7ff64", "#65f0b5"] },
  { id: "aurora", name: "Aurora", description: "Cian y violeta", colors: ["#47e9ff", "#8e7cff"] },
  { id: "ember", name: "Brasa", description: "Ámbar y coral", colors: ["#ffd15c", "#ff7b67"] },
  { id: "amethyst", name: "Amatista", description: "Violeta y rosa", colors: ["#bd8cff", "#ff79bd"] },
  { id: "glacier", name: "Glaciar", description: "Azul y hielo", colors: ["#72a7ff", "#78f0ec"] },
];

function NemetonMark() {
  return <svg className="nemeton-mark" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 7C18.2 7 7 18.2 7 32c0 8.2 3.9 15.4 10 20l7.2-8.2A15 15 0 1 1 47 32c0 4.4-1.9 8.4-5 11.1L49.6 51A25 25 0 0 0 32 7Z" fill="currentColor" />
    <path d="m27 24 13 8-13 8Z" fill="currentColor" />
  </svg>;
}

const formatPlaytime = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round((minutes / 60) * 10) / 10} h`;
};

const formatLastPlayed = (value: string | null) => {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (daysAgo === 0) return "Hoy";
  if (daysAgo === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(date);
};

const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

type SavegameData = Awaited<ReturnType<Window["launcher"]["getSavegames"]>>;

function SavegamesPanel({ game }: Readonly<{ game: LibraryGame }>) {
  const [data, setData] = useState<SavegameData | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const refresh = () => window.launcher.getSavegames(game.id).then(setData);
  useEffect(() => { void refresh(); }, [game.id]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setStatus("");
    try { await action(); await refresh(); setStatus(success); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo completar la operación"); }
    finally { setBusy(false); }
  };
  const copy = !data ? { title: "Comprobando partidas…", detail: "Revisando las rutas y la última copia.", tone: "checking" } : data.syncState === "synced" ? { title: "Partidas sincronizadas", detail: `Todo está protegido · última copia ${new Date(data.versions[0]!.createdAt).toLocaleString("es-ES")}`, tone: "ok" } : data.syncState === "unconfigured" ? { title: "Sincronización sin configurar", detail: "Elige una carpeta de Google Drive u otro servicio desde Ajustes.", tone: "warning" } : data.syncState === "path-missing" ? { title: "No se encuentra la carpeta de partidas", detail: data.missingPaths[0] ?? "La ubicación configurada ya no existe.", tone: "error" } : data.syncState === "not-detected" ? { title: "No se localizaron las partidas", detail: "Juega una vez para que Nemeton intente detectarlas o indica su carpeta.", tone: "warning" } : data.syncState === "waiting-backup" ? { title: "Preparado para sincronizar", detail: "La carpeta de partidas está detectada; falta crear la primera copia.", tone: "warning" } : { title: "Hay cambios pendientes", detail: "Las partidas actuales son más recientes que la última copia.", tone: "warning" };
  const chooseFolder = async () => {
    for (const missing of data?.missingPaths ?? []) await window.launcher.removeSavegameFolder(game.id, missing);
    await window.launcher.addSavegameFolder(game.id);
  };

  return <section className="savegames-section compact-save-status">
    <div className="savegames-heading"><div><span className="section-icon"><FloppyDisk weight="fill" /></span><span><small>PARTIDAS GUARDADAS</small><strong>{copy.title}</strong></span></div><i className={`save-sync-indicator ${copy.tone}`} /> </div>
    <p className="save-sync-detail">{copy.detail}</p>
    {data && (data.syncState === "not-detected" || data.syncState === "path-missing") && <button className="cover-button" disabled={busy} onClick={() => void run(chooseFolder, "Carpeta de partidas actualizada")}><FolderOpen /> Indicar carpeta</button>}
    {data && (data.syncState === "waiting-backup" || data.syncState === "pending") && <button className="cover-button" disabled={busy} onClick={() => void run(() => window.launcher.backupSavegames(game.id), "Partidas sincronizadas")}><FloppyDisk /> Sincronizar ahora</button>}
    {status && <p className="savegame-status">{status}</p>}
  </section>;
}

const localCoverUrl = (coverPath: string) =>
  `launcher-cover:///${encodeURIComponent(coverPath)}`;

const gameCoverUrl = (game: LibraryGame) =>
  game.coverPath ? localCoverUrl(game.coverPath) : game.coverUrl;

const gameHeroUrl = (game: LibraryGame) =>
  game.coverPath ? localCoverUrl(game.coverPath) : game.heroUrl ?? game.coverUrl;

function LibraryCollection({ games, runningGameIds, onSelect }: Readonly<{ games: LibraryGame[]; runningGameIds: Set<string>; onSelect: (gameId: string) => void }>) {
  return (
    <div className="library-collection-view">
      <section className="installed-section">
        <div className="installed-heading"><div><small>TU COLECCIÓN</small><h2>Juegos en tu biblioteca</h2></div><span>{games.length} {games.length === 1 ? "juego" : "juegos"}</span></div>
        <div className="installed-grid">
          {games.map((game) => {
            const cover = gameCoverUrl(game);
            const hero = gameHeroUrl(game);
            return (
              <button className={`installed-card ${!game.installed ? "unavailable" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`} key={game.id} onClick={() => onSelect(game.id)}>
                <span className="installed-art">
                  {hero && <img className="installed-backdrop" src={hero} alt="" />}
                  {cover ? <img className="installed-cover" src={cover} alt="" /> : <b>{game.title.slice(0, 1).toUpperCase()}</b>}
                  <i>{game.source === "steam" ? <SteamLogo weight="fill" /> : <GameController weight="fill" />}</i>
                </span>
                <span className="installed-copy"><strong>{game.title}</strong><small>{runningGameIds.has(game.id) ? "Jugando ahora" : `${formatPlaytime(game.platformPlaytimeMinutes ?? game.playtimeMinutes)}${!game.installed ? " · Sin ejecutable" : ""}`}</small></span>
                <span className="installed-play">{game.installed ? <Play weight="fill" /> : <PencilSimple weight="bold" />}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatisticsView({ games, sessions }: Readonly<{ games: LibraryGame[]; sessions: GameSession[] }>) {
  const [period, setPeriod] = useState<"all" | "2026">("all");
  const [summaryPeriod, setSummaryPeriod] = useState<"week" | "month">("week");
  const statistics = useMemo(() => {
    const minutesFor = (game: LibraryGame) => game.source === "steam"
      ? game.platformPlaytimeMinutes ?? 0
      : game.trackedPlaytimeSeconds / 60;
    const played = games.filter((game) => minutesFor(game) > 0).sort((a, b) => minutesFor(b) - minutesFor(a));
    const totalMinutes = played.reduce((total, game) => total + minutesFor(game), 0);
    return { played, totalMinutes };
  }, [games]);

  const totalHours = Math.round((statistics.totalMinutes / 60) * 10) / 10;
  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("es-ES", { month: "long" });
    return Array.from({ length: 12 }, (_, month) => {
      const activity = new Map<string, { launcherSeconds: number; steamSeconds: number }>();
      sessions.forEach((session) => {
        const date = new Date(session.endedAt);
        if (date.getFullYear() !== 2026 || date.getMonth() !== month) return;
        const previous = activity.get(session.gameId) ?? { launcherSeconds: 0, steamSeconds: 0 };
        if (session.origin === "steam-sync") previous.steamSeconds += session.durationSeconds;
        else previous.launcherSeconds += session.durationSeconds;
        activity.set(session.gameId, previous);
      });
      games.forEach((game) => {
        if (!game.lastPlayedAt) return;
        const date = new Date(game.lastPlayedAt);
        if (date.getFullYear() === 2026 && date.getMonth() === month && !activity.has(game.id)) activity.set(game.id, { launcherSeconds: 0, steamSeconds: 0 });
      });
      const entries = [...activity.entries()].map(([gameId, data]) => ({ game: games.find((game) => game.id === gameId), seconds: Math.max(data.launcherSeconds, data.steamSeconds) }))
        .filter((entry): entry is { game: LibraryGame; seconds: number } => Boolean(entry.game))
        .sort((a, b) => b.seconds - a.seconds || a.game.title.localeCompare(b.game.title));
      return { name: formatter.format(new Date(2026, month, 1)), entries };
    });
  }, [games, sessions]);
  const annualSeconds = months.reduce((total, month) => total + month.entries.reduce((monthTotal, entry) => monthTotal + entry.seconds, 0), 0);
  const annualRanking = useMemo(() => {
    const totals = new Map<string, number>();
    months.forEach((month) => month.entries.forEach((entry) => totals.set(entry.game.id, (totals.get(entry.game.id) ?? 0) + entry.seconds)));
    return [...totals.entries()].map(([gameId, seconds]) => ({ game: games.find((game) => game.id === gameId), seconds }))
      .filter((entry): entry is { game: LibraryGame; seconds: number } => Boolean(entry.game) && entry.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds).slice(0, 3);
  }, [games, months]);
  const automaticSummary = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonday = new Date(startOfToday);
    currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
    const previousMonday = new Date(currentMonday); previousMonday.setDate(previousMonday.getDate() - 7);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodStart = summaryPeriod === "week" ? currentMonday : currentMonth;
    const previousStart = summaryPeriod === "week" ? previousMonday : previousMonth;
    const valid = sessions.map((session) => ({ ...session, ended: new Date(session.endedAt) })).filter((session) => !Number.isNaN(session.ended.getTime()) && session.durationSeconds > 0);
    const current = valid.filter((session) => session.ended >= periodStart);
    const previous = valid.filter((session) => session.ended >= previousStart && session.ended < periodStart);
    const currentSeconds = current.reduce((sum, session) => sum + session.durationSeconds, 0);
    const previousSeconds = previous.reduce((sum, session) => sum + session.durationSeconds, 0);
    const byGame = new Map<string, number>();
    current.forEach((session) => byGame.set(session.gameId, (byGame.get(session.gameId) ?? 0) + session.durationSeconds));
    const top = [...byGame].sort((a, b) => b[1] - a[1])[0];
    const longest = [...current].sort((a, b) => b.durationSeconds - a.durationSeconds)[0];
    const cards: Array<{ label: string; text: string }> = [];
    if (currentSeconds > 0) {
      const periodName = summaryPeriod === "week" ? "semana" : "mes";
      const comparison = previousSeconds === 0 ? `y no registraste actividad ${summaryPeriod === "week" ? "la semana" : "el mes"} anterior` : `${Math.abs(Math.round(((currentSeconds - previousSeconds) / previousSeconds) * 100))} % ${currentSeconds >= previousSeconds ? "más" : "menos"} que ${summaryPeriod === "week" ? "la semana" : "el mes"} anterior`;
      cards.push({ label: summaryPeriod === "week" ? "ESTA SEMANA" : "ESTE MES", text: `Has jugado ${formatPlaytime(Math.round(currentSeconds / 60))} este ${periodName}, ${comparison}.` });
    }
    if (top) {
      const game = games.find((item) => item.id === top[0]);
      if (game) cards.push({ label: "MÁS JUGADO", text: `${game.title} lidera tu ${summaryPeriod === "week" ? "semana" : "mes"} con ${formatPlaytime(Math.round(top[1] / 60))}.` });
    }
    if (longest) {
      const game = games.find((item) => item.id === longest.gameId);
      if (game) cards.push({ label: "SESIÓN MÁS LARGA", text: `${game.title}: ${formatPlaytime(Math.round(longest.durationSeconds / 60))} el ${new Intl.DateTimeFormat("es-ES", { weekday: "long" }).format(longest.ended)}.` });
    }
    const byGameSessions = new Map<string, typeof valid>();
    valid.forEach((session) => byGameSessions.set(session.gameId, [...(byGameSessions.get(session.gameId) ?? []), session]));
    let comeback: { gameId: string; days: number; ended: Date } | null = null;
    byGameSessions.forEach((items, gameId) => {
      const ordered = items.sort((a, b) => a.ended.getTime() - b.ended.getTime());
      for (let index = 1; index < ordered.length; index += 1) {
        const ended = ordered[index]!.ended;
        const days = Math.floor((ended.getTime() - ordered[index - 1]!.ended.getTime()) / 86_400_000);
        if (ended >= periodStart && days >= 30 && (!comeback || days > comeback.days)) comeback = { gameId, days, ended };
      }
    });
    if (comeback) {
      const resolvedComeback = comeback as { gameId: string; days: number; ended: Date };
      const game = games.find((item) => item.id === resolvedComeback.gameId);
      if (game) cards.push({ label: "DE VUELTA", text: `Retomaste ${game.title} después de ${resolvedComeback.days} días.` });
    }
    const activeDays = [...new Set(valid.map((session) => `${session.ended.getFullYear()}-${session.ended.getMonth()}-${session.ended.getDate()}`))].map((key) => { const [year, month, day] = key.split("-").map(Number); return new Date(year!, month!, day!); }).sort((a, b) => b.getTime() - a.getTime());
    let streak = activeDays.length ? 1 : 0;
    for (let index = 1; index < activeDays.length; index += 1) { if (activeDays[index - 1]!.getTime() - activeDays[index]!.getTime() !== 86_400_000) break; streak += 1; }
    if (streak >= 2 && startOfToday.getTime() - activeDays[0]!.getTime() <= 86_400_000) cards.push({ label: "RACHA ACTUAL", text: `Llevas ${streak} días consecutivos jugando.` });
    if (!cards.length) cards.push({ label: "SIN ACTIVIDAD RECIENTE", text: `Inicia un juego desde Nemeton para generar tu resumen ${summaryPeriod === "week" ? "semanal" : "mensual"}.` });
    return cards;
  }, [games, sessions, summaryPeriod]);

  return (
    <div className="statistics-view">
      <div className="statistics-intro"><span className="eyebrow">TU HISTÓRICO DE JUEGO</span><h1>Estadísticas</h1><p>Steam completo y sesiones de los juegos añadidos manualmente.</p></div>
      <section className="automatic-summary"><div className="card-heading"><div><small>RESUMEN AUTOMÁTICO</small><h2>Lo más destacado</h2></div><div className="summary-period"><button className={summaryPeriod === "week" ? "active" : ""} onClick={() => setSummaryPeriod("week")}>Semana</button><button className={summaryPeriod === "month" ? "active" : ""} onClick={() => setSummaryPeriod("month")}>Mes</button></div></div><div className="summary-grid">{automaticSummary.map((item) => <article key={item.label}><span><ChartDonut weight="fill" /></span><div><small>{item.label}</small><p>{item.text}</p></div></article>)}</div></section>
      <div className="statistics-toolbar">
        <div className="metric-grid"><article><Clock /><span><small>{period === "all" ? "TIEMPO TOTAL" : "TIEMPO EN 2026"}</small><strong>{period === "all" ? `${totalHours} h` : formatPlaytime(Math.round(annualSeconds / 60))}</strong></span></article></div>
        <label className="period-selector"><CalendarBlank /><select value={period} onChange={(event) => setPeriod(event.target.value as "all" | "2026")}><option value="all">Total histórico</option><option value="2026">Anual · 2026</option></select></label>
      </div>
      {period === "all" && statistics.played.length > 0 && (
        <section className="ranking-card">
          <div className="card-heading"><div><small>CLASIFICACIÓN</small><h2>Tus juegos más jugados</h2></div><span>Ordenados por tiempo total</span></div>
          <div className="ranking-podium">
            {statistics.played.slice(0, 3).map((game, index) => {
              const minutes = game.source === "steam" ? game.platformPlaytimeMinutes ?? 0 : game.trackedPlaytimeSeconds / 60;
              const cover = gameCoverUrl(game);
              return (
                <article className={`podium-game podium-game-${index + 1}`} key={game.id}>
                  <div className="podium-cover">
                    {cover ? <img src={cover} alt="" /> : <span>{game.title.slice(0, 1).toUpperCase()}</span>}
                    <b>{index + 1}</b>
                  </div>
                  <strong>{game.title}</strong>
                  <span>{formatPlaytime(minutes)}</span>
                  <small>{Math.round((minutes / statistics.totalMinutes) * 100)}% de tu tiempo</small>
                </article>
              );
            })}
          </div>
          {statistics.played.length > 3 && (
            <div className="ranking-list">
              {statistics.played.slice(3).map((game, index) => {
                const minutes = game.source === "steam" ? game.platformPlaytimeMinutes ?? 0 : game.trackedPlaytimeSeconds / 60;
                const cover = gameCoverUrl(game);
                const percentage = Math.round((minutes / statistics.totalMinutes) * 100);
                return (
                  <div className="ranking-row" key={game.id}>
                    <b>{index + 4}</b>
                    <div className="ranking-cover">{cover ? <img src={cover} alt="" /> : <span>{game.title.slice(0, 1).toUpperCase()}</span>}</div>
                    <span className="ranking-name"><strong>{game.title}</strong><small>{game.source === "steam" ? "Steam" : "Añadido manualmente"}</small></span>
                    <div className="ranking-progress"><i style={{ width: `${Math.max(percentage, 2)}%` }} /></div>
                    <span className="ranking-time"><strong>{formatPlaytime(minutes)}</strong><small>{percentage}%</small></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {period === "all" && statistics.played.length === 0 && (
        <div className="statistics-empty"><ChartDonut /><strong>Aún no hay tiempo registrado</strong><span>Importa Steam o inicia un juego local desde el launcher.</span></div>
      )}
      {period === "2026" && (
        <section className="annual-card">
          <div className="card-heading"><div><small>ACTIVIDAD ANUAL</small><h2>Tu año jugando</h2></div><span>2026</span></div>
          {annualRanking.length > 0 && <><div className="annual-ranking-heading"><Trophy weight="fill" /><span><small>TOP DE 2026</small><strong>Los más jugados del año</strong></span></div><div className="ranking-podium annual-podium">{annualRanking.map(({ game, seconds }, index) => {
            const cover = gameCoverUrl(game);
            return <article className={`podium-game podium-game-${index + 1}`} key={game.id}><div className="podium-cover">{cover ? <img src={cover} alt="" /> : <span>{game.title.slice(0, 1).toUpperCase()}</span>}<b>{index + 1}</b></div><strong>{game.title}</strong><span>{formatPlaytime(Math.round(seconds / 60))}</span><small>Jugado en 2026</small></article>;
          })}</div></>}
          <div className="months-grid">
            {months.map((month, index) => (
              <article className={`month-card ${month.entries.length === 0 ? "empty" : ""}`} key={month.name}>
                <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{month.name}</strong><small>{month.entries.length} {month.entries.length === 1 ? "juego" : "juegos"}</small></header>
                {month.entries.length > 0 ? <div className="month-games">{month.entries.map(({ game, seconds }) => {
                  const cover = gameCoverUrl(game);
                  return <div key={game.id}><span className="month-cover">{cover ? <img src={cover} alt="" /> : game.title.slice(0, 1).toUpperCase()}</span><span><strong>{game.title}</strong><small>{seconds > 0 ? formatPlaytime(Math.round(seconds / 60)) : "Horas no disponibles"}</small></span></div>;
                })}</div> : <p>Sin actividad registrada</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsView({
  settings,
  syncSettings,
  accentTheme,
  onAccentThemeChange,
  onConnected,
  onSynced,
  onLibraryUpdated,
}: Readonly<{
  settings: SteamAccountSettings | null;
  syncSettings: FolderSyncSettings | null;
  accentTheme: AccentTheme;
  onAccentThemeChange: (theme: AccentTheme) => void;
  onConnected: (snapshot: LibrarySnapshot, count: number) => void;
  onSynced: (snapshot: LibrarySnapshot, settings: FolderSyncSettings) => void;
  onLibraryUpdated: (snapshot: LibrarySnapshot) => void;
}>) {
  const [steamId, setSteamId] = useState(settings?.steamId ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(settings?.hasApiKey ? "Cuenta conectada" : "");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  useEffect(() => { if (settings?.steamId) setSteamId(settings.steamId); }, [settings?.steamId]);

  const connect = async () => {
    setSaving(true);
    setStatus("Importando la biblioteca de la cuenta…");
    try {
      const result = await window.launcher.connectSteam(apiKey, steamId || undefined);
      onConnected(result.snapshot, result.ownedCount);
      setApiKey("");
      setStatus(`${result.ownedCount} juegos importados desde tu cuenta`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo conectar con Steam");
    } finally { setSaving(false); }
  };

  const chooseSyncFolder = async () => {
    setSyncing(true);
    setSyncStatus("Seleccionando y sincronizando…");
    try {
      const result = await window.launcher.selectSyncFolder();
      if (result) { onSynced(result.snapshot, result.settings); setSyncStatus("Sincronización completada"); }
      else setSyncStatus("");
    } catch (error) { setSyncStatus(error instanceof Error ? error.message : "No se pudo configurar la carpeta"); }
    finally { setSyncing(false); }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncStatus("Fusionando el historial…");
    try { const result = await window.launcher.syncNow(); onSynced(result.snapshot, result.settings); setSyncStatus("Sincronización completada"); }
    catch (error) { setSyncStatus(error instanceof Error ? error.message : "No se pudo sincronizar"); }
    finally { setSyncing(false); }
  };

  const associateLudusavi = async () => {
    setSyncing(true); setSyncStatus("Buscando coincidencias exactas en Ludusavi…");
    try { const result = await window.launcher.autoAssociateLudusavi(); onLibraryUpdated(result.snapshot); setSyncStatus(`${result.count} juegos asociados con Ludusavi`); }
    catch (error) { setSyncStatus(error instanceof Error ? error.message : "No se pudo consultar Ludusavi"); }
    finally { setSyncing(false); }
  };

  return (
    <div className="settings-view">
      <div className="statistics-intro"><span className="eyebrow">NEMETON</span><h1>Ajustes</h1><p>Personaliza la aplicación y conecta tus servicios.</p></div>
      <section className="settings-card appearance-settings-card">
        <div className="settings-card-heading"><span><Palette weight="fill" /></span><div><h2>Apariencia</h2><p>La interfaz permanece oscura; elige los colores de énfasis.</p></div><i>OSCURA</i></div>
        <div className="accent-grid">
          {accentThemes.map((theme) => <button type="button" className={accentTheme === theme.id ? "selected" : ""} key={theme.id} onClick={() => onAccentThemeChange(theme.id)}>
            <span className="accent-swatch" style={{ "--swatch-a": theme.colors[0], "--swatch-b": theme.colors[1] } as CSSProperties}><i /></span>
            <span><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <b aria-hidden="true" />
          </button>)}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading"><span><SteamLogo weight="fill" /></span><div><h2>Cuenta de Steam</h2><p>Importa todos los juegos de la cuenta, incluidos los que no están instalados.</p></div><i className={settings?.hasApiKey ? "connected" : ""}>{settings?.hasApiKey ? "CONECTADA" : settings?.steamId ? "CLAVE NECESARIA" : "SIN CONFIGURAR"}</i></div>
        <div className="settings-form">
          <label><span>SteamID64</span><input value={steamId} onChange={(event) => setSteamId(event.target.value)} placeholder="7656119…" /></label>
          <label><span>Steam Web API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.hasApiKey ? "••••••••••••••••••••••••••••••••" : "32 caracteres"} /></label>
          <button className="play" disabled={saving || apiKey.length === 0} onClick={() => void connect()}>{saving ? "Conectando…" : settings?.hasApiKey ? "Actualizar clave" : "Conectar Steam"}</button>
        </div>
        <p className="settings-note">La clave se usa directamente con la API oficial de Steam y se cifra en este equipo. El perfil debe permitir consultar los detalles de juegos.</p>
        {status && <div className="settings-status">{status}</div>}
      </section>
      <section className="settings-card sync-settings-card">
        <div className="settings-card-heading"><span><FolderOpen weight="fill" /></span><div><h2>Carpeta de sincronización</h2><p>Historial y partidas guardadas; el estado indica la carpeta local, no la subida de Google Drive.</p></div><i className={syncSettings?.status === "ready" ? "connected" : ""}>{syncSettings?.status === "ready" ? "DISPONIBLE" : syncSettings?.status === "missing" ? "NO DISPONIBLE" : syncSettings?.status === "error" ? "ERROR" : syncSettings?.folderPath ? "COMPROBANDO" : "SIN CONFIGURAR"}</i></div>
        <div className="sync-folder-row"><span><small>CARPETA ACTUAL</small><strong>{syncSettings?.folderPath ?? "Ninguna carpeta seleccionada"}</strong></span><button className="cancel-button" disabled={syncing} onClick={() => void chooseSyncFolder()}>{syncSettings?.folderPath ? "Cambiar carpeta" : "Elegir carpeta"}</button>{syncSettings?.folderPath && <button className="play" disabled={syncing} onClick={() => void syncNow()}>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</button>}</div>
        {syncSettings?.lastSyncedAt && <p className="settings-note">Última sincronización: {new Date(syncSettings.lastSyncedAt).toLocaleString("es-ES")}</p>}
        {syncStatus && <div className="settings-status">{syncStatus}</div>}
        <button className="cancel-button" disabled={syncing} onClick={() => void associateLudusavi()}>Asociar juegos existentes con Ludusavi</button>
      </section>
    </div>
  );
}

function AddGameModal({
  onClose,
  onCreated,
}: Readonly<{
  onClose: () => void;
  onCreated: (snapshot: LibrarySnapshot) => void;
}>) {
  const [title, setTitle] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [ludusaviSuggestions, setLudusaviSuggestions] = useState<Array<{ name: string; steamAppId: string | null; files: Array<{ path: string; tags: string[] }> }>>([]);
  const [selectedLudusavi, setSelectedLudusavi] = useState<{ name: string; steamAppId: string | null; files: Array<{ path: string; tags: string[] }> } | null>(null);
  const [automaticArtwork, setAutomaticArtwork] = useState<ArtworkSuggestion | null>(null);
  const [searchingLudusavi, setSearchingLudusavi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (title.trim().length < 2 || selectedLudusavi) { setLudusaviSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearchingLudusavi(true);
      void window.launcher.searchLudusavi(title).then((items) => { if (active) setLudusaviSuggestions(items); })
        .catch(() => { if (active) setLudusaviSuggestions([]); })
        .finally(() => { if (active) setSearchingLudusavi(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [title, selectedLudusavi]);

  const chooseExecutable = async () => {
    const result = await window.launcher.selectExecutable();
    if (!result) return;
    setExecutablePath(result.path);
    setTitle((current) => current || result.suggestedTitle);
    setError("");
  };

  const chooseLudusaviSuggestion = async (item: { name: string; steamAppId: string | null; files: Array<{ path: string; tags: string[] }> }) => {
    setTitle(item.name);
    setSelectedLudusavi(item);
    setLudusaviSuggestions([]);
    setAutomaticArtwork(null);
    try {
      const artwork = await window.launcher.searchArtwork(item.name);
      const exactSteam = item.steamAppId ? artwork.find((candidate) => candidate.provider === "steam" && candidate.providerId === item.steamAppId) : null;
      setAutomaticArtwork(exactSteam ?? artwork[0] ?? null);
    } catch { /* El juego puede añadirse aunque no haya arte disponible. */ }
  };

  const createGame = async () => {
    if (!title.trim()) {
      setError("Escribe un nombre para el juego");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const snapshot = await window.launcher.addLocalGame({
        title,
        executablePath,
        steamAppId: selectedLudusavi?.steamAppId ?? null,
        ludusaviGameName: selectedLudusavi?.name ?? null,
        coverUrl: automaticArtwork?.coverUrl ?? null,
        heroUrl: automaticArtwork?.heroUrl ?? null,
      });
      onCreated(snapshot);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo añadir el juego");
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-game-modal" role="dialog" aria-modal="true" aria-labelledby="add-game-title">
        <header><div><span className="section-icon"><Plus weight="bold" /></span><span><small>BIBLIOTECA LOCAL</small><h2 id="add-game-title">Añadir un juego</h2></span></div><button onClick={onClose} aria-label="Cerrar"><X /></button></header>
        <div className="add-game-body">
          <div className="game-fields">
            <label className="game-name-field"><span>Nombre del juego</span><input autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setSelectedLudusavi(null); setAutomaticArtwork(null); }} placeholder="Por ejemplo, Hollow Knight" />
              {selectedLudusavi ? <div className="ludusavi-selected">{automaticArtwork && <img src={automaticArtwork.coverUrl} alt="" />}<span><b>{selectedLudusavi.name}</b><small>{selectedLudusavi.steamAppId ? `Ludusavi · Steam ${selectedLudusavi.steamAppId}` : "Asociado con Ludusavi"}{automaticArtwork ? " · arte completado" : ""}</small></span><button type="button" onClick={() => { setSelectedLudusavi(null); setAutomaticArtwork(null); }}><X /></button></div> : (searchingLudusavi || ludusaviSuggestions.length > 0) ? <div className="ludusavi-results">{searchingLudusavi && !ludusaviSuggestions.length ? <small>Consultando catálogo de partidas…</small> : ludusaviSuggestions.map((item) => <button type="button" key={item.name} onClick={() => void chooseLudusaviSuggestion(item)}><span><b>{item.name}</b><small>{item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}</small></span><Plus /></button>)}</div> : null}
            </label>
            <label><span>Ejecutable <em>Opcional</em></span><div className="file-field"><input readOnly value={executablePath} placeholder="Puedes configurarlo más adelante" /><button onClick={() => void chooseExecutable()}><FolderOpen /> Examinar</button></div></label>
            <div className="modal-hint"><GameController /><span>La carátula, el ejecutable y otros datos se pueden completar después desde la ficha del juego.</span></div>
          </div>
        </div>
        {error && <div className="modal-error">{error}</div>}
        <footer><button className="cancel-button" onClick={onClose}>Cancelar</button><button className="play" disabled={saving || !title.trim()} onClick={() => void createGame()}>{saving ? "Añadiendo…" : "Añadir a la biblioteca"}</button></footer>
      </section>
    </div>
  );
}

function ArtworkModal({ game, onClose, onUpdated }: Readonly<{ game: LibraryGame; onClose: () => void; onUpdated: (snapshot: LibrarySnapshot) => void }>) {
  const [query, setQuery] = useState(game.title);
  const [suggestions, setSuggestions] = useState<ArtworkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void window.launcher.searchArtwork(query).then((items) => { if (active) setSuggestions(items); })
        .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo buscar arte"); })
        .finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const applySuggestion = async (suggestion: ArtworkSuggestion) => {
    const snapshot = await window.launcher.setRemoteArtwork(game.id, suggestion);
    onUpdated(snapshot); onClose();
  };

  const uploadArtwork = async () => {
    const snapshot = await window.launcher.setCover(game.id);
    if (snapshot) { onUpdated(snapshot); onClose(); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="artwork-modal" role="dialog" aria-modal="true"><header><div><span className="section-icon"><Image weight="fill" /></span><span><small>PERSONALIZACIÓN</small><h2>Arte para {game.title}</h2></span></div><button onClick={onClose}><X /></button></header><div className="artwork-search"><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar un juego" /><button onClick={() => void uploadArtwork()}><FolderOpen /> Usar archivo</button></div>{error && <div className="modal-error">{error}</div>}<div className="artwork-results">{loading ? <div className="artwork-loading">Buscando arte…</div> : suggestions.map((suggestion) => <button key={`${suggestion.provider}:${suggestion.providerId}`} onClick={() => void applySuggestion(suggestion)}><img src={suggestion.coverUrl} alt="" /><span><strong>{suggestion.title}</strong><small>{suggestion.provider === "steam" ? "Steam · portada y hero" : "Wikipedia · imagen principal"}</small></span></button>)}</div></section></div>;
}

function EditGameModal({ game, onClose, onUpdated }: Readonly<{ game: LibraryGame; onClose: () => void; onUpdated: (snapshot: LibrarySnapshot) => void }>) {
  const [title, setTitle] = useState(game.title);
  const [executablePath, setExecutablePath] = useState(game.installPath);
  const [hours, setHours] = useState(String(Math.round((game.trackedPlaytimeSeconds / 3600) * 100) / 100));
  const [steamAppId, setSteamAppId] = useState(game.steamAppId ?? "");
  const [ludusaviName, setLudusaviName] = useState(game.ludusaviGameName ?? "");
  const [ludusaviMatches, setLudusaviMatches] = useState<Array<{ name: string; steamAppId: string | null; files: Array<{ path: string; tags: string[] }> }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ludusaviName.trim().length < 2 || ludusaviName === game.ludusaviGameName) { setLudusaviMatches([]); return; }
    let active = true;
    const timer = window.setTimeout(() => { void window.launcher.searchLudusavi(ludusaviName).then((items) => { if (active) setLudusaviMatches(items); }).catch(() => { if (active) setLudusaviMatches([]); }); }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [ludusaviName, game.ludusaviGameName]);

  const chooseExecutable = async () => {
    const result = await window.launcher.selectExecutable();
    if (result) setExecutablePath(result.path);
  };
  const save = async () => {
    const numericHours = Number(hours.replace(",", "."));
    if (!title.trim()) { setError("Escribe un nombre"); return; }
    if (!Number.isFinite(numericHours) || numericHours < 0) { setError("Introduce unas horas válidas"); return; }
    setSaving(true);
    try {
      const snapshot = await window.launcher.updateLocalGame(game.id, {
        title,
        executablePath,
        playtimeMinutes: numericHours * 60,
        steamAppId,
        ludusaviGameName: ludusaviName,
      });
      onUpdated(snapshot); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo actualizar"); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="edit-game-modal" role="dialog" aria-modal="true"><header><div><span className="section-icon"><PencilSimple /></span><span><small>JUEGO LOCAL</small><h2>Editar ficha</h2></span></div><button onClick={onClose}><X /></button></header><div className="edit-game-fields"><label><span>Nombre</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Ejecutable <em>Opcional</em></span><div className="file-field"><input readOnly value={executablePath} placeholder="Sin ejecutable configurado" /><button onClick={() => void chooseExecutable()}><FolderOpen /> Examinar</button>{executablePath && <button className="clear-file" onClick={() => setExecutablePath("")}><X /> Quitar</button>}</div></label><label className="game-name-field"><span>Juego en Ludusavi <em>Opcional</em></span><input value={ludusaviName} onChange={(event) => setLudusaviName(event.target.value)} placeholder="Buscar asociación o dejar vacío" />{ludusaviMatches.length > 0 && <div className="ludusavi-results">{ludusaviMatches.map((item) => <button type="button" key={item.name} onClick={() => { setLudusaviName(item.name); setLudusaviMatches([]); if (item.steamAppId) setSteamAppId(item.steamAppId); }}><span><b>{item.name}</b><small>{item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}</small></span><Plus /></button>)}</div>}</label><label><span>Steam AppID <em>Para logros locales</em></span><input inputMode="numeric" value={steamAppId} onChange={(event) => setSteamAppId(event.target.value.replace(/\D/g, ""))} placeholder="Ej. 1238840" /></label><label><span>Horas acumuladas</span><div className="hours-field"><input inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} /><b>horas</b></div></label><p>La asociación de Ludusavi localiza las partidas; el AppID permite leer logros locales.</p></div>{error && <div className="modal-error">{error}</div>}<footer><button className="cancel-button" onClick={onClose}>Cancelar</button><button className="play" disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></section></div>;
}

function App() {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("Tu biblioteca vive en este equipo");
  const [achievements, setAchievements] = useState<GameAchievements | null>(null);
  const [view, setView] = useState<"library" | "statistics" | "settings">("library");
  const [steamSettings, setSteamSettings] = useState<SteamAccountSettings | null>(null);
  const [syncSettings, setSyncSettings] = useState<FolderSyncSettings | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [artworkGame, setArtworkGame] = useState<LibraryGame | null>(null);
  const [editGame, setEditGame] = useState<LibraryGame | null>(null);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [gameMenu, setGameMenu] = useState<{ game: LibraryGame; x: number; y: number } | null>(null);
  const [runningGameIds, setRunningGameIds] = useState<Set<string>>(() => new Set());
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(() => {
    const stored = window.localStorage.getItem("nemeton.accent-theme");
    return accentThemes.some((theme) => theme.id === stored) ? stored as AccentTheme : "forest";
  });

  useEffect(() => {
    document.documentElement.dataset.accent = accentTheme;
    window.localStorage.setItem("nemeton.accent-theme", accentTheme);
  }, [accentTheme]);

  useEffect(() => {
    void window.launcher.listGames().then(async (snapshot) => {
      const initialSnapshot = snapshot.games.length > 0
        ? snapshot
        : await window.launcher.scanSteam();
      setGames(initialSnapshot.games);
      setSessions(initialSnapshot.sessions);
      setSelectedId(null);
      if (snapshot.games.length === 0 && initialSnapshot.games.length > 0) {
        setMessage(`${initialSnapshot.games.length} juegos importados desde Steam`);
      }
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la biblioteca");
    });
    window.launcher.onLibraryChanged((snapshot) => { setGames(snapshot.games); setSessions(snapshot.sessions); });
    window.launcher.onGameRunningChanged(({ gameId, running }) => {
      setRunningGameIds((current) => {
        const next = new Set(current);
        if (running) next.add(gameId); else next.delete(gameId);
        return next;
      });
    });
    void window.launcher.getSteamSettings().then(setSteamSettings);
    void window.launcher.getSyncSettings().then(setSyncSettings);
  }, []);

  useEffect(() => {
    const refresh = () => { void window.launcher.getSyncSettings().then(setSyncSettings); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    if (!gameMenu) return;
    const close = () => setGameMenu(null);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("blur", close); window.removeEventListener("resize", close); };
  }, [gameMenu]);

  const visibleGames = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const libraryGames = games.filter((game) => !game.hiddenFromLibrary && (game.source === "local" || game.installed));
    return normalized ? libraryGames.filter((game) => game.title.toLocaleLowerCase().includes(normalized)) : libraryGames;
  }, [games, query]);
  const collectionGames = useMemo(() => visibleGames.filter((game) => game.source === "local" || game.installed), [visibleGames]);
  const selected = games.find((game) => game.id === selectedId) ?? null;

  useEffect(() => {
    setAchievements(null);
    if (!selected) return;
    let active = true;
    void window.launcher.getAchievements(selected.id).then((result) => {
      if (active) setAchievements(result);
    });
    return () => { active = false; };
  }, [selected?.id, selected ? runningGameIds.has(selected.id) : false]);

  const importSteam = async () => {
    setScanning(true);
    setMessage("Buscando instalaciones de Steam…");
    try {
      const snapshot = await window.launcher.scanSteam();
      setGames(snapshot.games);
      setSessions(snapshot.sessions);
      setMessage(`${snapshot.games.length} juegos disponibles localmente`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer Steam");
    } finally {
      setScanning(false);
    }
  };

  const onLocalGameCreated = (snapshot: LibrarySnapshot) => {
    setGames(snapshot.games);
    setSessions(snapshot.sessions);
    const newest = [...snapshot.games].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
    setSelectedId(newest?.id ?? null);
    setMessage("Juego local añadido");
  };

  const chooseCover = async () => {
    if (!selected) return;
    setArtworkGame(selected);
  };

  const launchSelected = async () => {
    if (!selected) return;
    try {
      setMessage(`Abriendo ${selected.title}…`);
      await window.launcher.launchGame(selected.id);
      setMessage(`${selected.title} iniciado`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `No se pudo iniciar ${selected.title}`);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><NemetonMark /></span><span>Nemeton</span></div>
        <nav className="primary-nav">
          <button className={`nav-item ${view === "library" && !selected ? "active" : ""}`} onClick={() => { setView("library"); setSelectedId(null); }}><GameController /> Biblioteca</button>
          <button className={`nav-item ${view === "statistics" ? "active" : ""}`} onClick={() => setView("statistics")}><ChartDonut /> Estadísticas</button>
          <button className={`nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}><Gear /> Ajustes</button>
          <button className="nav-item" onClick={() => setShowAddGame(true)}><Plus /> Añadir juego</button>
        </nav>
        <div className="library-heading"><span>JUEGOS</span><span>{games.filter((game) => !game.hiddenFromLibrary && (game.source === "local" || game.installed)).length}</span></div>
        <div className="game-list">
          {visibleGames.map((game) => (
            <button key={game.id} className={`game-row ${selected?.id === game.id ? "selected" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`} onClick={() => { setGameMenu(null); setView("library"); setSelectedId(game.id); }} onContextMenu={(event) => { event.preventDefault(); setGameMenu({ game, x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 90) }); }}>
              <span className="game-avatar">
                {game.title.slice(0, 1).toUpperCase()}
                {gameCoverUrl(game) && <img src={gameCoverUrl(game)!} alt="" onError={(event) => event.currentTarget.remove()} />}
              </span>
              <span><strong>{game.title}</strong><small>{runningGameIds.has(game.id) ? "Jugando ahora" : game.installed ? formatPlaytime(game.platformPlaytimeMinutes ?? game.playtimeMinutes) : "No instalado"}</small></span>
            </button>
          ))}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          {view === "library" ? <label className="search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en tu biblioteca" /></label> : <span className="topbar-title">{view === "statistics" ? <><ChartDonut /> Estadísticas</> : <><Gear /> Ajustes</>}</span>}
          {view === "library" && <button className="steam-import" disabled={scanning} onClick={() => void importSteam()}><SteamLogo />{scanning ? "Buscando…" : "Importar Steam"}</button>}
          <div className="window-controls"><button aria-label="Minimizar" onClick={() => void window.launcher.minimizeWindow()}><Minus /></button><button aria-label="Maximizar" onClick={() => void window.launcher.toggleMaximizeWindow()}><Square /></button><button className="window-close" aria-label="Cerrar" onClick={() => void window.launcher.closeWindow()}><X /></button></div>
        </header>

        {view === "statistics" ? <StatisticsView games={games} sessions={sessions} /> : view === "settings" ? <SettingsView settings={steamSettings} syncSettings={syncSettings} accentTheme={accentTheme} onAccentThemeChange={setAccentTheme} onLibraryUpdated={(snapshot) => { setGames(snapshot.games); setSessions(snapshot.sessions); }} onConnected={(snapshot, count) => { setGames(snapshot.games); setSessions(snapshot.sessions); setSteamSettings((current) => ({ steamId: current?.steamId ?? null, hasApiKey: true })); setMessage(`${count} juegos en tu cuenta de Steam`); }} onSynced={(snapshot, nextSettings) => { setGames(snapshot.games); setSessions(snapshot.sessions); setSyncSettings(nextSettings); setMessage("Historial manual sincronizado"); }} /> : selected ? (
          <div className="game-view">
            <section className="game-hero">
              <div className="ambient" />
              {gameHeroUrl(selected) && (
                <img className="hero-art" src={gameHeroUrl(selected)!} alt={`Arte de ${selected.title}`} onError={(event) => event.currentTarget.remove()} />
              )}
              <div className="hero-shade" />
              <div className="hero-copy">
                <span className="eyebrow">{runningGameIds.has(selected.id) ? "● JUGANDO AHORA" : selected.source === "steam" ? `STEAM · ${selected.installed ? "INSTALADO" : "EN TU CUENTA"}` : "JUEGO LOCAL"}</span>
                <h1>{selected.title}</h1>
                <p>{selected.installPath}</p>
                <div className="stats"><span><b>{formatPlaytime(selected.platformPlaytimeMinutes ?? selected.playtimeMinutes)}</b> {selected.source === "steam" ? "en Steam" : "tiempo total"}</span><span><b>{formatLastPlayed(selected.lastPlayedAt)}</b> última partida</span></div>
                <div className="hero-actions"><button className={`play ${runningGameIds.has(selected.id) ? "running" : ""}`} disabled={runningGameIds.has(selected.id) || (selected.source === "local" && !selected.installPath)} onClick={() => void launchSelected()}><Play weight="fill" /> {runningGameIds.has(selected.id) ? "Jugando" : selected.source === "local" && !selected.installPath ? "Sin ejecutable" : selected.installed ? "Jugar" : "Instalar"}</button>{selected.source === "local" && <button className="cover-button" onClick={() => setEditGame(selected)}><PencilSimple /> Editar</button>}<button className="cover-button" onClick={() => void chooseCover()}><Image /> Carátula</button></div>
              </div>
            </section>
            {selected.source === "local" && achievements && achievements.total === 0 && <section className="achievements-section achievement-diagnostic"><div className="achievements-heading"><div><span className="section-icon"><Trophy /></span><span><small>LOGROS LOCALES</small><strong>{achievements.status === "missing-app-id" ? "Falta identificar el juego" : achievements.status === "parse-error" ? "El archivo de logros no se pudo interpretar" : "Todavía no se encontró un estado local"}</strong></span></div></div><p>{achievements.status === "missing-app-id" ? "Asocia el juego con Ludusavi o añade su Steam AppID desde Editar." : achievements.status === "parse-error" ? `${achievements.source ?? "Formato desconocido"} · ${achievements.statePath ?? "ruta no disponible"}` : "Nemeton volverá a buscar mientras juegas. Algunos juegos no generan un archivo de logros compatible."}</p></section>}
            {achievements && achievements.total > 0 && (
              <section className="achievements-section">
                <div className="achievements-heading">
                  <div><span className="section-icon"><Trophy weight="fill" /></span><span><small>LOGROS{achievements.source ? ` · ${achievements.source.toLocaleUpperCase()}` : ""}</small><strong>{achievements.unlocked} de {achievements.total} desbloqueados</strong></span></div>
                  <b>{Math.round((achievements.unlocked / achievements.total) * 100)}%</b>
                </div>
                <div className="achievement-progress"><span style={{ width: `${(achievements.unlocked / achievements.total) * 100}%` }} /></div>
                <div className="achievement-grid">
                  {achievements.items.slice(0, 8).map((achievement) => (
                    <article key={achievement.id} className={`achievement ${achievement.achieved ? "unlocked" : "locked"}`}>
                      <div className="achievement-image">
                        {achievement.imageUrl ? <img src={achievement.imageUrl} alt="" /> : <Trophy />}
                        {!achievement.achieved && <span><LockKey weight="fill" /></span>}
                      </div>
                      <div><strong>{achievement.hidden && !achievement.achieved ? "Logro oculto" : achievement.name}</strong><p>{achievement.hidden && !achievement.achieved ? "Sigue jugando para descubrirlo." : achievement.description}</p><small>{achievement.achieved && achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString("es-ES") : achievement.globalPercentage !== null ? `${achievement.globalPercentage.toFixed(1)}% de jugadores` : "Bloqueado"}</small></div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {selected.source === "local" && <SavegamesPanel game={selected} />}
          </div>
        ) : collectionGames.length > 0 ? (
          <LibraryCollection games={collectionGames} runningGameIds={runningGameIds} onSelect={setSelectedId} />
        ) : (
          <section className="empty-state">
            <span className="empty-icon"><SteamLogo weight="fill" /></span>
            <h1>Tu biblioteca, sin ruido</h1>
            <p>Importa los juegos instalados en Steam. Se guardarán únicamente en este ordenador.</p>
            <button className="play" disabled={scanning} onClick={() => void importSteam()}><SteamLogo /> Importar desde Steam</button>
          </section>
        )}
        <footer>{message}<span>{syncSettings?.folderPath ? "Sincronización automática activa" : "Sin sincronización"}</span></footer>
      </section>
      {showAddGame && <AddGameModal onClose={() => setShowAddGame(false)} onCreated={onLocalGameCreated} />}
      {artworkGame && <ArtworkModal game={artworkGame} onClose={() => setArtworkGame(null)} onUpdated={(snapshot) => setGames(snapshot.games)} />}
      {editGame && <EditGameModal game={editGame} onClose={() => setEditGame(null)} onUpdated={(snapshot) => setGames(snapshot.games)} />}
      {gameMenu && <div className="game-context-backdrop" onMouseDown={() => setGameMenu(null)} onContextMenu={(event) => { event.preventDefault(); setGameMenu(null); }}><div className="game-context-menu" style={{ left: gameMenu.x, top: gameMenu.y }} onMouseDown={(event) => event.stopPropagation()}><small>{gameMenu.game.title}</small><button onClick={async () => { try { const snapshot = await window.launcher.uninstallOrHide(gameMenu.game.id); setGames(snapshot.games); setSessions(snapshot.sessions); if (selectedId === gameMenu.game.id) setSelectedId(null); setMessage(gameMenu.game.source === "steam" && gameMenu.game.installed ? "Desinstalación abierta en Steam; historial conservado" : "Juego retirado de la biblioteca; historial conservado"); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo retirar el juego"); } finally { setGameMenu(null); } }}><X weight="bold" />{gameMenu.game.source === "steam" && gameMenu.game.installed ? "Desinstalar" : "Quitar de la biblioteca"}</button></div></div>}
    </main>
  );
}

const root = document.getElementById("root");

if (!root) throw new Error("Renderer root element is missing");

try {
  createRoot(root).render(<StrictMode><App /></StrictMode>);
} catch (error) {
  root.innerHTML = `<pre style="padding:32px;color:#ff8f8f;white-space:pre-wrap">${String(error)}</pre>`;
}
