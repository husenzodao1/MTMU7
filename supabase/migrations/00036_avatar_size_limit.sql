-- Photographs straight from a phone camera are regularly over two megabytes,
-- so the avatar bucket refused them before the person saw any error worth
-- reading. Four megabytes covers an ordinary phone photograph.
-- The application limit lives in src/lib/storage/files.ts and matches this.

UPDATE storage.buckets
SET file_size_limit = 4194304
WHERE id = 'avatars';
