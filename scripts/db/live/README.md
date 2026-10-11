# Live database update, October 2026

Run by hand in Supabase → SQL Editor, in this order. Each file is one
transaction: it goes in whole or changes nothing.

1. The update: either `01-update.sql` (all of it at once), or, where the
   editor will not take a file that size, `01-update-parts/part-1.sql` …
   `part-7.sql` one after another. The parts hold the same migrations
   (00086–00089, 00091–00093) without comments; each refuses to run out of
   order or twice. Use one or the other, not both.
2. `02-start-clean.sql`, after replacing `KEEP_EMAIL` with the main
   administrator's address. It removes every other account and the test
   data, and cannot be undone.

Both were checked on a database built to the live state (00001–00085 and
00090): the parts and the whole file leave the same schema, and the clean-up
leaves one account, 66 classes and the ten bells.
