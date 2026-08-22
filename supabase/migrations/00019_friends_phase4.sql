-- Phase 4: Friends module hardening

-- 1. Drop the unconditional unique constraint and replace with partial unique indexes
ALTER TABLE public.friend_requests DROP CONSTRAINT IF EXISTS friend_requests_unique_pair;

-- Only one pending or accepted request per direction
CREATE UNIQUE INDEX idx_friend_requests_active_pair
  ON public.friend_requests(sender_id, receiver_id)
  WHERE status IN ('pending', 'accepted');

-- Prevent A→B and B→A from both being active at the same time
CREATE OR REPLACE FUNCTION public.check_bidirectional_friend_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE sender_id = NEW.receiver_id
      AND receiver_id = NEW.sender_id
      AND status IN ('pending', 'accepted')
  ) THEN
    RAISE EXCEPTION 'A friend request already exists between these users';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_bidirectional_friend
  BEFORE INSERT ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bidirectional_friend_request();

-- 2. Tighten RLS update policy: sender can only cancel, receiver can only accept/reject
DROP POLICY IF EXISTS friend_requests_update ON public.friend_requests;

-- Sender can: cancel pending request, or unfriend (accepted → cancelled)
CREATE POLICY friend_requests_update_sender ON public.friend_requests FOR UPDATE
  USING (
    school_id = public.current_user_school_id()
    AND sender_id = auth.uid()
    AND status IN ('pending', 'accepted')
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND sender_id = auth.uid()
    AND status = 'cancelled'
  );

-- Receiver can: accept/reject pending request, or unfriend (accepted → rejected)
CREATE POLICY friend_requests_update_receiver ON public.friend_requests FOR UPDATE
  USING (
    school_id = public.current_user_school_id()
    AND receiver_id = auth.uid()
    AND status IN ('pending', 'accepted')
  )
  WITH CHECK (
    school_id = public.current_user_school_id()
    AND receiver_id = auth.uid()
    AND status IN ('accepted', 'rejected')
  );

-- 3. Tighten delete policy: only allow deleting rejected/cancelled rows (for cleanup on re-send)
DROP POLICY IF EXISTS friend_requests_delete ON public.friend_requests;

CREATE POLICY friend_requests_delete ON public.friend_requests FOR DELETE
  USING (
    school_id = public.current_user_school_id()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
    AND status IN ('rejected', 'cancelled')
  );

-- 4. Add 'friend' to notification type constraints
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'message', 'grade', 'homework', 'schedule', 'attendance',
  'announcement', 'document', 'library', 'system', 'friend'
));

ALTER TABLE public.notification_settings DROP CONSTRAINT IF EXISTS notification_settings_type_check;
ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_type_check CHECK (type IN (
  'message', 'grade', 'homework', 'schedule', 'attendance',
  'announcement', 'document', 'library', 'system', 'friend'
));
