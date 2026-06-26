import { getAgentDir as getPiAgentDir } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_PROJECT_CONFIG_DIR = ".pi";

function expandConfiguredDir(configured: string): string {
  if (configured === "~") return homedir();
  if (configured.startsWith("~/")) return resolve(homedir(), configured.slice(2));
  return resolve(configured);
}

function normalizeCommandName(value: string | undefined): string | undefined {
  const name = basename(value ?? "").toLowerCase().replace(/\.(cmd|ps1|exe|js|mjs|cjs)$/i, "");
  return name || undefined;
}

function getConfiguredAgentDir(): string | undefined {
  const explicit = process.env.PI_CODING_AGENT_DIR?.trim() || process.env.EMI_CODING_AGENT_DIR?.trim();
  if (explicit) return expandConfiguredDir(explicit);

  for (const [key, value] of Object.entries(process.env)) {
    if (key.endsWith("_CODING_AGENT_DIR") && value?.trim()) {
      return expandConfiguredDir(value.trim());
    }
  }

  return undefined;
}

function inferAgentDirFromCommand(): string | undefined {
  const command = normalizeCommandName(process.argv[1]);
  if (!command || command === "node") return undefined;
  if (command === "pi" || command === "emi") return join(homedir(), `.${command}`, "agent");
  return undefined;
}

export function getAgentDir(): string {
  return getConfiguredAgentDir() ?? inferAgentDirFromCommand() ?? getPiAgentDir();
}

export function getAgentPath(...segments: string[]): string {
  return join(getAgentDir(), ...segments);
}

export function getProjectConfigDirName(): string {
  const agentDir = getAgentDir();
  const agentLeaf = basename(agentDir);
  const parentLeaf = basename(dirname(agentDir));
  if (agentLeaf === "agent" && /^\.[A-Za-z0-9._-]+$/.test(parentLeaf)) {
    return parentLeaf;
  }
  return DEFAULT_PROJECT_CONFIG_DIR;
}
