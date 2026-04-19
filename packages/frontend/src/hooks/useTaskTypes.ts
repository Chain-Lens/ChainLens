"use client";

import { INITIAL_TASK_TYPE_NAMES } from "@chainlens/shared";

/**
 * MVP: returns the static list of task types registered on deploy.
 * Later this can query a backend /api/task-types endpoint that reads
 * TaskTypeRegistry on-chain.
 */
export function useTaskTypes() {
  return {
    taskTypes: INITIAL_TASK_TYPE_NAMES as readonly string[],
    loading: false,
    error: null as string | null,
  };
}
