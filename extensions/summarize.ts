import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { complete } from "@mariozechner/pi-ai";
import type { Api, Context, Message, Model, TextContent } from "@mariozechner/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

type SessionEntry = {
	type: string;
	timestamp?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
};

type ContentBlock = {
	type?: string;
	text?: string;
	name?: string;
	input?: unknown;
};

type SummarizeConfig = {
	provider: string;
	model: string;
	maxTokens: number;
	temperature: number | null;
	maxTurns: number;
	refreshTopicEveryNTurns: number;
	enableTopicBadge: boolean;
};

const unsupportedTemperatureModels = new Set<string>();

const DEFAULT_CONFIG: SummarizeConfig = {
	provider: "anthropic",
	model: "claude-haiku-4-5-20251001",
	maxTokens: 600,
	temperature: 0.3,
	maxTurns: 40,
	refreshTopicEveryNTurns: 3,
	enableTopicBadge: true,
};

const STATUS_KEY = "summarize";
const MAX_VISIBLE_LINES = 20;
const MAX_BADGE_CHARS = 24;

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(EXTENSION_DIR, "summarize.config.json");

const SUMMARY_SYSTEM_PROMPT = `You summarize an in-progress coding-agent session for the user who got distracted and needs to catch up.

Output format (no preamble, no closing remarks):
- One line: **Topic:** <3-8 words>
- One line: **Status:** <one short sentence — what's currently happening or last result>
- 3-6 bullets covering: user goals, decisions made, files/areas touched, blockers or open questions, next obvious step.

Be concrete: name files, tools, and outcomes. Skip filler. If nothing has happened yet, say so.`;

const TOPIC_SYSTEM_PROMPT = `Reply with 2-4 words naming the current topic of this coding session. No punctuation, no quotes, no preamble. Lowercase. Examples: "rust auth refactor", "tui sidebar bug", "supabase migration".`;

function loadConfig(): SummarizeConfig {
	if (!existsSync(CONFIG_PATH)) {
		writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
		return { ...DEFAULT_CONFIG };
	}
	try {
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<SummarizeConfig>;
		return { ...DEFAULT_CONFIG, ...raw };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function saveConfig(next: SummarizeConfig): void {
	writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";

	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n").trim();
}

function summarizeToolCall(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	const lines: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const block = part as ContentBlock & { type?: string };
		if (block.type !== "tool_use" && block.type !== "toolCall") continue;
		const name = block.name ?? "tool";
		let arg = "";
		const input = block.input as Record<string, unknown> | undefined;
		if (input && typeof input === "object") {
			const candidate = input.command ?? input.path ?? input.file ?? input.pattern ?? input.query;
			if (typeof candidate === "string") {
				arg = candidate.replace(/\s+/g, " ").slice(0, 80);
			}
		}
		lines.push(arg ? `  - tool: ${name} (${arg})` : `  - tool: ${name}`);
	}
	return lines;
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function buildTranscript(entries: SessionEntry[], maxTurns: number): string {
	const userTurns: { user: string; tail: string[] }[] = [];

	for (const entry of entries) {
		if (entry.type !== "message" || !entry.message) continue;
		const role = entry.message.role;
		if (role === "user") {
			const text = extractText(entry.message.content);
			if (text) userTurns.push({ user: text, tail: [] });
			continue;
		}
		if (role === "assistant" && userTurns.length > 0) {
			const current = userTurns[userTurns.length - 1]!;
			const text = extractText(entry.message.content);
			if (text) current.tail.push(`assistant: ${normalize(text).slice(0, 400)}`);
			current.tail.push(...summarizeToolCall(entry.message.content));
		}
	}

	const slice = userTurns.slice(-maxTurns);
	const blocks: string[] = [];
	slice.forEach((turn, i) => {
		const idx = userTurns.length - slice.length + i + 1;
		const lines = [`### turn ${idx}`, `user: ${normalize(turn.user).slice(0, 600)}`];
		if (turn.tail.length > 0) lines.push(...turn.tail);
		blocks.push(lines.join("\n"));
	});

	return blocks.join("\n\n");
}

async function callLlm(
	ctx: ExtensionContext,
	cfg: SummarizeConfig,
	systemPrompt: string,
	transcript: string,
	options: { maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
	const model = ctx.modelRegistry.find(cfg.provider, cfg.model);
	if (!model) {
		throw new Error(
			`Model ${cfg.provider}/${cfg.model} not found. Edit ${CONFIG_PATH} or run /login.`,
		);
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model as Model<Api>);
	if (!auth.ok) throw new Error(auth.error);

	const userText: TextContent = {
		type: "text",
		text: transcript || "(empty session — nothing has happened yet)",
	};
	const messages: Message[] = [
		{ role: "user", content: [userText], timestamp: Date.now() },
	];
	const context: Context = { systemPrompt, messages };

	const modelKey = `${cfg.provider}/${cfg.model}`;
	const sendTemperature =
		cfg.temperature !== null && !unsupportedTemperatureModels.has(modelKey);

	const baseOpts = {
		apiKey: auth.apiKey,
		headers: auth.headers,
		maxTokens: options.maxTokens ?? cfg.maxTokens,
		signal: options.signal,
	};

	let result = await complete(model as Model<Api>, context, {
		...baseOpts,
		...(sendTemperature ? { temperature: cfg.temperature as number } : {}),
	});

	if (
		(result.stopReason === "error" || result.stopReason === "aborted") &&
		sendTemperature &&
		/temperature/i.test(result.errorMessage ?? "")
	) {
		unsupportedTemperatureModels.add(modelKey);
		result = await complete(model as Model<Api>, context, baseOpts);
	}

	if (result.stopReason === "error" || result.stopReason === "aborted") {
		throw new Error(
			`${cfg.provider}/${cfg.model} returned ${result.stopReason}: ${result.errorMessage ?? "(no detail)"}`,
		);
	}

	const texts: string[] = [];
	for (const block of result.content) {
		if (block.type === "text" && block.text) texts.push(block.text);
	}
	if (texts.length > 0) return texts.join("\n").trim();

	for (const block of result.content) {
		if (block.type === "thinking" && block.thinking) return block.thinking.trim();
	}

	const blockTypes = result.content.map((b) => b.type).join(",") || "(empty)";
	throw new Error(
		`${cfg.provider}/${cfg.model} returned stopReason=${result.stopReason} with no text (blocks: ${blockTypes}, usage: in=${result.usage.input}/out=${result.usage.output})`,
	);
}

function wrapText(text: string, width: number): string[] {
	if (width <= 1) return [text];
	const out: string[] = [];
	for (const para of text.split(/\n/)) {
		if (!para) {
			out.push("");
			continue;
		}
		const words = para.split(/\s+/);
		let line = "";
		for (const word of words) {
			if (!line) {
				line = word;
				continue;
			}
			if (`${line} ${word}`.length <= width) {
				line = `${line} ${word}`;
				continue;
			}
			out.push(line);
			line = word;
		}
		if (line) out.push(line);
	}
	return out.length > 0 ? out : [""];
}

async function showPopup(
	ctx: ExtensionCommandContext,
	title: string,
	body: string,
): Promise<void> {
	if (!ctx.hasUI) {
		console.log(`\n${title}\n\n${body}\n`);
		return;
	}

	await ctx.ui.custom<void>(
		(tui, theme, _kb, done) => {
			let scrollOffset = 0;
			let lastInnerWidth = 94;

			return {
				render: (width: number) => {
					const popupWidth = Math.max(56, Math.min(width, 100));
					const innerWidth = Math.max(1, popupWidth - 2);
					lastInnerWidth = innerWidth;
					const bodyLines = wrapText(body, innerWidth - 2).map((l) => `  ${l}`);
					const maxOffset = Math.max(0, bodyLines.length - MAX_VISIBLE_LINES);
					scrollOffset = Math.min(scrollOffset, maxOffset);

					const border = (text: string) => theme.fg("muted", text);
					const padLine = (text: string) => {
						const truncated = truncateToWidth(text, innerWidth, "…", true);
						return truncated + " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
					};

					const visibleLines = bodyLines.slice(scrollOffset, scrollOffset + MAX_VISIBLE_LINES);
					const canScrollUp = scrollOffset > 0;
					const canScrollDown = scrollOffset < maxOffset;
					const scrollInfo = canScrollUp || canScrollDown
						? theme.fg("dim", ` ↑${scrollOffset} ↓${Math.max(0, maxOffset - scrollOffset)} `)
						: "";

					const titleText = theme.fg("accent", ` ${title} `);
					const titlePad = Math.max(0, innerWidth - visibleWidth(titleText));
					const lines = [border("╭") + titleText + border("─".repeat(titlePad) + "╮")];
					lines.push(border("│") + padLine(scrollInfo) + border("│"));

					for (const line of visibleLines) {
						lines.push(border("│") + padLine(theme.fg("text", line)) + border("│"));
					}
					for (let i = visibleLines.length; i < MAX_VISIBLE_LINES; i += 1) {
						lines.push(border("│") + padLine("") + border("│"));
					}

					lines.push(
						border("│") +
							padLine(theme.fg("dim", " ↑↓ scroll | Enter/Esc close ")) +
							border("│"),
					);
					lines.push(border("╰" + "─".repeat(innerWidth) + "╯"));
					return lines;
				},
				invalidate: () => undefined,
				handleInput: (data: string) => {
					const maxOffset = Math.max(
						0,
						wrapText(body, Math.max(1, lastInnerWidth - 2)).length - MAX_VISIBLE_LINES,
					);
					if (matchesKey(data, "enter") || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
						done(undefined);
						return;
					}
					if (matchesKey(data, "up") || data === "k") {
						scrollOffset = Math.max(0, scrollOffset - 1);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "down") || data === "j") {
						scrollOffset = Math.min(maxOffset, scrollOffset + 1);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "pageup")) {
						scrollOffset = Math.max(0, scrollOffset - MAX_VISIBLE_LINES);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "pagedown")) {
						scrollOffset = Math.min(maxOffset, scrollOffset + MAX_VISIBLE_LINES);
						tui.requestRender();
					}
				},
			};
		},
		{
			overlay: true,
			overlayOptions: { width: "80%", minWidth: 56, maxWidth: 100 },
		},
	);
}

export default function summarizeExtension(pi: ExtensionAPI) {
	let cfg = loadConfig();
	let turnsSinceTopic = 0;
	let topicInFlight = false;
	let lastTopic: string | undefined;

	function applyBadge(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!lastTopic) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(
			STATUS_KEY,
			ctx.ui.theme.fg("dim", `~ ${lastTopic.slice(0, MAX_BADGE_CHARS)}`),
		);
	}

	async function refreshTopic(ctx: ExtensionContext): Promise<void> {
		if (!cfg.enableTopicBadge || topicInFlight) return;
		const transcript = buildTranscript(
			ctx.sessionManager.getBranch() as SessionEntry[],
			cfg.maxTurns,
		);
		if (!transcript) return;

		topicInFlight = true;
		try {
			const topic = normalize(
				await callLlm(ctx, cfg, TOPIC_SYSTEM_PROMPT, transcript, { maxTokens: 32 }),
			);
			if (topic) {
				lastTopic = topic;
				applyBadge(ctx);
			}
		} catch (err) {
			// Stay quiet on background failures — the /summarize command will surface real errors.
			if (ctx.hasUI) {
				ctx.ui.setStatus(
					STATUS_KEY,
					ctx.ui.theme.fg("dim", `~ topic: ${(err as Error).message.slice(0, 40)}`),
				);
			}
		} finally {
			topicInFlight = false;
		}
	}

	pi.registerCommand("summarize-settings", {
		description: "Pick which model /summarize uses (from models with configured auth)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				console.log(`Edit ${CONFIG_PATH} to change the summarize model.`);
				return;
			}
			cfg = loadConfig();

			const available = ctx.modelRegistry.getAvailable();
			if (available.length === 0) {
				ctx.ui.notify(
					"No models with configured auth. Run /login or set API keys first.",
					"warning",
				);
				return;
			}

			const sorted = [...available].sort((a, b) => {
				const pa = (a.provider as string) ?? "";
				const pb = (b.provider as string) ?? "";
				if (pa !== pb) return pa.localeCompare(pb);
				return a.id.localeCompare(b.id);
			});

			const labels: string[] = [];
			const index = new Map<string, { provider: string; id: string }>();
			for (const m of sorted) {
				const provider = (m.provider as string) ?? "unknown";
				const active = provider === cfg.provider && m.id === cfg.model ? " ●" : "";
				const label = `${provider} / ${m.id}${active}`;
				labels.push(label);
				index.set(label, { provider, id: m.id });
			}

			const choice = await ctx.ui.select(
				`Summarize model (current: ${cfg.provider}/${cfg.model})`,
				labels,
			);
			if (!choice) return;
			const picked = index.get(choice);
			if (!picked) return;

			cfg = { ...cfg, provider: picked.provider, model: picked.id };
			saveConfig(cfg);
			lastTopic = undefined;
			turnsSinceTopic = 0;
			applyBadge(ctx);
			ctx.ui.notify(`Summarize model set to ${picked.provider}/${picked.id}`, "info");
		},
	});

	pi.registerCommand("summarize", {
		description:
			"Summarize the current session via a cheap LLM (model configured in summarize.config.json)",
		handler: async (_args, ctx) => {
			cfg = loadConfig();
			const transcript = buildTranscript(
				ctx.sessionManager.getBranch() as SessionEntry[],
				cfg.maxTurns,
			);
			if (!transcript) {
				if (ctx.hasUI) ctx.ui.notify("Nothing to summarize yet — empty session.", "warning");
				return;
			}
			if (ctx.hasUI) ctx.ui.notify(`Summarizing via ${cfg.provider}/${cfg.model}…`, "info");
			try {
				const summary = await callLlm(ctx, cfg, SUMMARY_SYSTEM_PROMPT, transcript, {
					signal: ctx.signal,
				});
				await showPopup(ctx, `Session summary (${cfg.model})`, summary);
			} catch (err) {
				if (ctx.hasUI) ctx.ui.notify(`Summarize failed: ${(err as Error).message}`, "error");
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		cfg = loadConfig();
		turnsSinceTopic = 0;
		lastTopic = undefined;
		applyBadge(ctx);
	});

	pi.on("session_switch", async (_event, ctx) => {
		turnsSinceTopic = 0;
		lastTopic = undefined;
		applyBadge(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		turnsSinceTopic += 1;
		if (turnsSinceTopic >= Math.max(1, cfg.refreshTopicEveryNTurns)) {
			turnsSinceTopic = 0;
			await refreshTopic(ctx);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
