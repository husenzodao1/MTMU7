# Phase 4: Digital Library Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a digital library module with categories, book/material browsing, visibility-based access control, favorites, reading history, search, and admin management — fully governed by school isolation, RBAC, and RLS.

**Architecture:** Server-side module/permission gating via `isModuleAccessible("library")` and `canPerformAction("library", "library.*")`. Visibility logic enforced at DB level via RLS policies (all/teachers/admin/specific). File storage via Supabase Storage buckets (`library-files`, `library-covers`). Admin management pages under existing `/admin` layout.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript strict (`noUncheckedIndexedAccess`), Supabase (RLS + Storage), Tailwind CSS 4, next-intl (tg/ru), Zod, Lucide React, cva

## Global Constraints

- **No inline `"use server"` in client components.** Always use `.bind()` pattern.
- **`params` and `searchParams` are Promises** in Next.js 16 — must `await` them.
- **Database type placeholder:** all Supabase queries use `as never` casts.
- **Four authorization layers:** (1) RLS at database, (2) Middleware route check, (3) Server actions verify permissions, (4) UI hides for UX only.
- **Module access chain:** module enabled → role sees module → role has permission.
- **Existing permissions:** `library.read`, `library.create`, `library.update`, `library.delete`, `library.manage` (seeded).
- **Existing tables:** `library_categories`, `library_items`, `library_item_access`, `library_favorites`, `library_reading_history` — with RLS + 5 cross-school triggers.
- **Visibility levels:** `all` (everyone), `teachers` (role level ≤ 4), `admin` (role level ≤ 3), `specific` (via `library_item_access` role/class entries).
- **Soft delete:** `library_items` uses `is_published` / `unpublished_at`.
- **Design system:** Existing UI components. Animation tokens. `prefers-reduced-motion`. Playful error characters.
- **i18n:** All strings via `useTranslations()` / `getTranslations()`. Tajik primary, Russian secondary.
- **No mock data as business logic.**
- **File access security:** Supabase Storage bucket policies must enforce school_id. Direct URL access must not bypass RLS.
- **Admin pages:** Under existing `/admin` layout which already calls `requireAdmin()`.

---

### Task 1: i18n + Module Guard Layout + Library Browse Page

**Files:**
- Create: `src/app/(dashboard)/library/layout.tsx`
- Create: `src/app/(dashboard)/library/page.tsx`
- Create: `src/app/(dashboard)/library/actions.ts`
- Create: `src/app/(dashboard)/library/book-card.tsx`
- Create: `src/app/(dashboard)/library/category-nav.tsx`
- Modify: `src/i18n/tg.json` (add `library` section)
- Modify: `src/i18n/ru.json` (add `library` section)

**Interfaces:**
- Consumes: `isModuleAccessible("library")`, `canPerformAction("library", "library.read")`, `getUserWithRole()`, `createServerClient()`, `ErrorState`, `EmptyState`, `Skeleton`, `Card`, `Badge`, `Avatar`, `Button`, `Input`
- Produces: `LibraryItem` interface, `CategoryItem` interface, `getLibraryItems(categoryId?, searchQuery?)`, `getCategories()`, `BookCard` component, `CategoryNav` component

- [ ] **Step 1: Add i18n keys for library module**

Add to `src/i18n/tg.json` a new `"library"` section:

```json
"library": {
  "title": "Китобхона",
  "browse": "Дидан",
  "search": "Ҷустуҷӯи китоб...",
  "allCategories": "Ҳамаи категорияҳо",
  "noBooks": "Ҳоло китобе нест",
  "noBooksDesc": "Китобхона холӣ аст",
  "noResults": "Натиҷае ёфт нашуд",
  "noResultsDesc": "Дархости ҷустуҷӯро тағйир диҳед",
  "favorites": "Дӯстдоштаҳо",
  "readingHistory": "Таърихи хониш",
  "continueReading": "Идома додан",
  "addToFavorites": "Ба дӯстдоштаҳо",
  "removeFromFavorites": "Аз дӯстдоштаҳо нест кардан",
  "author": "Муаллиф",
  "publisher": "Нашриёт",
  "year": "Сол",
  "language": "Забон",
  "grade": "Синф",
  "subject": "Фан",
  "category": "Категория",
  "format": "Формат",
  "pages": "Саҳифаҳо",
  "fileSize": "Андозаи файл",
  "downloadFile": "Боргирӣ",
  "openBook": "Кушодан",
  "visibility": "Дастрасӣ",
  "visibilityAll": "Барои ҳама",
  "visibilityTeachers": "Барои муаллимон",
  "visibilityAdmin": "Барои маъмурият",
  "visibilitySpecific": "Барои гурӯҳи муайян",
  "published": "Нашршуда",
  "unpublished": "Пешнавис",
  "addBook": "Илова кардани китоб",
  "editBook": "Таҳрири китоб",
  "deleteBook": "Нест кардани китоб",
  "bookDetails": "Тафсилоти китоб",
  "uploadFile": "Боркунии файл",
  "uploadCover": "Боркунии муқова",
  "selectCategory": "Интихоби категория",
  "selectSubject": "Интихоби фан",
  "manageCategories": "Идоракунии категорияҳо",
  "addCategory": "Илова кардани категория",
  "editCategory": "Таҳрири категория",
  "deleteCategory": "Нест кардани категория",
  "categoryName": "Номи категория",
  "parentCategory": "Категорияи болоӣ",
  "noCategories": "Категорияе нест",
  "lastRead": "Охирин хониш",
  "page": "Саҳифа",
  "moduleDisabled": "Бахши китобхона ғайрифаъол аст",
  "noAccess": "Шумо ба ин бахш дастрасӣ надоред",
  "accessControl": "Идоракунии дастрасӣ",
  "roleAccess": "Нақшҳо",
  "classAccess": "Синфҳо",
  "description": "Тавсиф",
  "filters": "Филтрҳо",
  "clearFilters": "Тоза кардан"
}
```

Add corresponding Russian translations to `src/i18n/ru.json`:

```json
"library": {
  "title": "Библиотека",
  "browse": "Просмотр",
  "search": "Поиск книг...",
  "allCategories": "Все категории",
  "noBooks": "Нет книг",
  "noBooksDesc": "Библиотека пуста",
  "noResults": "Ничего не найдено",
  "noResultsDesc": "Измените параметры поиска",
  "favorites": "Избранное",
  "readingHistory": "История чтения",
  "continueReading": "Продолжить чтение",
  "addToFavorites": "В избранное",
  "removeFromFavorites": "Убрать из избранного",
  "author": "Автор",
  "publisher": "Издательство",
  "year": "Год",
  "language": "Язык",
  "grade": "Класс",
  "subject": "Предмет",
  "category": "Категория",
  "format": "Формат",
  "pages": "Страницы",
  "fileSize": "Размер файла",
  "downloadFile": "Скачать",
  "openBook": "Открыть",
  "visibility": "Доступ",
  "visibilityAll": "Для всех",
  "visibilityTeachers": "Для учителей",
  "visibilityAdmin": "Для администрации",
  "visibilitySpecific": "Для определённой группы",
  "published": "Опубликовано",
  "unpublished": "Черновик",
  "addBook": "Добавить книгу",
  "editBook": "Редактировать книгу",
  "deleteBook": "Удалить книгу",
  "bookDetails": "Подробности книги",
  "uploadFile": "Загрузить файл",
  "uploadCover": "Загрузить обложку",
  "selectCategory": "Выберите категорию",
  "selectSubject": "Выберите предмет",
  "manageCategories": "Управление категориями",
  "addCategory": "Добавить категорию",
  "editCategory": "Редактировать категорию",
  "deleteCategory": "Удалить категорию",
  "categoryName": "Название категории",
  "parentCategory": "Родительская категория",
  "noCategories": "Нет категорий",
  "lastRead": "Последнее чтение",
  "page": "Страница",
  "moduleDisabled": "Модуль библиотеки отключён",
  "noAccess": "У вас нет доступа к этому разделу",
  "accessControl": "Управление доступом",
  "roleAccess": "Роли",
  "classAccess": "Классы",
  "description": "Описание",
  "filters": "Фильтры",
  "clearFilters": "Сбросить"
}
```

- [ ] **Step 2: Create the library module layout with guard**

Create `src/app/(dashboard)/library/layout.tsx` — same pattern as messages: check `isModuleAccessible("library")`, show `ErrorState` if inaccessible.

- [ ] **Step 3: Create server actions for loading categories and items**

Create `src/app/(dashboard)/library/actions.ts`:

- `getCategories()`: load from `library_categories` where `is_active = true`, ordered by `sort_order`. RLS enforces school isolation.
- `getLibraryItems(categoryId?: string, search?: string)`: load from `library_items`. RLS handles visibility. Server action checks `canPerformAction("library", "library.read")`. If search provided, use `.ilike()` on title/author/description. If categoryId, filter by it.
- `toggleFavoriteAction(itemId: string, isFavorite: boolean)`: insert or delete from `library_favorites`. Sets `school_id: user.schoolId`, `user_id: user.id`.
- `recordReadingHistory(itemId: string, lastPage?: number)`: upsert into `library_reading_history`.

- [ ] **Step 4: Create CategoryNav component**

Create `src/app/(dashboard)/library/category-nav.tsx` — horizontal scrollable list of category chips/badges. "All" as first item. Active state highlighting. Uses Link for each category (query param `?category=slug`).

- [ ] **Step 5: Create BookCard component**

Create `src/app/(dashboard)/library/book-card.tsx` — card with cover image (or placeholder icon), title, author, category badge, file type badge, favorite button (using `.bind()` pattern for `toggleFavoriteAction`). Links to `/library/[itemId]`.

- [ ] **Step 6: Create the main library browse page**

Create `src/app/(dashboard)/library/page.tsx` — server component. Reads `searchParams` (async, Next.js 16). Shows `CategoryNav` + search input + grid of `BookCard` components. Empty state when no books. Uses `getCategories()` and `getLibraryItems()`.

- [ ] **Step 7: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/library/ src/i18n/tg.json src/i18n/ru.json
git commit -m "feat: add library module layout with browse, categories, and book cards"
```

---

### Task 2: Book Detail Page + Favorites + Reading History

**Files:**
- Create: `src/app/(dashboard)/library/[itemId]/page.tsx`
- Create: `src/app/(dashboard)/library/[itemId]/book-detail.tsx`
- Create: `src/app/(dashboard)/library/[itemId]/actions.ts`

**Interfaces:**
- Consumes: `LibraryItem` from Task 1, `getUserWithRole()`, `createServerClient()`, `canPerformAction("library", "library.read")`, `Card`, `Badge`, `Button`, `Avatar`
- Produces: `getBookDetail(itemId)`, `BookDetail` component showing full metadata, favorite toggle, reading history link, file download link

- [ ] **Step 1: Create server actions for book detail**

Create `src/app/(dashboard)/library/[itemId]/actions.ts`:

- `getBookDetail(itemId: string)`: load item with category info, subject info, check favorites status, load reading history. Permission check via `canPerformAction("library", "library.read")`.
- `toggleFavoriteAction(itemId: string, isFavorite: boolean)`: reuse pattern from Task 1 or import.
- `updateReadingProgressAction(itemId: string, lastPage: number)`: upsert `library_reading_history` with `school_id: user.schoolId`.

- [ ] **Step 2: Create BookDetail client component**

Create `src/app/(dashboard)/library/[itemId]/book-detail.tsx`:

- Full book info: title, author, description, publisher, year, language, grade level
- Cover image (or file-type icon placeholder)
- Category + subject badges
- File info: type, size (formatted), file name
- Favorite toggle button using `.bind()` pattern
- "Open" / "Download" button linking to file URL
- Reading progress indicator if history exists
- Visibility badge (for admins)
- Responsive: stack on mobile, side-by-side on desktop

- [ ] **Step 3: Create book detail server page**

Create `src/app/(dashboard)/library/[itemId]/page.tsx` — server component with `params: Promise<{ itemId: string }>`. Loads book detail, passes to client component.

- [ ] **Step 4: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/library/\[itemId\]/
git commit -m "feat: add book detail page with favorites and reading history"
```

---

### Task 3: Library Admin — Category Management

**Files:**
- Create: `src/app/(dashboard)/admin/library/page.tsx`
- Create: `src/app/(dashboard)/admin/library/actions.ts`
- Create: `src/app/(dashboard)/admin/library/category-manager.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `getUserWithRole()`, `createServerClient()`, `hasPermission("library.manage")`, `Card`, `Button`, `Input`, `Badge`
- Produces: `createCategoryAction`, `updateCategoryAction`, `deleteCategoryAction`, `CategoryManager` component

- [ ] **Step 1: Create admin library server actions**

Create `src/app/(dashboard)/admin/library/actions.ts`:

- `createCategoryAction(_prev, formData)`: Zod validation for `name_tg` (required), `name_ru`, `slug`, `parent_id`. Sets `school_id: user.schoolId`. Requires `requireAdmin()` + `hasPermission("library.manage")`.
- `updateCategoryAction(categoryId, _prev, formData)`: same validation, update by ID.
- `deleteCategoryAction(categoryId)`: delete category. RLS + triggers prevent cross-school. Will fail if has children/items (RESTRICT FK).

- [ ] **Step 2: Create CategoryManager component**

Create `src/app/(dashboard)/admin/library/category-manager.tsx`:

- List of categories with parent/child hierarchy (indented)
- Add category form (name_tg, name_ru, slug auto-generated, parent select)
- Edit inline or modal
- Delete button with confirm
- All mutations via `.bind()` pattern

- [ ] **Step 3: Create admin library page**

Create `src/app/(dashboard)/admin/library/page.tsx`:

- Server component. Calls `requireAdmin()`. Checks `hasPermission("library.manage")`. Loads categories. Shows `CategoryManager`.
- Show `ErrorState` if no permission.

- [ ] **Step 4: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/admin/library/
git commit -m "feat: add library admin page with category management"
```

---

### Task 4: Library Admin — Book Management (CRUD)

**Files:**
- Create: `src/app/(dashboard)/admin/library/books/page.tsx`
- Create: `src/app/(dashboard)/admin/library/books/actions.ts`
- Create: `src/app/(dashboard)/admin/library/books/books-table.tsx`
- Create: `src/app/(dashboard)/admin/library/books/new/page.tsx`
- Create: `src/app/(dashboard)/admin/library/books/new/book-form.tsx`

**Interfaces:**
- Consumes: `requireAdmin()`, `hasPermission("library.manage")`, `createServerClient()`, categories/subjects data, `Card`, `Button`, `Input`, `Badge`
- Produces: `createBookAction`, `updateBookAction`, `deleteBookAction`, `togglePublishAction`, `BooksTable`, `BookForm`

- [ ] **Step 1: Create book management server actions**

Create `src/app/(dashboard)/admin/library/books/actions.ts`:

- `createBookAction(_prev, formData)`: Zod schema for all book fields. Sets `school_id: user.schoolId`, `uploaded_by: user.id`. File URL comes from form (uploaded separately to Storage).
- `togglePublishAction(itemId, isPublished)`: toggle `is_published`.
- `deleteBookAction(itemId)`: soft delete via `is_published = false`.

- [ ] **Step 2: Create BooksTable component**

Create `src/app/(dashboard)/admin/library/books/books-table.tsx`:

- Table with columns: title, author, category, type, visibility, status (published/draft), actions
- Publish/unpublish toggle button using `.bind()`
- Delete button using `.bind()`
- Link to edit page
- Empty state when no books

- [ ] **Step 3: Create BookForm component**

Create `src/app/(dashboard)/admin/library/books/new/book-form.tsx`:

- Form with: title, author, description, file_url, file_name, file_size, file_type, cover_url, category_id (select), subject_id (select), language (select: tg/ru/en), publication_year, publisher, grade_level (1-11), visibility (select: all/teachers/admin/specific)
- Uses `useActionState` + `createBookAction`
- Category and subject dropdowns populated from props

- [ ] **Step 4: Create admin book list and new book pages**

Create `src/app/(dashboard)/admin/library/books/page.tsx` — loads all books (admin sees unpublished too via admin RLS policy), categories. Shows `BooksTable`.

Create `src/app/(dashboard)/admin/library/books/new/page.tsx` — loads categories, subjects. Shows `BookForm`.

- [ ] **Step 5: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/admin/library/books/
git commit -m "feat: add library book management with CRUD and publish toggle"
```

---

### Task 5: Favorites Page + Reading History Page

**Files:**
- Create: `src/app/(dashboard)/library/favorites/page.tsx`
- Create: `src/app/(dashboard)/library/history/page.tsx`

**Interfaces:**
- Consumes: `getUserWithRole()`, `createServerClient()`, `canPerformAction("library", "library.read")`, `BookCard` from Task 1, `EmptyState`, `Badge`
- Produces: Favorites page, Reading History page

- [ ] **Step 1: Create favorites page**

Create `src/app/(dashboard)/library/favorites/page.tsx`:

- Server component. Loads user's favorites via JOIN `library_favorites` → `library_items`. RLS handles both school isolation and item visibility.
- Renders grid of `BookCard` components with `isFavorite: true`.
- Empty state when no favorites.

- [ ] **Step 2: Create reading history page**

Create `src/app/(dashboard)/library/history/page.tsx`:

- Server component. Loads user's reading history via JOIN `library_reading_history` → `library_items`.
- Shows books with last page/position and "continue reading" button.
- Sorted by `updated_at DESC` (most recent first).
- Empty state when no history.

- [ ] **Step 3: Verify TypeScript compiles and commit**

```bash
npx tsc --noEmit
git add src/app/\(dashboard\)/library/favorites/ src/app/\(dashboard\)/library/history/
git commit -m "feat: add library favorites and reading history pages"
```

---

### Task 6: Admin Nav Update + Build Verification

**Files:**
- Modify: `src/app/(dashboard)/admin/admin-nav.tsx` (add library admin links)
- No other new files

**Interfaces:**
- Consumes: All Task 1-5 outputs

- [ ] **Step 1: Add library admin links to admin nav**

Update admin-nav.tsx to include "Китобхона" section with links to `/admin/library` (categories) and `/admin/library/books` (book management).

- [ ] **Step 2: Run TypeScript compiler**

Run: `npx tsc --noEmit` — expected: zero errors.

- [ ] **Step 3: Run production build**

Run: `npx next build` — expected: build succeeds, all library routes appear.

- [ ] **Step 4: Start dev server and verify**

Check:
1. `/library` route shows browse page (empty state or categories)
2. `/library/favorites` shows favorites page
3. `/library/history` shows reading history page
4. `/admin/library` shows category management (admin only)
5. `/admin/library/books` shows book management (admin only)
6. Login redirect for unauthenticated users
7. Module guard shows error if library module disabled
8. No console errors, no server errors

- [ ] **Step 5: Fix any build errors and commit**

```bash
git add -A
git commit -m "fix: resolve build issues in library module"
```

- [ ] **Step 6: Update progress ledger**
