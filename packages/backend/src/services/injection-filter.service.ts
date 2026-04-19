/**
 * Prompt-injection / LLM-jailbreak patterns (OWASP LLM01 motivated).
 * Applied to serialized seller responses before they reach buyer-facing output
 * or any downstream LLM call. Not a substitute for strict schema validation —
 * it just catches text-body attempts to hijack instructions.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\[SYSTEM:\s/i,
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(above|previous)/i,
  /forget\s+(all\s+)?(above|previous)/i,
  /you\s+are\s+now\s+[a-z]/i,
  /act\s+as\s+(a\s+)?(different|new)/i,
  /\n\nSystem:\s/,
  /\n\nAssistant:\s/,
  /\n\nHuman:\s/,
];

const MAX_RESPONSE_BYTES = 1_000_000;

export interface InjectionMatch {
  found: boolean;
  pattern?: string;
}

export interface ScanResult {
  clean: boolean;
  reason?: string;
}

export function containsInjection(text: string): InjectionMatch {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { found: true, pattern: pattern.source };
    }
  }
  return { found: false };
}

export function scanResponse(data: unknown): ScanResult {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(data);
  } catch {
    return { clean: false, reason: "response_unserializable" };
  }
  if (serialized === undefined) {
    return { clean: false, reason: "response_unserializable" };
  }
  if (serialized.length > MAX_RESPONSE_BYTES) {
    return { clean: false, reason: "response_too_large" };
  }
  const hit = containsInjection(serialized);
  if (hit.found) {
    return { clean: false, reason: `injection_pattern: ${hit.pattern}` };
  }
  return { clean: true };
}

export { MAX_RESPONSE_BYTES };
