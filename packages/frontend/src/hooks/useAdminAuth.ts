"use client";

import { useState, useEffect, useCallback } from "react";
import { useSignMessage, useAccount, useChainId } from "wagmi";
import { SiweMessage } from "siwe";

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

export function useAdminAuth() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing session
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, { credentials: "include" });
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Reset session when wallet changes
  useEffect(() => {
    setIsAuthenticated(false);
    checkSession();
  }, [address, checkSession]);

  async function signIn() {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch nonce from server
      const { nonce } = await fetch(`${BASE_URL}/auth/nonce`).then((r) => r.json());

      // 2. Build SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to ChainLens Admin Dashboard",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const preparedMessage = message.prepareMessage();

      // 3. Sign with wallet
      const signature = await signMessageAsync({ message: preparedMessage });

      // 4. Verify on server → issues JWT cookie
      const res = await fetch(`${BASE_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: preparedMessage, signature }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Verification failed");
      }

      setIsAuthenticated(true);
    } catch (err) {
      if (err instanceof Error && err.message.includes("User rejected")) {
        setError("Signature rejected");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setIsAuthenticated(false);
  }

  return { isAuthenticated, signIn, signOut, loading, error };
}
