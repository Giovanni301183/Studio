-- Studio: preparazione di Supabase (da eseguire una volta sola)
-- Supabase → SQL Editor → New query → incolla tutto → Run

-- 1. Tabella dei documenti (personaggi, episodi, rassegne, impostazioni)
create table if not exists public.documents (
  path text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists documents_path_pattern on public.documents (path text_pattern_ops);

-- Accesso solo dal server dello Studio (chiave service_role): nessuna policy pubblica
alter table public.documents enable row level security;

-- 2. Archivio privato per immagini, audio, video e PDF
insert into storage.buckets (id, name, public)
values ('studio', 'studio', false)
on conflict (id) do nothing;
