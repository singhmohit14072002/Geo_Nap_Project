"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestContext = exports.runWithRequestContext = void 0;
const async_hooks_1 = require("async_hooks");
const requestContextStore = new async_hooks_1.AsyncLocalStorage();
const runWithRequestContext = (context, fn) => {
    return requestContextStore.run(context, fn);
};
exports.runWithRequestContext = runWithRequestContext;
const getRequestContext = () => {
    return requestContextStore.getStore();
};
exports.getRequestContext = getRequestContext;
