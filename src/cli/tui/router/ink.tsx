/**
 * InkRoot — production entry (named export). Wraps the router in the App shell
 * (Header / Sidebar / Footer). entry.ts renders WizardSteps directly when
 * phase === 'wizard'; all post-wizard navigation flows through InkRoot.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useInput } from 'ink';
import type { CategoryDef, CategoryId } from '../schema/types.js';
import type { SettingsStore } from '../state/settings-store.js';
import type { ToastStore, ToastAction } from '../state/toast-store.js';
import type { ActivityStore } from '../state/activity-store.js';
import { activityStore as defaultActivityStore } from '../state/activity-store-instance.js';
import { SettingsHome, type SettingsHomeAction } from '../components/SettingsHome.js';
import { CategoryScreen } from '../components/CategoryScreen.js';
import { VerifyScreen } from '../components/VerifyScreen.js';
import { DoctorScreen } from '../components/DoctorScreen.js';
import { DashboardExport } from '../components/DashboardExport.js';
import { ImportScreen } from '../components/ImportScreen.js';
import { DashboardUninstall } from '../components/DashboardUninstall.js';
import { App, DEFAULT_ROUTES } from '../shell/App.js';
import { buildPaletteIndex, type PaletteEntry } from '../shell/palette-index.js';
import type { AgentTarget } from '../state/agent-targets.js';
import {
  makeInstalledHintDecorator,
  detectInstalledAgentIds,
} from '../state/agent-install-hints.js';

type ScreenView =
  | { kind: 'home' }
  | { kind: 'category'; id: CategoryId; initialFocusKey?: string }
  | { kind: 'action'; id: SettingsHomeAction };

const ACTION_LABELS = ['Verify', 'Doctor', 'Export', 'Import', 'Uninstall'];

type SaveState = 'idle-saved' | 'saving' | 'saved-toast' | 'dirty' | 'error';

function computeSaveState(
  dirtyCount: number,
  isSaving: boolean,
  currentToast: { message: string; severity: 'ok' | 'warn' | 'err'; group?: string } | null,
  hasUnresolvedError: boolean,
): SaveState {
  if (isSaving) return 'saving';
  if (currentToast?.group === 'save') return 'saved-toast';
  if (hasUnresolvedError || currentToast?.severity === 'err') return 'error';
  if (dirtyCount > 0) return 'dirty';
  return 'idle-saved';
}

function saveStateToStatus(state: SaveState): 'ok' | 'warn' | 'err' {
  if (state === 'idle-saved' || state === 'saved-toast') return 'ok';
  if (state === 'error') return 'err';
  return 'warn';
}

function saveStateLabel(
  state: SaveState,
  dirtyCount: number,
  toastMessage: string | null,
  toastAction: ToastAction | undefined,
): string {
  switch (state) {
    case 'idle-saved': return 'All changes saved ✓';
    case 'saving': return 'Saving…';
    case 'saved-toast': {
      const base = toastMessage ?? 'Saved';
      return toastAction ? `${base} · ${toastAction.label}` : base;
    }
    case 'dirty': return `${dirtyCount} unsaved`;
    case 'error': return 'Save failed — check logs';
  }
}

// ---------------------------------------------------------------------------
// InkRoot — production shell compositor (SP6+)
//
// Wraps the router logic in the App shell (Header / Sidebar / Footer).
// `initialRoute` seeds the starting view (used in tests and future deep-link
// support); entry.ts always omits it, defaulting to 'home'.
// ---------------------------------------------------------------------------

export interface InkRootProps {
  store: SettingsStore;
  catalog: ReadonlyArray<CategoryDef>;
  onExit?: () => void;
  version?: string;
  productName?: string;
  /** Optional toast store for reactive toast prop. If omitted, toast is null. */
  toastStore?: ToastStore;
  /**
   * Optional activity store for reactive isSaving state. If omitted, falls
   * back to the module-level defaultActivityStore singleton.
   */
  activityStore?: ActivityStore;
  /**
   * Seed the initial view. Defaults to 'home'. Added as a testability hook;
   * production entry always renders with default 'home' and drives navigation
   * via keyboard.
   */
  initialRoute?: string;
  /**
   * Agent targets used to compute live `installed` hints for the agents
   * multiselect. When omitted, the agents category renders without runtime
   * install hints (schema-static). Detection re-runs whenever the agents
   * category is (re)entered so the row reflects current install state (#105).
   */
  agents?: ReadonlyArray<AgentTarget>;
}

function resolveInitialView(initialRoute: string | undefined): ScreenView {
  if (!initialRoute || initialRoute === 'home') return { kind: 'home' };
  const r = DEFAULT_ROUTES.find((x) => x.id === initialRoute);
  if (!r) return { kind: 'home' };
  return r.group === 'settings'
    ? { kind: 'category', id: r.id as CategoryId }
    : { kind: 'action', id: r.id as SettingsHomeAction };
}

function computeActiveRoute(view: ScreenView): string {
  if (view.kind === 'home') return 'browser';
  if (view.kind === 'category') return view.id;
  return view.id;
}

function computeRouteId(view: ScreenView): string {
  if (view.kind === 'home') return 'home';
  if (view.kind === 'category') return `category:${view.id}`;
  return `action:${view.id}`;
}

function computePaneTitle(view: ScreenView, catalog: ReadonlyArray<CategoryDef>): string {
  if (view.kind === 'home') return 'Settings';
  if (view.kind === 'category') {
    const cat = catalog.find((c) => c.id === view.id);
    return cat?.label ?? view.id;
  }
  const label = DEFAULT_ROUTES.find((r) => r.id === view.id)?.label;
  return label ?? view.id;
}

function computeDirtyByCategory(dirtyKeys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of dirtyKeys) {
    const seg = key.split('.')[0] ?? key;
    out[seg] = (out[seg] ?? 0) + 1;
  }
  return out;
}

export function InkRoot(props: InkRootProps): React.ReactElement {
  const {
    store,
    catalog,
    onExit = () => {},
    version,
    productName,
    toastStore,
    activityStore: injectedActivityStore,
    initialRoute,
    agents,
  } = props;

  const liveActivityStore = injectedActivityStore ?? defaultActivityStore;

  // Live install-state for the agents multiselect (#105). Detection re-runs on
  // each entry into the agents category so the checkbox/hint reflects current
  // install state rather than a one-shot snapshot from app start.
  const [installedAgentIds, setInstalledAgentIds] = useState<ReadonlySet<string>>(new Set());
  const [agentRefresh, setAgentRefresh] = useState(0);
  const refreshInstalledAgents = useCallback(async () => {
    if (!agents || agents.length === 0) return;
    try {
      const ids = await detectInstalledAgentIds(agents);
      setInstalledAgentIds(ids);
      setAgentRefresh((n) => n + 1);
    } catch {
      /* detection is cosmetic — never break the shell over it */
    }
  }, [agents]);
  const decorateAgentsField = useMemo(
    () => makeInstalledHintDecorator(installedAgentIds),
    [installedAgentIds],
  );

  const [view, setView] = useState<ScreenView>(() => resolveInitialView(initialRoute));
  const [focusedPane, setFocusedPane] = useState<'sidebar' | 'main'>('sidebar');
  const [inEditBuffer, setInEditBuffer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Reactive dirty count
  const [dirtyCount, setDirtyCount] = useState(() => store.dirtyKeys().length);
  useEffect(() => {
    const unsub = store.subscribe(() => setDirtyCount(store.dirtyKeys().length));
    return unsub;
  }, [store]);

  // Reactive activity (saving in flight)
  const [isSaving, setIsSaving] = useState(() => {
    const labels = liveActivityStore.labels();
    return labels.some((l) => l.startsWith('save:'));
  });
  useEffect(() => {
    const unsub = liveActivityStore.subscribe(() => {
      setIsSaving(liveActivityStore.labels().some((l) => l.startsWith('save:')));
    });
    return unsub;
  }, [liveActivityStore]);

  // Reactive toast
  const [toast, setToast] = useState<{ message: string; severity: 'ok' | 'warn' | 'err'; group?: string; action?: ToastAction } | null>(
    () => toastStore?.current() ?? null,
  );
  useEffect(() => {
    if (!toastStore) return;
    const unsub = toastStore.subscribe(() => setToast(toastStore.current()));
    return unsub;
  }, [toastStore]);

  // Apply & Verify affordance: when a new save-group toast arrives (without an
  // action already set), retrofit it with the verify action so InkRoot's global
  // keypress handler can fire it on Enter.
  const prevSaveToastRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!toastStore) return;
    const unsub = toastStore.subscribe(() => {
      const t = toastStore.current();
      if (t?.group === 'save' && !t.action) {
        const msg = t.message;
        if (msg !== prevSaveToastRef.current) {
          prevSaveToastRef.current = msg;
          toastStore.setCurrentAction({
            key: '\r',
            label: '⏎ Apply & verify',
            handler: () => {
              setView({ kind: 'action', id: 'verify' });
              setFocusedPane('main');
            },
          });
        }
      }
      if (!t || t.group !== 'save') {
        prevSaveToastRef.current = null;
      }
    });
    return unsub;
  }, [toastStore]);

  // Persistent error flag — set when a save-error toast fires, cleared only by a
  // subsequent successful save. This keeps the header in 'error' state after the
  // 5s toast TTL expires so the UI never lies "All changes saved ✓" after a
  // failed write.
  const [hasUnresolvedError, setHasUnresolvedError] = useState(false);
  useEffect(() => {
    if (!toastStore) return;
    const unsub = toastStore.subscribe(() => {
      const t = toastStore.current();
      if (t?.severity === 'err' && t?.group === 'save-error') {
        setHasUnresolvedError(true);
      } else if (t?.severity === 'ok' && t?.group === 'save') {
        setHasUnresolvedError(false);
      }
    });
    return unsub;
  }, [toastStore]);

  // Derived save-state (single computed value, no new globals)
  const saveState = computeSaveState(dirtyCount, isSaving, toast, hasUnresolvedError);
  const headerStatus = saveStateToStatus(saveState);
  const headerLabel = saveStateLabel(saveState, dirtyCount, toast?.message ?? null, toast?.action);

  // Build palette index once per catalog change
  const paletteEntries = useMemo(
    () => buildPaletteIndex({ catalog: [...catalog], actionLabels: ACTION_LABELS }),
    [catalog],
  );

  // Global key handler: Ctrl-K opens palette; ? opens help (when not in edit buffer)
  // Also honors toast action keys while a toast with an action is visible.
  useInput((_input, key) => {
    if (paletteOpen || helpOpen) return;

    // Toast action: fire handler and dismiss when the matching key is pressed.
    if (toast?.action && !inEditBuffer) {
      const action = toast.action;
      const matchesKey = action.key === '\r' ? key.return : _input === action.key;
      if (matchesKey) {
        action.handler();
        toastStore?.dismiss();
        return;
      }
    }

    if (key.ctrl && _input === 'k') {
      setPaletteOpen(true);
      return;
    }
    if (_input === '?' && !inEditBuffer) {
      setHelpOpen(true);
      return;
    }
    if (key.tab) setFocusedPane((p) => p === 'sidebar' ? 'main' : 'sidebar');
  });

  const handlePalettePick = useCallback((entry: PaletteEntry) => {
    setPaletteOpen(false);
    if (entry.kind === 'category') {
      setView({ kind: 'category', id: entry.id as CategoryId });
      setFocusedPane('main');
    } else if (entry.kind === 'field' && entry.path) {
      // entry.id is the field key; entry.path is the category id.
      // Thread initialFocusKey so CategoryScreen pre-positions the cursor.
      setView({ kind: 'category', id: entry.path as CategoryId, initialFocusKey: entry.id });
      setFocusedPane('main');
    } else if (entry.kind === 'action') {
      setView({ kind: 'action', id: entry.id as SettingsHomeAction });
      setFocusedPane('main');
    }
  }, []);

  const handlePaletteClose = useCallback(() => setPaletteOpen(false), []);
  const handleHelpClose = useCallback(() => setHelpOpen(false), []);

  const goHome = useCallback(() => {
    setView({ kind: 'home' });
    setFocusedPane('sidebar');
  }, []);

  const onSelectCategory = useCallback((id: CategoryId) => {
    setView({ kind: 'category', id });
    setFocusedPane('main');
  }, []);

  const onAction = useCallback((action: SettingsHomeAction) => {
    setView({ kind: 'action', id: action });
    setFocusedPane('main');
  }, []);

  const handleSelectRoute = useCallback((id: string) => {
    if (id === 'quit') {
      onExit();
      return;
    }
    const route = DEFAULT_ROUTES.find((r) => r.id === id);
    if (!route) return;
    if (route.group === 'settings') {
      setView({ kind: 'category', id: id as CategoryId });
    } else {
      setView({ kind: 'action', id: id as SettingsHomeAction });
    }
    setFocusedPane('main');
  }, [onExit]);

  // Re-detect agent install state whenever the agents category becomes the
  // active view, so re-entering the screen always shows fresh hints (#105).
  const onAgentsCategory = view.kind === 'category' && view.id === 'agents';
  useEffect(() => {
    if (onAgentsCategory) void refreshInstalledAgents();
  }, [onAgentsCategory, refreshInstalledAgents]);

  const activeRoute = computeActiveRoute(view);
  const routeId = computeRouteId(view);
  const paneTitle = computePaneTitle(view, catalog);
  const dirtyByCategory = computeDirtyByCategory(store.dirtyKeys());

  let currentScreen: React.ReactElement;

  if (view.kind === 'category') {
    const category = catalog.find((c) => c.id === view.id);
    if (!category) {
      currentScreen = (
        <SettingsHome
          store={store}
          catalog={catalog}
          onSelectCategory={onSelectCategory}
          onAction={onAction}
          onQuit={onExit}
          version={version}
          productName={productName}
        />
      );
    } else {
      const isAgents = category.id === 'agents';
      currentScreen = (
        <CategoryScreen
          category={category}
          store={store}
          onBack={goHome}
          onEditBufferChange={setInEditBuffer}
          initialFocusKey={view.initialFocusKey}
          {...(isAgents
            ? { decorateField: decorateAgentsField, refreshSignal: agentRefresh }
            : {})}
        />
      );
    }
  } else if (view.kind === 'action') {
    const actionId: SettingsHomeAction = view.id;
    switch (actionId) {
      case 'verify':
        currentScreen = <VerifyScreen onBack={goHome} />;
        break;
      case 'doctor':
        currentScreen = <DoctorScreen onBack={goHome} />;
        break;
      case 'export':
        currentScreen = <DashboardExport onBack={goHome} />;
        break;
      case 'import':
        currentScreen = <ImportScreen store={store} catalog={catalog} onBack={goHome} />;
        break;
      case 'uninstall':
        currentScreen = <DashboardUninstall onBack={goHome} />;
        break;
      default: {
        const _exhaustive: never = actionId;
        throw new Error(`Unhandled action: ${String(_exhaustive)}`);
      }
    }
  } else {
    currentScreen = (
      <SettingsHome
        store={store}
        catalog={catalog}
        onSelectCategory={onSelectCategory}
        onAction={onAction}
        onQuit={onExit}
        version={version}
        productName={productName}
      />
    );
  }

  return (
    <App
      routes={DEFAULT_ROUTES}
      activeRoute={activeRoute}
      routeId={routeId}
      dirtyByCategory={dirtyByCategory}
      status={headerStatus}
      pending={0}
      toast={toast}
      saveLabel={headerLabel}
      focusedPane={focusedPane}
      paneTitle={paneTitle}
      onSelectRoute={handleSelectRoute}
      paletteOpen={paletteOpen}
      paletteEntries={paletteEntries}
      onPalettePick={handlePalettePick}
      onPaletteClose={handlePaletteClose}
      helpOpen={helpOpen}
      onHelpClose={handleHelpClose}
      activityStore={liveActivityStore}
    >
      {currentScreen}
    </App>
  );
}
