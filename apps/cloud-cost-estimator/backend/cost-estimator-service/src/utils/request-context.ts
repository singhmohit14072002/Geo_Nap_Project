import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  requestId: string;
}

const requestContextStore = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(
  context: RequestContext,
  fn: () => T
): T => {
  return requestContextStore.run(context, fn);
};

export const getRequestContext = (): RequestContext | undefined => {
  return requestContextStore.getStore();
};

