-- Fix: allow users to read their own row even when is_active = false (pending users)
CREATE POLICY users_select_self ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Friend requests / friendships
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT friend_requests_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  CONSTRAINT friend_requests_no_self CHECK (sender_id != receiver_id),
  CONSTRAINT friend_requests_unique_pair UNIQUE (sender_id, receiver_id)
);

CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id, status);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id, status);
CREATE INDEX idx_friend_requests_school ON public.friend_requests(school_id);

-- RLS
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own friend requests (sent or received)
CREATE POLICY friend_requests_select ON public.friend_requests FOR SELECT
  USING (
    school_id = public.current_user_school_id()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );

-- Users can send friend requests (insert)
CREATE POLICY friend_requests_insert ON public.friend_requests FOR INSERT
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND sender_id = auth.uid()
  );

-- Users can update requests they're involved in (accept/reject by receiver, cancel by sender)
CREATE POLICY friend_requests_update ON public.friend_requests FOR UPDATE
  USING (
    school_id = public.current_user_school_id()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );

-- Users can delete their own sent requests
CREATE POLICY friend_requests_delete ON public.friend_requests FOR DELETE
  USING (
    school_id = public.current_user_school_id()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );
