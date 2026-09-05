import { isTrustedDocument } from "./document.js";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  ipcContracts,
  type IpcArgs,
  type IpcChannel,
} from "../../shared/ipc-contracts.js";

const trustedDocuments = new Map<number, string>();

export function trustWindow(window: BrowserWindow, documentUrl: string) {
  trustedDocuments.set(window.webContents.id, documentUrl);
  window.webContents.once("destroyed", () =>
    trustedDocuments.delete(window.webContents.id),
  );
}

export function handle<K extends IpcChannel, T>(
  channel: K,
  listener: (event: IpcMainInvokeEvent, ...args: IpcArgs<K>) => T,
) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    const expected = trustedDocuments.get(event.sender.id);

    if (
      !expected ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedDocument(event.senderFrame.url, expected)
    ) {
      throw new Error("Origen IPC no autorizado");
    }

    const parsed = ipcContracts[channel].safeParse(args);

    if (!parsed.success) {
      throw new Error(`Argumentos no válidos para ${channel}`);
    }
    return listener(event, ...(parsed.data as IpcArgs<K>));
  });
}
