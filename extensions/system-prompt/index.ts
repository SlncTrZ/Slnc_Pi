import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, basename } from "node:path";
import { getAgentDir, type BeforeAgentStartEvent, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { openMenu, type MenuItem } from "./menu";

type SystemPromptMode = "default" | "custom";

type PromptProfile = {
	id: string;
	label: string;
	path: string;
	content: string;
};

type SystemPromptSettings = {
	mode?: SystemPromptMode;
	profileId?: string;
};

const SETTINGS_PATH = join(getAgentDir(), "system-prompt.json");
const PROMPTS_DIR = join(__dirname, "prompts");
const DEFAULT_PROFILE_ID = "validation-prompt";

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	return String(error);
}

function isSystemPromptMode(value: string | undefined): value is SystemPromptMode {
	return value === "default" || value === "custom";
}

function defaultSettings(): Required<SystemPromptSettings> {
	return {
		mode: "default",
		profileId: DEFAULT_PROFILE_ID,
	};
}

function normalizeSettings(settings: SystemPromptSettings): Required<SystemPromptSettings> {
	const defaults = defaultSettings();
	return {
		mode: isSystemPromptMode(settings.mode) ? settings.mode : defaults.mode,
		profileId: typeof settings.profileId === "string" && settings.profileId.trim() ? settings.profileId.trim() : defaults.profileId,
	};
}

function loadSettings(): Required<SystemPromptSettings> {
	if (!existsSync(SETTINGS_PATH)) return defaultSettings();
	try {
		const data = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as SystemPromptSettings;
		return normalizeSettings(data);
	} catch (error) {
		console.error(`[system-prompt] Failed to read ${SETTINGS_PATH}: ${formatError(error)}`);
		return defaultSettings();
	}
}

function saveSettings(settings: SystemPromptSettings): Required<SystemPromptSettings> {
	const normalized = normalizeSettings(settings);
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
	return normalized;
}

function formatProfileLabel(id: string): string {
	return id
		.split(/[-_]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function loadProfiles(): PromptProfile[] {
	if (!existsSync(PROMPTS_DIR)) return [];
	return readdirSync(PROMPTS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
		.map((entry) => {
			const path = join(PROMPTS_DIR, entry.name);
			const id = basename(entry.name, ".md");
			return {
				id,
				label: formatProfileLabel(id),
				path,
				content: readFileSync(path, "utf-8").trim(),
			};
		})
		.filter((profile) => profile.id.length > 0 && profile.content.length > 0)
		.sort((a, b) => a.label.localeCompare(b.label));
}

function getProfile(profiles: PromptProfile[], profileId: string): PromptProfile | undefined {
	return profiles.find((profile) => profile.id === profileId);
}

function appendProfile(systemPrompt: string, profile: PromptProfile): string {
	return `${systemPrompt}\n\nAdditional system-prompt profile (${profile.id}):\n\n${profile.content}`;
}

export default function systemPromptExtension(pi: ExtensionAPI) {
	let settings = loadSettings();
	const profiles = loadProfiles();

	function persist(next: SystemPromptSettings): void {
		settings = saveSettings(next);
	}

	function selectedProfileLabel(): string {
		const profile = getProfile(profiles, settings.profileId);
		return profile ? profile.label : `${settings.profileId} (missing)`;
	}

	function buildMenuTree(): MenuItem[] {
		const currentMode = settings.mode;
		const customLabel = currentMode === "custom" ? `Custom: ${selectedProfileLabel()}` : "Custom";
		return [
			{ type: "action", id: "mode:default", label: `${currentMode === "default" ? "✓ " : ""}Default` },
			{
				type: "submenu",
				id: "custom",
				label: `${currentMode === "custom" ? "✓ " : ""}${customLabel}`,
				children: () => {
					if (profiles.length === 0) {
						return [{ type: "action", id: "noop:no-profiles", label: "No profiles found in prompts/" }];
					}
					return profiles.map((profile) => ({
						type: "action" as const,
						id: `profile:${profile.id}`,
						label: `${settings.mode === "custom" && settings.profileId === profile.id ? "✓ " : ""}${profile.label}`,
					}));
				},
			},
		];
	}

	async function handleMenuAction(id: string): Promise<void> {
		if (id === "mode:default") {
			persist({ ...settings, mode: "default" });
			return;
		}

		if (id.startsWith("profile:")) {
			const profileId = id.slice("profile:".length);
			const profile = getProfile(profiles, profileId);
			if (!profile) return;
			persist({ mode: "custom", profileId: profile.id });
			return;
		}

	}

	pi.registerCommand("system-prompt", {
		description: "Choose a system prompt profile to append to Pi's default prompt",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("[system-prompt] The interactive menu requires Pi's UI mode.", "warning");
				return;
			}
			await openMenu(ctx, "System Prompt", buildMenuTree, handleMenuAction);
		},
	});

	pi.on("before_agent_start", async (event: BeforeAgentStartEvent) => {
		if (settings.mode !== "custom") return undefined;

		const profile = getProfile(profiles, settings.profileId);
		if (!profile) {
			console.error(`[system-prompt] Selected profile "${settings.profileId}" was not loaded. Run /system-prompt to select a valid profile, then /reload after changing profile files.`);
			return undefined;
		}

		return {
			systemPrompt: appendProfile(event.systemPrompt, profile),
		};
	});
}
