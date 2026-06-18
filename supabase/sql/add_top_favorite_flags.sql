-- Run once in Supabase SQL editor.
-- Adds lightweight boolean flags so "Top" and "Favorite" marks persist
-- across devices and are visible to Ethan (bot.py) via the same tables,
-- instead of being trapped in browser localStorage.

alter table feed       add column if not exists is_top boolean not null default false;
alter table feed       add column if not exists is_favorite boolean not null default false;

alter table yaya_notes add column if not exists is_top boolean not null default false;
alter table yaya_notes add column if not exists is_favorite boolean not null default false;

alter table diary      add column if not exists is_top boolean not null default false;
alter table diary      add column if not exists is_favorite boolean not null default false;
