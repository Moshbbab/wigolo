export interface Toast {
  message: string;
  severity: 'ok' | 'warn' | 'err';
  ttl: number;
  group?: string;
}

type Listener = () => void;

interface ToastStore {
  push(t: Toast): void;
  current(): Toast | null;
  queue(): Toast[];
  subscribe(fn: Listener): () => void;
}

export function createToastStore(): ToastStore {
  let queue: Toast[] = [];
  const listeners = new Set<Listener>();
  const fire = () => listeners.forEach((l) => l());

  function push(t: Toast): void {
    if (t.group === 'save') {
      const last = queue[queue.length - 1];
      if (last && last.group === 'save') {
        const m = /^Saved · (\d+) fields$/.exec(last.message);
        const next = m ? Number(m[1]) + 1 : 2;
        queue[queue.length - 1] = { ...last, message: `Saved · ${next} fields` };
        fire();
        return;
      }
    }
    queue.push(t);
    fire();
    setTimeout(() => {
      queue = queue.filter((q) => q !== t);
      fire();
    }, t.ttl);
  }

  return {
    push,
    current: () => queue[0] ?? null,
    queue: () => [...queue],
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
