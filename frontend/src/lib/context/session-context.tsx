"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { registerTokenGetter } from "@/lib/api/client";
import { getMe } from "@/lib/api/identity";
import type { Identity } from "@/lib/types";

const STORAGE_KEY = "resilience.session";
const LAST_IDENTITY_KEY = "resilience.last_identity";

interface StoredSession {
  token: string;
  identity: Identity;
}

export interface LastIdentity {
  id: string;
  pseudonym: string;
  avatar_seed: string;
}

interface SessionContextValue {
  identity: Identity | null;
  token: string | null;
  isLoading: boolean;
  /** Kept even after the active session is cleared, so /unlock can greet a
   * returning survivor by pseudonym and ask only for their PIN — cleared
   * only by the explicit "Clear everything" settings flow. */
  lastIdentity: LastIdentity | null;
  setSession: (session: StoredSession) => void;
  clearSession: () => void;
  forgetDevice: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function readLastIdentity(): LastIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as LastIdentity) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastIdentity, setLastIdentity] = useState<LastIdentity | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    registerTokenGetter(() => tokenRef.current);
    setLastIdentity(readLastIdentity());
  }, []);

  const setSession = useCallback((session: StoredSession) => {
    tokenRef.current = session.token;
    setToken(session.token);
    setIdentity(session.identity);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      const last: LastIdentity = {
        id: session.identity.id,
        pseudonym: session.identity.pseudonym,
        avatar_seed: session.identity.avatar_seed,
      };
      window.localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify(last));
      setLastIdentity(last);
    }
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setIdentity(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const forgetDevice = useCallback(() => {
    clearSession();
    setLastIdentity(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LAST_IDENTITY_KEY);
    }
  }, [clearSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setIsLoading(false);
      return;
    }
    try {
      const parsed: StoredSession = JSON.parse(raw);
      tokenRef.current = parsed.token;
      setToken(parsed.token);
      setIdentity(parsed.identity);
      // Revalidate in the background; drop the session if the server no longer knows it
      // (e.g. backend restarted, which clears the prototype's in-memory session store).
      getMe()
        .then((fresh) => setIdentity(fresh))
        .catch(() => clearSession())
        .finally(() => setIsLoading(false));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ identity, token, isLoading, lastIdentity, setSession, clearSession, forgetDevice }),
    [identity, token, isLoading, lastIdentity, setSession, clearSession, forgetDevice]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
