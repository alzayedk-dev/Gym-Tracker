-- A workout summary saved with each completed session.
-- Made by the "summarize" edge function when Completed is ticked:
--   { "stats": {...the numbers...}, "note": "short coach note", "note_by": "ai" | "you", "made_at": "..." }
-- Empty (null) until the session is first completed.
alter table public.sessions add column summary jsonb;
