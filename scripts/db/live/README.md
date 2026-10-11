# Live database update, October 2026

Run by hand in Supabase → SQL Editor. Every file is one transaction: it goes
in whole or changes nothing, and none of them runs twice.

- `all-in-one.sql`: the update and the clean-up together, without comments.
  Replace `KEEP_EMAIL` with the main administrator's address first; left as
  it is, the whole file stops and nothing changes.

Or the same work in steps:

1. The update (migrations 00086–00089 and 00091–00093; 00090 is already
   live), as one of:
   - `01-update.sql`: the migrations as written, comments included;
   - `01-update-min.sql`: the same without comments;
   - `01-update-parts/part-1.sql` … `part-7.sql`: the same in seven short
     parts, run one after another; each refuses to run out of order.
2. `02-start-clean.sql`, after replacing `KEEP_EMAIL`. It removes every other
   account and the test data, and cannot be undone.

All of them were checked on a database built to the live state (00001–00085
and 00090): each way of running the update leaves the same schema, and the
clean-up leaves one account, 66 classes and the ten bells. In the files
without comments, the 00088 versions of import_people and save_account are
left out, because 00092 replaces both.
