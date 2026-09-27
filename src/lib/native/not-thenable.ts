/**
 * The same object, minus the `then` that would make an await swallow it.
 *
 * A Capacitor plugin is a Proxy that answers every property with a native
 * method, `then` included, so a promise that resolves to one calls that
 * `then` and fails with "Plugin.then() is not implemented" instead of handing
 * the plugin over (see plugin() in features/native/bridge.ts). Kept on its own,
 * free of the browser, so the tests can hold it to that.
 */
export function notThenable<T extends object>(target: T): T {
  return new Proxy(target, {
    get: (object, property) => (property === "then" ? undefined : Reflect.get(object, property)),
  });
}
