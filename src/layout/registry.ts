// ── layout/registry.ts ────────────────────────────────────────────────
// Per-session layout state store backed by OpenClaw's keyed-state runtime.

import type { LayoutMode, SessionLayoutState, PluginConfig, DiffEntry, ThinkingBlock } from "../types/layout.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

export interface LayoutRegistry {
  get(stateKey: string): Promise<SessionLayoutState>;
  set(stateKey: string, patch: Partial<SessionLayoutState>): Promise<void>;
  config(): PluginConfig;
  pushDiff(stateKey: string, entry: DiffEntry): void;
  pushThinking(stateKey: string, entry: ThinkingBlock): void;
  flush(stateKey: string): void;
}

/** Create a memory-backed registry that delegates durable state to api.runtime.state */
export function createLayoutRegistry(api: OpenClawPluginApi): LayoutRegistry {
  // Safe namespace — colons cause PluginStateStoreError
  const safeNamespace = `${api.id.replace(/[:\/]/g, "_")}_layout`;

  const store = api.runtime.state.openKeyedStoreV2<{
    mode: LayoutMode;
    widths?: Record<string, number>;
    collapsed?: string[];
  }>({ namespace: safeNamespace, maxEntries: 500, defaultTtlMs: 24 * 60 * 60_000 });

  // In-memory buffers for live streaming data (diffs & thinking blocks).
  const memBuffers = new Map<string, { diffs: DiffEntry[]; thinkingBlocks: ThinkingBlock[] }>();
  // Local cache mirrors durable store for fast reads
  const localCache = new Map<string, { _mode: LayoutMode; widths?: Record<string, number>; collapsed: string[] }>();

  function resolveConfig(): PluginConfig {
    const raw = api.pluginConfig as Record<string, unknown> | undefined;
    const hostRaw = (raw?.host ?? {}) as Record<string, unknown>;
    return {
      host: {
        enabled: Boolean(hostRaw.enabled ?? true),
        default_layout: (hostRaw.default_layout as LayoutMode) || "triple",
        auto_think_expand: Boolean(hostRaw.auto_think_expand ?? false),
        max_diff_lines: Number(hostRaw.max_diff_lines ?? 50),
        show_additions: Boolean(hostRaw.show_additions ?? true),
        show_deletions: Boolean(hostRaw.show_deletions ?? true),
        show_line_numbers: Boolean(hostRaw.show_line_numbers ?? true),
      },
    };
  }

  function getStateInternal(key: string): SessionLayoutState {
    // Try local cache first
    const cached = localCache.get(key);
    if (cached) {
      return { mode: cached._mode, widths: cached.widths, collapsed: new Set(cached.collapsed) } as SessionLayoutState;
    }

    let rawPromise: any;
    try { rawPromise = store.lookup(key); } catch { /* setup phase, ignore */ }

    // Handle both sync and async return types
    let rawRecord: Record<string, unknown> | undefined;
    if (rawPromise && typeof rawPromise.then === "function") {
      // It's a promise — sync read means we fall back to defaults
      return { mode: resolveConfig().host.default_layout, widths: undefined, collapsed: new Set() } as SessionLayoutState;
    } else {
      rawRecord = rawPromise;
    }

    if (!rawRecord || !("mode" in rawRecord)) {
      return { mode: resolveConfig().host.default_layout, widths: undefined, collapsed: new Set() } as SessionLayoutState;
    }

    // Safe typed access through unknown
    const typed = rawRecord as { mode?: LayoutMode; widths?: Record<string, number>; collapsed?: string[] };
    return {
      mode: typed.mode ?? resolveConfig().host.default_layout,
      widths: typed.widths,
      collapsed: new Set(typed.collapsed ?? []),
    } as SessionLayoutState;
  }

  function setStateInternal(key: string, patch: Partial<SessionLayoutState>): void {
    const current = getStateInternal(key);
    const serialized = {
      _mode: patch.mode ?? current.mode,
      widths: patch.widths ?? current.widths,
      collapsed: Array.from(patch.collapsed ?? current.collapsed),
    };
    localCache.set(key, serialized);
    try {
      store.register(
        key,
        (serialized as unknown) as { mode: LayoutMode; widths?: Record<string, number>; collapsed?: string[] },
      );
    } catch {
      /* defer to next call */
    }
  }

  return {
    async get(key) {
      return getStateInternal(key);
    },
    async set(key, patch) {
      setStateInternal(key, patch);
    },
    config() {
      return resolveConfig();
    },
    pushDiff(key, entry) {
      let buf = memBuffers.get(key);
      if (!buf) {
        buf = { diffs: [], thinkingBlocks: [] };
        memBuffers.set(key, buf);
      }
      buf.diffs.push(entry);
    },
    pushThinking(key, entry) {
      let buf = memBuffers.get(key);
      if (!buf) {
        buf = { diffs: [], thinkingBlocks: [] };
        memBuffers.set(key, buf);
      }
      buf.thinkingBlocks.push(entry);
    },
    flush(key) {
      memBuffers.delete(key);
    },
  };
}
