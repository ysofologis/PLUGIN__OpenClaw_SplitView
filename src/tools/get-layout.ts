// ── tools/get-layout.ts ───────────────────────────────────────────────
import { Type } from "typebox";
import type { LayoutRegistry } from "../layout/registry.js";

const GET_LAYOUT_OUTPUT = Type.Object({
  mode: Type.String(),
  widths: Type.Optional(Type.Record(Type.String(), Type.Number())),
  collapsed: Type.Optional(Type.Array(Type.String())),
}, { additionalProperties: false });

export function registerGetLayoutTool(registry: LayoutRegistry): any {
  return ({
    name: "split-view.get_layout",
    label: "Get Split View Layout",
    description: "Return the current split-view layout mode for this session.",
    parameters: Type.Object({}, { additionalProperties: false }),
    outputSchema: GET_LAYOUT_OUTPUT,
    async execute(_id: string, _params: {}) {
      const state = await registry.get("current-session");
      return {
        content: [{ type: "text" as const, text: `Layout: ${state.mode}` }],
        details: {
          mode: state.mode,
          widths: state.widths,
          collapsed: Array.from(state.collapsed),
        },
      };
    },
  });
}
