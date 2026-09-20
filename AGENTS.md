# AGENTS.md

## Project Context

Art Flow Creative is a Vite/React application deployed on Vercel. Better Auth handles independent email/password accounts, and Neon Postgres stores application data. Treat it as user-owned application code, keep changes focused on the request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publishing.

## Key Files

- `src/`: frontend application source.
- `api/`: Vercel serverless endpoints and Better Auth handlers.
- `api/neon-data.mjs`: authenticated business-data API.
- `src/lib/neonEntityClient.js`: frontend business-data client.
- `vite.config.js`: Vite frontend configuration.
- `vercel.json`: production routing, cron, and function configuration.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `npm run dev` for local frontend work.
- Keep authentication on Better Auth and business data in Neon; do not add a second auth or data provider.
- Preserve the production custom domain, `https://artflowcreative.com`.
- Run the relevant checks from `package.json` before finishing code changes.
