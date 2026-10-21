/**
 * Which version of the site this is: the deployment on Vercel, the commit
 * when there is no deployment id, "local" on a developer's machine. A phone
 * holding pages of another version takes the new ones on the next pull
 * (page-installer.tsx).
 */
export const BUILD = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
