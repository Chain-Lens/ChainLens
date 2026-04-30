/**
 * Pure error-shaping helpers used by the listing-call path. Kept off
 * the route so the service can produce CallLog `errorReason` strings
 * and structured log payloads without importing Express.
 */

export function rejectionReasonToErrorReason(reason: string | undefined): string {
  if (!reason) return "response_rejected";
  if (reason.startsWith("injection_pattern:")) return "response_rejected_injection";
  if (reason.startsWith("schema_validation_failed:")) return "response_rejected_schema";
  if (reason === "response_too_large") return "response_rejected_too_large";
  if (reason === "response_unserializable") return "response_rejected_unserializable";
  return "response_rejected";
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    const base = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    const cause = error.cause;
    if (!cause) return base;
    if (cause instanceof Error) {
      return {
        ...base,
        cause: {
          name: cause.name,
          message: cause.message,
          stack: cause.stack,
        },
      };
    }
    return { ...base, cause };
  }
  return { value: String(error) };
}

export function errorCauseMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const cause = error.cause;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}
