import { parentPort, workerData } from "node:worker_threads";
import { parseManifest } from "./ludusavi-parser.js";

parentPort?.postMessage(parseManifest(workerData));
