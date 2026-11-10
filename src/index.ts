// ── index.ts ─────────────────────────────────────────────────────────
// Plugin entry point — registers tools + hooks following the OpenClaw SDK
// patterns from /docs/plugins/building-plugins.md.

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { LayoutRegistry } from "./layout/registry.js";
import { createLayoutRegistry } from "./layout/registry.js";
import { registerSetLayoutTool } from "./tools/set-layout.js";
import { registerGetLayoutTool } from "./tools/get-layout.js";
import { registerDiffCaptureHook } from "./hooks/diff-hook.js";
import { registerThinkingCaptureHook } from "./hooks/thinking-hook.js";

export default definePluginEntry({
  id: "split-view",
  name: "Split View",
  description:
    "Splits the session view into configurable panes (chat, file actions, thinking process) with switchable layouts.",
  register(api) {
    // Create per-session state store backed by keyed-state runtime
    const registry = createLayoutRegistry(api);

    // Register agent tools — each returns a simple tool object compatible
    // with api.registerTool's AnyAgentTool union.
    api.registerTool(
      registerSetLayoutTool(registry),
      { name: "split-view.set_layout" },
    );

    api.registerTool(
      registerGetLayoutTool(registry),
      { name: "split-view.get_layout" },
    );

    // Install hooks to feed live data into split-view panes
    registerDiffCaptureHook(api, registry);
    registerThinkingCaptureHook(api, registry);
  },
});
