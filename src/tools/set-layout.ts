// ── tools/set-layout.ts ───────────────────────────────────────────────
import { Type } from "typebox";
import type { LayoutMode } from "../types/layout.js";
import type { LayoutRegistry } from "../layout/registry.js";

const SET_LAYOUT_PARAMS = Type.Object({
  mode: Type.Union([
    Type.Literal("single"),
    Type.Literal("dual-files"),
    Type.Literal("dual-thinking"),
    Type.Literal("triple"),
  ], { description: "Target layout mode" }),
});

const SET_LAYOUT_OUTPUT = Type.Object({
  mode: Type.String(),
  message: Type.String(),
}, { additionalProperties: false });

export function registerSetLayoutTool(registry: LayoutRegistry): any {
  return {
    name: "split-view.set_layout",
    label: "Set Split View Layout",
    description: "Change the split-view layout mode for the active OpenClaw session.",
    parameters: SET_LAYOUT_PARAMS,
    outputSchema: SET_LAYOUT_OUTPUT,
    async execute(_id: string, params: { mode: LayoutMode }) {
      const cfg = registry.config();
      if (!cfg.host.enabled) {
        return {
          content: [{ type: "text" as const, text: "Split View is disabled." }],
          details: { error: "disabled" },
        };
      }
      try {
        await (registry as any).set("current-session", { mode: params.mode });
        return {
          content: [
            { type: "text" as const, text: `Split-view layout set to: ${params.mode}` },
          ],
          details: { mode: params.mode },
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Failed to update layout: ${String(err)}` },
          ],
          details: { error: String(err) },
        };
      }
    },
  };
}
