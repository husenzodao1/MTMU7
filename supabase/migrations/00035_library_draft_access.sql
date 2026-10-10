-- ============================================================================
-- 00035 Library: a book author may set the access list of their own draft.
--
-- library_items accepts an insert with 'library.create', but the access list
-- that backs visibility = 'specific' required 'library.update'. A role holding
-- only 'library.create' could therefore create a book it could not finish: the
-- item row was written and the access rows were rejected.
--
-- The author of an unpublished draft may now manage that draft's access list.
-- A draft is invisible to readers (the member read policy requires
-- status = 'published'), so this grants no additional read access; publishing
-- still requires 'library.publish'.
-- ============================================================================

-- The author is already stamped into library_items.uploaded_by on insert
-- (00026), so the policy can key on it.
--
-- Read through a SECURITY DEFINER helper: the library_items read policy itself
-- consults library_item_access, so an inline subquery would recurse.
CREATE OR REPLACE FUNCTION app.is_own_library_draft(p_item uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.library_items i
    WHERE i.id = p_item
      AND i.status = 'draft' AND i.published_at IS NULL
      AND i.uploaded_by = (SELECT auth.uid())
  )
$$;
GRANT EXECUTE ON FUNCTION app.is_own_library_draft(uuid) TO authenticated;

SELECT app.drop_policies('public', 'library_item_access');
CREATE POLICY lib_item_access_read ON public.library_item_access FOR SELECT TO authenticated
  USING (app.can_read_school(school_id));
CREATE POLICY lib_item_access_write ON public.library_item_access FOR ALL TO authenticated
  USING (
    app.can(school_id, 'library.update')
    OR (app.can(school_id, 'library.create') AND app.is_own_library_draft(item_id))
  )
  WITH CHECK (
    app.can(school_id, 'library.update')
    OR (app.can(school_id, 'library.create') AND app.is_own_library_draft(item_id))
  );
