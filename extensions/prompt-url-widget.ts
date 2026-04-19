import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";

const GITHUB_URL_PATTERN = /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(pull|issues)\/(\d+)/gi;

type PromptMatch = {
  kind: "pr" | "issue";
  url: string;
  owner: string;
  repo: string;
  number: string;
  extraCount: number;
};

type GhMetadata = {
  title?: string;
  author?: {
    login?: string;
  };
};

function extractPromptMatch(prompt: string): PromptMatch | undefined {
  const matches = [...prompt.matchAll(GITHUB_URL_PATTERN)];
  if (matches.length === 0) {
    return undefined;
  }

  const [first] = matches;
  const [, owner, repo, rawKind, number] = first;
  const kind = rawKind === "pull" ? "pr" : "issue";

  return {
    kind,
    url: `https://github.com/${owner}/${repo}/${rawKind}/${number}`,
    owner,
    repo,
    number,
    extraCount: Math.max(0, matches.length - 1),
  };
}

async function fetchGhMetadata(
  pi: ExtensionAPI,
  kind: PromptMatch["kind"],
  url: string,
): Promise<GhMetadata | undefined> {
  const args =
    kind === "pr"
      ? ["pr", "view", url, "--json", "title,author"]
      : ["issue", "view", url, "--json", "title,author"];

  try {
    const result = await pi.exec("gh", args);
    if (result.code !== 0 || !result.stdout) {
      return undefined;
    }
    return JSON.parse(result.stdout) as GhMetadata;
  } catch {
    return undefined;
  }
}

function formatSubmitter(author?: GhMetadata["author"]): string | undefined {
  const login = author?.login?.trim();
  return login ? `@${login}` : undefined;
}

function getUserText(content: string | { type: string; text?: string }[] | undefined): string {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export default function promptUrlWidgetExtension(pi: ExtensionAPI) {
  const setWidget = (
    ctx: ExtensionContext,
    match: PromptMatch,
    title?: string,
    submitter?: string,
  ) => {
    ctx.ui.setWidget("prompt-url", (_tui, theme) => {
      const label = match.kind === "pr" ? "PR" : "Issue";
      const header = `${label} #${match.number} · ${match.owner}/${match.repo}`;
      const titleLine = theme.fg("accent", title?.trim() || header);
      const submitterLine = submitter ? theme.fg("muted", submitter) : undefined;
      const extraLine =
        match.extraCount > 0
          ? theme.fg(
              "muted",
              `+${match.extraCount} more GitHub link${match.extraCount === 1 ? "" : "s"} in this prompt`,
            )
          : undefined;
      const urlLine = theme.fg("dim", match.url);

      const lines = [titleLine, theme.fg("muted", header)];
      if (submitterLine) {
        lines.push(submitterLine);
      }
      if (extraLine) {
        lines.push(extraLine);
      }
      lines.push(urlLine);

      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("muted", s)));
      container.addChild(new Text(lines.join("\n"), 1, 0));
      return container;
    });
  };

  const applySessionName = (match: PromptMatch, title?: string) => {
    const label = match.kind === "pr" ? "PR" : "Issue";
    const trimmedTitle = title?.trim();
    const fallbackName = `${label}: ${match.owner}/${match.repo}#${match.number}`;
    const desiredName = trimmedTitle ? `${label}: ${trimmedTitle}` : fallbackName;
    const currentName = pi.getSessionName()?.trim();

    if (!currentName || currentName === match.url || currentName === fallbackName) {
      pi.setSessionName(desiredName);
    }
  };

  const showMatch = (ctx: ExtensionContext, match: PromptMatch) => {
    setWidget(ctx, match);
    applySessionName(match);

    void fetchGhMetadata(pi, match.kind, match.url).then((meta) => {
      const title = meta?.title?.trim();
      const submitter = formatSubmitter(meta?.author);
      setWidget(ctx, match, title, submitter);
      applySessionName(match, title);
    });
  };

  const rebuildFromSession = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) {
      return;
    }

    const lastMatch = [...ctx.sessionManager.getBranch()].reverse().find((entry) => {
      if (entry.type !== "message" || entry.message.role !== "user") {
        return false;
      }
      return !!extractPromptMatch(getUserText(entry.message.content));
    });

    if (!lastMatch || lastMatch.type !== "message" || lastMatch.message.role !== "user") {
      ctx.ui.setWidget("prompt-url", undefined);
      return;
    }

    const match = extractPromptMatch(getUserText(lastMatch.message.content));
    if (!match) {
      ctx.ui.setWidget("prompt-url", undefined);
      return;
    }

    showMatch(ctx, match);
  };

  pi.on("before_agent_start", async (event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    const match = extractPromptMatch(event.prompt);
    if (!match) {
      return;
    }

    showMatch(ctx, match);
  });

  pi.on("session_start", async (_event, ctx) => {
    rebuildFromSession(ctx);
  });
}
