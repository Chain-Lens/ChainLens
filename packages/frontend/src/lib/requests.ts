import type { PaymentRequest } from "@chainlens/shared";

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001/api";

export type RequestWithApi = PaymentRequest & {
  api?: { name: string; description: string };
};

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body && typeof body === "object" && "error" in body
        ? ((body as { error?: { message?: string } }).error?.message ??
            `Request failed with status ${res.status}`)
        : `Request failed with status ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

export async function fetchRequestStatus(requestId: string): Promise<RequestWithApi> {
  return requestJson<RequestWithApi>(`/requests/${requestId}`);
}

export async function refundRequest(requestId: string, buyer: string): Promise<void> {
  await requestJson(`/payments/requests/${requestId}/refund`, {
    method: "POST",
    body: JSON.stringify({ buyer }),
  });
}
