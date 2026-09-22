# FantaMotoGP 2026 v4

## Novita
- Layout Home ripulito
- Paddock con avatar evolutivi
- Pagellone del lunedi salvato in `monday_reports`
- Pulsante Admin per generare/rigenerare il Pagellone
- Cron Vercel ogni lunedi alle 07:30 UTC
- Generazione server-side con OpenAI API

## Environment Variables Vercel
- NEXT_PUBLIC_SUPABASE_URL (Config)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (Config)
- SUPABASE_SERVICE_ROLE_KEY (Secret)
- OPENAI_API_KEY (Secret)
- CRON_SECRET (Secret)
- OPENAI_MODEL (Config, opzionale: gpt-5.6-luna)

Non esporre mai SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY o CRON_SECRET nel frontend.
