# Plan2Reality

Plan2Reality is a React Router application that turns uploaded 2D floor plans into AI-generated 3D architectural visualizations using Puter.

## Tech stack

- React 19 + TypeScript
- React Router 7
- Vite
- Tailwind CSS
- Puter.js / Puter Worker

## Local development

Install dependencies:

```bash
npm install
```

Create a local environment file from the example:

```bash
cp .env.example .env.local
```

Set the Puter worker URL in `.env.local`:

```env
VITE_PUTER_WORKER_URL=YOUR_PUTER_WORKER_URL
```

Run the development server:

```bash
npm run dev
```

## Production build

```bash
npm run build
```

The Netlify deployment uses the client bundle generated at `build/client`.

## Netlify deployment

This project is configured for Netlify as a client-side React Router SPA. It does not require the Dockerfile or a Node server in production.

`netlify.toml` configures:

- Build command: `npm run build`
- Publish directory: `build/client`
- Node.js: 22
- SPA fallback for client-side routes such as `/visualizer/:id`

### Required Netlify environment variable

In Netlify, open **Site configuration → Environment variables** and add:

```env
VITE_PUTER_WORKER_URL=YOUR_PUTER_WORKER_URL
```

Use the URL of the Puter worker that is already configured for this project. Do not commit `.env.local` or any secret credentials.

## Notes

The application has a local-storage fallback for projects when the Puter worker is unavailable. The Puter worker is still required for the hosted project/AI workflow.
