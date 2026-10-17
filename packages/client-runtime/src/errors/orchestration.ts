import {
  OrchestrationDispatchCommandError,
  OrchestrationV2DispatchCommandError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isOrchestrationDispatchCommandError = Schema.is(OrchestrationDispatchCommandError);
const isOrchestrationV2DispatchCommandError = Schema.is(OrchestrationV2DispatchCommandError);

/** A delete sent with `expectedEmpty` kept the thread because a message landed first. */
export function wasThreadNotEmpty(error: unknown): boolean {
  return isOrchestrationV2DispatchCommandError(error) && error.reason === "thread_not_empty";
}

export function wasBootstrapThreadDeleted(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "deleted"
  );
}

export function wasBootstrapThreadNotCreated(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "not-created"
  );
}
