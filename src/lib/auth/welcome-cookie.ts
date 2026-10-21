/**
 * The cookie that says "this is the first page after signing in", so the
 * portal greets the person with its welcome animation once. Read by the
 * layouts on the server and cleared by the animation in the browser; it holds
 * nothing but "1" and lives a minute.
 */
export const WELCOME_COOKIE = "portal-welcome";
