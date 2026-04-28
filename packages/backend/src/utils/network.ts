import { lookup } from "node:dns/promises";
import net from "node:net";
import { BadRequestError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost", ".localdomain"];

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateIp(address: string): boolean {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isPrivateIPv4(address);
  if (ipVersion === 6) return isPrivateIPv6(address);
  return false;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestError("Invalid outbound URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestError("Only HTTP(S) outbound URLs are allowed");
  }

  if (url.username || url.password) {
    throw new BadRequestError("Outbound URLs must not include credentials");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new BadRequestError("Blocked outbound hostname");
  }

  if (isPrivateIp(url.hostname)) {
    throw new BadRequestError("Blocked outbound IP address");
  }

  try {
    const resolved = await lookup(url.hostname, { all: true });
    if (resolved.some((entry) => isPrivateIp(entry.address))) {
      throw new BadRequestError("Blocked outbound host resolution");
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    // Best-effort DNS resolution. If lookup fails here, the subsequent fetch
    // will still enforce runtime connectivity/error handling.
  }

  return url;
}
