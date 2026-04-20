/**
 * Agent Sound Extension
 *
 * Global pi extension that plays configurable sounds when an agent finishes or
 * asks for user input. Includes an interactive /agent-sound command.
 *
 * Install location:
 *   ~/.pi/agent/extensions/agent-sound/index.ts
 *
 * Then run /reload in each active pi session.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir, platform } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const EXTENSION_DIR = join(homedir(), ".pi", "agent", "extensions", "agent-sound");
const CONFIG_PATH = join(EXTENSION_DIR, "config.json");
const CACHE_DIR = join(EXTENSION_DIR, "cache");
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const SYSTEM_SOUND_DIR = "/System/Library/Sounds";

const DEFAULT_COMPLETION_SOUND = "Glass";
const DEFAULT_INPUT_SOUND = "Ping";

type SoundEventKey = "completion" | "ask_user" | "interview" | "input_request";

type SoundSource =
	| {
			kind: "system";
			name: string;
	  }
	| {
			kind: "file";
			path: string;
			original?: string;
	  }
	| {
			kind: "silent";
	  };

interface SoundConfig {
	version: 2;
	sounds: Record<SoundEventKey, SoundSource>;
}

const SOUND_EVENT_INFO: Record<
	SoundEventKey,
	{
		label: string;
		description: string;
		defaultSource: SoundSource;
		testMessage: string;
	}
> = {
	completion: {
		label: "Completion",
		description: "When an agent finishes and is ready for the next prompt",
		defaultSource: { kind: "system", name: DEFAULT_COMPLETION_SOUND },
		testMessage: "Done. Ready for input.",
	},
	ask_user: {
		label: "ask_user",
		description: "When a session asks a blocking ask_user / ask_user_question question",
		defaultSource: { kind: "system", name: DEFAULT_INPUT_SOUND },
		testMessage: "Waiting for your input via ask_user.",
	},
	interview: {
		label: "interview",
		description: "When a session opens an interview form",
		defaultSource: { kind: "system", name: DEFAULT_INPUT_SOUND },
		testMessage: "Waiting for your input via interview.",
	},
	input_request: {
		label: "Generic input request",
		description: "Fallback for other user-input request tools like request_user_input",
		defaultSource: { kind: "system", name: DEFAULT_INPUT_SOUND },
		testMessage: "Waiting for your input.",
	},
};

const SOUND_EVENT_KEYS = Object.keys(SOUND_EVENT_INFO) as SoundEventKey[];

const INPUT_REQUEST_TOOL_TO_EVENT: Record<string, SoundEventKey> = {
	ask_user: "ask_user",
	ask_user_question: "ask_user",
	interview: "interview",
	request_user_input: "input_request",
};

let cachedConfig: SoundConfig | null = null;
let hasOhPiCache: boolean | null = null;

function cloneSource(source: SoundSource): SoundSource {
	if (source.kind === "system") return { kind: "system", name: source.name };
	if (source.kind === "file") return { kind: "file", path: source.path, original: source.original };
	return { kind: "silent" };
}

function createDefaultConfig(): SoundConfig {
	return {
		version: 2,
		sounds: {
			completion: cloneSource(SOUND_EVENT_INFO.completion.defaultSource),
			ask_user: cloneSource(SOUND_EVENT_INFO.ask_user.defaultSource),
			interview: cloneSource(SOUND_EVENT_INFO.interview.defaultSource),
			input_request: cloneSource(SOUND_EVENT_INFO.input_request.defaultSource),
		},
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sha1(value: string): string {
	return createHash("sha1").update(value).digest("hex");
}

function expandHome(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	return value;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function isUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function isYouTubeUrl(value: string): boolean {
	if (!isUrl(value)) return false;
	const host = new URL(value).hostname.toLowerCase();
	return host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com");
}

function hasCommand(command: string): boolean {
	if (platform() === "win32") {
		return spawnSync("where", [command], { stdio: "ignore" }).status === 0;
	}
	return spawnSync("sh", ["-lc", `command -v ${shellQuote(command)} >/dev/null 2>&1`], {
		stdio: "ignore",
	}).status === 0;
}

function fireAndForget(command: string, args: string[]): void {
	try {
		const child = spawn(command, args, {
			stdio: "ignore",
			detached: true,
		});
		child.on("error", () => undefined);
		child.unref();
	} catch {
		// Ignore playback/notification errors.
	}
}

function runShellDetached(script: string): void {
	if (platform() === "win32") {
		fireAndForget("powershell.exe", ["-NoProfile", "-Command", script]);
		return;
	}
	fireAndForget("sh", ["-lc", script]);
}

function notifyOSC777(title: string, body: string): void {
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
	process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
	process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function windowsToastScript(title: string, body: string): string {
	const safeTitle = title.replace(/'/g, "''");
	const safeBody = body.replace(/'/g, "''");
	const type = "Windows.UI.Notifications";
	return [
		`[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
		`$template = [${type}.ToastTemplateType]::ToastText02`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent($template)`,
		`$text = $xml.GetElementsByTagName('text')`,
		`$text.Item(0).AppendChild($xml.CreateTextNode('${safeTitle}')) > $null`,
		`$text.Item(1).AppendChild($xml.CreateTextNode('${safeBody}')) > $null`,
		`$toast = [${type}.ToastNotification]::new($xml)`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('pi').Show($toast)`,
	].join("; ");
}

function terminalNotify(title: string, body: string): void {
	try {
		if (platform() === "win32" || process.env.WT_SESSION) {
			fireAndForget("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
			return;
		}
		if (!process.stdout.isTTY) return;
		if (process.env.KITTY_WINDOW_ID) {
			notifyOSC99(title, body);
			return;
		}
		notifyOSC777(title, body);
	} catch {
		// Ignore notification errors.
	}
}

function normalizeSource(candidate: unknown, fallback: SoundSource): SoundSource {
	if (!candidate || typeof candidate !== "object") return cloneSource(fallback);

	const source = candidate as Partial<SoundSource> & Record<string, unknown>;
	if (source.kind === "system" && typeof source.name === "string" && source.name.trim()) {
		return { kind: "system", name: source.name.trim() };
	}
	if (source.kind === "file" && typeof source.path === "string" && source.path.trim()) {
		return {
			kind: "file",
			path: source.path.trim(),
			original: typeof source.original === "string" ? source.original : undefined,
		};
	}
	if (source.kind === "silent") {
		return { kind: "silent" };
	}
	return cloneSource(fallback);
}

function normalizeConfig(candidate: unknown): SoundConfig {
	const fallback = createDefaultConfig();
	if (!candidate || typeof candidate !== "object") return fallback;
	const parsed = candidate as Record<string, unknown>;

	if (parsed.version === 2 && parsed.sounds && typeof parsed.sounds === "object") {
		const sounds = parsed.sounds as Record<string, unknown>;
		return {
			version: 2,
			sounds: {
				completion: normalizeSource(sounds.completion, fallback.sounds.completion),
				ask_user: normalizeSource(sounds.ask_user, fallback.sounds.ask_user),
				interview: normalizeSource(sounds.interview, fallback.sounds.interview),
				input_request: normalizeSource(sounds.input_request, fallback.sounds.input_request),
			},
		};
	}

	if (parsed.source) {
		const migrated = normalizeSource(parsed.source, fallback.sounds.completion);
		return {
			version: 2,
			sounds: {
				completion: cloneSource(migrated),
				ask_user: cloneSource(migrated),
				interview: cloneSource(migrated),
				input_request: cloneSource(migrated),
			},
		};
	}

	return fallback;
}

async function ensureDirs(): Promise<void> {
	await mkdir(CACHE_DIR, { recursive: true });
}

async function saveConfig(config: SoundConfig): Promise<void> {
	await ensureDirs();
	cachedConfig = config;
	await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function loadConfig(): Promise<SoundConfig> {
	if (cachedConfig) return cachedConfig;
	await ensureDirs();

	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		const normalized = normalizeConfig(parsed);
		cachedConfig = normalized;
		if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
			await saveConfig(normalized);
		}
		return normalized;
	} catch {
		const config = createDefaultConfig();
		await saveConfig(config);
		return config;
	}
}

async function updateEventSound(eventKey: SoundEventKey, source: SoundSource): Promise<SoundConfig> {
	const config = await loadConfig();
	const next: SoundConfig = {
		version: 2,
		sounds: {
			...config.sounds,
			[eventKey]: cloneSource(source),
		},
	};
	await saveConfig(next);
	return next;
}

async function resetConfig(): Promise<SoundConfig> {
	const config = createDefaultConfig();
	await saveConfig(config);
	return config;
}

async function hasOhPiInstalled(): Promise<boolean> {
	if (hasOhPiCache !== null) return hasOhPiCache;
	try {
		const raw = await readFile(SETTINGS_PATH, "utf8");
		const parsed = JSON.parse(raw) as { packages?: unknown[] };
		const packages = Array.isArray(parsed.packages) ? parsed.packages : [];
		hasOhPiCache = packages.some((entry) => {
			if (typeof entry === "string") return entry === "npm:oh-pi";
			if (entry && typeof entry === "object" && "source" in entry) {
				return (entry as { source?: string }).source === "npm:oh-pi";
			}
			return false;
		});
		return hasOhPiCache;
	} catch {
		hasOhPiCache = false;
		return false;
	}
}

function describeSource(source: SoundSource): string {
	if (source.kind === "silent") return "disabled";
	if (source.kind === "system") return `system:${source.name}`;
	return source.original ? `${source.path} (from ${source.original})` : source.path;
}

function formatStatus(config: SoundConfig): string {
	return SOUND_EVENT_KEYS.map((eventKey) => {
		const info = SOUND_EVENT_INFO[eventKey];
		return `${info.label}: ${describeSource(config.sounds[eventKey])}`;
	}).join("\n");
}

function shortProjectName(cwd: string): string {
	return basename(cwd) || cwd;
}

function buildSystemSoundPath(name: string): string {
	return join(SYSTEM_SOUND_DIR, `${name}.aiff`);
}

function buildPlaybackScript(source: SoundSource): string | null {
	if (source.kind === "silent") return null;

	if (platform() === "darwin") {
		if (source.kind === "system") {
			const systemSoundPath = buildSystemSoundPath(source.name);
			return `afplay ${shellQuote(systemSoundPath)} >/dev/null 2>&1 || osascript -e 'beep' >/dev/null 2>&1 || true`;
		}
		const filePath = shellQuote(source.path);
		return [
			`afplay ${filePath} >/dev/null 2>&1`,
			`(command -v ffplay >/dev/null 2>&1 && ffplay -nodisp -autoexit -loglevel quiet ${filePath} >/dev/null 2>&1)`,
			`(command -v play >/dev/null 2>&1 && play -q ${filePath} >/dev/null 2>&1)`,
			`osascript -e 'beep' >/dev/null 2>&1`,
			"true",
		].join(" || ");
	}

	if (platform() === "linux") {
		if (source.kind === "system") {
			return "printf '\\a' >/dev/null 2>&1 || true";
		}
		const filePath = shellQuote(source.path);
		return [
			`(command -v paplay >/dev/null 2>&1 && paplay ${filePath} >/dev/null 2>&1)`,
			`(command -v aplay >/dev/null 2>&1 && aplay ${filePath} >/dev/null 2>&1)`,
			`(command -v ffplay >/dev/null 2>&1 && ffplay -nodisp -autoexit -loglevel quiet ${filePath} >/dev/null 2>&1)`,
			`(command -v play >/dev/null 2>&1 && play -q ${filePath} >/dev/null 2>&1)`,
			"printf '\\a' >/dev/null 2>&1",
			"true",
		].join(" || ");
	}

	if (platform() === "win32") {
		if (source.kind === "system") {
			return "[console]::beep(880,250)";
		}
		const safePath = source.path.replace(/'/g, "''");
		return [
			`$player = New-Object System.Media.SoundPlayer '${safePath}'`,
			"try { $player.PlaySync() } catch { [console]::beep(880,250) }",
		].join("; ");
	}

	return null;
}

async function playSoundSource(source: SoundSource): Promise<void> {
	if (source.kind === "file" && !(await pathExists(source.path))) {
		// Missing file -> stay quiet here and let caller decide whether to reconfigure.
		return;
	}
	const script = buildPlaybackScript(source);
	if (!script) return;
	runShellDetached(script);
}

async function playSoundForEvent(eventKey: SoundEventKey): Promise<void> {
	const config = await loadConfig();
	const source = config.sounds[eventKey] ?? SOUND_EVENT_INFO[eventKey].defaultSource;
	await playSoundSource(source);
}

async function downloadAudioFile(url: string): Promise<SoundSource> {
	await ensureDirs();
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Download failed with HTTP ${response.status}`);
	}

	const urlExt = extname(new URL(url).pathname);
	const contentType = response.headers.get("content-type") || "";
	const contentTypeExt = contentType.includes("wav")
		? ".wav"
		: contentType.includes("mpeg")
			? ".mp3"
			: contentType.includes("mp4") || contentType.includes("m4a")
				? ".m4a"
				: contentType.includes("aiff")
					? ".aiff"
					: contentType.includes("ogg")
						? ".ogg"
						: contentType.includes("caf")
							? ".caf"
							: ".bin";
	const finalExt = urlExt || contentTypeExt;
	const targetPath = join(CACHE_DIR, `sound-${sha1(url)}${finalExt}`);
	const buffer = Buffer.from(await response.arrayBuffer());
	await writeFile(targetPath, buffer);
	return { kind: "file", path: targetPath, original: url };
}

async function downloadYouTubeAudio(url: string): Promise<SoundSource> {
	if (!hasCommand("yt-dlp")) {
		throw new Error("yt-dlp is required for YouTube audio. Install it and try again.");
	}

	await ensureDirs();
	const baseName = `youtube-${sha1(url).slice(0, 12)}`;
	const outputTemplate = join(CACHE_DIR, `${baseName}.%(ext)s`);

	await new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(
			"yt-dlp",
			[
				"-x",
				"--audio-format",
				"mp3",
				"--no-playlist",
				"-o",
				outputTemplate,
				url,
			],
			{ stdio: "ignore" },
		);
		child.on("error", rejectPromise);
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else rejectPromise(new Error(`yt-dlp exited with code ${code ?? -1}`));
		});
	});

	const files = await readdir(CACHE_DIR);
	const match = files
		.filter((file) => file.startsWith(`${baseName}.`))
		.sort()
		.reverse()[0];
	if (!match) {
		throw new Error("yt-dlp finished but no audio file was written.");
	}
	return { kind: "file", path: join(CACHE_DIR, match), original: url };
}

async function resolveSourceInput(input: string): Promise<SoundSource> {
	const trimmed = input.trim();
	if (!trimmed) throw new Error("Missing sound source.");
	if (trimmed === "silent" || trimmed === "off" || trimmed === "disabled") {
		return { kind: "silent" };
	}
	if (trimmed.startsWith("system:")) {
		const name = trimmed.slice("system:".length).trim() || DEFAULT_COMPLETION_SOUND;
		return { kind: "system", name };
	}
	if (isUrl(trimmed)) {
		if (isYouTubeUrl(trimmed)) return downloadYouTubeAudio(trimmed);
		return downloadAudioFile(trimmed);
	}

	const resolvedPath = resolve(expandHome(trimmed));
	if (!(await pathExists(resolvedPath))) {
		throw new Error(`File not found: ${resolvedPath}`);
	}
	return { kind: "file", path: resolvedPath };
}

function getEventForTool(toolName: string): SoundEventKey | null {
	return INPUT_REQUEST_TOOL_TO_EVENT[toolName] ?? null;
}

function parseEventToken(token: string | undefined): SoundEventKey | null {
	if (!token) return null;
	const normalized = token.trim().toLowerCase();
	if (["completion", "complete", "done", "finish", "finished"].includes(normalized)) return "completion";
	if (["ask", "ask_user", "ask-user", "ask_user_question", "question"].includes(normalized)) return "ask_user";
	if (["interview", "form"].includes(normalized)) return "interview";
	if (["input", "input_request", "input-request", "request", "generic"].includes(normalized)) {
		return "input_request";
	}
	return null;
}

async function listMacSystemSounds(): Promise<string[]> {
	if (platform() !== "darwin") return [];
	try {
		const files = await readdir(SYSTEM_SOUND_DIR);
		return files
			.filter((file) => extname(file).toLowerCase() === ".aiff")
			.map((file) => file.slice(0, -extname(file).length))
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

async function testEvent(eventKey: SoundEventKey, cwd: string): Promise<void> {
	await playSoundForEvent(eventKey);
	terminalNotify("pi", `[${shortProjectName(cwd)}] ${SOUND_EVENT_INFO[eventKey].testMessage}`);
}

async function configureEventInteractively(
	eventKey: SoundEventKey,
	ctx: {
		ui: {
			select(prompt: string, options: string[]): Promise<string | undefined>;
			input(prompt: string, placeholder?: string): Promise<string | undefined>;
			notify(message: string, level: "info" | "success" | "warning" | "error"): void;
		};
		cwd: string;
	},
): Promise<void> {
	const info = SOUND_EVENT_INFO[eventKey];
	const choice = await ctx.ui.select(
		`Configure ${info.label}\n\n${info.description}`,
		[
			platform() === "darwin" ? "Choose a macOS system sound" : "Use system / beep sound",
			"Use a local audio file",
			"Download from a URL",
			"Download from a YouTube URL",
			"Copy sound from another event",
			"Disable this sound",
		],
	);
	if (!choice) return;

	try {
		if (choice === "Disable this sound") {
			await updateEventSound(eventKey, { kind: "silent" });
			ctx.ui.notify(`${info.label} sound disabled`, "success");
			return;
		}

		if (choice === "Copy sound from another event") {
			const config = await loadConfig();
			const otherOptions = SOUND_EVENT_KEYS.filter((key) => key !== eventKey).map((key) => SOUND_EVENT_INFO[key].label);
			const selectedLabel = await ctx.ui.select(`Copy ${info.label} from which event?`, otherOptions);
			if (!selectedLabel) return;
			const otherKey = SOUND_EVENT_KEYS.find((key) => SOUND_EVENT_INFO[key].label === selectedLabel);
			if (!otherKey) return;
			await updateEventSound(eventKey, cloneSource(config.sounds[otherKey]));
			await testEvent(eventKey, ctx.cwd);
			ctx.ui.notify(`${info.label} now uses ${selectedLabel}'s sound`, "success");
			return;
		}

		if (choice === "Choose a macOS system sound" || choice === "Use system / beep sound") {
			if (platform() === "darwin") {
				const sounds = await listMacSystemSounds();
				if (sounds.length > 0) {
					const selected = await ctx.ui.select(`Pick a macOS sound for ${info.label}`, sounds);
					if (!selected) return;
					await updateEventSound(eventKey, { kind: "system", name: selected });
					await testEvent(eventKey, ctx.cwd);
					ctx.ui.notify(`${info.label} sound set to system:${selected}`, "success");
					return;
				}
			}
			await updateEventSound(eventKey, { kind: "system", name: DEFAULT_INPUT_SOUND });
			await testEvent(eventKey, ctx.cwd);
			ctx.ui.notify(`${info.label} sound set to system/default beep`, "success");
			return;
		}

		let prompt = "";
		let placeholder = "";
		if (choice === "Use a local audio file") {
			prompt = `Enter a file path for ${info.label}`;
			placeholder = "~/Downloads/ping.mp3";
		} else if (choice === "Download from a URL") {
			prompt = `Enter an audio URL for ${info.label}`;
			placeholder = "https://example.com/ping.mp3";
		} else if (choice === "Download from a YouTube URL") {
			prompt = `Enter a YouTube URL for ${info.label}`;
			placeholder = "https://www.youtube.com/watch?v=...";
		}

		const rawInput = await ctx.ui.input(prompt, placeholder);
		if (!rawInput) return;
		const source = await resolveSourceInput(rawInput);
		await updateEventSound(eventKey, source);
		await testEvent(eventKey, ctx.cwd);
		ctx.ui.notify(`${info.label} sound saved: ${describeSource(source)}`, "success");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Could not configure ${info.label}: ${message}`, "error");
	}
}

function helpText(): string {
	return [
		"/agent-sound                  # interactive menu",
		"/agent-sound status",
		"/agent-sound test [all|completion|ask_user|interview|input_request]",
		"/agent-sound reset",
		"/agent-sound set <event> <system:Glass|path|url|youtube-url|silent>",
		"",
		"Examples:",
		"/agent-sound set completion system:Glass",
		"/agent-sound set ask_user ~/Downloads/ping.mp3",
		"/agent-sound set interview https://example.com/chime.mp3",
		"/agent-sound set input_request silent",
	].join("\n");
}

async function openInteractiveMenu(
	ctx: {
		ui: {
			select(prompt: string, options: string[]): Promise<string | undefined>;
			notify(message: string, level: "info" | "success" | "warning" | "error"): void;
		};
		cwd: string;
	},
): Promise<void> {
	while (true) {
		const config = await loadConfig();
		const prompt = [
			"Agent sound",
			"",
			formatStatus(config),
			"",
			"Choose an action:",
		].join("\n");
		const action = await ctx.ui.select(prompt, [
			"Show current status",
			"Test all sounds",
			"Test completion",
			"Test ask_user",
			"Test interview",
			"Test generic input-request",
			"Configure completion",
			"Configure ask_user",
			"Configure interview",
			"Configure generic input-request",
			"Reset defaults",
			"Show help",
		]);

		if (!action) return;

		if (action === "Show current status") {
			ctx.ui.notify(formatStatus(config), "info");
			continue;
		}
		if (action === "Test all sounds") {
			for (const eventKey of SOUND_EVENT_KEYS) {
				await testEvent(eventKey, ctx.cwd);
			}
			ctx.ui.notify("Played all configured sounds", "success");
			continue;
		}
		if (action === "Test completion") {
			await testEvent("completion", ctx.cwd);
			ctx.ui.notify("Tested completion sound", "success");
			continue;
		}
		if (action === "Test ask_user") {
			await testEvent("ask_user", ctx.cwd);
			ctx.ui.notify("Tested ask_user sound", "success");
			continue;
		}
		if (action === "Test interview") {
			await testEvent("interview", ctx.cwd);
			ctx.ui.notify("Tested interview sound", "success");
			continue;
		}
		if (action === "Test generic input-request") {
			await testEvent("input_request", ctx.cwd);
			ctx.ui.notify("Tested generic input-request sound", "success");
			continue;
		}
		if (action === "Configure completion") {
			await configureEventInteractively("completion", ctx);
			continue;
		}
		if (action === "Configure ask_user") {
			await configureEventInteractively("ask_user", ctx);
			continue;
		}
		if (action === "Configure interview") {
			await configureEventInteractively("interview", ctx);
			continue;
		}
		if (action === "Configure generic input-request") {
			await configureEventInteractively("input_request", ctx);
			continue;
		}
		if (action === "Reset defaults") {
			await resetConfig();
			ctx.ui.notify("Reset all sounds to defaults", "success");
			continue;
		}
		if (action === "Show help") {
			ctx.ui.notify(helpText(), "info");
		}
	}
}

export default function agentSoundExtension(pi: ExtensionAPI): void {
	const alertedToolCalls = new Set<string>();

	pi.on("session_start", async () => {
		await loadConfig();
	});

	pi.on("tool_call", async (event, ctx) => {
		const eventKey = getEventForTool(event.toolName);
		if (!eventKey) return;
		if (alertedToolCalls.has(event.toolCallId)) return;
		alertedToolCalls.add(event.toolCallId);
		if (alertedToolCalls.size > 200) {
			const first = alertedToolCalls.values().next().value;
			if (typeof first === "string") alertedToolCalls.delete(first);
		}

		await playSoundForEvent(eventKey);
		terminalNotify("pi", `[${shortProjectName(ctx.cwd)}] ${SOUND_EVENT_INFO[eventKey].testMessage}`);
	});

	pi.on("agent_end", async (_event, ctx) => {
		await playSoundForEvent("completion");
		const hasOhPi = await hasOhPiInstalled();
		if (!hasOhPi) {
			terminalNotify("pi", `[${shortProjectName(ctx.cwd)}] ${SOUND_EVENT_INFO.completion.testMessage}`);
		}
	});

	pi.registerCommand("agent-sound", {
		description: "Interactive sound configuration for completion and input-request events",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (!trimmed || trimmed === "menu") {
				await openInteractiveMenu(ctx);
				return;
			}

			if (trimmed === "help") {
				ctx.ui.notify(helpText(), "info");
				return;
			}

			if (trimmed === "status") {
				const config = await loadConfig();
				ctx.ui.notify(formatStatus(config), "info");
				return;
			}

			if (trimmed === "reset") {
				await resetConfig();
				ctx.ui.notify("Reset all sounds to defaults", "success");
				return;
			}

			if (trimmed.startsWith("test")) {
				const testArg = trimmed.slice("test".length).trim();
				if (!testArg || testArg === "all") {
					for (const eventKey of SOUND_EVENT_KEYS) {
						await testEvent(eventKey, ctx.cwd);
					}
					ctx.ui.notify("Played all configured sounds", "success");
					return;
				}
				const eventKey = parseEventToken(testArg);
				if (!eventKey) {
					ctx.ui.notify("Unknown test target. Use completion, ask_user, interview, input_request, or all.", "warning");
					return;
				}
				await testEvent(eventKey, ctx.cwd);
				ctx.ui.notify(`Tested ${SOUND_EVENT_INFO[eventKey].label} sound`, "success");
				return;
			}

			if (trimmed.startsWith("set ")) {
				const match = trimmed.match(/^set\s+(\S+)\s+([\s\S]+)$/);
				if (!match) {
					ctx.ui.notify("Usage: /agent-sound set <event> <source>", "warning");
					return;
				}
				const eventKey = parseEventToken(match[1]);
				if (!eventKey) {
					ctx.ui.notify("Unknown event. Use completion, ask_user, interview, or input_request.", "warning");
					return;
				}

				try {
					const source = await resolveSourceInput(match[2]);
					await updateEventSound(eventKey, source);
					await testEvent(eventKey, ctx.cwd);
					ctx.ui.notify(`Saved ${SOUND_EVENT_INFO[eventKey].label} sound: ${describeSource(source)}`, "success");
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Could not set sound: ${message}`, "error");
				}
				return;
			}

			ctx.ui.notify(helpText(), "warning");
		},
	});
}
