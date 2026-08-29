import { StrictMode, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { ArrowCounterClockwise, CalendarBlank, ChartDonut, Clock, FloppyDisk, FolderOpen, GameController, Gear, Image, ImageSquare, LockKey, MagnifyingGlass, Minus, Palette, PencilSimple, Play, Plus, Square, SteamLogo, Trash, Trophy, X } from "@phosphor-icons/react";
import type { ArtworkSuggestion, FolderSyncSettings, GameAchievements, GameSession, LibraryGame, LibrarySnapshot, SteamAccountSettings } from "@launcher/core";

import "./styles.css";

const componentUtilities: Record<string, string> = {
  "accent-grid": "[display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [margin-top:22px] [&_>_button]:[position:relative] [&_>_button]:[display:grid] [&_>_button]:[justify-items:start] [&_>_button]:[gap:10px] [&_>_button]:[min-width:0] [&_>_button]:[border:1px_solid_#ffffff0d] [&_>_button]:[border-radius:13px] [&_>_button]:[padding:11px] [&_>_button]:[background:#090a0f80] [&_>_button]:[color:#b9bbc3] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button]:[transition:border-color_.16s_ease,_background_.16s_ease,_transform_.16s_ease] [&_>_button:hover]:[border-color:#ffffff20] [&_>_button:hover]:[background:#ffffff08] [&_>_button:hover]:[transform:translateY(-2px)] [&_>_button.selected]:[border-color:color-mix(in_srgb,_var(--accent-a)_48%,_transparent)] [&_>_button.selected]:[background:color-mix(in_srgb,_var(--accent-a)_7%,_#090a0f)] [&_>_button.selected]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_10%,_transparent)] [&_>_button_>_span:nth-child(2)]:[min-width:0] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:4px] [&_small]:[color:#686b77] [&_small]:[font-size:9px] [&_>_button_>_b]:[position:absolute] [&_>_button_>_b]:[top:10px] [&_>_button_>_b]:[right:10px] [&_>_button_>_b]:[width:7px] [&_>_button_>_b]:[height:7px] [&_>_button_>_b]:[border:1px_solid_#ffffff2b] [&_>_button_>_b]:[border-radius:50%] [&_>_button.selected_>_b]:[border-color:var(--accent-a)] [&_>_button.selected_>_b]:[background:var(--accent-a)] [&_>_button.selected_>_b]:[box-shadow:0_0_9px_color-mix(in_srgb,_var(--accent-a)_60%,_transparent)]",
  "accent-swatch": "[--swatch-a:#b7ff64] [--swatch-b:#65f0b5] [display:block] [width:100%] [height:33px] [overflow:hidden] [border-radius:9px] [background:linear-gradient(135deg,_var(--swatch-a),_var(--swatch-b))] [&_i]:[display:block] [&_i]:[width:17px] [&_i]:[height:17px] [&_i]:[margin:8px] [&_i]:[border:4px_solid_#090a0fba] [&_i]:[border-radius:50%]",
  "achievement": "[display:grid] [grid-template-columns:54px_1fr] [gap:12px] [min-width:0] [padding:10px] [border-radius:13px] [background:#ffffff06] [&.locked]:[opacity:.55] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_p]:[display:block] [&_p]:[overflow:hidden] [&_p]:[text-overflow:ellipsis] [&_p]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[margin-top:1px] [&_strong]:[font-size:13px] [&_p]:[margin:4px_0] [&_p]:[color:#777a86] [&_p]:[font-size:11px] [&_small]:[color:#a2a5af] [&_small]:[font-size:10px]",
  "achievement-grid": "[display:grid] [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:10px]",
  "achievement-image": "[position:relative] [display:grid] [place-items:center] [width:54px] [height:54px] [overflow:hidden] [border-radius:10px] [background:#20222d] [color:#858997] [&_>_img]:[width:100%] [&_>_img]:[height:100%] [&_>_img]:[object-fit:cover] [&_>_span]:[position:absolute] [&_>_span]:[inset:0] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[background:#090a0fa8]",
  "achievement-progress": "[height:4px] [margin:17px_0_20px] [overflow:hidden] [border-radius:10px] [background:#ffffff0a] [&_span]:[display:block] [&_span]:[height:100%] [&_span]:[border-radius:inherit] [&_span]:[background:linear-gradient(90deg,_#a9fb76,_#70e4a7)] [&_span]:[background:linear-gradient(90deg,_var(--accent-a),_var(--accent-b))]",
  "achievements-heading": "[justify-content:space-between] [&_>_div]:[gap:12px] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[margin-bottom:3px] [&_small]:[color:#696c78] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.4px] [&_strong]:[font-size:14px] [&_>_b]:[color:#a9fb76] [&_>_b]:[font-size:20px]",
  "achievements-section": "[margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "add-game-body": "[padding:26px_24px]",
  "add-game-modal": "[width:min(780px,_94vw)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[margin-bottom:3px] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[font-size:18px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer] [&_>_footer]:[display:flex] [&_>_footer]:[justify-content:flex-end] [&_>_footer]:[gap:9px] [&_>_footer]:[height:auto] [&_>_footer]:[padding:17px_24px] [&_>_footer]:[border-top:1px_solid_#ffffff0d] [&_>_footer]:[color:inherit] [&_>_footer_.play]:[padding:11px_18px]",
  "ambient": "[position:absolute] [inset:0] [background:radial-gradient(circle_at_77%_32%,_#94ff7430,_transparent_27%),_radial-gradient(circle_at_90%_82%,_#596bff24,_transparent_35%)] [background-position:center] [background-size:cover]",
  "annual-card": "[padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "annual-podium": "[margin-top:24px] [border-bottom:1px_solid_#ffffff0b] [padding-bottom:24px]",
  "annual-ranking-heading": "[display:flex] [align-items:center] [gap:10px] [margin:25px_0_0] [color:#a9fb76] [&_>_svg]:[width:28px] [&_>_svg]:[height:28px] [&_span]:[display:block] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[color:#6c6f7a] [&_small]:[font-size:8px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.2px] [&_strong]:[margin-top:3px] [&_strong]:[color:#e9eaed] [&_strong]:[font-size:12px]",
  "app-shell": "[height:100vh] [display:grid] [grid-template-columns:270px_1fr] [background:radial-gradient(circle_at_76%_0%,_#222135_0,_#0b0c12_38%)]",
  "appearance-settings-card": "[margin-top:30px] [&_+_.settings-card]:[margin-top:16px]",
  "artwork-loading": "[grid-column:1_/_-1] [display:grid] [place-items:center] [color:#737681] [font-size:12px]",
  "artwork-modal": "[width:min(820px,_94vw)] [max-height:min(720px,_90vh)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[margin-top:3px] [&_>_header_h2]:[font-size:17px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer]",
  "artwork-picker": "[position:relative] [display:flex] [flex-direction:column] [align-items:center] [justify-content:center] [aspect-ratio:2_/_2.75] [overflow:hidden] [border:1px_dashed_#ffffff24] [border-radius:16px] [padding:18px] [background:#090a0f80] [color:#777a86] [cursor:pointer] [&:hover]:[border-color:#a9fb766b] [&:hover]:[background:#a9fb7607] [&_>_svg]:[width:34px] [&_>_svg]:[height:34px] [&_>_svg]:[margin-bottom:13px] [&_>_svg]:[color:#a9fb76] [&_strong]:[color:#d6d7dc] [&_strong]:[font-size:13px] [&_small]:[margin-top:6px] [&_small]:[color:#626571] [&_small]:[font-size:10px] [&.has-artwork]:[border-style:solid] [&.has-artwork]:[padding:0] [&_>_img]:[width:100%] [&_>_img]:[height:100%] [&_>_img]:[object-fit:cover] [&_>_span]:[position:absolute] [&_>_span]:[right:10px] [&_>_span]:[bottom:10px] [&_>_span]:[display:flex] [&_>_span]:[align-items:center] [&_>_span]:[gap:6px] [&_>_span]:[padding:7px_9px] [&_>_span]:[border-radius:8px] [&_>_span]:[background:#090a0fdd] [&_>_span]:[color:white] [&_>_span]:[font-size:10px] [&_>_svg]:[color:var(--accent-a)] [&:hover]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&:hover]:[background:color-mix(in_srgb,_var(--accent-a)_3%,_transparent)]",
  "artwork-results": "[min-height:290px] [max-height:470px] [overflow-y:auto] [display:grid] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:11px] [padding:4px_24px_24px] [&_>_button]:[overflow:hidden] [&_>_button]:[border:1px_solid_#ffffff0d] [&_>_button]:[border-radius:13px] [&_>_button]:[padding:0] [&_>_button]:[background:#0a0b10] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[border-color:#a9fb7666] [&_>_button:hover]:[transform:translateY(-2px)] [&_img]:[display:block] [&_img]:[width:100%] [&_img]:[aspect-ratio:2_/_2.75] [&_img]:[object-fit:cover] [&_button_span]:[display:block] [&_button_span]:[padding:10px] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:4px] [&_small]:[color:#696c77] [&_small]:[font-size:9px]",
  "artwork-search": "[display:grid] [grid-template-columns:auto_minmax(0,_1fr)_auto] [align-items:center] [gap:10px] [margin:20px_24px] [padding-left:12px] [border:1px_solid_#ffffff12] [border-radius:11px] [background:#090a0f99] [color:#6f727e] [&_input]:[height:44px] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:[background:transparent] [&_input]:[color:white] [&_button]:[align-self:stretch] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:7px] [&_button]:[border:0] [&_button]:[border-left:1px_solid_#ffffff12] [&_button]:[padding:0_14px] [&_button]:[background:#ffffff06] [&_button]:[cursor:pointer]",
  "artwork-suggestions": "[padding:0_24px_22px] [&_>_div:first-child]:[display:flex] [&_>_div:first-child]:[justify-content:space-between] [&_>_div:first-child]:[align-items:center] [&_>_div:first-child]:[margin-bottom:10px] [&_>_div:first-child_strong]:[font-size:12px] [&_>_div:first-child_small]:[color:#696c77] [&_>_div:first-child_small]:[font-size:10px]",
  "automatic-summary": "[border-color:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [background:linear-gradient(135deg,_color-mix(in_srgb,_var(--accent-a)_4%,_transparent),_#101119_48%)]",
  "brand": "[height:54px] [display:flex] [align-items:center] [gap:11px] [padding:0_10px] [font-size:18px] [font-weight:600] [letter-spacing:-.5px]",
  "brand-mark": "[--mark-cut:#101015] [display:grid] [place-items:center] [width:34px] [height:34px] [border-radius:11px] [color:var(--accent-ink)] [background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [box-shadow:0_8px_24px_color-mix(in_srgb,_var(--accent-a)_18%,_transparent)] [&_svg]:[width:25px] [&_svg]:[height:25px]",
  "cancel-button": "[border:1px_solid_#ffffff14] [border-radius:11px] [padding:11px_17px] [background:transparent] [color:#a2a4ad] [cursor:pointer]",
  "card-heading": "[display:flex] [justify-content:space-between] [align-items:end] [&_small]:[color:#727581] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.3px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:20px] [&_>_span]:[color:#5f626e] [&_>_span]:[font-size:11px]",
  "chart-layout": "[display:grid] [grid-template-columns:minmax(250px,_.8fr)_minmax(320px,_1.2fr)] [align-items:center] [gap:50px] [padding:34px_24px_14px]",
  "chart-legend": "[display:grid] [gap:5px] [&_>_div]:[display:grid] [&_>_div]:[grid-template-columns:10px_minmax(0,_1fr)_44px] [&_>_div]:[align-items:center] [&_>_div]:[gap:11px] [&_>_div]:[padding:9px_10px] [&_>_div]:[border-radius:10px] [&_>_div:hover]:[background:#ffffff06] [&_i]:[width:8px] [&_i]:[height:8px] [&_i]:[border-radius:50%] [&_span]:[display:block] [&_span]:[min-width:0] [&_strong]:[display:block] [&_strong]:[min-width:0] [&_small]:[display:block] [&_small]:[min-width:0] [&_strong]:[overflow:hidden] [&_strong]:[font-size:12px] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[margin-top:3px] [&_small]:[color:#676a76] [&_small]:[font-size:10px] [&_b]:[color:#9b9eaa] [&_b]:[font-size:12px] [&_b]:[text-align:right]",
  "clear-file": "[color:#e49096]",
  "compact-save-status": "[padding-bottom:22px] [&_>_.cover-button]:[margin-top:14px]",
  "content": "[min-width:0] [min-height:0] [height:100vh] [display:grid] [grid-template-rows:80px_minmax(0,_1fr)_42px] [overflow:hidden]",
  "cover-button": "[display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:12px_16px] [background:#ffffff0b] [cursor:pointer]",
  "donut": "[position:relative] [justify-self:center] [width:min(280px,_26vw)] [aspect-ratio:1] [border-radius:50%] [box-shadow:0_16px_60px_#00000038] [&::after]:[content:\"\"] [&::after]:[position:absolute] [&::after]:[inset:23%] [&::after]:[border-radius:50%] [&::after]:[background:#101119] [&::after]:[box-shadow:inset_0_0_30px_#0000002b] [&_>_div]:[position:absolute] [&_>_div]:[z-index:1] [&_>_div]:[inset:0] [&_>_div]:[display:grid] [&_>_div]:[place-content:center] [&_>_div]:[text-align:center] [&_strong]:[display:block] [&_span]:[display:block] [&_strong]:[font-size:30px] [&_strong]:[letter-spacing:-1.5px] [&_span]:[margin-top:2px] [&_span]:[color:#727581] [&_span]:[font-size:11px]",
  "edit-game-fields": "[display:grid] [gap:18px] [padding:25px_24px] [&_label_em]:[margin-left:5px] [&_label_em]:[color:#626571] [&_label_em]:[font-size:9px] [&_label_em]:[font-style:normal] [&_label_em]:[font-weight:500] [&_label_em]:[text-transform:uppercase] [&_label_>_span]:[display:block] [&_label_>_span]:[margin:0_0_8px_2px] [&_label_>_span]:[color:#989ba5] [&_label_>_span]:[font-size:11px] [&_label_>_span]:[font-weight:600] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff14] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_>_p]:[margin:-4px_0_0] [&_>_p]:[color:#696c77] [&_>_p]:[font-size:11px] [&_>_p]:[line-height:1.5] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]",
  "edit-game-modal": "[width:min(650px,_94vw)] [overflow:hidden] [border:1px_solid_#ffffff17] [border-radius:22px] [background:#12131b] [box-shadow:0_30px_100px_#0000008a] [&_>_header]:[display:flex] [&_>_header]:[justify-content:space-between] [&_>_header]:[align-items:center] [&_>_header]:[padding:22px_24px] [&_>_header]:[border-bottom:1px_solid_#ffffff0d] [&_>_header_>_div]:[display:flex] [&_>_header_>_div]:[align-items:center] [&_>_header_>_div]:[gap:12px] [&_>_header_small]:[display:block] [&_>_header_small]:[margin:0] [&_>_header_h2]:[display:block] [&_>_header_h2]:[margin:0] [&_>_header_small]:[color:#696c78] [&_>_header_small]:[font-size:9px] [&_>_header_small]:[font-weight:700] [&_>_header_small]:[letter-spacing:1.3px] [&_>_header_h2]:[margin-top:3px] [&_>_header_h2]:[font-size:18px] [&_>_header_>_button]:[display:grid] [&_>_header_>_button]:[place-items:center] [&_>_header_>_button]:[width:34px] [&_>_header_>_button]:[height:34px] [&_>_header_>_button]:[border:0] [&_>_header_>_button]:[border-radius:9px] [&_>_header_>_button]:[background:#ffffff08] [&_>_header_>_button]:[color:#8b8e99] [&_>_header_>_button]:[cursor:pointer] [&_.file-field]:[grid-template-columns:minmax(0,_1fr)_auto_auto] [&_>_footer]:[display:flex] [&_>_footer]:[justify-content:flex-end] [&_>_footer]:[gap:9px] [&_>_footer]:[height:auto] [&_>_footer]:[padding:17px_24px] [&_>_footer]:[border-top:1px_solid_#ffffff0d] [&_>_footer]:[color:inherit]",
  "empty-icon": "[display:grid] [place-items:center] [width:76px] [height:76px] [border-radius:24px] [background:#ffffff08] [color:#a8f982] [&_svg]:[width:38px] [&_svg]:[height:38px]",
  "empty-state": "[display:grid] [place-items:center] [align-content:center] [margin:0_34px] [padding:40px] [border:1px_dashed_#ffffff17] [border-radius:24px] [background:#ffffff04] [text-align:center] [&_h1]:[font-size:38px] [&_h1]:[letter-spacing:-1.8px] [&_p]:[max-width:470px] [&_p]:[margin:0_0_26px] [&_p]:[color:#898c97] [&_p]:[line-height:1.6]",
  "eyebrow": "[color:#a3f982] [font-size:11px] [font-weight:700] [letter-spacing:1.7px]",
  "file-field": "[display:grid] [grid-template-columns:minmax(0,_1fr)_auto] [gap:8px] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:7px] [&_button]:[border:1px_solid_#ffffff16] [&_button]:[border-radius:10px] [&_button]:[padding:0_13px] [&_button]:[background:#ffffff08] [&_button]:[cursor:pointer]",
  "game-avatar": "[overflow:hidden] [&_img]:[position:absolute] [&_img]:[inset:0] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]",
  "game-context-backdrop": "[position:fixed] [z-index:80] [inset:0] [-webkit-app-region:no-drag]",
  "game-context-menu": "[position:fixed] [width:218px] [overflow:hidden] [border:1px_solid_#ffffff18] [border-radius:12px] [padding:6px] [background:#171820f5] [box-shadow:0_18px_55px_#00000080] [backdrop-filter:blur(18px)] [&_>_small]:[display:block] [&_>_small]:[overflow:hidden] [&_>_small]:[padding:7px_9px_9px] [&_>_small]:[color:#777a86] [&_>_small]:[font-size:9px] [&_>_small]:[text-overflow:ellipsis] [&_>_small]:[white-space:nowrap] [&_>_button]:[display:flex] [&_>_button]:[align-items:center] [&_>_button]:[gap:9px] [&_>_button]:[width:100%] [&_>_button]:[border:0] [&_>_button]:[border-radius:8px] [&_>_button]:[padding:10px] [&_>_button]:[background:transparent] [&_>_button]:[color:#ee959b] [&_>_button]:[font-size:12px] [&_>_button]:[text-align:left] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#ff727d12] [&_>_button_svg]:[width:16px] [&_>_button_svg]:[height:16px]",
  "game-fields": "[display:flex] [flex-direction:column] [gap:18px] [padding-top:8px] [&_label_>_span]:[display:block] [&_label_>_span]:[margin:0_0_8px_2px] [&_label_>_span]:[color:#989ba5] [&_label_>_span]:[font-size:11px] [&_label_>_span]:[font-weight:600] [&_label_em]:[margin-left:5px] [&_label_em]:[color:#626571] [&_label_em]:[font-size:9px] [&_label_em]:[font-style:normal] [&_label_em]:[font-weight:500] [&_label_em]:[text-transform:uppercase] [&_input]:[width:100%] [&_input]:[height:44px] [&_input]:[border:1px_solid_#ffffff14] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0fa3] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]",
  "game-hero": "[position:relative] [overflow:hidden] [height:min(510px,_62vh)] [min-height:410px] [margin:0_34px] [border:1px_solid_#ffffff10] [border-radius:24px] [background:linear-gradient(120deg,_#11131c_8%,_#171a27_55%,_#20253a)] [&:not(:has(.hero-art))_.ambient::after]:[content:\"\"] [&:not(:has(.hero-art))_.ambient::after]:[position:absolute] [&:not(:has(.hero-art))_.ambient::after]:[width:380px] [&:not(:has(.hero-art))_.ambient::after]:[height:380px] [&:not(:has(.hero-art))_.ambient::after]:[right:10%] [&:not(:has(.hero-art))_.ambient::after]:[top:13%] [&:not(:has(.hero-art))_.ambient::after]:[border:1px_solid_#adff8f28] [&:not(:has(.hero-art))_.ambient::after]:[border-radius:42%_58%_67%_33%] [&:not(:has(.hero-art))_.ambient::after]:[transform:rotate(18deg)] [&:not(:has(.hero-art))_.ambient::after]:[box-shadow:0_0_90px_#7eff6815,_inset_0_0_80px_#6caaff0d]",
  "game-list": "[min-height:0] [overflow-x:hidden] [overflow-y:auto] [display:grid] [align-content:start] [gap:3px]",
  "game-name-field": "[position:relative]",
  "game-row": "[display:grid] [grid-template-columns:36px_1fr] [gap:10px] [width:100%] [border:0] [background:transparent] [padding:7px] [border-radius:10px] [text-align:left] [cursor:pointer] [&:hover]:[background:#ffffff0b] [&.selected]:[background:#ffffff0b] [&.selected]:[box-shadow:inset_2px_0_#9df37b] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_strong]:[max-width:175px] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_small]:[max-width:175px] [&_strong]:[margin-top:1px] [&_strong]:[font-size:13px] [&_strong]:[font-weight:500] [&_small]:[margin-top:3px] [&_small]:[color:#686b77] [&_small]:[font-size:11px] [&.running]:[background:#a9fb760b] [&.running]:[box-shadow:inset_2px_0_#9df37b] [&.running_.game-avatar]:[overflow:visible] [&.running_.game-avatar]:[box-shadow:0_0_0_1px_#9df37b55] [&.running_.game-avatar_img]:[border-radius:8px] [&.running_.game-avatar::after]:[content:\"\"] [&.running_.game-avatar::after]:[position:absolute] [&.running_.game-avatar::after]:[z-index:2] [&.running_.game-avatar::after]:[right:-3px] [&.running_.game-avatar::after]:[bottom:-3px] [&.running_.game-avatar::after]:[width:9px] [&.running_.game-avatar::after]:[height:9px] [&.running_.game-avatar::after]:[border:2px_solid_#11121a] [&.running_.game-avatar::after]:[border-radius:50%] [&.running_.game-avatar::after]:[background:#9df37b] [&.running_.game-avatar::after]:[box-shadow:0_0_10px_#9df37b] [&.running_.game-avatar::after]:[animation:running-pulse_1.6s_ease-in-out_infinite] [&.running_small]:[color:#9df37b] [&.running_small]:[font-weight:600] [&.selected]:[box-shadow:inset_2px_0_var(--accent-a)] [&.running]:[box-shadow:inset_2px_0_var(--accent-a)] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_5%,_transparent)] [&.running_.game-avatar]:[box-shadow:0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.running_.game-avatar::after]:[background:var(--accent-a)] [&.running_.game-avatar::after]:[box-shadow:0_0_10px_var(--accent-a)]",
  "game-view": "[min-width:0] [min-height:0] [overflow-x:hidden] [overflow-y:auto] [overscroll-behavior:contain] [padding-bottom:30px] [scrollbar-gutter:stable]",
  "hero-actions": "[display:flex] [gap:10px]",
  "hero-art": "[position:absolute] [inset:0] [width:100%] [height:100%] [object-fit:cover] [object-position:center]",
  "hero-copy": "[position:relative] [z-index:1] [display:flex] [flex-direction:column] [justify-content:center] [width:60%] [height:100%] [padding:64px] [&_>_p]:[color:#7e818e] [&_>_p]:[overflow:hidden] [&_>_p]:[text-overflow:ellipsis] [&_>_p]:[white-space:nowrap]",
  "hero-shade": "[position:absolute] [inset:0] [background:linear-gradient(90deg,_#10121b_3%,_#10121bf2_32%,_#10121b8f_58%,_#10121b17_100%),_linear-gradient(0deg,_#0d0f17a8,_transparent_45%)]",
  "hours-field": "[position:relative] [&_input]:[padding-right:65px] [&_b]:[position:absolute] [&_b]:[right:13px] [&_b]:[top:14px] [&_b]:[color:#6e717c] [&_b]:[font-size:11px] [&_b]:[font-weight:500]",
  "installed-art": "[position:relative] [display:grid] [place-items:center] [height:185px] [overflow:hidden] [background:linear-gradient(135deg,_#252936,_#141620)] [&::after]:[content:\"\"] [&::after]:[position:absolute] [&::after]:[inset:0] [&::after]:[background:linear-gradient(0deg,_#151720_0,_transparent_48%)] [&_>_b]:[position:relative] [&_>_b]:[z-index:1] [&_>_b]:[color:#a9fb76] [&_>_b]:[font-size:42px] [&_>_i]:[position:absolute] [&_>_i]:[z-index:2] [&_>_i]:[top:11px] [&_>_i]:[right:11px] [&_>_i]:[display:grid] [&_>_i]:[place-items:center] [&_>_i]:[width:28px] [&_>_i]:[height:28px] [&_>_i]:[border-radius:9px] [&_>_i]:[background:#090a0fc7] [&_>_i]:[color:#c7cad2] [&_>_i]:[font-style:normal] [&_>_i]:[backdrop-filter:blur(8px)] [&_>_i_svg]:[width:15px] [&_>_i_svg]:[height:15px]",
  "installed-backdrop": "[position:absolute] [inset:-12px] [width:calc(100%_+_24px)] [height:calc(100%_+_24px)] [object-fit:cover] [filter:blur(14px)_brightness(.38)_saturate(1.25)] [transform:scale(1.08)]",
  "installed-card": "[position:relative] [min-width:0] [overflow:hidden] [border:1px_solid_#ffffff0d] [border-radius:17px] [padding:0] [background:#151720] [color:white] [text-align:left] [cursor:pointer] [transition:transform_.18s_ease,_border-color_.18s_ease,_box-shadow_.18s_ease] [&:hover]:[z-index:1] [&:hover]:[border-color:#a9fb7652] [&:hover]:[transform:translateY(-4px)] [&:hover]:[box-shadow:0_18px_38px_#00000055] [&.selected]:[border-color:#a9fb7645] [&.selected]:[box-shadow:inset_0_0_0_1px_#a9fb761b] [&.unavailable_.installed-play]:[background:#777b87] [&.unavailable_.installed-play]:[color:#15161d] [&:hover_.installed-cover]:[transform:scale(1.035)] [&:hover_.installed-play]:[opacity:1] [&:hover_.installed-play]:[transform:translateY(0)] [&.selected_.installed-play]:[opacity:1] [&.selected_.installed-play]:[transform:translateY(0)] [&.running]:[border-color:#a9fb765c] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb761a,_0_12px_35px_#68ee8110] [&.running::after]:[content:\"JUGANDO\"] [&.running::after]:[position:absolute] [&.running::after]:[z-index:4] [&.running::after]:[top:12px] [&.running::after]:[left:12px] [&.running::after]:[padding:5px_8px] [&.running::after]:[border-radius:20px] [&.running::after]:[background:#10150de8] [&.running::after]:[color:#a9fb76] [&.running::after]:[font-size:8px] [&.running::after]:[font-weight:800] [&.running::after]:[letter-spacing:1px] [&.running::after]:[box-shadow:0_0_0_1px_#a9fb7640] [&.running_.installed-copy_small]:[color:#9df37b] [&:hover]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.selected]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)] [&.running]:[border-color:color-mix(in_srgb,_var(--accent-a)_34%,_transparent)]",
  "installed-copy": "[display:block] [min-width:0] [padding:14px_48px_15px_15px] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:13px] [&_small]:[margin-top:5px] [&_small]:[color:#747783] [&_small]:[font-size:10px]",
  "installed-cover": "[position:relative] [z-index:1] [height:148px] [max-width:74%] [border-radius:9px] [object-fit:cover] [box-shadow:0_14px_35px_#0000008a] [transition:transform_.2s_ease]",
  "installed-grid": "[display:grid] [grid-template-columns:repeat(auto-fill,_minmax(190px,_1fr))] [gap:14px]",
  "installed-heading": "[display:flex] [justify-content:space-between] [align-items:end] [margin-bottom:19px] [&_small]:[color:#6e717c] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.35px] [&_h2]:[margin:5px_0_0] [&_h2]:[font-size:21px] [&_h2]:[letter-spacing:-.5px] [&_>_span]:[color:#666975] [&_>_span]:[font-size:11px]",
  "installed-play": "[position:absolute] [right:14px] [bottom:18px] [display:grid] [place-items:center] [width:28px] [height:28px] [border-radius:50%] [background:#a9fb76] [color:#11150e] [opacity:0] [transform:translateY(5px)] [transition:opacity_.18s_ease,_transform_.18s_ease] [&_svg]:[width:12px] [&_svg]:[height:12px]",
  "installed-section": "[padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "library-collection-view": "[min-height:0] [overflow-y:auto] [padding:0_34px_34px]",
  "library-heading": "[display:flex] [justify-content:space-between] [padding:0_11px_10px] [color:#666976] [font-size:10px] [font-weight:700] [letter-spacing:1.4px]",
  "ludusavi-results": "[position:absolute] [z-index:8] [top:72px] [right:0] [left:0] [overflow:auto] [max-height:240px] [border:1px_solid_#ffffff18] [border-radius:11px] [padding:6px] [background:#171821] [box-shadow:0_18px_45px_#0009] [&_>_small]:[display:block] [&_>_small]:[padding:10px] [&_>_small]:[color:#737783] [&_>_small]:[font-size:10px] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#a9fb760d] [&_>_button:hover]:[color:#a9fb76] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:10px] [&_small]:[margin-top:3px] [&_small]:[color:#6f737e] [&_small]:[font-size:8px] [&_>_button:hover]:[color:var(--accent-a)]",
  "ludusavi-selected": "[margin-top:7px] [border:1px_solid_#a9fb7625] [background:#a9fb7608] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:10px] [&_small]:[margin-top:3px] [&_small]:[color:#6f737e] [&_small]:[font-size:8px] [&_>_img]:[width:32px] [&_>_img]:[height:42px] [&_>_img]:[margin-right:9px] [&_>_img]:[border-radius:6px] [&_>_img]:[object-fit:cover] [&_>_button]:[display:grid] [&_>_button]:[place-items:center] [&_>_button]:[border:0] [&_>_button]:[background:transparent] [&_>_button]:[color:#777b85] [&_>_button]:[cursor:pointer]",
  "metric-grid": "[display:grid] [grid-template-columns:minmax(220px,_320px)] [gap:12px] [margin:0] [&_article]:[display:flex] [&_article]:[align-items:center] [&_article]:[gap:14px] [&_article]:[min-width:0] [&_article]:[padding:18px] [&_article]:[border:1px_solid_#ffffff0d] [&_article]:[border-radius:16px] [&_article]:[background:#ffffff06] [&_article_>_svg]:[flex:0_0_auto] [&_article_>_svg]:[width:24px] [&_article_>_svg]:[height:24px] [&_article_>_svg]:[color:#a9fb76] [&_article_span]:[display:block] [&_article_span]:[min-width:0] [&_article_small]:[display:block] [&_article_small]:[min-width:0] [&_article_strong]:[display:block] [&_article_strong]:[min-width:0] [&_article_small]:[margin-bottom:5px] [&_article_small]:[color:#666a76] [&_article_small]:[font-size:9px] [&_article_small]:[font-weight:700] [&_article_small]:[letter-spacing:1.2px] [&_article_strong]:[overflow:hidden] [&_article_strong]:[color:#f4f5f7] [&_article_strong]:[font-size:18px] [&_article_strong]:[text-overflow:ellipsis] [&_article_strong]:[white-space:nowrap]",
  "modal-backdrop": "[position:fixed] [z-index:50] [inset:0] [display:grid] [place-items:center] [padding:28px] [background:#050609c7] [backdrop-filter:blur(12px)] [-webkit-app-region:no-drag]",
  "modal-error": "[margin:0_24px_16px] [padding:10px_12px] [border-radius:9px] [background:#ff6f7912] [color:#ff9299] [font-size:12px]",
  "modal-hint": "[display:flex] [align-items:flex-start] [gap:9px] [margin-top:auto] [padding:12px] [border-radius:10px] [background:#ffffff05] [color:#737682] [font-size:11px] [line-height:1.45] [&_svg]:[flex:0_0_auto] [&_svg]:[width:17px] [&_svg]:[height:17px] [&_svg]:[color:#a9fb76] [&_svg]:[color:var(--accent-a)]",
  "month-card": "[min-width:0] [min-height:178px] [overflow:hidden] [border:1px_solid_#ffffff0d] [border-radius:15px] [padding:15px] [background:#ffffff05] [&_>_header]:[display:grid] [&_>_header]:[grid-template-columns:27px_minmax(0,_1fr)_auto] [&_>_header]:[align-items:center] [&_>_header]:[gap:8px] [&_>_header]:[padding-bottom:12px] [&_>_header]:[border-bottom:1px_solid_#ffffff0b] [&_>_header_>_span]:[color:#a9fb76] [&_>_header_>_span]:[font-size:10px] [&_>_header_>_span]:[font-weight:800] [&_>_header_>_strong]:[overflow:hidden] [&_>_header_>_strong]:[font-size:13px] [&_>_header_>_strong]:[text-transform:capitalize] [&_>_header_>_strong]:[text-overflow:ellipsis] [&_>_header_>_strong]:[white-space:nowrap] [&_>_header_>_small]:[color:#626570] [&_>_header_>_small]:[font-size:9px] [&_>_p]:[margin:34px_0_0] [&_>_p]:[color:#51545f] [&_>_p]:[font-size:10px] [&_>_p]:[text-align:center] [&.empty]:[opacity:.65]",
  "month-cover": "[display:grid] [place-items:center] [width:34px] [height:40px] [overflow:hidden] [border-radius:7px] [background:#22242f] [color:#a9fb76] [font-size:11px] [font-weight:700] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]",
  "month-games": "[display:grid] [gap:8px] [margin-top:11px] [&_>_div]:[display:grid] [&_>_div]:[grid-template-columns:34px_minmax(0,_1fr)] [&_>_div]:[align-items:center] [&_>_div]:[gap:9px] [&_>_div]:[min-width:0] [&_strong]:[display:block] [&_strong]:[overflow:hidden] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[display:block] [&_small]:[overflow:hidden] [&_small]:[text-overflow:ellipsis] [&_small]:[white-space:nowrap] [&_strong]:[font-size:11px] [&_small]:[margin-top:3px] [&_small]:[color:#696c77] [&_small]:[font-size:9px]",
  "months-grid": "[display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:12px] [margin-top:24px]",
  "period-selector": "[display:flex] [align-items:center] [gap:9px] [min-width:190px] [height:44px] [border:1px_solid_#ffffff14] [border-radius:12px] [padding:0_12px] [background:#ffffff08] [color:#9295a0] [&_svg]:[flex:0_0_auto] [&_svg]:[width:18px] [&_svg]:[height:18px] [&_svg]:[color:#a9fb76] [&_select]:[width:100%] [&_select]:[border:0] [&_select]:[outline:0] [&_select]:[background:transparent] [&_select]:[color:#e5e6e9] [&_select]:[cursor:pointer] [&_option]:[background:#15161e] [&_option]:[color:white]",
  "play": "[background:linear-gradient(135deg,_var(--accent-a),_var(--accent-b))] [color:var(--accent-ink)] [box-shadow:0_12px_40px_color-mix(in_srgb,_var(--accent-a)_15%,_transparent)] [&:disabled]:[filter:grayscale(1)] [&:disabled]:[opacity:.45] [&:disabled]:[cursor:default] [&.running]:[filter:none] [&.running]:[opacity:1] [&.running]:[background:#a9fb7617] [&.running]:[color:#a9fb76] [&.running]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running:disabled]:[filter:none] [&.running:disabled]:[opacity:1] [&.running:disabled]:[background:#a9fb7617] [&.running:disabled]:[color:#a9fb76] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_#a9fb7640,_0_0_30px_#83ef8412] [&.running]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running]:[color:var(--accent-a)] [&.running]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)] [&.running:disabled]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)] [&.running:disabled]:[color:var(--accent-a)] [&.running:disabled]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--accent-a)_25%,_transparent)]",
  "playtime-card": "[padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "podium-cover": "[position:relative] [width:82px] [aspect-ratio:2_/_2.75] [overflow:visible] [margin:0_auto_14px] [border-radius:12px] [background:linear-gradient(135deg,_#292c39,_#171923)] [box-shadow:0_12px_28px_#00000066] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover] [&_img]:[border-radius:inherit] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:100%] [&_>_span]:[height:100%] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:30px] [&_>_span]:[font-weight:800] [&_b]:[position:absolute] [&_b]:[right:-10px] [&_b]:[bottom:-8px] [&_b]:[display:grid] [&_b]:[place-items:center] [&_b]:[width:30px] [&_b]:[height:30px] [&_b]:[border:3px_solid_#101119] [&_b]:[border-radius:50%] [&_b]:[background:#737783] [&_b]:[color:#15161d] [&_b]:[font-size:13px]",
  "podium-game": "[position:relative] [min-width:0] [padding:18px_16px] [border:1px_solid_#ffffff0d] [border-radius:18px] [background:linear-gradient(180deg,_#ffffff09,_#ffffff03)] [text-align:center] [&_>_strong]:[display:block] [&_>_strong]:[overflow:hidden] [&_>_strong]:[text-overflow:ellipsis] [&_>_strong]:[white-space:nowrap] [&_>_span]:[display:block] [&_>_span]:[overflow:hidden] [&_>_span]:[text-overflow:ellipsis] [&_>_span]:[white-space:nowrap] [&_>_small]:[display:block] [&_>_small]:[overflow:hidden] [&_>_small]:[text-overflow:ellipsis] [&_>_small]:[white-space:nowrap] [&_>_strong]:[font-size:14px] [&_>_span]:[margin-top:7px] [&_>_span]:[color:#a9fb76] [&_>_span]:[font-size:18px] [&_>_span]:[font-weight:750] [&_>_small]:[margin-top:4px] [&_>_small]:[color:#686b77] [&_>_small]:[font-size:9px]",
  "podium-game-1": "[order:2] [padding-top:23px] [border-color:#b5ff7833] [background:linear-gradient(180deg,_#a9fb7614,_#ffffff04)] [box-shadow:0_18px_50px_#00000030] [transform:translateY(-14px)] [&_.podium-cover]:[width:100px] [&_.podium-cover_b]:[width:36px] [&_.podium-cover_b]:[height:36px] [&_.podium-cover_b]:[background:linear-gradient(135deg,_#d9ff86,_#83eb82)] [&_.podium-cover_b]:[background:linear-gradient(90deg,_var(--accent-a),_var(--accent-b))]",
  "podium-game-2": "[order:1]",
  "podium-game-3": "[order:3] [&_.podium-cover_b]:[background:#b67c54]",
  "primary-nav": "[display:grid] [gap:4px] [margin:20px_0_24px]",
  "ranking-card": "[padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "ranking-cover": "[display:grid] [place-items:center] [width:38px] [height:44px] [overflow:hidden] [border-radius:8px] [background:#20222d] [color:#a9fb76] [font-size:13px] [font-weight:700] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:[object-fit:cover]",
  "ranking-list": "[overflow:hidden] [border-top:1px_solid_#ffffff0b]",
  "ranking-podium": "[display:grid] [grid-template-columns:repeat(3,_minmax(0,_1fr))] [align-items:end] [gap:12px] [max-width:820px] [margin:32px_auto_30px]",
  "ranking-progress": "[height:4px] [overflow:hidden] [border-radius:5px] [background:#ffffff0b] [&_i]:[display:block] [&_i]:[height:100%] [&_i]:[border-radius:inherit] [&_i]:[background:linear-gradient(90deg,_#a9fb76,_#67e5ae)] [&_i]:[background:linear-gradient(90deg,_var(--accent-a),_var(--accent-b))]",
  "ranking-row": "[display:grid] [grid-template-columns:28px_38px_minmax(150px,_1fr)_minmax(80px,_.8fr)_78px] [align-items:center] [gap:12px] [min-width:0] [padding:10px_8px] [border-bottom:1px_solid_#ffffff08] [&:hover]:[background:#ffffff04] [&_>_b]:[color:#676a75] [&_>_b]:[font-size:12px] [&_>_b]:[text-align:center]",
  "ranking-time": "[text-align:right] [&_strong]:[font-size:12px] [&_small]:[margin-top:3px] [&_small]:[color:#686b76] [&_small]:[font-size:9px]",
  "save-path": "[display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [margin-top:10px] [border:1px_solid_#ffffff0b] [border-radius:11px] [padding:10px_12px] [background:#ffffff05] [&_>_span]:[display:flex] [&_>_span]:[align-items:center] [&_>_span]:[gap:9px] [&_>_span]:[min-width:0] [&_>_span]:[color:#858995] [&_b]:[overflow:hidden] [&_b]:[color:#b5b8c1] [&_b]:[font-size:11px] [&_b]:[font-weight:500] [&_b]:[text-overflow:ellipsis] [&_b]:[white-space:nowrap] [&_svg]:[flex:0_0_auto] [&_svg]:[width:16px] [&_>_button]:[display:grid] [&_>_button]:[place-items:center] [&_>_button]:[flex:0_0_auto] [&_>_button]:[width:30px] [&_>_button]:[height:30px] [&_>_button]:[border:0] [&_>_button]:[border-radius:8px] [&_>_button]:[background:transparent] [&_>_button]:[color:#777b87] [&_>_button]:[cursor:pointer] [&_>_button:hover]:[background:#ff727d12] [&_>_button:hover]:[color:#ee959b]",
  "save-policy": "[display:flex] [flex-wrap:wrap] [align-items:center] [gap:12px] [margin-top:16px] [border-top:1px_solid_#ffffff0b] [padding-top:15px] [&_label]:[display:flex] [&_label]:[align-items:center] [&_label]:[gap:6px] [&_label]:[color:#7f838e] [&_label]:[font-size:10px] [&_input[type=number]]:[width:62px] [&_input[type=number]]:[border:1px_solid_#ffffff12] [&_input[type=number]]:[border-radius:7px] [&_input[type=number]]:[padding:6px] [&_input[type=number]]:[background:#090a0f] [&_input[type=number]]:[color:#b7bac3] [&_.save-exclusions]:[width:170px] [&_.save-exclusions]:[border:1px_solid_#ffffff12] [&_.save-exclusions]:[border-radius:7px] [&_.save-exclusions]:[padding:6px_8px] [&_.save-exclusions]:[background:#090a0f] [&_.save-exclusions]:[color:#b7bac3]",
  "save-suggestions": "[margin-top:16px] [&_>_small]:[display:block] [&_>_small]:[margin-bottom:7px] [&_>_small]:[color:#666a75] [&_>_small]:[font-size:8px] [&_>_small]:[font-weight:700] [&_>_small]:[letter-spacing:1.2px] [&_>_button]:[display:flex] [&_>_button]:[align-items:center] [&_>_button]:[gap:8px] [&_>_button]:[width:100%] [&_>_button]:[margin-top:5px] [&_>_button]:[border:1px_dashed_#a9fb762e] [&_>_button]:[border-radius:9px] [&_>_button]:[padding:9px_11px] [&_>_button]:[background:#a9fb7607] [&_>_button]:[color:#9bdfa0] [&_>_button]:[font-size:10px] [&_>_button]:[cursor:pointer] [&_>_button_span]:[overflow:hidden] [&_>_button_span]:[text-overflow:ellipsis] [&_>_button_span]:[white-space:nowrap] [&_>_button_span_b]:[display:block] [&_>_button_span_b]:[overflow:hidden] [&_>_button_span_b]:[text-overflow:ellipsis] [&_>_button_span_b]:[white-space:nowrap] [&_>_button_span_em]:[display:block] [&_>_button_span_em]:[overflow:hidden] [&_>_button_span_em]:[text-overflow:ellipsis] [&_>_button_span_em]:[white-space:nowrap] [&_>_button_span_b]:[font-size:10px] [&_>_button_span_b]:[font-weight:500] [&_>_button_span_em]:[margin-top:3px] [&_>_button_span_em]:[color:#747985] [&_>_button_span_em]:[font-size:8px] [&_>_button_span_em]:[font-style:normal]",
  "save-sync-detail": "[margin:12px_0_0] [color:#777b86] [font-size:11px] [line-height:1.5]",
  "save-sync-indicator": "[width:10px] [height:10px] [border-radius:50%] [background:#777b86] [box-shadow:0_0_0_5px_#777b8610] [&.ok]:[background:#a9fb76] [&.ok]:[box-shadow:0_0_0_5px_#a9fb7612] [&.warning]:[background:#e9bd70] [&.warning]:[box-shadow:0_0_0_5px_#e9bd7012] [&.error]:[background:#ff727d] [&.error]:[box-shadow:0_0_0_5px_#ff727d12]",
  "save-version-list": "[display:grid] [gap:7px] [margin-top:14px] [&_article]:[display:grid] [&_article]:[grid-template-columns:minmax(0,_1fr)_auto_auto_auto] [&_article]:[align-items:center] [&_article]:[gap:12px] [&_article]:[border:1px_solid_#ffffff0b] [&_article]:[border-radius:11px] [&_article]:[padding:11px_12px] [&_article]:[background:#ffffff04] [&_article.latest]:[border-color:#a9fb7625] [&_b]:[display:block] [&_small]:[display:block] [&_b]:[font-size:11px] [&_small]:[margin-top:3px] [&_small]:[color:#6e727d] [&_small]:[font-size:9px] [&_em]:[border-radius:20px] [&_em]:[padding:4px_7px] [&_em]:[background:#a9fb7613] [&_em]:[color:#a9fb76] [&_em]:[font-size:7px] [&_em]:[font-style:normal] [&_em]:[font-weight:800] [&_em]:[letter-spacing:1px] [&_button]:[display:flex] [&_button]:[align-items:center] [&_button]:[gap:6px] [&_button]:[border:1px_solid_#ffffff12] [&_button]:[border-radius:8px] [&_button]:[padding:7px_9px] [&_button]:[background:#ffffff07] [&_button]:[color:#a9acb6] [&_button]:[font-size:9px] [&_button]:[cursor:pointer] [&_button:hover]:[border-color:#a9fb763b] [&_button:hover]:[color:#a9fb76]",
  "save-versions-heading": "[margin-top:22px] [border-top:1px_solid_#ffffff0b] [padding-top:20px] [&_strong]:[display:block] [&_small]:[display:block] [&_strong]:[font-size:14px] [&_small]:[margin-top:4px] [&_small]:[color:#6f727e] [&_small]:[font-size:10px] [&_.play]:[padding:10px_15px] [&_.play]:[font-size:11px]",
  "savegame-status": "[background:#a9fb760d] [color:#a9fb76]",
  "savegames-section": "[margin:24px_34px_0] [padding:24px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "search": "[display:flex] [align-items:center] [gap:9px] [width:min(390px,_44vw)] [padding:10px_13px] [border:1px_solid_#ffffff10] [border-radius:11px] [background:#ffffff08] [color:#777a87] [-webkit-app-region:no-drag] [&_input]:[width:100%] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:[background:transparent] [&_input]:[color:white]",
  "section-icon": "[display:grid] [place-items:center] [width:38px] [height:38px] [border-radius:11px] [background:#a9fb7615] [color:#a9fb76]",
  "settings": "[margin-top:8px] [flex:0_0_auto] [-webkit-app-region:no-drag] [&_svg]:[width:19px] [&.active]:[background:#ffffff0c] [&.active]:[color:white]",
  "settings-card": "[max-width:850px] [margin-top:30px] [padding:26px] [border:1px_solid_#ffffff0d] [border-radius:20px] [background:#101119]",
  "settings-card-heading": "[display:grid] [grid-template-columns:46px_minmax(0,_1fr)_auto] [align-items:center] [gap:14px] [padding-bottom:22px] [border-bottom:1px_solid_#ffffff0b] [&_>_span]:[display:grid] [&_>_span]:[place-items:center] [&_>_span]:[width:46px] [&_>_span]:[height:46px] [&_>_span]:[border-radius:13px] [&_>_span]:[background:#5d8eff1a] [&_>_span]:[color:#83a7ff] [&_>_span_svg]:[width:25px] [&_>_span_svg]:[height:25px] [&_h2]:[margin:0] [&_p]:[margin:0] [&_h2]:[font-size:17px] [&_p]:[margin-top:5px] [&_p]:[color:#777a86] [&_p]:[font-size:12px] [&_i]:[padding:6px_8px] [&_i]:[border-radius:7px] [&_i]:[background:#ffffff08] [&_i]:[color:#737681] [&_i]:[font-size:9px] [&_i]:[font-style:normal] [&_i]:[font-weight:700] [&_i]:[letter-spacing:1px] [&_i.connected]:[background:#a9fb7612] [&_i.connected]:[color:#a9fb76] [&_i.connected]:[color:var(--accent-a)]",
  "settings-form": "[display:grid] [grid-template-columns:1fr_1.25fr_auto] [align-items:end] [gap:12px] [margin-top:24px] [&_label_span]:[display:block] [&_label_span]:[margin:0_0_7px_2px] [&_label_span]:[color:#777a86] [&_label_span]:[font-size:11px] [&_input]:[width:100%] [&_input]:[height:43px] [&_input]:[border:1px_solid_#ffffff12] [&_input]:[border-radius:10px] [&_input]:[outline:none] [&_input]:[padding:0_12px] [&_input]:[background:#090a0f99] [&_input]:[color:white] [&_input:focus]:[border-color:#a9fb766b] [&_input:focus]:[box-shadow:0_0_0_3px_#a9fb760d] [&_.play]:[height:43px] [&_.play]:[white-space:nowrap] [&_input:focus]:[border-color:color-mix(in_srgb,_var(--accent-a)_42%,_transparent)] [&_input:focus]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--accent-a)_5%,_transparent)]",
  "settings-note": "[margin:16px_0_0] [color:#666975] [font-size:11px] [line-height:1.55]",
  "settings-status": "[margin-top:16px] [padding:11px_13px] [border-radius:9px] [background:#ffffff07] [color:#aeb0b8] [font-size:12px]",
  "settings-view": "[min-height:0] [overflow-y:auto] [padding:20px_34px_40px]",
  "sidebar": "[min-height:0] [display:grid] [grid-template-rows:54px_auto_auto_minmax(0,_1fr)] [padding:26px_14px_14px] [background:rgba(10,_11,_17,_.9)] [border-right:1px_solid_#ffffff0d] [overflow:hidden] [-webkit-app-region:drag]",
  "statistics-empty": "[display:grid] [place-items:center] [padding:70px_20px] [color:#686b76] [text-align:center] [&_svg]:[width:42px] [&_svg]:[height:42px] [&_svg]:[margin-bottom:15px] [&_strong]:[color:#d5d6da] [&_span]:[margin-top:6px] [&_span]:[font-size:12px]",
  "statistics-toolbar": "[display:flex] [justify-content:space-between] [align-items:center] [gap:18px] [margin:28px_0_16px]",
  "statistics-view": "[min-height:0] [overflow-y:auto] [padding:20px_34px_40px]",
  "stats": "[display:flex] [gap:32px] [margin:24px_0_32px] [color:#777a86] [font-size:12px] [&_b]:[display:block] [&_b]:[color:white] [&_b]:[font-size:17px] [&_b]:[margin-bottom:4px]",
  "steam-import": "[display:flex] [align-items:center] [gap:8px] [border:1px_solid_#ffffff18] [padding:9px_14px] [border-radius:10px] [background:#ffffff0b] [cursor:pointer] [-webkit-app-region:no-drag] [&:disabled]:[opacity:.55]",
  "suggestion-strip": "[display:grid] [grid-template-columns:repeat(6,_minmax(0,_1fr))] [gap:8px] [&_button]:[min-width:0] [&_button]:[overflow:hidden] [&_button]:[border:1px_solid_transparent] [&_button]:[border-radius:10px] [&_button]:[padding:0] [&_button]:[background:#090a0f] [&_button]:[cursor:pointer] [&_button.selected]:[border-color:#a9fb76] [&_button.selected]:[box-shadow:0_0_0_2px_#a9fb7618] [&_img]:[display:block] [&_img]:[width:100%] [&_img]:[aspect-ratio:2_/_2.75] [&_img]:[object-fit:cover] [&_span]:[display:block] [&_span]:[overflow:hidden] [&_span]:[padding:7px] [&_span]:[color:#a5a7af] [&_span]:[font-size:9px] [&_span]:[text-overflow:ellipsis] [&_span]:[white-space:nowrap] [&_button.selected]:[border-color:var(--accent-a)] [&_button.selected]:[box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--accent-a)_9%,_transparent)]",
  "summary-grid": "[display:grid] [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:9px] [margin-top:18px] [&_article]:[display:grid] [&_article]:[grid-template-columns:34px_minmax(0,_1fr)] [&_article]:[gap:10px] [&_article]:[align-items:center] [&_article]:[min-width:0] [&_article]:[border:1px_solid_#ffffff0b] [&_article]:[border-radius:12px] [&_article]:[padding:13px] [&_article]:[background:#ffffff04] [&_article_>_span]:[display:grid] [&_article_>_span]:[place-items:center] [&_article_>_span]:[width:34px] [&_article_>_span]:[height:34px] [&_article_>_span]:[border-radius:9px] [&_article_>_span]:[background:#a9fb7610] [&_article_>_span]:[color:#a9fb76] [&_article_svg]:[width:17px] [&_article_svg]:[height:17px] [&_small]:[color:#777b86] [&_small]:[font-size:8px] [&_small]:[font-weight:750] [&_small]:[letter-spacing:1.1px] [&_p]:[margin:4px_0_0] [&_p]:[color:#c6c8ce] [&_p]:[font-size:11px] [&_p]:[line-height:1.45] [&_article_>_span]:[color:var(--accent-a)] [&_article_>_span]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)]",
  "summary-period": "[display:flex] [gap:4px] [border:1px_solid_#ffffff0d] [border-radius:9px] [padding:3px] [background:#090a0f80] [&_button]:[border:0] [&_button]:[border-radius:6px] [&_button]:[padding:7px_11px] [&_button]:[background:transparent] [&_button]:[color:#737783] [&_button]:[font-size:9px] [&_button]:[cursor:pointer] [&_button.active]:[background:#a9fb7615] [&_button.active]:[color:#a9fb76] [&_button.active]:[color:var(--accent-a)] [&_button.active]:[background:color-mix(in_srgb,_var(--accent-a)_9%,_transparent)]",
  "sync-folder-row": "[display:grid] [grid-template-columns:minmax(0,_1fr)_auto_auto] [align-items:center] [gap:10px] [margin-top:22px] [&_>_span]:[display:block] [&_>_span]:[min-width:0] [&_small]:[display:block] [&_small]:[min-width:0] [&_strong]:[display:block] [&_strong]:[min-width:0] [&_small]:[margin-bottom:6px] [&_small]:[color:#666a76] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.2px] [&_strong]:[overflow:hidden] [&_strong]:[color:#c7c9d0] [&_strong]:[font-size:12px] [&_strong]:[font-weight:500] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_.play]:[height:42px] [&_.play]:[white-space:nowrap] [&_.cancel-button]:[height:42px] [&_.cancel-button]:[white-space:nowrap]",
  "sync-settings-card": "[margin-top:16px]",
  "topbar": "[position:relative] [display:flex] [justify-content:space-between] [align-items:center] [padding:20px_150px_12px_34px] [-webkit-app-region:drag]",
  "topbar-title": "[display:flex] [align-items:center] [gap:9px] [color:#a4a7b1] [font-size:13px] [font-weight:600]",
  "window-controls": "[position:absolute] [top:0] [right:0] [display:flex] [height:44px] [-webkit-app-region:no-drag] [&_button]:[display:grid] [&_button]:[place-items:center] [&_button]:[width:46px] [&_button]:[border:0] [&_button]:[background:transparent] [&_button]:[color:#8c8f99] [&_button]:[cursor:pointer] [&_button:hover]:[background:#ffffff0b] [&_button:hover]:[color:white] [&_button.window-close:hover]:[background:#d94b55] [&_button.window-close:hover]:[color:white] [&_svg]:[width:15px] [&_svg]:[height:15px]",
  "nav-item": "[&_svg]:[width:19px] [&.active]:[background:#ffffff0c] [&.active]:[color:white]",
  "achievement-diagnostic": "[&_p]:[margin:15px_0_0] [&_p]:[color:#747884] [&_p]:[font-size:11px] [&_p]:[line-height:1.55]",
  "savegames-heading": "[&_>_div]:[gap:12px] [&_small]:[display:block] [&_strong]:[display:block] [&_small]:[margin-bottom:3px] [&_small]:[color:#696c78] [&_small]:[font-size:9px] [&_small]:[font-weight:700] [&_small]:[letter-spacing:1.4px] [&_strong]:[font-size:14px]",
  "statistics-intro": "[&_h1]:[margin:10px_0_7px] [&_h1]:[font-size:46px] [&_h1]:[letter-spacing:-2.3px] [&_p]:[margin:0] [&_p]:[color:#777a87]",
  "ranking-name": "[&_strong]:[overflow:hidden] [&_strong]:[font-size:12px] [&_strong]:[text-overflow:ellipsis] [&_strong]:[white-space:nowrap] [&_small]:[margin-top:4px] [&_small]:[color:#626570] [&_small]:[font-size:9px]",
};

const tw = (classNames: string) => classNames.split(/\s+/).filter(Boolean).flatMap((name) => [name, componentUtilities[name]]).filter(Boolean).join(" ");

type AccentTheme = "forest" | "aurora" | "ember" | "amethyst" | "glacier";

const accentThemes: Array<{ id: AccentTheme; name: string; description: string; colors: [string, string] }> = [
  { id: "forest", name: "Bosque", description: "Verde y cian", colors: ["#b7ff64", "#65f0b5"] },
  { id: "aurora", name: "Aurora", description: "Cian y violeta", colors: ["#47e9ff", "#8e7cff"] },
  { id: "ember", name: "Brasa", description: "Ámbar y coral", colors: ["#ffd15c", "#ff7b67"] },
  { id: "amethyst", name: "Amatista", description: "Violeta y rosa", colors: ["#bd8cff", "#ff79bd"] },
  { id: "glacier", name: "Glaciar", description: "Azul y hielo", colors: ["#72a7ff", "#78f0ec"] },
];

function NemetonMark() {
  return <svg className={tw("nemeton-mark")} viewBox="0 0 64 64" aria-hidden="true">
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

  return <section className={tw("savegames-section compact-save-status")}>
    <div className={tw("savegames-heading")}><div><span className={tw("section-icon")}><FloppyDisk weight="fill" /></span><span><small>PARTIDAS GUARDADAS</small><strong>{copy.title}</strong></span></div><i className={tw(`save-sync-indicator ${copy.tone}`)} /> </div>
    <p className={tw("save-sync-detail")}>{copy.detail}</p>
    {data && (data.syncState === "not-detected" || data.syncState === "path-missing") && <button className={tw("cover-button")} disabled={busy} onClick={() => void run(chooseFolder, "Carpeta de partidas actualizada")}><FolderOpen /> Indicar carpeta</button>}
    {data && (data.syncState === "waiting-backup" || data.syncState === "pending") && <button className={tw("cover-button")} disabled={busy} onClick={() => void run(() => window.launcher.backupSavegames(game.id), "Partidas sincronizadas")}><FloppyDisk /> Sincronizar ahora</button>}
    {status && <p className={tw("savegame-status")}>{status}</p>}
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
    <div className={tw("library-collection-view")}>
      <section className={tw("installed-section")}>
        <div className={tw("installed-heading")}><div><small>TU COLECCIÓN</small><h2>Juegos en tu biblioteca</h2></div><span>{games.length} {games.length === 1 ? "juego" : "juegos"}</span></div>
        <div className={tw("installed-grid")}>
          {games.map((game) => {
            const cover = gameCoverUrl(game);
            const hero = gameHeroUrl(game);
            return (
              <button className={tw(`installed-card ${!game.installed ? "unavailable" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`)} key={game.id} onClick={() => onSelect(game.id)}>
                <span className={tw("installed-art")}>
                  {hero && <img className={tw("installed-backdrop")} src={hero} alt="" />}
                  {cover ? <img className={tw("installed-cover")} src={cover} alt="" /> : <b>{game.title.slice(0, 1).toUpperCase()}</b>}
                  <i>{game.source === "steam" ? <SteamLogo weight="fill" /> : <GameController weight="fill" />}</i>
                </span>
                <span className={tw("installed-copy")}><strong>{game.title}</strong><small>{runningGameIds.has(game.id) ? "Jugando ahora" : `${formatPlaytime(game.platformPlaytimeMinutes ?? game.playtimeMinutes)}${!game.installed ? " · Sin ejecutable" : ""}`}</small></span>
                <span className={tw("installed-play")}>{game.installed ? <Play weight="fill" /> : <PencilSimple weight="bold" />}</span>
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
    <div className={tw("statistics-view")}>
      <div className={tw("statistics-intro")}><span className={tw("eyebrow")}>TU HISTÓRICO DE JUEGO</span><h1>Estadísticas</h1><p>Steam completo y sesiones de los juegos añadidos manualmente.</p></div>
      <section className={tw("automatic-summary")}><div className={tw("card-heading")}><div><small>RESUMEN AUTOMÁTICO</small><h2>Lo más destacado</h2></div><div className={tw("summary-period")}><button className={summaryPeriod === "week" ? "active" : ""} onClick={() => setSummaryPeriod("week")}>Semana</button><button className={summaryPeriod === "month" ? "active" : ""} onClick={() => setSummaryPeriod("month")}>Mes</button></div></div><div className={tw("summary-grid")}>{automaticSummary.map((item) => <article key={item.label}><span><ChartDonut weight="fill" /></span><div><small>{item.label}</small><p>{item.text}</p></div></article>)}</div></section>
      <div className={tw("statistics-toolbar")}>
        <div className={tw("metric-grid")}><article><Clock /><span><small>{period === "all" ? "TIEMPO TOTAL" : "TIEMPO EN 2026"}</small><strong>{period === "all" ? `${totalHours} h` : formatPlaytime(Math.round(annualSeconds / 60))}</strong></span></article></div>
        <label className={tw("period-selector")}><CalendarBlank /><select value={period} onChange={(event) => setPeriod(event.target.value as "all" | "2026")}><option value="all">Total histórico</option><option value="2026">Anual · 2026</option></select></label>
      </div>
      {period === "all" && statistics.played.length > 0 && (
        <section className={tw("ranking-card")}>
          <div className={tw("card-heading")}><div><small>CLASIFICACIÓN</small><h2>Tus juegos más jugados</h2></div><span>Ordenados por tiempo total</span></div>
          <div className={tw("ranking-podium")}>
            {statistics.played.slice(0, 3).map((game, index) => {
              const minutes = game.source === "steam" ? game.platformPlaytimeMinutes ?? 0 : game.trackedPlaytimeSeconds / 60;
              const cover = gameCoverUrl(game);
              return (
                <article className={tw(`podium-game podium-game-${index + 1}`)} key={game.id}>
                  <div className={tw("podium-cover")}>
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
            <div className={tw("ranking-list")}>
              {statistics.played.slice(3).map((game, index) => {
                const minutes = game.source === "steam" ? game.platformPlaytimeMinutes ?? 0 : game.trackedPlaytimeSeconds / 60;
                const cover = gameCoverUrl(game);
                const percentage = Math.round((minutes / statistics.totalMinutes) * 100);
                return (
                  <div className={tw("ranking-row")} key={game.id}>
                    <b>{index + 4}</b>
                    <div className={tw("ranking-cover")}>{cover ? <img src={cover} alt="" /> : <span>{game.title.slice(0, 1).toUpperCase()}</span>}</div>
                    <span className={tw("ranking-name")}><strong>{game.title}</strong><small>{game.source === "steam" ? "Steam" : "Añadido manualmente"}</small></span>
                    <div className={tw("ranking-progress")}><i style={{ width: `${Math.max(percentage, 2)}%` }} /></div>
                    <span className={tw("ranking-time")}><strong>{formatPlaytime(minutes)}</strong><small>{percentage}%</small></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {period === "all" && statistics.played.length === 0 && (
        <div className={tw("statistics-empty")}><ChartDonut /><strong>Aún no hay tiempo registrado</strong><span>Importa Steam o inicia un juego local desde el launcher.</span></div>
      )}
      {period === "2026" && (
        <section className={tw("annual-card")}>
          <div className={tw("card-heading")}><div><small>ACTIVIDAD ANUAL</small><h2>Tu año jugando</h2></div><span>2026</span></div>
          {annualRanking.length > 0 && <><div className={tw("annual-ranking-heading")}><Trophy weight="fill" /><span><small>TOP DE 2026</small><strong>Los más jugados del año</strong></span></div><div className={tw("ranking-podium annual-podium")}>{annualRanking.map(({ game, seconds }, index) => {
            const cover = gameCoverUrl(game);
            return <article className={tw(`podium-game podium-game-${index + 1}`)} key={game.id}><div className={tw("podium-cover")}>{cover ? <img src={cover} alt="" /> : <span>{game.title.slice(0, 1).toUpperCase()}</span>}<b>{index + 1}</b></div><strong>{game.title}</strong><span>{formatPlaytime(Math.round(seconds / 60))}</span><small>Jugado en 2026</small></article>;
          })}</div></>}
          <div className={tw("months-grid")}>
            {months.map((month, index) => (
              <article className={tw(`month-card ${month.entries.length === 0 ? "empty" : ""}`)} key={month.name}>
                <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{month.name}</strong><small>{month.entries.length} {month.entries.length === 1 ? "juego" : "juegos"}</small></header>
                {month.entries.length > 0 ? <div className={tw("month-games")}>{month.entries.map(({ game, seconds }) => {
                  const cover = gameCoverUrl(game);
                  return <div key={game.id}><span className={tw("month-cover")}>{cover ? <img src={cover} alt="" /> : game.title.slice(0, 1).toUpperCase()}</span><span><strong>{game.title}</strong><small>{seconds > 0 ? formatPlaytime(Math.round(seconds / 60)) : "Horas no disponibles"}</small></span></div>;
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
    <div className={tw("settings-view")}>
      <div className={tw("statistics-intro")}><span className={tw("eyebrow")}>NEMETON</span><h1>Ajustes</h1><p>Personaliza la aplicación y conecta tus servicios.</p></div>
      <section className={tw("settings-card appearance-settings-card")}>
        <div className={tw("settings-card-heading")}><span><Palette weight="fill" /></span><div><h2>Apariencia</h2><p>La interfaz permanece oscura; elige los colores de énfasis.</p></div><i>OSCURA</i></div>
        <div className={tw("accent-grid")}>
          {accentThemes.map((theme) => <button type="button" className={accentTheme === theme.id ? "selected" : ""} key={theme.id} onClick={() => onAccentThemeChange(theme.id)}>
            <span className={tw("accent-swatch")} style={{ "--swatch-a": theme.colors[0], "--swatch-b": theme.colors[1] } as CSSProperties}><i /></span>
            <span><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <b aria-hidden="true" />
          </button>)}
        </div>
      </section>
      <section className={tw("settings-card")}>
        <div className={tw("settings-card-heading")}><span><SteamLogo weight="fill" /></span><div><h2>Cuenta de Steam</h2><p>Importa todos los juegos de la cuenta, incluidos los que no están instalados.</p></div><i className={settings?.hasApiKey ? "connected" : ""}>{settings?.hasApiKey ? "CONECTADA" : settings?.steamId ? "CLAVE NECESARIA" : "SIN CONFIGURAR"}</i></div>
        <div className={tw("settings-form")}>
          <label><span>SteamID64</span><input value={steamId} onChange={(event) => setSteamId(event.target.value)} placeholder="7656119…" /></label>
          <label><span>Steam Web API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings?.hasApiKey ? "••••••••••••••••••••••••••••••••" : "32 caracteres"} /></label>
          <button className={tw("play")} disabled={saving || apiKey.length === 0} onClick={() => void connect()}>{saving ? "Conectando…" : settings?.hasApiKey ? "Actualizar clave" : "Conectar Steam"}</button>
        </div>
        <p className={tw("settings-note")}>La clave se usa directamente con la API oficial de Steam y se cifra en este equipo. El perfil debe permitir consultar los detalles de juegos.</p>
        {status && <div className={tw("settings-status")}>{status}</div>}
      </section>
      <section className={tw("settings-card sync-settings-card")}>
        <div className={tw("settings-card-heading")}><span><FolderOpen weight="fill" /></span><div><h2>Carpeta de sincronización</h2><p>Historial y partidas guardadas; el estado indica la carpeta local, no la subida de Google Drive.</p></div><i className={syncSettings?.status === "ready" ? "connected" : ""}>{syncSettings?.status === "ready" ? "DISPONIBLE" : syncSettings?.status === "missing" ? "NO DISPONIBLE" : syncSettings?.status === "error" ? "ERROR" : syncSettings?.folderPath ? "COMPROBANDO" : "SIN CONFIGURAR"}</i></div>
        <div className={tw("sync-folder-row")}><span><small>CARPETA ACTUAL</small><strong>{syncSettings?.folderPath ?? "Ninguna carpeta seleccionada"}</strong></span><button className={tw("cancel-button")} disabled={syncing} onClick={() => void chooseSyncFolder()}>{syncSettings?.folderPath ? "Cambiar carpeta" : "Elegir carpeta"}</button>{syncSettings?.folderPath && <button className={tw("play")} disabled={syncing} onClick={() => void syncNow()}>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</button>}</div>
        {syncSettings?.lastSyncedAt && <p className={tw("settings-note")}>Última sincronización: {new Date(syncSettings.lastSyncedAt).toLocaleString("es-ES")}</p>}
        {syncStatus && <div className={tw("settings-status")}>{syncStatus}</div>}
        <button className={tw("cancel-button")} disabled={syncing} onClick={() => void associateLudusavi()}>Asociar juegos existentes con Ludusavi</button>
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
    <div className={tw("modal-backdrop")} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={tw("add-game-modal")} role="dialog" aria-modal="true" aria-labelledby="add-game-title">
        <header><div><span className={tw("section-icon")}><Plus weight="bold" /></span><span><small>BIBLIOTECA LOCAL</small><h2 id="add-game-title">Añadir un juego</h2></span></div><button onClick={onClose} aria-label="Cerrar"><X /></button></header>
        <div className={tw("add-game-body")}>
          <div className={tw("game-fields")}>
            <label className={tw("game-name-field")}><span>Nombre del juego</span><input autoFocus value={title} onChange={(event) => { setTitle(event.target.value); setSelectedLudusavi(null); setAutomaticArtwork(null); }} placeholder="Por ejemplo, Hollow Knight" />
              {selectedLudusavi ? <div className={tw("ludusavi-selected")}>{automaticArtwork && <img src={automaticArtwork.coverUrl} alt="" />}<span><b>{selectedLudusavi.name}</b><small>{selectedLudusavi.steamAppId ? `Ludusavi · Steam ${selectedLudusavi.steamAppId}` : "Asociado con Ludusavi"}{automaticArtwork ? " · arte completado" : ""}</small></span><button type="button" onClick={() => { setSelectedLudusavi(null); setAutomaticArtwork(null); }}><X /></button></div> : (searchingLudusavi || ludusaviSuggestions.length > 0) ? <div className={tw("ludusavi-results")}>{searchingLudusavi && !ludusaviSuggestions.length ? <small>Consultando catálogo de partidas…</small> : ludusaviSuggestions.map((item) => <button type="button" key={item.name} onClick={() => void chooseLudusaviSuggestion(item)}><span><b>{item.name}</b><small>{item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}</small></span><Plus /></button>)}</div> : null}
            </label>
            <label><span>Ejecutable <em>Opcional</em></span><div className={tw("file-field")}><input readOnly value={executablePath} placeholder="Puedes configurarlo más adelante" /><button onClick={() => void chooseExecutable()}><FolderOpen /> Examinar</button></div></label>
            <div className={tw("modal-hint")}><GameController /><span>La carátula, el ejecutable y otros datos se pueden completar después desde la ficha del juego.</span></div>
          </div>
        </div>
        {error && <div className={tw("modal-error")}>{error}</div>}
        <footer><button className={tw("cancel-button")} onClick={onClose}>Cancelar</button><button className={tw("play")} disabled={saving || !title.trim()} onClick={() => void createGame()}>{saving ? "Añadiendo…" : "Añadir a la biblioteca"}</button></footer>
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

  return <div className={tw("modal-backdrop")} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={tw("artwork-modal")} role="dialog" aria-modal="true"><header><div><span className={tw("section-icon")}><Image weight="fill" /></span><span><small>PERSONALIZACIÓN</small><h2>Arte para {game.title}</h2></span></div><button onClick={onClose}><X /></button></header><div className={tw("artwork-search")}><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar un juego" /><button onClick={() => void uploadArtwork()}><FolderOpen /> Usar archivo</button></div>{error && <div className={tw("modal-error")}>{error}</div>}<div className={tw("artwork-results")}>{loading ? <div className={tw("artwork-loading")}>Buscando arte…</div> : suggestions.map((suggestion) => <button key={`${suggestion.provider}:${suggestion.providerId}`} onClick={() => void applySuggestion(suggestion)}><img src={suggestion.coverUrl} alt="" /><span><strong>{suggestion.title}</strong><small>{suggestion.provider === "steam" ? "Steam · portada y hero" : "Wikipedia · imagen principal"}</small></span></button>)}</div></section></div>;
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

  return <div className={tw("modal-backdrop")} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={tw("edit-game-modal")} role="dialog" aria-modal="true"><header><div><span className={tw("section-icon")}><PencilSimple /></span><span><small>JUEGO LOCAL</small><h2>Editar ficha</h2></span></div><button onClick={onClose}><X /></button></header><div className={tw("edit-game-fields")}><label><span>Nombre</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Ejecutable <em>Opcional</em></span><div className={tw("file-field")}><input readOnly value={executablePath} placeholder="Sin ejecutable configurado" /><button onClick={() => void chooseExecutable()}><FolderOpen /> Examinar</button>{executablePath && <button className={tw("clear-file")} onClick={() => setExecutablePath("")}><X /> Quitar</button>}</div></label><label className={tw("game-name-field")}><span>Juego en Ludusavi <em>Opcional</em></span><input value={ludusaviName} onChange={(event) => setLudusaviName(event.target.value)} placeholder="Buscar asociación o dejar vacío" />{ludusaviMatches.length > 0 && <div className={tw("ludusavi-results")}>{ludusaviMatches.map((item) => <button type="button" key={item.name} onClick={() => { setLudusaviName(item.name); setLudusaviMatches([]); if (item.steamAppId) setSteamAppId(item.steamAppId); }}><span><b>{item.name}</b><small>{item.steamAppId ? `Steam ${item.steamAppId}` : "Ludusavi"}</small></span><Plus /></button>)}</div>}</label><label><span>Steam AppID <em>Para logros locales</em></span><input inputMode="numeric" value={steamAppId} onChange={(event) => setSteamAppId(event.target.value.replace(/\D/g, ""))} placeholder="Ej. 1238840" /></label><label><span>Horas acumuladas</span><div className={tw("hours-field")}><input inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} /><b>horas</b></div></label><p>La asociación de Ludusavi localiza las partidas; el AppID permite leer logros locales.</p></div>{error && <div className={tw("modal-error")}>{error}</div>}<footer><button className={tw("cancel-button")} onClick={onClose}>Cancelar</button><button className={tw("play")} disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></section></div>;
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
    <main className={tw("app-shell")}>
      <aside className={tw("sidebar")}>
        <div className={tw("brand")}><span className={tw("brand-mark")}><NemetonMark /></span><span>Nemeton</span></div>
        <nav className={tw("primary-nav")}>
          <button className={tw(`nav-item ${view === "library" && !selected ? "active" : ""}`)} onClick={() => { setView("library"); setSelectedId(null); }}><GameController /> Biblioteca</button>
          <button className={tw(`nav-item ${view === "statistics" ? "active" : ""}`)} onClick={() => setView("statistics")}><ChartDonut /> Estadísticas</button>
          <button className={tw(`nav-item ${view === "settings" ? "active" : ""}`)} onClick={() => setView("settings")}><Gear /> Ajustes</button>
          <button className={tw("nav-item")} onClick={() => setShowAddGame(true)}><Plus /> Añadir juego</button>
        </nav>
        <div className={tw("library-heading")}><span>JUEGOS</span><span>{games.filter((game) => !game.hiddenFromLibrary && (game.source === "local" || game.installed)).length}</span></div>
        <div className={tw("game-list")}>
          {visibleGames.map((game) => (
            <button key={game.id} className={tw(`game-row ${selected?.id === game.id ? "selected" : ""} ${runningGameIds.has(game.id) ? "running" : ""}`)} onClick={() => { setGameMenu(null); setView("library"); setSelectedId(game.id); }} onContextMenu={(event) => { event.preventDefault(); setGameMenu({ game, x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 90) }); }}>
              <span className={tw("game-avatar")}>
                {game.title.slice(0, 1).toUpperCase()}
                {gameCoverUrl(game) && <img src={gameCoverUrl(game)!} alt="" onError={(event) => event.currentTarget.remove()} />}
              </span>
              <span><strong>{game.title}</strong><small>{runningGameIds.has(game.id) ? "Jugando ahora" : game.installed ? formatPlaytime(game.platformPlaytimeMinutes ?? game.playtimeMinutes) : "No instalado"}</small></span>
            </button>
          ))}
        </div>
      </aside>

      <section className={tw("content")}>
        <header className={tw("topbar")}>
          {view === "library" ? <label className={tw("search")}><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en tu biblioteca" /></label> : <span className={tw("topbar-title")}>{view === "statistics" ? <><ChartDonut /> Estadísticas</> : <><Gear /> Ajustes</>}</span>}
          {view === "library" && <button className={tw("steam-import")} disabled={scanning} onClick={() => void importSteam()}><SteamLogo />{scanning ? "Buscando…" : "Importar Steam"}</button>}
          <div className={tw("window-controls")}><button aria-label="Minimizar" onClick={() => void window.launcher.minimizeWindow()}><Minus /></button><button aria-label="Maximizar" onClick={() => void window.launcher.toggleMaximizeWindow()}><Square /></button><button className={tw("window-close")} aria-label="Cerrar" onClick={() => void window.launcher.closeWindow()}><X /></button></div>
        </header>

        {view === "statistics" ? <StatisticsView games={games} sessions={sessions} /> : view === "settings" ? <SettingsView settings={steamSettings} syncSettings={syncSettings} accentTheme={accentTheme} onAccentThemeChange={setAccentTheme} onLibraryUpdated={(snapshot) => { setGames(snapshot.games); setSessions(snapshot.sessions); }} onConnected={(snapshot, count) => { setGames(snapshot.games); setSessions(snapshot.sessions); setSteamSettings((current) => ({ steamId: current?.steamId ?? null, hasApiKey: true })); setMessage(`${count} juegos en tu cuenta de Steam`); }} onSynced={(snapshot, nextSettings) => { setGames(snapshot.games); setSessions(snapshot.sessions); setSyncSettings(nextSettings); setMessage("Historial manual sincronizado"); }} /> : selected ? (
          <div className={tw("game-view")}>
            <section className={tw("game-hero")}>
              <div className={tw("ambient")} />
              {gameHeroUrl(selected) && (
                <img className={tw("hero-art")} src={gameHeroUrl(selected)!} alt={`Arte de ${selected.title}`} onError={(event) => event.currentTarget.remove()} />
              )}
              <div className={tw("hero-shade")} />
              <div className={tw("hero-copy")}>
                <span className={tw("eyebrow")}>{runningGameIds.has(selected.id) ? "● JUGANDO AHORA" : selected.source === "steam" ? `STEAM · ${selected.installed ? "INSTALADO" : "EN TU CUENTA"}` : "JUEGO LOCAL"}</span>
                <h1>{selected.title}</h1>
                <p>{selected.installPath}</p>
                <div className={tw("stats")}><span><b>{formatPlaytime(selected.platformPlaytimeMinutes ?? selected.playtimeMinutes)}</b> {selected.source === "steam" ? "en Steam" : "tiempo total"}</span><span><b>{formatLastPlayed(selected.lastPlayedAt)}</b> última partida</span></div>
                <div className={tw("hero-actions")}><button className={tw(`play ${runningGameIds.has(selected.id) ? "running" : ""}`)} disabled={runningGameIds.has(selected.id) || (selected.source === "local" && !selected.installPath)} onClick={() => void launchSelected()}><Play weight="fill" /> {runningGameIds.has(selected.id) ? "Jugando" : selected.source === "local" && !selected.installPath ? "Sin ejecutable" : selected.installed ? "Jugar" : "Instalar"}</button>{selected.source === "local" && <button className={tw("cover-button")} onClick={() => setEditGame(selected)}><PencilSimple /> Editar</button>}<button className={tw("cover-button")} onClick={() => void chooseCover()}><Image /> Carátula</button></div>
              </div>
            </section>
            {selected.source === "local" && achievements && achievements.total === 0 && <section className={tw("achievements-section achievement-diagnostic")}><div className={tw("achievements-heading")}><div><span className={tw("section-icon")}><Trophy /></span><span><small>LOGROS LOCALES</small><strong>{achievements.status === "missing-app-id" ? "Falta identificar el juego" : achievements.status === "parse-error" ? "El archivo de logros no se pudo interpretar" : "Todavía no se encontró un estado local"}</strong></span></div></div><p>{achievements.status === "missing-app-id" ? "Asocia el juego con Ludusavi o añade su Steam AppID desde Editar." : achievements.status === "parse-error" ? `${achievements.source ?? "Formato desconocido"} · ${achievements.statePath ?? "ruta no disponible"}` : "Nemeton volverá a buscar mientras juegas. Algunos juegos no generan un archivo de logros compatible."}</p></section>}
            {achievements && achievements.total > 0 && (
              <section className={tw("achievements-section")}>
                <div className={tw("achievements-heading")}>
                  <div><span className={tw("section-icon")}><Trophy weight="fill" /></span><span><small>LOGROS{achievements.source ? ` · ${achievements.source.toLocaleUpperCase()}` : ""}</small><strong>{achievements.unlocked} de {achievements.total} desbloqueados</strong></span></div>
                  <b>{Math.round((achievements.unlocked / achievements.total) * 100)}%</b>
                </div>
                <div className={tw("achievement-progress")}><span style={{ width: `${(achievements.unlocked / achievements.total) * 100}%` }} /></div>
                <div className={tw("achievement-grid")}>
                  {achievements.items.slice(0, 8).map((achievement) => (
                    <article key={achievement.id} className={tw(`achievement ${achievement.achieved ? "unlocked" : "locked"}`)}>
                      <div className={tw("achievement-image")}>
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
          <section className={tw("empty-state")}>
            <span className={tw("empty-icon")}><SteamLogo weight="fill" /></span>
            <h1>Tu biblioteca, sin ruido</h1>
            <p>Importa los juegos instalados en Steam. Se guardarán únicamente en este ordenador.</p>
            <button className={tw("play")} disabled={scanning} onClick={() => void importSteam()}><SteamLogo /> Importar desde Steam</button>
          </section>
        )}
        <footer>{message}<span>{syncSettings?.folderPath ? "Sincronización automática activa" : "Sin sincronización"}</span></footer>
      </section>
      {showAddGame && <AddGameModal onClose={() => setShowAddGame(false)} onCreated={onLocalGameCreated} />}
      {artworkGame && <ArtworkModal game={artworkGame} onClose={() => setArtworkGame(null)} onUpdated={(snapshot) => setGames(snapshot.games)} />}
      {editGame && <EditGameModal game={editGame} onClose={() => setEditGame(null)} onUpdated={(snapshot) => setGames(snapshot.games)} />}
      {gameMenu && <div className={tw("game-context-backdrop")} onMouseDown={() => setGameMenu(null)} onContextMenu={(event) => { event.preventDefault(); setGameMenu(null); }}><div className={tw("game-context-menu")} style={{ left: gameMenu.x, top: gameMenu.y }} onMouseDown={(event) => event.stopPropagation()}><small>{gameMenu.game.title}</small><button onClick={async () => { try { const snapshot = await window.launcher.uninstallOrHide(gameMenu.game.id); setGames(snapshot.games); setSessions(snapshot.sessions); if (selectedId === gameMenu.game.id) setSelectedId(null); setMessage(gameMenu.game.source === "steam" && gameMenu.game.installed ? "Desinstalación abierta en Steam; historial conservado" : "Juego retirado de la biblioteca; historial conservado"); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo retirar el juego"); } finally { setGameMenu(null); } }}><X weight="bold" />{gameMenu.game.source === "steam" && gameMenu.game.installed ? "Desinstalar" : "Quitar de la biblioteca"}</button></div></div>}
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
