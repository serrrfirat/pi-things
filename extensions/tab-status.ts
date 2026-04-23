/**
 * Update the terminal tab title with Pi run status and the latest user prompt.
 */
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
	SessionSwitchEvent,
	BeforeAgentStartEvent,
	AgentStartEvent,
	AgentEndEvent,
	TurnStartEvent,
	ToolCallEvent,
	ToolResultEvent,
	SessionShutdownEvent,
	MessageStartEvent,
} from "@mariozechner/pi-coding-agent";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, StopReason } from "@mariozechner/pi-ai";
import { basename } from "node:path";

type SessionEntry = {
	type: string;
	message?: {
		role?: string;
		content?: unknown;
	};
};

type ContentBlock = {
	type?: string;
	text?: string;
};

type StatusState = "new" | "running" | "doneCommitted" | "doneNoCommit" | "timeout";

type StatusTracker = {
	state: StatusState;
	running: boolean;
	sawCommit: boolean;
	latestPrompt?: string;
};

const STATUS_TEXT: Record<StatusState, string> = {
	new: ":new",
	running: ":running...",
	doneCommitted: ":✅",
	doneNoCommit: ":🚧",
	timeout: ":🛑",
};

const INACTIVE_TIMEOUT_MS = 180_000;
const GIT_COMMIT_RE = /\bgit\b[^\n]*\bcommit\b/;
const MAX_PROMPT_CHARS = 72;

function extractText(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return "";
	}

	const parts: string[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") {
			continue;
		}

		const block = part as ContentBlock;
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}

	return parts.join("\n").trim();
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
	return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

function getLatestUserPrompt(entries: SessionEntry[]): string | undefined {
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry.type !== "message" || entry.message?.role !== "user") {
			continue;
		}

		const text = extractText(entry.message.content);
		if (text) {
			return text;
		}
	}

	return undefined;
}

export default function (pi: ExtensionAPI) {
	const status: StatusTracker = {
		state: "new",
		running: false,
		sawCommit: false,
		latestPrompt: undefined,
	};
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const nativeClearTimeout = globalThis.clearTimeout;

	const cwdBase = (ctx: ExtensionContext): string => basename(ctx.cwd || "pi");

	const baseTitle = (ctx: ExtensionContext): string => {
		const session = pi.getSessionName()?.trim();
		return session ? `π - ${session} - ${cwdBase(ctx)}` : `π - ${cwdBase(ctx)}`;
	};

	const promptSuffix = (): string => {
		const prompt = status.latestPrompt ? normalize(status.latestPrompt) : "";
		return prompt ? ` — ${truncate(prompt, MAX_PROMPT_CHARS)}` : "";
	};

	const refreshTitle = (ctx: ExtensionContext): void => {
		if (!ctx.hasUI) return;
		ctx.ui.setTitle(`${baseTitle(ctx)} ${STATUS_TEXT[status.state]}${promptSuffix()}`);
	};

	const setTitle = (ctx: ExtensionContext, next: StatusState): void => {
		status.state = next;
		refreshTitle(ctx);
	};

	const rebuildPromptFromSession = (ctx: ExtensionContext): void => {
		status.latestPrompt = getLatestUserPrompt(ctx.sessionManager.getBranch() as SessionEntry[]);
	};

	const clearTabTimeout = (): void => {
		if (timeoutId === undefined) return;
		nativeClearTimeout(timeoutId);
		timeoutId = undefined;
	};

	const resetTimeout = (ctx: ExtensionContext): void => {
		clearTabTimeout();
		timeoutId = setTimeout(() => {
			if (status.running && status.state === "running") {
				setTitle(ctx, "timeout");
			}
		}, INACTIVE_TIMEOUT_MS);
	};

	const markActivity = (ctx: ExtensionContext): void => {
		if (status.state === "timeout") {
			setTitle(ctx, "running");
		}
		if (!status.running) return;
		resetTimeout(ctx);
	};

	const resetState = (ctx: ExtensionContext, next: StatusState): void => {
		status.running = false;
		status.sawCommit = false;
		clearTabTimeout();
		setTitle(ctx, next);
	};

	const beginRun = (ctx: ExtensionContext): void => {
		status.running = true;
		status.sawCommit = false;
		setTitle(ctx, "running");
		resetTimeout(ctx);
	};

	const getStopReason = (messages: AgentMessage[]): StopReason | undefined => {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			const message = messages[i];
			if (message.role === "assistant") {
				return (message as AssistantMessage).stopReason;
			}
		}
		return undefined;
	};

	const handlers = [
		[
			"session_start",
			async (_event: SessionStartEvent, ctx: ExtensionContext) => {
				rebuildPromptFromSession(ctx);
				resetState(ctx, "new");
			},
		],
		[
			"session_switch",
			async (_event: SessionSwitchEvent, ctx: ExtensionContext) => {
				rebuildPromptFromSession(ctx);
				resetState(ctx, "new");
			},
		],
		[
			"message_start",
			async (event: MessageStartEvent, ctx: ExtensionContext) => {
				if (event.message.role !== "user") {
					return;
				}

				const text = extractText(event.message.content);
				if (!text) {
					return;
				}

				status.latestPrompt = text;
				setTitle(ctx, status.running ? "running" : "new");
			},
		],
		[
			"before_agent_start",
			async (_event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
				markActivity(ctx);
			},
		],
		[
			"agent_start",
			async (_event: AgentStartEvent, ctx: ExtensionContext) => {
				beginRun(ctx);
			},
		],
		[
			"turn_start",
			async (_event: TurnStartEvent, ctx: ExtensionContext) => {
				markActivity(ctx);
			},
		],
		[
			"tool_call",
			async (event: ToolCallEvent, ctx: ExtensionContext) => {
				if (event.toolName === "bash") {
					const command = typeof event.input.command === "string" ? event.input.command : "";
					if (command && GIT_COMMIT_RE.test(command)) {
						status.sawCommit = true;
					}
				}
				markActivity(ctx);
			},
		],
		[
			"tool_result",
			async (_event: ToolResultEvent, ctx: ExtensionContext) => {
				markActivity(ctx);
			},
		],
		[
			"agent_end",
			async (event: AgentEndEvent, ctx: ExtensionContext) => {
				status.running = false;
				clearTabTimeout();
				const stopReason = getStopReason(event.messages);
				if (stopReason === "error") {
					setTitle(ctx, "timeout");
					return;
				}
				setTitle(ctx, status.sawCommit ? "doneCommitted" : "doneNoCommit");
			},
		],
		[
			"session_shutdown",
			async (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
				clearTabTimeout();
				status.latestPrompt = undefined;
				if (!ctx.hasUI) return;
				ctx.ui.setTitle(baseTitle(ctx));
			},
		],
	] as const;

	for (const [event, handler] of handlers) {
		pi.on(event, handler as (event: unknown, ctx: ExtensionContext) => void);
	}
}
