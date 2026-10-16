import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ProxyTarget } from "@/lib/admin.functions";

const KEY = "fcp.viewAs";

type ProxyCtx = {
  proxy: ProxyTarget | null;
  setProxy: (p: ProxyTarget | null) => void;
  ready: boolean;
  /** True while viewing as another user: View As is read-only, so write controls must check this. */
  readOnly: boolean;
};

const Ctx = createContext<ProxyCtx>({
  proxy: null,
  setProxy: () => {},
  ready: false,
  readOnly: false,
});

export function ProxyProvider({ children }: { children: ReactNode }) {
  const [proxy, setProxyState] = useState<ProxyTarget | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setProxyState(JSON.parse(raw) as ProxyTarget);
    } catch {
      /* ignore unreadable state */
    }
    setReady(true);
  }, []);

  const setProxy = useCallback((p: ProxyTarget | null) => {
    setProxyState(p);
    try {
      if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore storage failures */
    }
  }, []);

  const readOnly = !!proxy;

  return <Ctx.Provider value={{ proxy, setProxy, ready, readOnly }}>{children}</Ctx.Provider>;
}

export const useProxy = () => useContext(Ctx);
