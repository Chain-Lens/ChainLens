"use client";

import { useState, useEffect, useCallback } from "react";
import { useSignMessage, useAccount, useChainId } from "wagmi";
import { SiweMessage } from "siwe";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

export function useAdminAuth() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기존 세션 확인
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

  // 지갑 변경 시 세션 초기화
  useEffect(() => {
    setIsAuthenticated(false);
    checkSession();
  }, [address, checkSession]);

  async function signIn() {
    if (!address) return;
    setLoading(true);
    setError(null);

    try {
      // 1. 서버에서 nonce 발급
      const { nonce } = await fetch(`${BASE_URL}/auth/nonce`).then((r) =>
        r.json()
      );

      // 2. SIWE 메시지 생성
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

      // 3. 지갑으로 서명
      const signature = await signMessageAsync({ message: preparedMessage });

      // 4. 서버에서 검증 → JWT 쿠키 발급
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
