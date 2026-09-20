# Art Flow Creative

Business management for artists: marketplace sales, orders, expenses, inventory, reporting, tax planning, mileage, products, and business goals in one responsive dashboard.

The app uses Vite and React on the frontend, Vercel serverless functions, Better Auth, and Neon Postgres.

## Development

npm ci
npm run dev

Open the local URL Vite prints (typically http://localhost:5173).

Before opening a pull request:

```bash
npm test
npm run lint
npm run build
```

## Deployment

Connected to Vercel — pushes to `main` deploy automatically to [artflowcreative.com](https://artflowcreative.com).

## Environment variables

Set production secrets in Vercel (Project → Settings → Environment Variables). Core services use the configured Neon database URL and `BETTER_AUTH_SECRET`; Google and Resend credentials enable optional mailbox sync and password-reset email.
