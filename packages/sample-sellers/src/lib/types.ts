/**
 * Shared contract between the ChainLens gateway and any seller wrapper.
 * The gateway POSTs `SellerRequest` to the seller's single endpoint and
 * expects a JSON body that passes the task type's schema + injection filter.
 */
export interface SellerRequest {
  task_type: string;
  inputs: Record<string, unknown>;
}

export type TaskHandler = (inputs: Record<string, unknown>) => Promise<unknown>;

export type TaskHandlerMap = Record<string, TaskHandler>;

export class BadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadInputError";
  }
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}
