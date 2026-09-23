/*
# Remove old register_user overload

The original 4-parameter `register_user(text, text, text, text)` conflicts with
the newer 6-parameter version that has defaults for p_phone and p_email. When a
caller passes 4 arguments, Postgres cannot choose between the two. Dropping the
old signature resolves the ambiguity — the new function's defaults cover 4-arg
calls identically.
*/

DROP FUNCTION IF EXISTS public.register_user(text, text, text, text);
