"use client";

import { useState, useEffect, useCallback } from "react";
import { useSignMessage, useAccount, useChainId } from "wagmi";
import { SiweMessage } from "siwe";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

export function useSellerAuth() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/seller/auth/me`, {
        credentials: "include",
      });
      const data = await res.json();
      setIsAuthenticated(!!data.authenticated);
      setSessionAddress(data.address ?? null);
    } catch {
      setIsAuthenticated(false);
      setSessionAddress(null);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // If the user switches wallet mid-session, drop the seller session —
  // the JWT is bound to a specific address and the endpoint visibility
  // / edit gate must not apply to a different wallet.
  useEffect(() => {
    if (
      isAuthenticated &&
      address &&
      sessionAddress &&
      address.toLowerCase() !== sessionAddress.toLowerCase()
    ) {
      setIsAuthenticated(false);
      setSessionAddress(null);
    }
  }, [address, sessionAddress, isAuthenticated]);

  async function signIn() {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      const { nonce } = await fetch(`${BASE_URL}/seller/auth/nonce`).then(
        (r) => r.json(),
      );

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to ChainLens Seller Portal",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const preparedMessage = message.prepareMessage();
      const signature = await signMessageAsync({ message: preparedMessage });

      const res = await fetch(`${BASE_URL}/seller/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: preparedMessage, signature }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Verification failed");
      }

      const data = await res.json();
      setIsAuthenticated(true);
      setSessionAddress(data.address ?? address.toLowerCase());
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
    await fetch(`${BASE_URL}/seller/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setIsAuthenticated(false);
    setSessionAddress(null);
  }

  return {
    isAuthenticated,
    sessionAddress,
    signIn,
    signOut,
    loading,
    error,
  };
}