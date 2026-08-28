# Project PenPal

A friendship-first pen pal application for meaningful, long-form platonic correspondence.

## Stack
- React
- TypeScript
- Vite
- Supabase

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Add your Supabase project URL and publishable key.
3. Run `npm install`.
4. Run `npm run dev`.

## Environment variables
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Never commit database passwords, service-role keys, or other secrets.
