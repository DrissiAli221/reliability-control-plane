/** A non-2xx answer from the control plane. The status lets callers tell "not found" from "the service is failing". */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly title?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const isNotFound = (reason: unknown): boolean => reason instanceof ApiError && reason.status === 404;
