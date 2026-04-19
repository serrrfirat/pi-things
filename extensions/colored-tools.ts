/**
 * Colored Tools Extension
 *
 * Global pi extension that keeps built-in tool behavior intact while giving
 * each built-in coding tool its own icon and color in the TUI.
 *
 * Install location:
 *   ~/.pi/agent/extensions/colored-tools.ts
 *
 * After creating or editing this file, run /reload in pi.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { homedir } from "node:os";

type BuiltInTools = ReturnType<typeof createBuiltInTools>;

const toolCache = new Map<string, BuiltInTools>();

function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}

function getBuiltInTools(cwd: string): BuiltInTools {
	let tools = toolCache.get(cwd);
	if (!tools) {
		tools = createBuiltInTools(cwd);
		toolCache.set(cwd, tools);
	}
	return tools;
}

function shortenPath(path?: string): string {
	if (!path) return ".";
	const home = homedir();
	if (path.startsWith(home)) return `~${path.slice(home.length)}`;
	return path;
}

export default function coloredTools(pi: ExtensionAPI) {
	const baseTools = getBuiltInTools(process.cwd());

	pi.registerTool({
		...baseTools.read,
		renderCall(args, theme) {
			const path = theme.fg("accent", shortenPath(args.path));
			let text = theme.fg("mdLink", theme.bold("📖 read")) + " " + path;
			if (args.offset !== undefined || args.limit !== undefined) {
				const start = args.offset ?? 1;
				const end = args.limit !== undefined ? start + args.limit - 1 : undefined;
				text += theme.fg("warning", `:${start}${end !== undefined ? `-${end}` : ""}`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
		},
	});

	// Intentionally do not override `bash` here.
	// Packages like oh-pi's bg-process extension also override bash, and pi
	// treats extension-vs-extension tool name collisions as errors.
	// If you want colored bash headers too, add the rendering to the owning
	// bash extension rather than registering another bash tool here.

	pi.registerTool({
		...baseTools.edit,
		renderCall(args, theme) {
			const path = theme.fg("accent", shortenPath(args.path));
			const editCount = Array.isArray(args.edits) ? args.edits.length : 0;
			let text = theme.fg("warning", theme.bold("✂️ edit")) + " " + path;
			if (editCount > 0) {
				text += theme.fg("dim", ` (${editCount} block${editCount === 1 ? "" : "s"})`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...baseTools.write,
		renderCall(args, theme) {
			const path = theme.fg("accent", shortenPath(args.path));
			const lineCount = typeof args.content === "string" ? args.content.split("\n").length : 0;
			let text = theme.fg("success", theme.bold("📝 write")) + " " + path;
			if (lineCount > 0) {
				text += theme.fg("dim", ` (${lineCount} line${lineCount === 1 ? "" : "s"})`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...baseTools.grep,
		renderCall(args, theme) {
			const pattern = theme.fg("accent", `/${args.pattern || ""}/`);
			const path = theme.fg("muted", ` in ${shortenPath(args.path || ".")}`);
			let text = theme.fg("error", theme.bold("🔎 grep")) + " " + pattern + path;
			if (args.glob) {
				text += theme.fg("dim", ` (${args.glob})`);
			}
			if (args.limit !== undefined) {
				text += theme.fg("dim", ` limit=${args.limit}`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...baseTools.find,
		renderCall(args, theme) {
			const pattern = theme.fg("accent", args.pattern || "");
			const path = theme.fg("muted", ` in ${shortenPath(args.path || ".")}`);
			let text = theme.fg("syntaxType", theme.bold("🧭 find")) + " " + pattern + path;
			if (args.limit !== undefined) {
				text += theme.fg("dim", ` limit=${args.limit}`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...baseTools.ls,
		renderCall(args, theme) {
			const path = theme.fg("accent", shortenPath(args.path || "."));
			let text = theme.fg("syntaxKeyword", theme.bold("📂 ls")) + " " + path;
			if (args.limit !== undefined) {
				text += theme.fg("dim", ` (limit ${args.limit})`);
			}
			return new Text(text, 0, 0);
		},
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
		},
	});
}
