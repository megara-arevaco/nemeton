import type { CSSProperties } from "react";
import type {
  FolderSyncSettings,
  LibrarySnapshot,
  SteamAccountSettings,
} from "@launcher/core";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Palette } from "@phosphor-icons/react/Palette";
import { SteamLogo } from "@phosphor-icons/react/SteamLogo";
import { accentThemes, type AccentTheme } from "../../shared/presentation";
import { Button } from "../Button";
import { useSettingsView } from "./SettingsView.hook";

export function SettingsView({
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
  const {
    steamId,
    setSteamId,
    apiKey,
    setApiKey,
    saving,
    importingSteam,
    status,
    syncing,
    syncStatus,
    connect,
    importSteam,
    chooseSyncFolder,
    syncNow,
    associateLudusavi,
  } = useSettingsView({
    settings,
    syncSettings,
    accentTheme,
    onAccentThemeChange,
    onConnected,
    onSynced,
    onLibraryUpdated,
  });

  return (
    <div
      className={
        "settings-view [min-height:0] [overflow-y:auto] [padding:20px_34px_40px]"
      }
    >
      <div
        className={
          "statistics-intro [&_h1]:[margin:10px_0_7px] [&_h1]:[font-size:46px] [&_h1]:[letter-spacing:-2.3px] [&_p]:[margin:0] [&_p]:[color:#777a87]"
        }
      >
        <span
          className={
            "eyebrow [color:#a3f982] [font-size:11px] [font-weight:700] [letter-spacing:1.7px]"
          }
        >
          NEMETON
        </span>
        <h1>Ajustes</h1>
        <p>Personaliza la aplicación y conecta tus servicios.</p>
      </div>
      <section
        className={
          "settings-card [max-width:850px] [margin-top:30px] [border:1px_solid] appearance-settings-card [&_+_.settings-card]:[margin-top:16px]"
        }
      >
        <div
          className={
            "settings-card-heading [display:grid] [grid-template-columns:46px_minmax(0,_1fr)_auto] [align-items:center] [gap:14px] [padding-bottom:22px] [border-bottom:1px_solid_#ffffff0b] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:46px] [&_>_span]:[height:46px] [&_>_span]:[border-radius:13px] [&_>_span]:[background:#5d8eff1a] [&_>_span]:[color:#83a7ff] [&_>_span_svg]:[width:25px] [&_>_span_svg]:[height:25px] [&_h2]:[margin:0] [&_p]:[margin:0] [&_h2]:[font-size:17px] [&_p]:[margin-top:5px] [&_p]:[color:#777a86] [&_p]:[font-size:12px] [&_i]:[padding:6px_8px] [&_i]:[border-radius:7px] [&_i]:[background:#ffffff08] [&_i]:[color:#737681] [&_i]:[font-size:9px] [&_i]:[font-style:normal] [&_i]:[font-weight:700] [&_i]:[letter-spacing:1px] [&_i.connected]:[background:#a9fb7612] [&_i.connected]:[color:#a9fb76] [&_i.connected]:[color:var(--accent-a)]"
          }
        >
          <span>
            <Palette weight="fill" />
          </span>
          <div>
            <h2>Apariencia</h2>
            <p>La interfaz permanece oscura; elige los colores de énfasis.</p>
          </div>
          <i>OSCURA</i>
        </div>
        <div
          className={
            "accent-grid [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [margin-top:22px] [&_>_button]:[position:relative] [&_>_button]:[display:grid] [&_>_button]:[justify-items:start] [&_>_button]:[gap:10px] [&_>_button]:[min-width:0] [&_>_button]:[border:1px_solid_#ffffff0d] [&_>_button]:[border-radius:13px] [&_>_button]:[padding:11px] [&_>_button]:[background:#090a0f80] [&_>_button]:[color:#b9bbc3] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button]:[transition:border-color_.16s_ease,_background_.16s_ease,_transform_.16s_ease] [&_>_button:hover]:[border-color:#ffffff20] [&_>_button:hover]:[background:#ffffff08] [&_>_button:hover]:[transform:translateY(-2px)] [&_>_button.selected]:[border-color:color-mix(in_srgb,_var(--accent-a)_48%,_transparent)] [&_>_button.selected]:[background:color-mix(in_srgb,_var(--accent-a)_7%,_#090a0f)] [&_>_button.selected]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_10%,_transparent)] [&_>_button_>_span:nth-child(2)]:[min-width:0] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:4px] [&_small]:[color:#686b77] [&_small]:[font-size:9px] [&_>_button_>_b]:[position:absolute] [&_>_button_>_b]:[top:10px] [&_>_button_>_b]:[right:10px] [&_>_button_>_b]:[width:7px] [&_>_button_>_b]:[height:7px] [&_>_button_>_b]:[border:1px_solid_#ffffff2b] [&_>_button_>_b]:[border-radius:50%] [&_>_button.selected_>_b]:[border-color:var(--accent-a)] [&_>_button.selected_>_b]:[background:var(--accent-a)] [&_>_button.selected_>_b]:[box-shadow:0_0_9px_color-mix(in_srgb,_var(--accent-a)_60%,_transparent)]"
          }
        >
          {accentThemes.map((theme) => (
            <button
              type="button"
              className={accentTheme === theme.id ? "selected" : ""}
              key={theme.id}
              onClick={() => onAccentThemeChange(theme.id)}
            >
              <span
                className={
                  "accent-swatch [--swatch-a:#b7ff64] [--swatch-b:#65f0b5] [display:block] [width:100%] [height:33px] [overflow:hidden] [border-radius:9px] [background:linear-gradient(135deg,_var(--swatch-a),_var(--swatch-b))] [&_i]:[display:block] [&_i]:[width:17px] [&_i]:[height:17px] [&_i]:[margin:8px] [&_i]:[border:4px_solid_#090a0fba] [&_i]:[border-radius:50%]"
                }
                style={
                  {
                    "--swatch-a": theme.colors[0],
                    "--swatch-b": theme.colors[1],
                  } as CSSProperties
                }
              >
                <i />
              </span>
              <span>
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              <b aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
      <section
        className={
          "settings-card [max-width:850px] [margin-top:30px] [border:1px_solid]"
        }
      >
        <div
          className={
            "settings-card-heading [display:grid] [grid-template-columns:46px_minmax(0,_1fr)_auto] [align-items:center] [gap:14px] [padding-bottom:22px] [border-bottom:1px_solid_#ffffff0b] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:46px] [&_>_span]:[height:46px] [&_>_span]:[border-radius:13px] [&_>_span]:[background:#5d8eff1a] [&_>_span]:[color:#83a7ff] [&_>_span_svg]:[width:25px] [&_>_span_svg]:[height:25px] [&_h2]:[margin:0] [&_p]:[margin:0] [&_h2]:[font-size:17px] [&_p]:[margin-top:5px] [&_p]:[color:#777a86] [&_p]:[font-size:12px] [&_i]:[padding:6px_8px] [&_i]:[border-radius:7px] [&_i]:[background:#ffffff08] [&_i]:[color:#737681] [&_i]:[font-size:9px] [&_i]:[font-style:normal] [&_i]:[font-weight:700] [&_i]:[letter-spacing:1px] [&_i.connected]:[background:#a9fb7612] [&_i.connected]:[color:#a9fb76] [&_i.connected]:[color:var(--accent-a)]"
          }
        >
          <span>
            <SteamLogo weight="fill" />
          </span>
          <div>
            <h2>Cuenta de Steam</h2>
            <p>
              Importa todos los juegos de la cuenta, incluidos los que no están
              instalados.
            </p>
          </div>
          <i className={settings?.hasApiKey ? "connected" : ""}>
            {settings?.hasApiKey
              ? "CONECTADA"
              : settings?.steamId
                ? "CLAVE NECESARIA"
                : "SIN CONFIGURAR"}
          </i>
        </div>
        <div
          className={
            "settings-form [display:grid] [grid-template-columns:1fr_1.25fr_auto] [align-items:end] [gap:12px] [margin-top:24px] [&_label_span]:[display:block] [&_label_span]:[margin:0_0_7px_2px] [&_label_span]:[color:#777a86] [&_label_span]:[font-size:11px] [&_input]:[width:100%] [&_input]:[height:43px] [&_input]:[border:1px_solid_#ffffff12] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0f99] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_.play]:[height:43px] [&_.play]:[white-space:nowrap] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]"
          }
        >
          <label>
            <span>SteamID64</span>
            <input
              value={steamId}
              onChange={(event) => setSteamId(event.target.value)}
              placeholder="7656119…"
            />
          </label>
          <label>
            <span>Steam Web API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                settings?.hasApiKey
                  ? "••••••••••••••••••••••••••••••••"
                  : "32 caracteres"
              }
            />
          </label>
          <Button
            className="play"
            disabled={saving || apiKey.length === 0}
            onClick={() => connect()}
            variant="primary"
          >
            {saving
              ? "Conectando…"
              : settings?.hasApiKey
                ? "Actualizar clave"
                : "Conectar Steam"}
          </Button>
        </div>
        <div
          className={
            "[display:flex] [justify-content:space-between] [align-items:center] [gap:18px] [margin-top:18px] [padding:14px] [border:1px_solid_#ffffff0d] [border-radius:13px] [background:#ffffff04] [&_strong]:[display:block] [&_strong]:[font-size:12px] [&_p]:[margin:4px_0_0] [&_p]:[color:#777a86] [&_p]:[font-size:11px]"
          }
        >
          <div>
            <strong>Instalaciones locales</strong>
            <p>Busca juegos instalados sin conectar una cuenta.</p>
          </div>
          <button
            type="button"
            className={
              "[display:inline-flex] [align-items:center] [gap:7px] [min-height:38px] [border:1px_solid_color-mix(in_srgb,_var(--accent-a)_40%,_transparent)] [border-radius:10px] [padding:0_13px] [background:color-mix(in_srgb,_var(--accent-a)_10%,_transparent)] [color:var(--accent-a)] [font-size:11px] [font-weight:700] [cursor:pointer] [transition:background_.16s_ease,_transform_.16s_ease] [&:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--accent-a)_18%,_transparent)] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:focus-visible]:[outline:2px_solid_var(--accent-a)] [&:focus-visible]:[outline-offset:3px] [&:disabled]:[opacity:.5]"
            }
            disabled={importingSteam}
            onClick={importSteam}
          >
            <SteamLogo weight="fill" />
            {importingSteam ? "Buscando…" : "Buscar Steam"}
          </button>
        </div>
        <p
          className={
            "settings-note [margin:16px_0_0] [color:#666975] [font-size:11px] [line-height:1.55]"
          }
        >
          La clave se usa directamente con la API oficial de Steam y se cifra en este
          equipo. El perfil debe permitir consultar los detalles de juegos.
        </p>
        {status && (
          <div
            role="status"
            aria-live="polite"
            className={
              "settings-status [margin-top:16px] [padding:11px_13px] [border-radius:9px] [background:#ffffff07] [color:#aeb0b8] [font-size:12px]"
            }
          >
            {status}
          </div>
        )}
      </section>
      <section
        className={
          "settings-card [max-width:850px] [margin-top:30px] [border:1px_solid] sync-settings-card [margin-top:16px]"
        }
      >
        <div
          className={
            "settings-card-heading [display:grid] [grid-template-columns:46px_minmax(0,_1fr)_auto] [align-items:center] [gap:14px] [padding-bottom:22px] [border-bottom:1px_solid_#ffffff0b] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:46px] [&_>_span]:[height:46px] [&_>_span]:[border-radius:13px] [&_>_span]:[background:#5d8eff1a] [&_>_span]:[color:#83a7ff] [&_>_span_svg]:[width:25px] [&_>_span_svg]:[height:25px] [&_h2]:[margin:0] [&_p]:[margin:0] [&_h2]:[font-size:17px] [&_p]:[margin-top:5px] [&_p]:[color:#777a86] [&_p]:[font-size:12px] [&_i]:[padding:6px_8px] [&_i]:[border-radius:7px] [&_i]:[background:#ffffff08] [&_i]:[color:#737681] [&_i]:[font-size:9px] [&_i]:[font-style:normal] [&_i]:[font-weight:700] [&_i]:[letter-spacing:1px] [&_i.connected]:[background:#a9fb7612] [&_i.connected]:[color:#a9fb76] [&_i.connected]:[color:var(--accent-a)]"
          }
        >
          <span>
            <FolderOpen weight="fill" />
          </span>
          <div>
            <h2>Carpeta de sincronización</h2>
            <p>
              Historial y partidas guardadas; el estado indica la carpeta local, no la
              subida de Google Drive.
            </p>
          </div>
          <i className={syncSettings?.status === "ready" ? "connected" : ""}>
            {syncSettings?.status === "ready"
              ? "DISPONIBLE"
              : syncSettings?.status === "missing"
                ? "NO DISPONIBLE"
                : syncSettings?.status === "error"
                  ? "ERROR"
                  : syncSettings?.folderPath
                    ? "COMPROBANDO"
                    : "SIN CONFIGURAR"}
          </i>
        </div>
        <div
          className={
            "sync-folder-row [display:grid] [grid-template-columns:minmax(0,_1fr)_auto_auto] [align-items:center] [gap:10px] [margin-top:22px] [&_>_span]:[display:block] [&_>_span]:[min-width:0] [&_small]:[display:block] [&_small]:[min-width:0] [&_strong]:[display:block] [&_strong]:[min-width:0] [&_small]:[margin-bottom:6px] [&_small]:[color:#666a76] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.2px] [&_strong]:[overflow:hidden] [&_strong]:[color:#c7c9d0] [&_strong]:[font-size:12px] [&_strong]:[font-weight:500] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_.play]:[height:42px] [&_.play]:[white-space:nowrap] [&_.cancel-button]:[height:42px] [&_.cancel-button]:[white-space:nowrap]"
          }
        >
          <span>
            <small>CARPETA ACTUAL</small>
            <strong>
              {syncSettings?.folderPath ?? "Ninguna carpeta seleccionada"}
            </strong>
          </span>
          <button
            type="button"
            className={
              "cancel-button [border:1px_solid_#ffffff14] [border-radius:11px] [padding:11px_17px] [background:transparent] [color:#a2a4ad] [cursor:pointer]"
            }
            disabled={syncing}
            onClick={() => chooseSyncFolder()}
          >
            {syncSettings?.folderPath ? "Cambiar carpeta" : "Elegir carpeta"}
          </button>
          {syncSettings?.folderPath && (
            <Button
              className="play"
              disabled={syncing}
              onClick={() => syncNow()}
              variant="primary"
            >
              {syncing ? "Sincronizando…" : "Sincronizar ahora"}
            </Button>
          )}
        </div>
        {syncSettings?.lastSyncedAt && (
          <p
            className={
              "settings-note [margin:16px_0_0] [color:#666975] [font-size:11px] [line-height:1.55]"
            }
          >
            Última sincronización:{" "}
            {new Date(syncSettings.lastSyncedAt).toLocaleString("es-ES")}
          </p>
        )}
        {syncStatus && (
          <div
            role="status"
            aria-live="polite"
            className={
              "settings-status [margin-top:16px] [padding:11px_13px] [border-radius:9px] [background:#ffffff07] [color:#aeb0b8] [font-size:12px]"
            }
          >
            {syncStatus}
          </div>
        )}
        <button
          type="button"
          className={
            "cancel-button [border:1px_solid_#ffffff14] [border-radius:11px] [padding:11px_17px] [background:transparent] [color:#a2a4ad] [cursor:pointer]"
          }
          disabled={syncing}
          onClick={() => associateLudusavi()}
        >
          Asociar juegos existentes con Ludusavi
        </button>
      </section>
    </div>
  );
}
