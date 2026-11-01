create table if not exists sessions (
  id text primary key,
  slug text unique not null,
  transcript text not null default '',
  claims jsonb,
  portfolio jsonb not null default '{"templateId":"showcase","skills":[],"projects":{},"contradictions":[]}',
  metrics jsonb not null default '{}',
  created_at timestamptz default now()
);
