export class BadInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadInputError";
  }
}

export class UpstreamError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}
