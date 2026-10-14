-- Sending where you are.
--
-- A parent who cannot find the school gate, a teacher telling a colleague which
-- entrance the bus is at: a pair of numbers says it where a paragraph does not.
--
-- The coordinates are columns rather than something packed into `content`,
-- because a place is not a sentence: it has to be checked for being a real
-- point on Earth, and it has to survive being read back by something that was
-- not the thing that wrote it. `content` stays free for the label a person
-- types alongside it, which is often the useful half — "at the back gate".
--
-- Six decimal places is about ten centimetres, which is finer than any phone
-- reports and far finer than anybody needs.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS location_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS location_lng numeric(9, 6);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'file', 'image', 'system', 'audio', 'location'));

-- A location message without a location is not a location message, and a
-- location on a message that is not one would never be drawn.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_location_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_location_check CHECK (
  CASE
    WHEN type = 'location' THEN
      location_lat IS NOT NULL AND location_lng IS NOT NULL
      AND location_lat BETWEEN -90 AND 90
      AND location_lng BETWEEN -180 AND 180
    ELSE location_lat IS NULL AND location_lng IS NULL
  END
);

-- No grant needed: INSERT on this table is granted whole, not column by
-- column, so the two new columns are already covered. What decides whether a
-- row may be written is the row level policy, which is unchanged — a location
-- is still a message in a conversation you belong to.
