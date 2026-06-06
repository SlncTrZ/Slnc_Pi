import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceSettings } from "./settings";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type WorkerEvent =
  | { type: "ready"; pid?: number; torchVersion?: string; cudaAvailable?: boolean; cudaDevice?: string }
  | { type: "pong"; id?: string; pid?: number; modelLoaded?: boolean; torchVersion?: string; cudaAvailable?: boolean; cudaDevice?: string; listening?: boolean; mode?: string; awake?: boolean; lastError?: string }
  | { type: "status"; status: string; detail?: string }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "wake"; phrase: string }
  | { type: "audio_level"; energy: number; threshold: number; inSpeech?: boolean }
  | { type: "audio_accepted"; seconds: number }
  | { type: "audio_rejected"; reason: string; seconds?: number; minSeconds?: number }
  | { type: "download_progress"; message: string }
  | { type: "disconnected"; reason?: string }
  | { type: "error"; message: string };

export type WorkerClientOptions = Required<Pick<VoiceSettings, "workerHost" | "workerPort" | "workerCommand" | "logPath" | "wakePhrases" | "sampleRate">>;

export class VoiceWorkerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private socket: Socket | null = null;
  private buffer = "";
  private listeners = new Set<(event: WorkerEvent) => void>();
  private pendingPings = new Map<string, { resolve: (event: Extract<WorkerEvent, { type: "pong" }>) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private options: WorkerClientOptions) {}

  onEvent(listener: (event: WorkerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isProcessRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  startNonBlocking(): void {
    // First try to adopt an already-running compatible worker on the configured port.
    this.connectWithRetry(1, 0)
      .then(() => this.ping(1500)
        .then((health) => this.emit({ type: "status", status: "ready", detail: `pid=${health.pid ?? "?"} model=${health.modelLoaded ? "loaded" : "not-loaded"} cuda=${health.cudaAvailable ?? "?"} ${health.cudaDevice ?? ""}` }))
        .catch((error) => {
          this.disconnect();
          this.emit({ type: "error", message: `existing worker on ${this.options.workerHost}:${this.options.workerPort} did not answer health ping (${formatError(error)}). Run /voice cleanup-workers, then /voice start-worker.` });
        }))
      .catch(() => {
        this.spawnWorker();
      });
  }

  private spawnWorker(): void {
    if (this.isProcessRunning()) {
      if (!this.isConnected()) {
        this.connectWithRetry(20, 500).catch((error) => this.emit({ type: "error", message: `worker reconnect failed: ${formatError(error)}` }));
      }
      return;
    }
    mkdirSync(dirname(this.options.logPath), { recursive: true });
    const log = createWriteStream(this.options.logPath, { flags: "a" });
    const command = this.resolveWorkerCommand();
    this.child = spawn(command[0], command.slice(1), {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        VOICE_INPUT_HOST: this.options.workerHost,
        VOICE_INPUT_PORT: String(this.options.workerPort),
        VOICE_INPUT_SAMPLE_RATE: String(this.options.sampleRate),
        VOICE_INPUT_WAKE_PHRASES: JSON.stringify(this.options.wakePhrases),
        VOICE_INPUT_PARENT_PID: String(process.pid),
      },
    });
    log.write(`\n[voice-input] spawned ${command.join(" ")}\n`);
    this.child.stdout.pipe(log, { end: false });
    this.child.stderr.pipe(log, { end: false });
    this.child.on("exit", (code, signal) => {
      log.write(`[voice-input] worker exited code=${code} signal=${signal}\n`);
      this.child = null;
      this.emit({ type: "status", status: "stopped", detail: `worker exited code=${code} signal=${signal}` });
    });
    this.connectWithRetry(40, 500).catch((error) => this.emit({ type: "error", message: `worker connection failed: ${formatError(error)}` }));
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: this.options.workerHost, port: this.options.workerPort });
      socket.setNoDelay(true);
      socket.once("connect", () => {
        this.socket = socket;
        this.installSocketHandlers(socket);
        resolve();
      });
      socket.once("error", reject);
    });
  }

  async connectWithRetry(attempts: number, delayMs: number): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.connect();
        return;
      } catch {
        await delay(delayMs);
      }
    }
    throw new Error(`could not connect to ${this.options.workerHost}:${this.options.workerPort}`);
  }

  async ping(timeoutMs = 2000): Promise<Extract<WorkerEvent, { type: "pong" }>> {
    await this.connect();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(id);
        reject(new Error("worker ping timed out"));
      }, timeoutMs);
      this.pendingPings.set(id, { resolve, reject, timer });
      if (!this.send({ type: "ping", id }, false)) {
        clearTimeout(timer);
        this.pendingPings.delete(id);
        reject(new Error("worker socket is not connected"));
      }
    });
  }

  sendAudio(chunk: Buffer): boolean {
    return this.send({ type: "audio", data: chunk.toString("base64") }, false);
  }

  sendControl(type: string, data: Record<string, JsonValue> = {}): boolean {
    return this.send({ type, ...data }, true);
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  stop(): void {
    for (const [id, pending] of this.pendingPings) {
      clearTimeout(pending.timer);
      pending.reject(new Error("worker stopped"));
      this.pendingPings.delete(id);
    }
    if (this.isConnected()) this.sendControl("shutdown");
    this.disconnect();
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  private resolveWorkerCommand(): string[] {
    if (this.options.workerCommand.length) return this.options.workerCommand;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const workerDir = join(__dirname, "worker");
    const script = join(workerDir, "voice_worker.py");
    if (!existsSync(script)) throw new Error(`worker script missing: ${script}`);
    return ["uvx", "--refresh", "--from", workerDir, "pi-voice-worker"];
  }

  private installSocketHandlers(socket: Socket): void {
    socket.on("data", (data) => {
      this.buffer += data.toString("utf-8");
      let newline = this.buffer.indexOf("\n");
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (line) this.handleLine(line);
        newline = this.buffer.indexOf("\n");
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.emit({ type: "disconnected", reason: "socket closed" });
    });
    socket.on("error", (error) => {
      if (this.socket === socket) this.socket = null;
      this.emit({ type: "disconnected", reason: formatError(error) });
    });
  }

  private handleLine(line: string): void {
    try {
      const event = JSON.parse(line) as WorkerEvent;
      if (event.type === "pong" && event.id) {
        const pending = this.pendingPings.get(event.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingPings.delete(event.id);
          pending.resolve(event);
        }
      }
      this.emit(event);
    } catch (error) {
      this.emit({ type: "error", message: `invalid worker JSON: ${formatError(error)}` });
    }
  }

  private send(value: Record<string, JsonValue>, reportError: boolean): boolean {
    if (!this.socket || this.socket.destroyed) {
      if (reportError) this.emit({ type: "error", message: "worker socket is not connected" });
      return false;
    }
    return this.socket.write(`${JSON.stringify(value)}\n`);
  }

  private emit(event: WorkerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
