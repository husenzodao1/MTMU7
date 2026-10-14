# What the school has to provide

Everything the platform cannot invent, grouped by where it is entered. Nothing here needs a
developer: every item is a field in the Admin Control Center once the account exists.

Priority: **P0** blocks a public launch · **P1** needed in the first week · **P2** improves the site.

---

## 1. Access and decisions (P0)

| # | Item | Where |
| --- | --- | --- |
| 1.1 | Supabase project for the new schema (fresh project recommended) | Supabase dashboard |
| 1.2 | Rotated anon and service-role keys | Supabase → Settings → API |
| 1.3 | The six environment variables | Vercel → Settings → Environment Variables |
| 1.4 | Who holds the first school administrator account (name, email) | created during setup |
| 1.5 | Custom domain, if the school wants one instead of `*.vercel.app` | Vercel → Domains |
| 1.6 | Sender address for system email, and the OTP template containing `{{ .Token }}` | Supabase → Auth |

## 2. Official identity (P0 — the site shows placeholders until approved)

| # | Item | Field |
| --- | --- | --- |
| 2.1 | Exact official school name in Tajik, Russian, English | `/admin/school` → official name |
| 2.2 | Short name used in navigation, and the full name | `/admin/school` |
| 2.3 | Ministry / governing authority name, in three languages | `/admin/platform` → identity |
| 2.4 | Official emblem image (from an approved source, never generated) | `/admin/platform` → emblem |
| 2.5 | School logo | `/admin/school` → logo |
| 2.6 | Photograph of the school building | `/admin/school` → photo |
| 2.7 | Footer attribution: exact names and roles of the creators | `/admin/platform` → developed by |
| 2.8 | Copyright line | `/admin/platform` → copyright |
| 2.9 | Support email and phone | `/admin/platform` |
| 2.10 | Confirmation that every text above is final → "identity approved" | `/admin/platform` |

## 3. Homepage sections (P1) — `/admin/website`

Each section takes Tajik, Russian and English text; sections marked ✔ also need an image or must be
approved before they appear publicly.

| Section | What to provide | Image |
| --- | --- | --- |
| identity | School name, authority name | logo ✔ |
| hero | Headline and a short paragraph | wide photo ✔ (about 1600×900) |
| intro | "About the school" title and text | — |
| principal_message | Greeting text, the principal's name and position | portrait ✔ (about 800×800) |
| statistics | Lines in the form `Label \| Value`, for example `Students \| 1200` | — |
| news / announcements / events / library / documents | Section titles and how many entries to show | — |
| links | Useful links as `Label \| https://…` | — |
| contacts | Address, opening hours, phone, email, map link | — |
| footer | Footer text | — |

## 4. People and rights (P0)

Roles created for every school: **admin** (school administrator), **director**, **vice_principal**,
**teacher**, **librarian**, **staff**, **student**, **parent**. Permissions are edited per role in
`/admin/roles`; a role may be added for a specific responsibility.

| # | Item |
| --- | --- |
| 4.1 | Who receives the administrator role (full rights over the school) |
| 4.2 | Director and deputies: names, emails |
| 4.3 | Teachers: surname, first name, middle name, position, subjects, email or phone |
| 4.4 | Librarian, and any other staff who need an account |
| 4.5 | Whether teachers may publish news and announcements themselves, or only draft them for review |
| 4.6 | Whether students may message each other and create group chats |
| 4.7 | Whether self-registration is open, or entry is by invitation code only |
| 4.8 | How many days back a teacher may correct an attendance register |

## 5. Academic setup (P0 — the portal is empty without it)

| # | Item | Where |
| --- | --- | --- |
| 5.1 | Academic year with start and end dates | `/admin/academic-years` |
| 5.2 | Terms (quarters/semesters), exam periods, holidays | `/admin/academic-years` |
| 5.3 | Bell schedule: period numbers and times, and shifts if the school has two | `/admin/timetable` |
| 5.4 | Class list: name, grade level, homeroom teacher, room, capacity, shift | `/admin/classes` |
| 5.5 | Subject list with codes, in three languages if possible | `/admin/subjects` |
| 5.6 | Which teacher teaches which subject in which class | `/admin/classes` |
| 5.7 | Weekly timetable | `/admin/timetable` |
| 5.8 | Student register: surname, first name, middle name, date of birth, gender, class, student number | `/admin/students` or CSV import |
| 5.9 | Guardians and which child each one belongs to | `/admin/guardians` |
| 5.10 | Grading scale in use (the 5-point scale and assessment types are pre-created; adjust if needed) | `/admin/gradebook` |

For 5.8 and 5.9 the import templates are in `/admin/students/import` and `/admin/staff/import` —
download the file, fill it in, upload it, and errors are shown before anything is written.

## 6. Content for launch (P1–P2)

| # | Item | Where |
| --- | --- | --- |
| 6.1 | Three to five news items with cover images | `/admin/news` |
| 6.2 | Current announcements | `/admin/announcements` |
| 6.3 | Upcoming events | `/admin/events` |
| 6.4 | Official documents: charter, rules, forms, timetable PDFs | `/admin/documents` |
| 6.5 | Library: books with covers and files, by subject and grade | `/admin/library` |
| 6.6 | Photographs for the media library | `/admin/media` |

## 7. Legal texts (P0 for registration, P1 for the rest)

| # | Item |
| --- | --- |
| 7.1 | Consent text shown at registration (personal data of minors) |
| 7.2 | Privacy policy |
| 7.3 | Rules for using the portal |
| 7.4 | Who is responsible for personal data, and how long records are kept |

## 8. File formats accepted

| Purpose | Formats | Maximum size |
| --- | --- | --- |
| Photographs, covers, homepage images | JPG, PNG, WebP, AVIF | 10 MB |
| Profile avatars | JPG, PNG, WebP | 2 MB |
| Book covers | JPG, PNG, WebP | 5 MB |
| Book files | PDF, EPUB, MP3 | 100 MB |
| Documents | PDF, DOC, DOCX, XLS, XLSX, PPTX, JPG, PNG | 50 MB |
| Homework attachments | PDF, images, DOCX, TXT | 25 MB |

Images are served publicly; book files and documents are delivered only through a permission check
and a short-lived link.

## 9. Language review (P1)

The Tajik and Russian interface text was produced during development and needs a native reading,
especially official and academic terms. The catalogues are `src/messages/{tg,ru}/*.json`; a list of
corrections in a message is enough — no editing on your side.
