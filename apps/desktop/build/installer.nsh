; Native NSIS welcome: no web runtime, network or extra installer process.
!include nsDialogs.nsh
!include LogicLib.nsh
!define MUI_BGCOLOR "10131B"
!define MUI_TEXTCOLOR "EDF2EA"
!define MUI_INSTFILESPAGE_COLORS "B7FF64 10131B"
!include MUI2.nsh

!ifndef BUILD_UNINSTALLER
Var NemetonDialog
Var NemetonLogo
Var NemetonBitmap
Var NemetonFrame
Var NemetonTitleFont
Var NemetonBodyFont
Var NemetonMotion

!macro customWelcomePage
  Page custom NemetonWelcome
!macroend

Function NemetonAnimate
  IntOp $NemetonFrame $NemetonFrame + 1
  IntOp $NemetonFrame $NemetonFrame % 60
  StrCpy $0 $NemetonBitmap
  ${NSD_SetImage} $NemetonLogo "$PLUGINSDIR\nemeton-frames\frame-$NemetonFrame.bmp" $NemetonBitmap
  ${NSD_FreeImage} $0
FunctionEnd

Function NemetonToggleMotion
  Pop $0
  ${NSD_GetState} $NemetonMotion $1
  ${If} $1 == ${BST_CHECKED}
    ${NSD_KillTimer} NemetonAnimate
  ${Else}
    ${NSD_CreateTimer} NemetonAnimate 50
  ${EndIf}
FunctionEnd

Function NemetonWelcome
  !insertmacro MUI_HEADER_TEXT "Bienvenido a Nemeton" "Tu biblioteca. Tu tiempo. Tu mundo."
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\nemeton-frames"
  File "${BUILD_RESOURCES_DIR}\installer-assets\frame-*.bmp"
  nsDialogs::Create 1018
  Pop $NemetonDialog
  ${If} $NemetonDialog == error
    Abort
  ${EndIf}
  SetCtlColors $NemetonDialog EDF2EA 10131B
  CreateFont $NemetonTitleFont "Segoe UI" 22 700
  CreateFont $NemetonBodyFont "Segoe UI" 10 400
  ${NSD_CreateBitmap} 12u 12u 160 160 ""
  Pop $NemetonLogo
  StrCpy $NemetonFrame 0
  ${NSD_SetImage} $NemetonLogo "$PLUGINSDIR\nemeton-frames\frame-0.bmp" $NemetonBitmap
  ${NSD_CreateLabel} 140u 18u 158u 28u "NEMETON"
  Pop $0
  SetCtlColors $0 EDF2EA 10131B
  SendMessage $0 ${WM_SETFONT} $NemetonTitleFont 1
  ${NSD_CreateLabel} 140u 53u 158u 22u "Todos tus juegos. Un solo lugar."
  Pop $0
  SetCtlColors $0 B7FF64 10131B
  SendMessage $0 ${WM_SETFONT} $NemetonBodyFont 1
  ${NSD_CreateLabel} 140u 82u 158u 50u "Reúne tus bibliotecas, revive tus logros y protege tus partidas.$\r$\n$\r$\nInstala Nemeton y empieza a jugar."
  Pop $0
  SetCtlColors $0 C4CCBF 10131B
  ${NSD_CreateCheckbox} 12u 126u 125u 14u "Pausar animación"
  Pop $NemetonMotion
  System::Call 'uxtheme::SetWindowTheme(p $NemetonMotion, w "", w "")'
  SetCtlColors $NemetonMotion C4CCBF 10131B
  ${NSD_OnClick} $NemetonMotion NemetonToggleMotion
  ; Respect Windows' client-area animation accessibility preference.
  System::Call 'user32::SystemParametersInfoW(i 0x1042, i 0, *i .r0, i 0)'
  ${If} $0 == 0
    ${NSD_Check} $NemetonMotion
  ${Else}
    ${NSD_CreateTimer} NemetonAnimate 50
  ${EndIf}
  nsDialogs::Show
  ${NSD_KillTimer} NemetonAnimate
  ${NSD_FreeImage} $NemetonBitmap
  System::Call 'gdi32::DeleteObject(p $NemetonTitleFont)'
  System::Call 'gdi32::DeleteObject(p $NemetonBodyFont)'
FunctionEnd
!endif
