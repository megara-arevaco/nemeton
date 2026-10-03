import { recordOperation } from "../operation-metrics.js";
import { isTrustedDocument } from "./document.js";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  ipcContracts,
  type IpcArgs,
  type IpcChannel,
} from "../../shared/ipc-contracts.js";

let decorateSnapshot: (value: unknown) => unknown = (value) => value;

export function setSnapshotDecorator(decorate: typeof decorateSnapshot) {
  decorateSnapshot = decorate;
}

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
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
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

    const started = performance.now();
    let failed = false;

    try {
      return decorateSnapshot(await listener(event, ...(parsed.data as IpcArgs<K>)));
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (channel !== "performance:record") {
        recordOperation(`main:${channel}`, performance.now() - started, failed);
      }
    }
  });
}
