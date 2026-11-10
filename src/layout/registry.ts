// ── layout/registry.ts ────────────────────────────────────────────────
// Per-session layout state store backed by OpenClaw's keyed-state runtime.
//
// Runtime access is deferred out of register(): the plugin is loaded in
// several registration modes (cli-metadata, discovery, setup-only) where
// api.runtime throws by design. The durable store is therefore opened lazily
// on first use and all accessors degrade to in-memory state until then.

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

/** Minimal shape of the keyed-state store we depend on. */
interface KeyedStore {
  lookup(key: string): unknown;
  register(key: string, value: unknown): unknown;
}

export function createLayoutRegistry(api: OpenClawPluginApi): LayoutRegistry {
  // Local cache is the source of truth for fast reads and the fallback when
  // the durable store is not reachable (setup/discovery registration modes).
  const localCache = new Map<string, { mode: LayoutMode; widths?: Record<string, number>; collapsed: string[] }>();

  // In-memory buffers for live streaming data (diffs & thinking blocks).
  const memBuffers = new Map<string, { diffs: DiffEntry[]; thinkingBlocks: ThinkingBlock[] }>();

  let store: KeyedStore | null = null;
  let storeResolved = false;

  /** Lazily open the durable store; returns null when runtime is unavailable. */
  function getStore(): KeyedStore | null {
    if (storeResolved) return store;
    storeResolved = true;
    try {
      // Safe namespace — colons cause PluginStateStoreError.
      const safeNamespace = `${api.id.replace(/[:/]/g, "_")}_layout`;
      store = api.runtime.state.openKeyedStoreV2<{
        mode: LayoutMode;
        widths?: Record<string, number>;
        collapsed?: string[];
      }>({ namespace: safeNamespace, maxEntries: 500, defaultTtlMs: 24 * 60 * 60_000 }) as unknown as KeyedStore;
    } catch {
      // Runtime unavailable during this registration mode — stay in memory.
      store = null;
    }
    return store;
  }

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
    const cached = localCache.get(key);
    if (cached) {
      return {
        mode: cached.mode,
        widths: cached.widths,
        collapsed: new Set(cached.collapsed) as SessionLayoutState["collapsed"],
      };
    }

    const durable = getStore();
    if (durable) {
      try {
        const rawPromise = durable.lookup(key);
        const raw = rawPromise && typeof (rawPromise as Promise<unknown>).then === "function"
          ? undefined
          : (rawPromise as Record<string, unknown> | undefined);
        if (raw && typeof raw === "object" && "mode" in raw) {
          const typed = raw as { mode?: LayoutMode; widths?: Record<string, number>; collapsed?: string[] };
          const state: SessionLayoutState = {
            mode: typed.mode ?? resolveConfig().host.default_layout,
            widths: typed.widths,
            collapsed: new Set(typed.collapsed ?? []) as SessionLayoutState["collapsed"],
          };
          localCache.set(key, {
            mode: state.mode,
            widths: state.widths,
            collapsed: Array.from(state.collapsed),
          });
          return state;
        }
      } catch {
        // Corrupt/unavailable row — fall through to defaults.
      }
    }

    return {
      mode: resolveConfig().host.default_layout,
      widths: undefined,
      collapsed: new Set(),
    };
  }

  function setStateInternal(key: string, patch: Partial<SessionLayoutState>): void {
    const current = getStateInternal(key);
    const next = {
      mode: patch.mode ?? current.mode,
      widths: patch.widths ?? current.widths,
      collapsed: Array.from(patch.collapsed ?? current.collapsed),
    };
    localCache.set(key, next);

    const durable = getStore();
    if (!durable) return;
    try {
      durable.register(key, { mode: next.mode, widths: next.widths, collapsed: next.collapsed });
    } catch {
      // Durable write failed — in-memory state still reflects the change.
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
