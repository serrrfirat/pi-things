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
import { createFindTool, createGrepTool, createLsTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { homedir } from "node:os";

type BuiltInTools = ReturnType<typeof createBuiltInTools>;

const toolCache = new Map<string, BuiltInTools>();

function createBuiltInTools(cwd: string) {
	return {
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

	// Intentionally do not override `read`, `write`, `edit`, or `bash` here.
	// Packages like pi-ssh and oh-pi/bg-process own those tool names, and pi
	// treats extension-vs-extension collisions as load errors.
	// Keep this extension focused on the non-conflicting read-only helpers.

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
