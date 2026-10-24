export const downloadTranslations = {
  es: {
    "downloads.title": "Descargas",
    "downloads.description":
      "Pega enlaces o abre un torrent. Descarga con Real-Debrid o BitTorrent y controla cada archivo.",
    "downloads.queue": "Cola de descargas",
    "downloads.configuration": "Configuración",
    "downloads.addDownload": "Añadir descarga",
    "downloads.newDownload": "Nueva descarga",
    "downloads.links": "Enlaces magnet o HTTPS · uno por línea",
    "downloads.linkPlaceholder": "Pega aquí uno o varios enlaces…",
    "downloads.invalidLinks":
      "Introduce entre 1 y 50 enlaces magnet o HTTPS válidos, uno por línea.",
    "downloads.name": "Nombre de la descarga",
    "downloads.optional": "Opcional · se obtiene del enlace",
    "downloads.method": "Descargar con",
    "downloads.torrent": "BitTorrent integrado",
    "downloads.addQueue": "Añadir a la cola",
    "downloads.openTorrent": "Abrir .torrent",
    "downloads.change": "Cambiar",
    "downloads.parallel": "Hasta {{count}} tareas simultáneas",
    "downloads.connectHint":
      "Para usar Real-Debrid, conecta tu cuenta en Configuración.",
    "downloads.token": "Clave API de Real-Debrid",
    "downloads.tokenHelp":
      "Obtén tu clave personal en real-debrid.com/apitoken. Se comprueba la cuenta antes de conectarla.",
    "downloads.connect": "Conectar cuenta",
    "downloads.disconnect": "Desconectar",
    "downloads.connected": "Conectado como {{username}} · caduca {{expiration}}",
    "downloads.sessionToken":
      "El cifrado seguro no está disponible: la clave solo se conserva durante esta sesión.",
    "downloads.folder": "Carpeta de descargas",
    "downloads.chooseFolder": "Elegir carpeta",
    "downloads.noFolder": "Elige dónde guardar los archivos antes de descargar.",
    "downloads.torrentHelp":
      "BitTorrent descarga dentro de Nemeton y comparte fragmentos mientras descarga. Se detiene al terminar. Nemeton debe permanecer abierto.",
    "downloads.pauseResume": "Pausa y reanudación",
    "downloads.pauseHelp":
      "Puedes controlar cada archivo o toda la tarea. Al cerrar Nemeton, las descargas quedan pausadas. Cancelar conserva los datos guardados para reintentarlo. La pausa de Real-Debrid detiene la transferencia al equipo; la preparación en su nube puede continuar.",
    "downloads.emptyQueue": "Todavía no hay descargas",
    "downloads.emptyQueueHelp":
      "Añade enlaces o abre un archivo .torrent. Podrás elegir los archivos antes de descargar un torrent con varios contenidos.",
    "downloads.selectFiles": "Elige los archivos que quieres descargar",
    "downloads.selectAll": "Seleccionar todos",
    "downloads.downloadSelected": "Descargar seleccionados ({{count}})",
    "downloads.fileProgress": "Progreso de {{name}}",
    "downloads.cloudPreparation": "Preparación en Real-Debrid",
    "downloads.cloudProgress": "Preparando en Real-Debrid: {{progress}} %",
    "downloads.pause": "Pausar tarea",
    "downloads.resume": "Reanudar tarea",
    "downloads.cancel": "Cancelar tarea",
    "downloads.pauseFile": "Pausar archivo",
    "downloads.resumeFile": "Reanudar archivo",
    "downloads.cancelFile": "Cancelar archivo",
    "downloads.retry": "Reintentar",
    "downloads.remove": "Quitar del historial",
    "downloads.removeHelp": "Conserva los archivos descargados y los datos parciales.",
    "downloads.open": "Abrir carpeta",
    "downloads.queued": "En cola",
    "downloads.preparing": "Preparando",
    "downloads.waiting-selection": "Elegir archivos",
    "downloads.downloading": "Descargando",
    "downloads.paused": "Pausada",
    "downloads.completed": "Completada",
    "downloads.cancelled": "Cancelada",
    "downloads.interrupted": "Interrumpida",
    "downloads.error": "Error",
    "downloads.peers": "{{count}} pares",
    "downloads.restarted":
      "El servidor no permitió reanudar con seguridad: este archivo se ha iniciado de nuevo.",
    "downloads.failure":
      "No se pudo completar la operación. Comprueba la conexión, el espacio disponible, el enlace y tu cuenta, y vuelve a intentarlo.",
    "downloads.failure.choose-folder":
      "Elige una carpeta de descargas en Configuración.",
    "downloads.failure.connect-real-debrid":
      "Conecta tu cuenta de Real-Debrid en Configuración.",
    "downloads.failure.active-real-debrid":
      "Pausa las tareas de Real-Debrid antes de desconectar la cuenta.",
    "downloads.failure.premium-required":
      "Real-Debrid requiere una cuenta premium activa.",
    "downloads.failure.real-debrid-401":
      "La clave de Real-Debrid no es válida o ha caducado. Vuelve a conectar la cuenta.",
    "downloads.failure.real-debrid-403":
      "Real-Debrid ha rechazado la solicitud. Comprueba el estado premium de tu cuenta.",
    "downloads.failure.real-debrid-429":
      "Real-Debrid ha limitado las solicitudes. Espera un poco antes de reanudar.",
    "downloads.failure.already-queued":
      "Este enlace ya está añadido. Usa los controles de su tarea.",
    "downloads.failure.invalid-torrent":
      "El archivo .torrent no es válido o supera 8 MB.",
    "downloads.failure.invalid-range":
      "El servidor devolvió un tramo incorrecto. Se han conservado los datos parciales.",
    "downloads.failure.file-changed":
      "El archivo remoto ha cambiado. No se han mezclado sus datos con los descargados.",
    "downloads.failure.destination-exists":
      "Ya existe un archivo diferente en el destino. No se ha sobrescrito.",
    "downloads.failure.save-failed":
      "No se pudo guardar el estado de la descarga. Comprueba el espacio disponible.",
    "downloads.failure.remote-torrent-failed":
      "Real-Debrid no pudo obtener el torrent. Comprueba su disponibilidad y vuelve a intentarlo.",
    "downloads.saved": "Configuración actualizada",
    "downloads.added": "Descarga añadida a la cola",
    "downloads.busy": "Procesando…",
    "downloads.loading": "Cargando descargas…",
    "downloads.loadFailed": "No se pudieron cargar las descargas.",
  },
  en: {
    "downloads.title": "Downloads",
    "downloads.description":
      "Paste links or open a torrent. Download with Real-Debrid or BitTorrent and control each file.",
    "downloads.queue": "Download queue",
    "downloads.configuration": "Configuration",
    "downloads.addDownload": "Add download",
    "downloads.newDownload": "New download",
    "downloads.links": "Magnet or HTTPS links · one per line",
    "downloads.linkPlaceholder": "Paste one or more links here…",
    "downloads.invalidLinks":
      "Enter between 1 and 50 valid magnet or HTTPS links, one per line.",
    "downloads.name": "Download name",
    "downloads.optional": "Optional · derived from the link",
    "downloads.method": "Download with",
    "downloads.torrent": "Built-in BitTorrent",
    "downloads.addQueue": "Add to queue",
    "downloads.openTorrent": "Open .torrent",
    "downloads.change": "Change",
    "downloads.parallel": "Up to {{count}} simultaneous tasks",
    "downloads.connectHint":
      "Connect your account in Configuration to use Real-Debrid.",
    "downloads.token": "Real-Debrid API key",
    "downloads.tokenHelp":
      "Get your personal key at real-debrid.com/apitoken. Your account is checked before connecting.",
    "downloads.connect": "Connect account",
    "downloads.disconnect": "Disconnect",
    "downloads.connected": "Connected as {{username}} · expires {{expiration}}",
    "downloads.sessionToken":
      "Secure encryption is unavailable: your key is kept only for this session.",
    "downloads.folder": "Download folder",
    "downloads.chooseFolder": "Choose folder",
    "downloads.noFolder": "Choose where to save files before downloading.",
    "downloads.torrentHelp":
      "BitTorrent downloads inside Nemeton and shares pieces while downloading. It stops when complete. Keep Nemeton open.",
    "downloads.pauseResume": "Pause and resume",
    "downloads.pauseHelp":
      "Control each file or the entire task. Downloads stay paused when Nemeton closes. Cancelling keeps saved data for retrying. Pausing Real-Debrid stops transfers to your computer; cloud preparation may continue.",
    "downloads.emptyQueue": "No downloads yet",
    "downloads.emptyQueueHelp":
      "Add links or open a .torrent file. You can choose which files to download from torrents with multiple files.",
    "downloads.selectFiles": "Choose the files to download",
    "downloads.selectAll": "Select all",
    "downloads.downloadSelected": "Download selected ({{count}})",
    "downloads.fileProgress": "Progress for {{name}}",
    "downloads.cloudPreparation": "Real-Debrid preparation",
    "downloads.cloudProgress": "Preparing in Real-Debrid: {{progress}} %",
    "downloads.pause": "Pause task",
    "downloads.resume": "Resume task",
    "downloads.cancel": "Cancel task",
    "downloads.pauseFile": "Pause file",
    "downloads.resumeFile": "Resume file",
    "downloads.cancelFile": "Cancel file",
    "downloads.retry": "Retry",
    "downloads.remove": "Remove from history",
    "downloads.removeHelp": "Keeps downloaded files and partial data.",
    "downloads.open": "Open folder",
    "downloads.queued": "Queued",
    "downloads.preparing": "Preparing",
    "downloads.waiting-selection": "Choose files",
    "downloads.downloading": "Downloading",
    "downloads.paused": "Paused",
    "downloads.completed": "Completed",
    "downloads.cancelled": "Cancelled",
    "downloads.interrupted": "Interrupted",
    "downloads.error": "Error",
    "downloads.peers": "{{count}} peers",
    "downloads.restarted":
      "The server did not allow a safe resume: this file restarted from the beginning.",
    "downloads.failure":
      "The operation failed. Check connectivity, free space, link and account, then try again.",
    "downloads.failure.choose-folder": "Choose a download folder in Configuration.",
    "downloads.failure.connect-real-debrid":
      "Connect your Real-Debrid account in Configuration.",
    "downloads.failure.active-real-debrid":
      "Pause Real-Debrid tasks before disconnecting your account.",
    "downloads.failure.premium-required":
      "Real-Debrid requires an active premium account.",
    "downloads.failure.real-debrid-401":
      "Your Real-Debrid key is invalid or expired. Reconnect your account.",
    "downloads.failure.real-debrid-403":
      "Real-Debrid rejected the request. Check your account's premium status.",
    "downloads.failure.real-debrid-429":
      "Real-Debrid is limiting requests. Wait a moment before resuming.",
    "downloads.failure.already-queued":
      "This link is already added. Use its task controls.",
    "downloads.failure.invalid-torrent":
      "The .torrent file is invalid or larger than 8 MB.",
    "downloads.failure.invalid-range":
      "The server returned an incorrect range. Partial data has been preserved.",
    "downloads.failure.file-changed":
      "The remote file changed. Its data was not mixed with your partial download.",
    "downloads.failure.destination-exists":
      "A different file already exists at the destination. It was not overwritten.",
    "downloads.failure.save-failed":
      "Could not save download state. Check your free space.",
    "downloads.failure.remote-torrent-failed":
      "Real-Debrid could not retrieve the torrent. Check its availability and retry.",
    "downloads.saved": "Configuration updated",
    "downloads.added": "Download added to queue",
    "downloads.busy": "Working…",
    "downloads.loading": "Loading downloads…",
    "downloads.loadFailed": "Could not load downloads.",
  },
};
