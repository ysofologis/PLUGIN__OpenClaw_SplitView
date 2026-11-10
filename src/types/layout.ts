// ── types/layout.ts ───────────────────────────────────────────────────
// Shared types for the split-view plugin.

export type LayoutMode = "single" | "dual-files" | "dual-thinking" | "triple";

export const LAYOUT_MODES: readonly LayoutMode[] = [
  "single",
  "dual-files",
  "dual-thinking",
  "triple",
];

/** Per-session layout state persisted across turns */
export interface SessionLayoutState {
  mode: LayoutMode;
  widths?: Record<string, number>;
  collapsed: Set<"files" | "thinking">;
}

/** Plugin runtime config snapshot */
export interface PluginConfig {
  host: {
    enabled: boolean;
    default_layout: LayoutMode;
    auto_think_expand: boolean;
    max_diff_lines: number;
    show_additions: boolean;
    show_deletions: boolean;
    show_line_numbers: boolean;
  };
}

/** One captured diff entry pushed into File Actions pane */
export interface DiffEntry {
  id: string;                          // incremental counter + short hash
  tool: "write" | "edit" | "apply_patch";
  path: string;
  firstChangedLine?: number;
  addedLines?: number;
  removedLines?: number;
  summary?: {
    added: string[];
    deleted: string[];
    modified: string[];
  };
  diffText?: string;                   // raw unified-diff text
  patch?: string;                      // full patch block
  ts: number;                          // Date.now() at capture
}

/** One captured reasoning/thinking block for Thinking Process pane */
export interface ThinkingBlock {
  id: string;
  label: string;                       // e.g. "Thinking · 3 steps" or session-label
  depth: number;                       // nesting level in reasoning tree
  lines: number;                       // char count of raw output
  rawSnapshot: string;                 // truncated dump of current reasoning
  ts: number;
  sessionId?: string;                  // parent subagent session key if applicable
}

/** Aggregate per-session live data buffers */
export interface SessionDataBuffers {
  diffs: DiffEntry[];
  thinkingBlocks: ThinkingBlock[];
}
