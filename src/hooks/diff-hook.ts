// ── hooks/diff-hook.ts ────────────────────────────────────────────────
// Captures file-action tool results (write, edit, apply_patch) and
// streams them into the File Actions pane for the active session.

import type { LayoutRegistry } from "../layout/registry.js";
import type { DiffEntry } from "../types/layout.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

/** Attach before_tool_call hook to feed file diffs into the pane */
export function registerDiffCaptureHook(
  api: OpenClawPluginApi,
  registry: LayoutRegistry,
): void {
  // Capture tool calls targeting file operations.
  // Per SDK docs the event exposes event.toolName and event.params.
  api.on("before_tool_call", async (event, ctx) => {
    const toolName = event.toolName as string;
    if (!["write", "edit", "apply_patch"].includes(toolName)) return;

    // Per SDK docs, ctx.sessionKey is available on hook contexts.
    const stateKey = ctx?.sessionKey ?? "default";

    const params = event.params as Record<string, unknown>;
    const pathStr = String(params?.path ?? params?.filepath ?? "");

    registry.pushDiff(stateKey, {
      id: `${toolName}-${Date.now()}`,
      tool: toolName as "write" | "edit" | "apply_patch",
      path: pathStr || "unknown",
      ts: Date.now(),
    });
  });
}
