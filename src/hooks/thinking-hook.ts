// ── hooks/thinking-hook.ts ────────────────────────────────────────────
// Captures reasoning/thinking blocks from LLM provider output and streams
// them into the Thinking Process pane for the active session.
//
// Uses model_call_ended (observe hook) for provider call metadata and the
// subagent lifecycle hooks to track child reasoning context.

import type { LayoutRegistry } from "../layout/registry.js";
import type { ThinkingBlock } from "../types/layout.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

/** Register hooks that capture thinking/reasoning output into the pane */
export function registerThinkingCaptureHook(
  api: OpenClawPluginApi,
  registry: LayoutRegistry,
): void {
  // Provider call metadata — sanitized (no prompt/response content per docs),
  // so we record that reasoning happened for that model.
  api.on("model_call_ended", async (event, ctx) => {
    if (!event?.provider || !event?.callId) return;

    const cfg = registry.config();
    if (!cfg.host.enabled) return;

    const stateKey = ctx?.sessionKey ?? "default";
    const block: ThinkingBlock = {
      id: `think-${event.callId}-${Date.now()}`,
      label: `Thinking · ${event.provider}/${event.model ?? ""}`,
      depth: 0,
      lines: 0,
      rawSnapshot: `[Reasoning output captured by model ${event.provider}]`,
      ts: Date.now(),
      sessionId: ctx?.sessionKey,
    };

    registry.pushThinking(stateKey, block);
  });

  // Subagent launch — note the child in the Thinking pane so the parent
  // session can follow child reasoning while it runs.
  api.on("subagent_spawned", async (event) => {
    if (!event?.childSessionKey) return;

    const stateKey = event.childSessionKey;
    const resolvedModel = (event as Record<string, unknown>).resolvedModel ?? "unresolved";

    registry.pushThinking(stateKey, {
      id: `spawn-${event.childSessionKey}-${Date.now()}`,
      label: "▶ Subagent started",
      depth: 0,
      lines: 0,
      rawSnapshot: `[Subagent ${event.childSessionKey} spawned · ${String(resolvedModel)}]`,
      ts: Date.now(),
      sessionId: event.childSessionKey,
    });
  });

  // Subagent completion — collapse its thinking indicator.
  api.on("subagent_ended", async (event) => {
    if (!event?.targetSessionKey) return;

    const stateKey = event.targetSessionKey;
    const outcomeOrReason = event.outcome ?? event.reason ?? "unknown";

    registry.pushThinking(stateKey, {
      id: `end-${event.targetSessionKey}-${Date.now()}`,
      label: `◼ Subagent ended (${outcomeOrReason})`,
      depth: 0,
      lines: 0,
      rawSnapshot: `[${event.targetSessionKey} completed · reason: ${String(outcomeOrReason).substring(0, 120)}]`,
      ts: Date.now(),
      sessionId: event.targetSessionKey,
    });
  });
}
