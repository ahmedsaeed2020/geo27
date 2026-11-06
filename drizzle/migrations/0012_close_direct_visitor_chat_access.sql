DROP POLICY IF EXISTS "Messages readable by thread id" ON public.chat_messages;
DROP POLICY IF EXISTS "Visitors append messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Visitors create threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Visitors manage threads by unguessable id" ON public.chat_threads;
DROP POLICY IF EXISTS "Visitors update their threads" ON public.chat_threads;
REVOKE ALL ON public.chat_threads, public.chat_messages FROM anon;
GRANT ALL ON public.chat_threads, public.chat_messages TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;