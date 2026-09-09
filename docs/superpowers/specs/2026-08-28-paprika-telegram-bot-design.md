# PAPRIKA Telegram Bot — Design Spec

## Overview

Telegram бот для точки фаст-фуда **PAPRIKA** в Душанбе. Один бот для клиентов, операторов и админа. Полный цикл: просмотр меню → заказ → оплата → доставка → уведомления.

## Stack

- **Python 3.11+** + **aiogram 3** (асинхронный Telegram bot framework)
- **SQLite** через **aiosqlite**
- **OSRM** (бесплатный API) для расчёта расстояния по дороге
- Отдельный проект: `~/Desktop/paprika-bot/`

## Project Structure

```
paprika-bot/
├── bot.py                  # Точка входа
├── config.py               # Настройки (токен, координаты точки, пороги меток)
├── database.py             # Инициализация БД, создание таблиц
├── handlers/
│   ├── common.py           # /start, выбор языка
│   ├── client/
│   │   ├── menu.py         # Просмотр меню по категориям
│   │   ├── cart.py         # Корзина (добавление, удаление, изменение кол-ва)
│   │   ├── order.py        # Оформление заказа (доставка/самовывоз, адрес, оплата)
│   │   └── my_orders.py    # Мои заказы, отслеживание статуса
│   ├── admin/
│   │   ├── panel.py        # Главное меню админки
│   │   ├── menu_mgmt.py    # CRUD категорий, товаров, размеров, доп. ингредиентов
│   │   ├── ingredients.py  # CRUD продуктов/ингредиентов, зависимости
│   │   ├── delivery.py     # Настройки доставки (зоны, цена/км, максимум)
│   │   ├── customers.py    # Клиенты, метки, поиск, история
│   │   ├── operators.py    # Управление операторами
│   │   ├── promos.py       # Промокоды, вкл/выкл системы акций
│   │   └── stats.py        # Статистика (заказы, выручка, популярные товары)
│   └── operator/
│       └── orders.py       # Приём заказов, смена статуса, подтверждение оплаты
├── keyboards/
│   ├── client_kb.py        # Клавиатуры клиента
│   ├── admin_kb.py         # Клавиатуры админа
│   └── operator_kb.py      # Клавиатуры оператора
├── models/
│   ├── user.py             # CRUD пользователей
│   ├── product.py          # CRUD категорий, товаров, размеров
│   ├── ingredient.py       # CRUD ингредиентов, связи продукт-ингредиент
│   ├── order.py            # CRUD заказов, позиций
│   ├── delivery.py         # Настройки доставки, зоны
│   ├── promo.py            # Промокоды
│   └── tag.py              # Метки клиентов
├── utils/
│   ├── i18n.py             # Мультиязычность (RU/TJ/EN)
│   ├── geo.py              # Расчёт расстояния через OSRM
│   └── availability.py     # Проверка доступности товаров, альтернативы
├── locales/
│   ├── ru.json             # Русский
│   ├── tj.json             # Таджикский
│   └── en.json             # English
├── data/
│   └── paprika.db          # SQLite файл (создаётся автоматически)
└── requirements.txt
```

## Database Schema

### Users & Roles

```sql
-- Пользователи (клиенты)
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    language TEXT DEFAULT 'ru',  -- ru/tj/en
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Админы и операторы
CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    role TEXT NOT NULL,  -- 'admin' или 'operator'
    name TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ручные метки клиентов
CREATE TABLE user_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    tag TEXT NOT NULL,  -- 'not_paid', 'vip', 'blacklist', или кастомная
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Menu (Products & Ingredients)

```sql
-- Ингредиенты/Продукты (тесто, сыр, мясо, лаваш...)
CREATE TABLE ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ru TEXT NOT NULL,
    name_tj TEXT,
    name_en TEXT,
    is_available INTEGER DEFAULT 1  -- 1=есть, 0=закончился
);

-- Категории меню
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ru TEXT NOT NULL,
    name_tj TEXT,
    name_en TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

-- Товары (блюда)
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name_ru TEXT NOT NULL,
    name_tj TEXT,
    name_en TEXT,
    description_ru TEXT,
    description_tj TEXT,
    description_en TEXT,
    is_active INTEGER DEFAULT 1,  -- ручное вкл/выкл
    sort_order INTEGER DEFAULT 0
);

-- Размеры и цены товаров
CREATE TABLE product_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    size_name TEXT NOT NULL,  -- 'Малая', 'Средняя', 'Большая', '1 порция', '1 кг'
    price REAL NOT NULL,
    is_active INTEGER DEFAULT 1  -- можно отключить конкретный размер
);

-- Рецепт: какие ингредиенты входят в блюдо
CREATE TABLE product_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    UNIQUE(product_id, ingredient_id)
);

-- Доп. ингредиенты (которые клиент может добавить за доплату)
CREATE TABLE extras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),  -- для какой категории
    name_ru TEXT NOT NULL,
    name_tj TEXT,
    name_en TEXT,
    price REAL NOT NULL,
    is_active INTEGER DEFAULT 1
);
```

### Orders

```sql
-- Заказы
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'new',
    -- Статусы: new, payment_pending, payment_confirmed, confirmed, cooking, delivering, delivered, cancelled
    delivery_type TEXT NOT NULL,  -- 'delivery' или 'pickup'
    delivery_address TEXT,
    latitude REAL,
    longitude REAL,
    delivery_distance_km REAL,  -- расстояние по дороге
    delivery_fee REAL DEFAULT 0,
    subtotal REAL NOT NULL,  -- сумма без доставки
    total REAL NOT NULL,  -- итого с доставкой
    payment_method TEXT,  -- 'cash' или 'dushanbe_city'
    payment_screenshot TEXT,  -- file_id скриншота оплаты
    promo_code TEXT,
    discount_percent REAL DEFAULT 0,
    note TEXT,  -- комментарий к заказу
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Позиции заказа
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_size_id INTEGER NOT NULL REFERENCES product_sizes(id),
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL
);

-- Доп. ингредиенты в позиции заказа
CREATE TABLE order_item_extras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id),
    extra_id INTEGER NOT NULL REFERENCES extras(id),
    price REAL NOT NULL
);
```

### Delivery & Settings

```sql
-- Настройки доставки
CREATE TABLE delivery_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    free_zone_km REAL DEFAULT 3.0,      -- бесплатная зона (км)
    price_per_km REAL DEFAULT 5.0,       -- цена за км
    max_distance_km REAL DEFAULT 15.0,   -- максимум доставки
    restaurant_lat REAL NOT NULL,        -- координаты точки PAPRIKA
    restaurant_lng REAL NOT NULL
);

-- Районы для ручного выбора (если нет GPS)
CREATE TABLE delivery_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ru TEXT NOT NULL,
    name_tj TEXT,
    name_en TEXT,
    price REAL NOT NULL,
    is_active INTEGER DEFAULT 1
);

-- Промокоды
CREATE TABLE promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    valid_until TIMESTAMP,
    usage_limit INTEGER,  -- сколько раз можно использовать (NULL = без лимита)
    used_count INTEGER DEFAULT 0
);

-- Общие настройки бота
CREATE TABLE bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
-- Примеры ключей: 'promos_enabled', 'bot_active', 'working_hours_start', 'working_hours_end'
```

## Delivery Logic

Координаты точки PAPRIKA: из Google Maps ссылки (будут вписаны в config).

**Расчёт расстояния:** через OSRM API (бесплатно, по дорогам OpenStreetMap):
```
GET http://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=false
→ response.routes[0].distance (в метрах)
```

**Логика цены доставки:**
1. Клиент отправляет геолокацию (или выбирает район вручную)
2. Бот считает расстояние по дороге через OSRM
3. Если расстояние > `max_distance_km` → "Извините, мы не доставляем так далеко"
4. Если расстояние ≤ `free_zone_km` → доставка бесплатная
5. Если расстояние > `free_zone_km` → цена = `расстояние × price_per_km` (весь путь оплачивается, не только разница)

**Fallback:** если GPS недоступен, клиент выбирает район из списка `delivery_zones` с фиксированной ценой.

## Client Flow

```
/start
  → Выбор языка: [🇷🇺 Русский] [🇹🇯 Тоҷикӣ] [🇬🇧 English]
  → Главное меню:
     [🍕 Меню]  [🛒 Корзина]  [📦 Мои заказы]  [📞 Контакты]

Меню → Категории (inline кнопки):
  [Пицца] [Курица] [Твистеры] [Кесадильи]
  [Хачапури] [Соусы] [Горячие напитки] [Холодные напитки]

Категория → Список товаров → Карточка товара:
  "🍕 Маргарита
   📝 Состав: тесто, соус томатный, помидоры, сыр моцарелла
   Малая: 35с | Средняя: 50с | Большая: 65с"
  (Состав формируется из таблицы product_ingredients — клиент всегда видит из чего блюдо)
  → Выбор размера → Доп. ингредиенты (опционально) → Количество → В корзину

Корзина:
  Список позиций с ценами
  [Оформить заказ] [Очистить] [← Меню]

Оформление:
  [🚗 Доставка] [🏪 Самовывоз]
  → Доставка: [📍 Отправить геолокацию] или [Выбрать район]
  → Расчёт расстояния и цены доставки
  → Ввод адреса (улица, дом)
  → Телефон (запрос при первом заказе)
  → Промокод (если система включена): [Ввести промокод] [Пропустить]
  → Оплата: [💵 Наличные] [📱 Душанбе Сити]
  → Душанбе Сити: показать номер + сумму → клиент отправляет скриншот
  → Подтверждение → Заказ отправлен
```

## Unavailability System (Отключение товаров)

### Два уровня отключения:

**1. Отключение ингредиента/продукта:**
- Админ отключает ингредиент (например "Сыр моцарелла")
- Бот через таблицу `product_ingredients` находит все блюда с этим ингредиентом
- Все найденные блюда автоматически становятся недоступными
- Админ видит список затронутых блюд и подтверждает
- При включении обратно — все зависимые блюда автоматически включаются

**2. Ручное отключение товара/размера:**
- Админ отключает конкретный товар или размер напрямую
- Не зависит от ингредиентов

### Поведение для клиента:

Когда клиент нажимает на отключённый товар:
- Если отключён конкретный размер → показать доступные размеры того же товара
- Если отключён весь товар → показать похожие товары из той же категории
- Если отключён доп. ингредиент → показать другие доступные добавки

### Админ-интерфейс:

```
📦 Управление продуктами (ингредиентами):

Сыр моцарелла  ✅ [Выкл]
Сыр чеддер     ✅ [Выкл]
Тесто          ✅ [Выкл]
Лаваш средний  ❌ [Вкл]
...

[+ Добавить продукт]
```

### Создание нового блюда:

```
Шаг 1: Сначала добавляем продукты/ингредиенты (если новые)
Шаг 2: Создаём блюдо → Выбираем категорию → Вводим название и описание
Шаг 3: Выбираем ингредиенты из существующих продуктов
Шаг 4: Задаём размеры и цены
Шаг 5: Сохраняем — блюдо появляется в меню
```

## Customer Tags (Метки клиентов)

### Автоматические (вычисляются на лету):
- **Новый** — 0 завершённых заказов
- **Постоянник** — 10+ завершённых заказов
- **Дорогой клиент** — потратил 3000+ сом суммарно

### Ручные (ставит админ/оператор):
- **Не заплатил** — долг с прошлого раза
- **VIP** — особый клиент
- **Чёрный список** — бот отказывает в заказе
- Кастомные метки с комментарием

### Отображение при заказе:

```
🆕 НОВЫЙ ЗАКАЗ #47

👤 Ахмад Ахмадов | +992 900 123456
🏷 Постоянник | Дорогой клиент

📦 Пицца Пепперони (Большая) x1 — 85с
   + Сыр моцарелла — 10с
📦 Кола 0.5л x2 — 14с
🧴 Heinz барбекю x1 — 5с

💰 Итого: 114с
🚗 Доставка: 25с (5 км по дороге)
💵 Общая сумма: 139с
💳 Оплата: Душанбе Сити

📍 Локация: [ссылка на карту]

[✅ Принять] [❌ Отклонить]
```

## Admin Panel

Доступ: `/admin` (только для пользователей из таблицы `admins`)

```
⚙️ Админ-панель PAPRIKA

[📋 Заказы]         [📊 Статистика]
[🍕 Блюда]          [📦 Продукты]
[🚗 Доставка]       [👥 Клиенты]
[👨‍💼 Операторы]      [🎫 Промокоды]
[⚙️ Настройки]
```

### Разделы:

- **Заказы:** активные заказы, смена статуса, подтверждение оплаты
- **Блюда:** CRUD товаров (выбор ингредиентов из продуктов, размеры, цены, вкл/выкл)
- **Продукты:** CRUD ингредиентов, вкл/выкл с каскадным отключением блюд
- **Доставка:** бесплатная зона (км), цена за км, максимум (км), районы
- **Клиенты:** поиск, история заказов, метки
- **Операторы:** добавить/удалить по Telegram ID
- **Промокоды:** CRUD, вкл/выкл системы промокодов целиком
- **Статистика:** заказов/выручка за день/неделю/месяц, популярные товары, кол-во клиентов

## Operator Flow

Операторы (`role = 'operator'`) получают уведомления о новых заказах и могут:
- Принять заказ → статус `confirmed`
- Готовится → `cooking`
- В доставке → `delivering`
- Доставлен → `delivered`
- Подтвердить оплату Душанбе Сити
- Поставить метку клиенту

Операторы **не могут**: управлять меню, доставкой, операторами, промокодами, настройками.

## Payment Flow

### Наличные:
1. Клиент выбирает "Наличные"
2. Заказ отправляется оператору со статусом `new`
3. Оплата при получении

### Душанбе Сити:
1. Клиент выбирает "Душанбе Сити"
2. Бот показывает номер для перевода + точную сумму
3. Заказ получает статус `payment_pending`
4. Клиент переводит деньги и отправляет скриншот чека в бот
5. Оператор получает скриншот с кнопками [✅ Оплата принята] [❌ Отклонить]
6. После подтверждения → статус `payment_confirmed` → `confirmed`

## Notifications

### Клиенту:
- "✅ Заказ #47 принят!"
- "👨‍🍳 Ваш заказ готовится"
- "🚗 Курьер в пути!"
- "✅ Заказ доставлен! Приятного аппетита!"
- "❌ Заказ отменён" (с причиной)

### Оператору/Админу:
- Новый заказ (полные детали + метки клиента)
- Скриншот оплаты для подтверждения

## Multilanguage (i18n)

Три языка: Русский (по умолчанию), Таджикский, English.

Клиент выбирает язык при первом /start. Можно сменить через настройки.

Все тексты интерфейса хранятся в `locales/*.json`. Названия товаров/категорий хранятся в БД в трёх полях: `name_ru`, `name_tj`, `name_en`.

## Promotions System

- Вся система промокодов включается/выключается одной кнопкой в админке
- Когда включена: клиент видит поле "Ввести промокод" при оформлении
- Промокод = процент скидки от суммы заказа (без доставки)
- У промокода может быть лимит использований и срок действия

## Initial Data

При первом запуске бот создаёт таблицы и вносит:
- Координаты точки PAPRIKA (из Google Maps ссылки)
- Настройки доставки по умолчанию (бесплатная зона, цена/км, максимум)
- Telegram ID первого админа (из config)
- Всё меню PAPRIKA со всеми категориями, товарами, размерами, ценами и ингредиентами — согласно фото меню
