import { Box, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { semantic } from '../theme/palette.js';
import { reducedMotion } from '../theme/motion-guard.js';

const PULSE_TTL = 500;

export interface SidebarRoute {
  id: string;
  label: string;
  group: 'settings' | 'actions' | 'exit';
}

export interface SidebarProps {
  routes: readonly SidebarRoute[];
  activeRoute: string;
  dirtyByCategory: Record<string, number>;
  onSelect: (id: string) => void;
  focused: boolean;
}

export function Sidebar({ routes, activeRoute, dirtyByCategory, onSelect, focused }: SidebarProps): JSX.Element {
  const [cursor, setCursor] = useState(() => Math.max(0, routes.findIndex(r => r.id === activeRoute)));

  useEffect(() => {
    const i = routes.findIndex(r => r.id === activeRoute);
    if (i >= 0) setCursor(i);
  }, [activeRoute, routes]);

  // Track per-category dirty counts so we can detect N→0 transitions.
  const prevDirtyRef = useRef<Record<string, number>>({});
  const [pulsingCategories, setPulsingCategories] = useState<Set<string>>(new Set());
  const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Effect 1: respond to dirty changes — detect N→0 transitions and start per-category pulse timers.
  useEffect(() => {
    const prev = prevDirtyRef.current;

    if (!reducedMotion()) {
      for (const id of Object.keys(prev)) {
        const prevCount = prev[id] ?? 0;
        const curCount = dirtyByCategory[id] ?? 0;
        if (prevCount > 0 && curCount === 0 && !pulseTimers.current.has(id)) {
          setPulsingCategories((existing) => {
            const next = new Set(existing);
            next.add(id);
            return next;
          });
          const handle = setTimeout(() => {
            setPulsingCategories((s) => {
              const next = new Set(s);
              next.delete(id);
              return next;
            });
            pulseTimers.current.delete(id);
          }, PULSE_TTL);
          pulseTimers.current.set(id, handle);
        }
      }
    }

    prevDirtyRef.current = { ...dirtyByCategory };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyByCategory]);

  // Effect 2: cleanup on unmount only — clear all pending pulse timers.
  useEffect(() => {
    return () => {
      for (const handle of pulseTimers.current.values()) clearTimeout(handle);
      pulseTimers.current.clear();
    };
  }, []);

  useInput((_input, key) => {
    if (!focused) return;
    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(routes.length - 1, c + 1));
    } else if (key.return) {
      const route = routes[cursor];
      if (route) onSelect(route.id);
    }
  }, { isActive: focused });

  const settingsRoutes = routes.filter(r => r.group === 'settings');
  const actionsRoutes = routes.filter(r => r.group === 'actions');
  const exitRoutes = routes.filter(r => r.group === 'exit');

  const renderRow = (r: SidebarRoute, globalIndex: number) => {
    const isCursor = focused && globalIndex === cursor;
    const isActive = r.id === activeRoute;
    const dirty = r.group === 'settings' && (dirtyByCategory[r.id] ?? 0) > 0;
    const pulsing = r.group === 'settings' && pulsingCategories.has(r.id);
    const showDot = dirty || pulsing;
    return (
      <Box key={r.id} justifyContent="space-between">
        <Text color={isCursor || isActive ? semantic.accent : semantic.text} bold={isCursor}>
          {isCursor ? '▸ ' : '  '}{r.label}
        </Text>
        {showDot && <Text color={pulsing ? semantic.accentAlt : semantic.accent}>●</Text>}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" width={24} paddingX={1}>
      <Text color={semantic.textDim} bold>SETTINGS</Text>
      {settingsRoutes.map((r, i) => renderRow(r, i))}
      <Text color={semantic.textMuted}>────────────────────</Text>
      <Text color={semantic.textDim} bold>ACTIONS</Text>
      {actionsRoutes.map((r, i) => renderRow(r, settingsRoutes.length + i))}
      {exitRoutes.length > 0 && (
        <>
          <Text color={semantic.textMuted}>────────────────────</Text>
          <Text color={semantic.textDim} bold>EXIT</Text>
          {exitRoutes.map((r, i) =>
            renderRow(r, settingsRoutes.length + actionsRoutes.length + i),
          )}
        </>
      )}
    </Box>
  );
}
