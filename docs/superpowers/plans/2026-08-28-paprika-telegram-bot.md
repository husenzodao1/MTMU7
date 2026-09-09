# PAPRIKA Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram bot for fast food restaurant PAPRIKA in Dushanbe — one bot serving clients, operators, and admins with full ordering, delivery, payment, and menu management.

**Architecture:** Single Python process running an aiogram 3 async bot. SQLite database via aiosqlite for all persistence. OSRM public API for road-distance delivery calculations. Handler modules split by role (client/admin/operator), model modules for DB access, utility modules for i18n and geo.

**Tech Stack:** Python 3.11+, aiogram 3, aiosqlite, httpx (for OSRM API), SQLite 3

## Global Constraints

- Project location: `~/Desktop/paprika-bot/` (completely separate from any other project)
- Python 3.11+ required
- All user-facing text must support three languages: Russian (default), Tajik, English
- All DB text fields use three columns: `name_ru`, `name_tj`, `name_en`
- Locale files in `locales/ru.json`, `locales/tj.json`, `locales/en.json`
- No external database servers — SQLite only
- OSRM public API at `http://router.project-osrm.org` for road distance
- Restaurant coordinates: extracted from https://maps.app.goo.gl/bCiidSJBqYkJs7MD7
- Emoji in bot messages are part of the spec — use them as documented
- All monetary values in Somoni (сом), stored as REAL in SQLite
- Delivery price logic: within free zone = free; beyond free zone = entire distance × price_per_km; beyond max = rejected
- Customer auto-tags thresholds: New = 0 orders, Regular = 10+, High-value = 3000+ сом total

---

### Task 1: Project Scaffold, Config, and Database

**Files:**
- Create: `~/Desktop/paprika-bot/requirements.txt`
- Create: `~/Desktop/paprika-bot/config.py`
- Create: `~/Desktop/paprika-bot/database.py`
- Create: `~/Desktop/paprika-bot/bot.py`
- Create: `~/Desktop/paprika-bot/.env.example`
- Create: `~/Desktop/paprika-bot/.gitignore`
- Create: `~/Desktop/paprika-bot/tests/test_database.py`

**Interfaces:**
- Produces: `config.BOT_TOKEN: str`, `config.ADMIN_TELEGRAM_ID: int`, `config.RESTAURANT_LAT: float`, `config.RESTAURANT_LNG: float`, `config.DB_PATH: str`
- Produces: `database.init_db() -> None` (creates all 15 tables), `database.get_db() -> aiosqlite.Connection`

- [ ] **Step 1: Create project directory and requirements.txt**

```bash
mkdir -p ~/Desktop/paprika-bot/tests
mkdir -p ~/Desktop/paprika-bot/handlers/client
mkdir -p ~/Desktop/paprika-bot/handlers/admin
mkdir -p ~/Desktop/paprika-bot/handlers/operator
mkdir -p ~/Desktop/paprika-bot/keyboards
mkdir -p ~/Desktop/paprika-bot/models
mkdir -p ~/Desktop/paprika-bot/utils
mkdir -p ~/Desktop/paprika-bot/locales
mkdir -p ~/Desktop/paprika-bot/data
```

Create `requirements.txt`:
```
aiogram==3.15.0
aiosqlite==0.20.0
httpx==0.28.1
python-dotenv==1.1.0
pytest==8.3.4
pytest-asyncio==0.25.0
```

- [ ] **Step 2: Create .gitignore**

```gitignore
__pycache__/
*.pyc
.env
data/paprika.db
.venv/
```

- [ ] **Step 3: Create .env.example**

```
BOT_TOKEN=your_telegram_bot_token_here
ADMIN_TELEGRAM_ID=your_telegram_id_here
DUSHANBE_CITY_PHONE=+992XXXXXXXXX
```

- [ ] **Step 4: Create config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_TELEGRAM_ID = int(os.getenv("ADMIN_TELEGRAM_ID", "0"))
DUSHANBE_CITY_PHONE = os.getenv("DUSHANBE_CITY_PHONE", "")

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "paprika.db")

# PAPRIKA restaurant coordinates (from Google Maps)
RESTAURANT_LAT = 38.536270
RESTAURANT_LNG = 68.780498

# Customer tag thresholds
REGULAR_ORDER_COUNT = 10
HIGH_VALUE_TOTAL = 3000.0
```

- [ ] **Step 5: Create database.py with all 15 tables**

```python
import aiosqlite
import config

_connection: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _connection
    if _connection is None:
        _connection = await aiosqlite.connect(config.DB_PATH)
        _connection.row_factory = aiosqlite.Row
        await _connection.execute("PRAGMA journal_mode=WAL")
        await _connection.execute("PRAGMA foreign_keys=ON")
    return _connection


async def close_db() -> None:
    global _connection
    if _connection:
        await _connection.close()
        _connection = None


async def init_db() -> None:
    db = await get_db()

    await db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            full_name TEXT,
            phone TEXT,
            language TEXT DEFAULT 'ru',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            role TEXT NOT NULL,
            name TEXT,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            tag TEXT NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ru TEXT NOT NULL,
            name_tj TEXT,
            name_en TEXT,
            is_available INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ru TEXT NOT NULL,
            name_tj TEXT,
            name_en TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES categories(id),
            name_ru TEXT NOT NULL,
            name_tj TEXT,
            name_en TEXT,
            description_ru TEXT,
            description_tj TEXT,
            description_en TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS product_sizes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id),
            size_name TEXT NOT NULL,
            price REAL NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS product_ingredients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id),
            ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
            UNIQUE(product_id, ingredient_id)
        );

        CREATE TABLE IF NOT EXISTS extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES categories(id),
            name_ru TEXT NOT NULL,
            name_tj TEXT,
            name_en TEXT,
            price REAL NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            status TEXT DEFAULT 'new',
            delivery_type TEXT NOT NULL,
            delivery_address TEXT,
            latitude REAL,
            longitude REAL,
            delivery_distance_km REAL,
            delivery_fee REAL DEFAULT 0,
            subtotal REAL NOT NULL,
            total REAL NOT NULL,
            payment_method TEXT,
            payment_screenshot TEXT,
            promo_code TEXT,
            discount_percent REAL DEFAULT 0,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id),
            product_id INTEGER NOT NULL REFERENCES products(id),
            product_size_id INTEGER NOT NULL REFERENCES product_sizes(id),
            quantity INTEGER DEFAULT 1,
            unit_price REAL NOT NULL,
            total_price REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS order_item_extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_item_id INTEGER NOT NULL REFERENCES order_items(id),
            extra_id INTEGER NOT NULL REFERENCES extras(id),
            price REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            free_zone_km REAL DEFAULT 3.0,
            price_per_km REAL DEFAULT 5.0,
            max_distance_km REAL DEFAULT 15.0,
            restaurant_lat REAL NOT NULL,
            restaurant_lng REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS delivery_zones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ru TEXT NOT NULL,
            name_tj TEXT,
            name_en TEXT,
            price REAL NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS promo_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            discount_percent REAL NOT NULL,
            is_active INTEGER DEFAULT 1,
            valid_until TIMESTAMP,
            usage_limit INTEGER,
            used_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bot_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    """)

    # Seed admin
    await db.execute(
        "INSERT OR IGNORE INTO admins (telegram_id, role, name) VALUES (?, 'admin', 'Owner')",
        (config.ADMIN_TELEGRAM_ID,),
    )

    # Seed delivery settings
    await db.execute(
        """INSERT OR IGNORE INTO delivery_settings (id, free_zone_km, price_per_km, max_distance_km, restaurant_lat, restaurant_lng)
           VALUES (1, 3.0, 5.0, 15.0, ?, ?)""",
        (config.RESTAURANT_LAT, config.RESTAURANT_LNG),
    )

    # Seed default bot settings
    for key, value in [("promos_enabled", "0"), ("bot_active", "1")]:
        await db.execute(
            "INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)",
            (key, value),
        )

    await db.commit()
```

- [ ] **Step 6: Create minimal bot.py entry point**

```python
import asyncio
import logging

from aiogram import Bot, Dispatcher

import config
import database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()


async def main() -> None:
    await database.init_db()
    logger.info("Database initialized")
    try:
        await dp.start_polling(bot)
    finally:
        await database.close_db()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 7: Write test for database initialization**

Create `tests/conftest.py`:
```python
import os
import sys
import tempfile

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import config
import database


@pytest_asyncio.fixture
async def db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        config.DB_PATH = f.name
    database._connection = None
    await database.init_db()
    conn = await database.get_db()
    yield conn
    await database.close_db()
    os.unlink(config.DB_PATH)
```

Create `tests/test_database.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_all_tables_created(db):
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    tables = {row[0] for row in await cursor.fetchall()}
    expected = {
        "users", "admins", "user_tags", "ingredients", "categories",
        "products", "product_sizes", "product_ingredients", "extras",
        "orders", "order_items", "order_item_extras",
        "delivery_settings", "delivery_zones", "promo_codes", "bot_settings",
    }
    assert expected.issubset(tables)


@pytest.mark.asyncio
async def test_admin_seeded(db):
    cursor = await db.execute("SELECT role FROM admins WHERE telegram_id = ?", (0,))
    row = await cursor.fetchone()
    assert row is not None
    assert row[0] == "admin"


@pytest.mark.asyncio
async def test_delivery_settings_seeded(db):
    cursor = await db.execute("SELECT free_zone_km, price_per_km, max_distance_km FROM delivery_settings WHERE id = 1")
    row = await cursor.fetchone()
    assert row is not None
    assert row[0] == 3.0
    assert row[1] == 5.0
    assert row[2] == 15.0


@pytest.mark.asyncio
async def test_wal_mode(db):
    cursor = await db.execute("PRAGMA journal_mode")
    row = await cursor.fetchone()
    assert row[0] == "wal"
```

- [ ] **Step 8: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_database.py -v
```
Expected: all 4 tests pass.

- [ ] **Step 9: Initialize git and commit**

```bash
cd ~/Desktop/paprika-bot
git init
git add .
git commit -m "feat: project scaffold with config, database (15 tables), and bot entry point"
```

---

### Task 2: i18n System and Locale Files

**Files:**
- Create: `~/Desktop/paprika-bot/utils/i18n.py`
- Create: `~/Desktop/paprika-bot/locales/ru.json`
- Create: `~/Desktop/paprika-bot/locales/tj.json`
- Create: `~/Desktop/paprika-bot/locales/en.json`
- Create: `~/Desktop/paprika-bot/tests/test_i18n.py`

**Interfaces:**
- Produces: `i18n.t(key: str, lang: str = "ru", **kwargs) -> str` — returns translated string with optional format kwargs
- Produces: `i18n.get_localized_name(obj: dict | aiosqlite.Row, lang: str) -> str` — picks `name_ru`/`name_tj`/`name_en` from a DB row

- [ ] **Step 1: Create utils/i18n.py**

```python
import json
import os
from typing import Any

_locales: dict[str, dict[str, str]] = {}
_LOCALE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "locales")
SUPPORTED_LANGUAGES = ("ru", "tj", "en")


def load_locales() -> None:
    for lang in SUPPORTED_LANGUAGES:
        path = os.path.join(_LOCALE_DIR, f"{lang}.json")
        with open(path, "r", encoding="utf-8") as f:
            _locales[lang] = json.load(f)


def t(key: str, lang: str = "ru", **kwargs: Any) -> str:
    text = _locales.get(lang, _locales.get("ru", {})).get(key)
    if text is None:
        text = _locales.get("ru", {}).get(key, key)
    if kwargs:
        text = text.format(**kwargs)
    return text


def get_localized_name(obj: Any, lang: str) -> str:
    name = None
    if hasattr(obj, "__getitem__"):
        name = obj.get(f"name_{lang}") if isinstance(obj, dict) else obj[f"name_{lang}"]
    if not name:
        if hasattr(obj, "__getitem__"):
            name = obj.get("name_ru") if isinstance(obj, dict) else obj["name_ru"]
    return name or ""
```

- [ ] **Step 2: Create locales/ru.json with all bot strings**

```json
{
    "welcome": "Добро пожаловать в PAPRIKA! Выберите язык:",
    "choose_language": "Выберите язык:",
    "lang_ru": "🇷🇺 Русский",
    "lang_tj": "🇹🇯 Тоҷикӣ",
    "lang_en": "🇬🇧 English",
    "main_menu": "Главное меню PAPRIKA",
    "btn_menu": "🍕 Меню",
    "btn_cart": "🛒 Корзина",
    "btn_my_orders": "📦 Мои заказы",
    "btn_contacts": "📞 Контакты",
    "btn_settings": "⚙️ Настройки",
    "btn_change_lang": "🌐 Сменить язык",
    "categories_title": "Выберите категорию:",
    "products_title": "Выберите блюдо:",
    "product_card": "📝 Состав: {ingredients}\n\nВыберите размер:",
    "choose_extras": "Добавить ингредиенты? (необязательно)",
    "btn_skip_extras": "Пропустить",
    "btn_done_extras": "Готово ✓",
    "choose_quantity": "Количество:",
    "btn_add_to_cart": "В корзину ✓",
    "added_to_cart": "✅ Добавлено в корзину!",
    "cart_empty": "Корзина пуста",
    "cart_title": "🛒 Ваша корзина:",
    "cart_item": "{qty}x {name} ({size}) — {price}с",
    "cart_extra": "   + {name} — {price}с",
    "cart_subtotal": "💰 Итого: {total}с",
    "btn_checkout": "Оформить заказ",
    "btn_clear_cart": "Очистить",
    "btn_back_menu": "← Назад в меню",
    "btn_back": "← Назад",
    "choose_delivery": "Как хотите получить заказ?",
    "btn_delivery": "🚗 Доставка",
    "btn_pickup": "🏪 Самовывоз",
    "send_location": "Отправьте вашу геолокацию для расчёта доставки:",
    "btn_send_location": "📍 Отправить геолокацию",
    "btn_choose_zone": "Выбрать район",
    "choose_zone": "Выберите ваш район:",
    "delivery_free": "🚗 Доставка: бесплатно",
    "delivery_price": "🚗 Доставка: {price}с ({distance} км по дороге)",
    "delivery_too_far": "😔 Извините, мы не доставляем так далеко (максимум {max_km} км). Вы можете выбрать самовывоз.",
    "enter_address": "Введите адрес доставки (улица, дом, подъезд):",
    "enter_phone": "Введите ваш номер телефона:",
    "choose_payment": "Выберите способ оплаты:",
    "btn_cash": "💵 Наличные",
    "btn_dushanbe_city": "📱 Душанбе Сити",
    "payment_dushanbe_city": "Переведите {total}с на номер:\n📱 {phone}\n\nПосле оплаты отправьте скриншот чека сюда:",
    "payment_screenshot_received": "✅ Скриншот получен! Ожидайте подтверждения оплаты.",
    "enter_promo": "Введите промокод (или нажмите Пропустить):",
    "btn_skip_promo": "Пропустить",
    "promo_applied": "✅ Промокод применён! Скидка {percent}%",
    "promo_invalid": "❌ Промокод недействителен",
    "order_confirm": "📋 Подтвердите заказ:\n\n{items}\n\n💰 Подитог: {subtotal}с\n🚗 Доставка: {delivery}с\n💵 Итого: {total}с\n💳 Оплата: {payment}",
    "btn_confirm_order": "✅ Подтвердить заказ",
    "btn_cancel": "❌ Отменить",
    "order_placed": "✅ Заказ #{order_id} оформлен! Ожидайте подтверждения.",
    "order_confirmed": "✅ Заказ #{order_id} принят!",
    "order_cooking": "👨‍🍳 Заказ #{order_id} готовится!",
    "order_delivering": "🚗 Заказ #{order_id} — курьер в пути!",
    "order_delivered": "✅ Заказ #{order_id} доставлен! Приятного аппетита!",
    "order_cancelled": "❌ Заказ #{order_id} отменён.",
    "my_orders_empty": "У вас пока нет заказов",
    "my_orders_title": "📦 Ваши заказы:",
    "contacts": "📍 PAPRIKA\n📞 Телефон: {phone}\n📍 Адрес: г. Душанбе",
    "item_unavailable": "❌ {name} временно недоступен",
    "size_unavailable": "❌ {name} ({size}) временно недоступен\n\n✅ Доступные размеры:",
    "alternatives_title": "✅ Похожие блюда:",
    "blacklisted": "К сожалению, вы не можете сделать заказ. Обратитесь к администрации.",
    "admin_panel": "⚙️ Админ-панель PAPRIKA",
    "admin_orders": "📋 Активные заказы:",
    "admin_no_orders": "Нет активных заказов",
    "new_order_notification": "🆕 НОВЫЙ ЗАКАЗ #{order_id}\n\n👤 {customer_name} | {customer_phone}\n🏷 {tags}\n\n{items}\n\n💰 Итого: {subtotal}с\n🚗 Доставка: {delivery_fee}с ({distance})\n💵 Общая сумма: {total}с\n💳 Оплата: {payment}\n\n📍 {address}",
    "btn_accept_order": "✅ Принять",
    "btn_reject_order": "❌ Отклонить",
    "btn_cooking": "👨‍🍳 Готовится",
    "btn_delivering": "🚗 В доставке",
    "btn_delivered": "✅ Доставлен",
    "payment_confirm_prompt": "📱 Оплата Душанбе Сити\nЗаказ #{order_id} | {total}с",
    "btn_payment_ok": "✅ Оплата принята",
    "btn_payment_reject": "❌ Отклонить"
}
```

- [ ] **Step 3: Create locales/tj.json**

```json
{
    "welcome": "Хуш омадед ба PAPRIKA! Забонро интихоб кунед:",
    "choose_language": "Забонро интихоб кунед:",
    "lang_ru": "🇷🇺 Русский",
    "lang_tj": "🇹🇯 Тоҷикӣ",
    "lang_en": "🇬🇧 English",
    "main_menu": "Менюи асосии PAPRIKA",
    "btn_menu": "🍕 Меню",
    "btn_cart": "🛒 Сабад",
    "btn_my_orders": "📦 Фармоишҳои ман",
    "btn_contacts": "📞 Тамос",
    "btn_settings": "⚙️ Танзимот",
    "btn_change_lang": "🌐 Иваз кардани забон",
    "categories_title": "Категорияро интихоб кунед:",
    "products_title": "Таомро интихоб кунед:",
    "product_card": "📝 Таркиб: {ingredients}\n\nАндозаро интихоб кунед:",
    "choose_extras": "Илова кардани маҳсулот? (ихтиёрӣ)",
    "btn_skip_extras": "Гузаштан",
    "btn_done_extras": "Тайёр ✓",
    "choose_quantity": "Миқдор:",
    "btn_add_to_cart": "Ба сабад ✓",
    "added_to_cart": "✅ Ба сабад илова шуд!",
    "cart_empty": "Сабад холӣ аст",
    "cart_title": "🛒 Сабади шумо:",
    "cart_item": "{qty}x {name} ({size}) — {price}с",
    "cart_extra": "   + {name} — {price}с",
    "cart_subtotal": "💰 Ҳамагӣ: {total}с",
    "btn_checkout": "Фармоиш додан",
    "btn_clear_cart": "Тоза кардан",
    "btn_back_menu": "← Бозгашт ба меню",
    "btn_back": "← Бозгашт",
    "choose_delivery": "Чӣ тавр мехоҳед фармоишро гиред?",
    "btn_delivery": "🚗 Расонидан",
    "btn_pickup": "🏪 Худам мегирам",
    "send_location": "Ҷойгиршавии худро фиристед:",
    "btn_send_location": "📍 Ҷойгиршавӣ фиристодан",
    "btn_choose_zone": "Ноҳияро интихоб кунед",
    "choose_zone": "Ноҳияи худро интихоб кунед:",
    "delivery_free": "🚗 Расонидан: ройгон",
    "delivery_price": "🚗 Расонидан: {price}с ({distance} км)",
    "delivery_too_far": "😔 Бубахшед, мо то ин ҷо расонида наметавонем (максимум {max_km} км).",
    "enter_address": "Суроғаро ворид кунед (кӯча, хона):",
    "enter_phone": "Рақами телефони худро ворид кунед:",
    "choose_payment": "Тарзи пардохтро интихоб кунед:",
    "btn_cash": "💵 Нақд",
    "btn_dushanbe_city": "📱 Душанбе Сити",
    "payment_dushanbe_city": "{total}с ба рақами:\n📱 {phone} гузаронед\n\nПас аз пардохт скриншот фиристед:",
    "payment_screenshot_received": "✅ Скриншот қабул шуд! Мунтазир бошед.",
    "enter_promo": "Промокод ворид кунед (ё Гузаштан):",
    "btn_skip_promo": "Гузаштан",
    "promo_applied": "✅ Промокод қабул шуд! Тахфиф {percent}%",
    "promo_invalid": "❌ Промокод нодуруст аст",
    "order_placed": "✅ Фармоиш #{order_id} қабул шуд!",
    "order_confirmed": "✅ Фармоиш #{order_id} тасдиқ шуд!",
    "order_cooking": "👨‍🍳 Фармоиш #{order_id} тайёр мешавад!",
    "order_delivering": "🚗 Фармоиш #{order_id} — курер дар роҳ аст!",
    "order_delivered": "✅ Фармоиш #{order_id} расонида шуд! Нӯши ҷон!",
    "order_cancelled": "❌ Фармоиш #{order_id} бекор шуд.",
    "my_orders_empty": "Шумо ҳанӯз фармоиш надодаед",
    "my_orders_title": "📦 Фармоишҳои шумо:",
    "contacts": "📍 PAPRIKA\n📞 Телефон: {phone}\n📍 Суроға: ш. Душанбе",
    "item_unavailable": "❌ {name} муваққатан дастнорас аст",
    "size_unavailable": "❌ {name} ({size}) муваққатан дастнорас аст\n\n✅ Андозаҳои дастрас:",
    "alternatives_title": "✅ Таомҳои монанд:",
    "blacklisted": "Мутаассифона, шумо фармоиш дода наметавонед. Ба маъмурият муроҷиат кунед."
}
```

- [ ] **Step 4: Create locales/en.json**

```json
{
    "welcome": "Welcome to PAPRIKA! Choose your language:",
    "choose_language": "Choose your language:",
    "lang_ru": "🇷🇺 Русский",
    "lang_tj": "🇹🇯 Тоҷикӣ",
    "lang_en": "🇬🇧 English",
    "main_menu": "PAPRIKA Main Menu",
    "btn_menu": "🍕 Menu",
    "btn_cart": "🛒 Cart",
    "btn_my_orders": "📦 My Orders",
    "btn_contacts": "📞 Contacts",
    "btn_settings": "⚙️ Settings",
    "btn_change_lang": "🌐 Change Language",
    "categories_title": "Choose a category:",
    "products_title": "Choose a dish:",
    "product_card": "📝 Ingredients: {ingredients}\n\nChoose size:",
    "choose_extras": "Add extras? (optional)",
    "btn_skip_extras": "Skip",
    "btn_done_extras": "Done ✓",
    "choose_quantity": "Quantity:",
    "btn_add_to_cart": "Add to cart ✓",
    "added_to_cart": "✅ Added to cart!",
    "cart_empty": "Your cart is empty",
    "cart_title": "🛒 Your cart:",
    "cart_item": "{qty}x {name} ({size}) — {price}s",
    "cart_extra": "   + {name} — {price}s",
    "cart_subtotal": "💰 Total: {total}s",
    "btn_checkout": "Checkout",
    "btn_clear_cart": "Clear",
    "btn_back_menu": "← Back to menu",
    "btn_back": "← Back",
    "choose_delivery": "How would you like to receive your order?",
    "btn_delivery": "🚗 Delivery",
    "btn_pickup": "🏪 Pickup",
    "send_location": "Send your location for delivery calculation:",
    "btn_send_location": "📍 Send Location",
    "btn_choose_zone": "Choose district",
    "choose_zone": "Choose your district:",
    "delivery_free": "🚗 Delivery: free",
    "delivery_price": "🚗 Delivery: {price}s ({distance} km by road)",
    "delivery_too_far": "😔 Sorry, we don't deliver that far (max {max_km} km). You can choose pickup.",
    "enter_address": "Enter your delivery address (street, building):",
    "enter_phone": "Enter your phone number:",
    "choose_payment": "Choose payment method:",
    "btn_cash": "💵 Cash",
    "btn_dushanbe_city": "📱 Dushanbe City",
    "payment_dushanbe_city": "Transfer {total}s to:\n📱 {phone}\n\nSend a screenshot of payment here:",
    "payment_screenshot_received": "✅ Screenshot received! Waiting for payment confirmation.",
    "enter_promo": "Enter promo code (or press Skip):",
    "btn_skip_promo": "Skip",
    "promo_applied": "✅ Promo applied! {percent}% discount",
    "promo_invalid": "❌ Invalid promo code",
    "order_placed": "✅ Order #{order_id} placed! Awaiting confirmation.",
    "order_confirmed": "✅ Order #{order_id} confirmed!",
    "order_cooking": "👨‍🍳 Order #{order_id} is being prepared!",
    "order_delivering": "🚗 Order #{order_id} — courier on the way!",
    "order_delivered": "✅ Order #{order_id} delivered! Enjoy your meal!",
    "order_cancelled": "❌ Order #{order_id} cancelled.",
    "my_orders_empty": "You have no orders yet",
    "my_orders_title": "📦 Your orders:",
    "contacts": "📍 PAPRIKA\n📞 Phone: {phone}\n📍 Address: Dushanbe",
    "item_unavailable": "❌ {name} is temporarily unavailable",
    "size_unavailable": "❌ {name} ({size}) is temporarily unavailable\n\n✅ Available sizes:",
    "alternatives_title": "✅ Similar dishes:",
    "blacklisted": "Sorry, you cannot place orders. Please contact the administration."
}
```

- [ ] **Step 5: Write tests for i18n**

Create `tests/test_i18n.py`:
```python
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from utils.i18n import load_locales, t, get_localized_name


@pytest.fixture(autouse=True)
def setup_locales():
    load_locales()


def test_t_returns_russian_by_default():
    assert t("btn_menu") == "🍕 Меню"


def test_t_returns_english():
    assert t("btn_menu", lang="en") == "🍕 Menu"


def test_t_returns_tajik():
    assert t("btn_cart", lang="tj") == "🛒 Сабад"


def test_t_falls_back_to_russian():
    assert t("btn_menu", lang="xx") == "🍕 Меню"


def test_t_returns_key_if_missing():
    assert t("nonexistent_key") == "nonexistent_key"


def test_t_formats_kwargs():
    result = t("delivery_price", lang="en", price=10, distance=4.2)
    assert "10" in result
    assert "4.2" in result


def test_get_localized_name_dict():
    obj = {"name_ru": "Пицца", "name_tj": "Пицца", "name_en": "Pizza"}
    assert get_localized_name(obj, "en") == "Pizza"
    assert get_localized_name(obj, "ru") == "Пицца"


def test_get_localized_name_fallback():
    obj = {"name_ru": "Пицца", "name_tj": None, "name_en": None}
    assert get_localized_name(obj, "en") == "Пицца"
```

- [ ] **Step 6: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_i18n.py -v
```
Expected: all 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "feat: i18n system with RU/TJ/EN locale files"
```

---

### Task 3: User and Admin Models

**Files:**
- Create: `~/Desktop/paprika-bot/models/user.py`
- Create: `~/Desktop/paprika-bot/models/tag.py`
- Create: `~/Desktop/paprika-bot/tests/test_models_user.py`

**Interfaces:**
- Consumes: `database.get_db() -> aiosqlite.Connection`
- Produces: `user.get_or_create_user(telegram_id: int, full_name: str | None = None) -> dict`
- Produces: `user.update_language(telegram_id: int, lang: str) -> None`
- Produces: `user.update_phone(telegram_id: int, phone: str) -> None`
- Produces: `user.get_user_by_telegram_id(telegram_id: int) -> dict | None`
- Produces: `user.is_admin(telegram_id: int) -> bool`
- Produces: `user.is_operator(telegram_id: int) -> bool`
- Produces: `user.get_admin_role(telegram_id: int) -> str | None`
- Produces: `user.get_all_admins_and_operators() -> list[dict]`
- Produces: `user.add_operator(telegram_id: int, name: str) -> None`
- Produces: `user.remove_operator(telegram_id: int) -> None`
- Produces: `tag.get_user_tags(user_id: int) -> list[dict]`
- Produces: `tag.add_user_tag(user_id: int, tag: str, comment: str | None = None) -> None`
- Produces: `tag.remove_user_tag(user_id: int, tag: str) -> None`
- Produces: `tag.get_auto_tags(user_id: int) -> list[str]` — computes from order history
- Produces: `tag.get_all_tags(user_id: int) -> list[str]` — auto + manual combined

- [ ] **Step 1: Write test file tests/test_models_user.py**

```python
import pytest

from models.user import (
    get_or_create_user, update_language, update_phone,
    get_user_by_telegram_id, is_admin, is_operator,
    add_operator, remove_operator, get_admin_role,
)
from models.tag import get_user_tags, add_user_tag, remove_user_tag, get_all_tags


@pytest.mark.asyncio
async def test_get_or_create_user(db):
    user = await get_or_create_user(12345, "Test User")
    assert user["telegram_id"] == 12345
    assert user["full_name"] == "Test User"
    assert user["language"] == "ru"

    same_user = await get_or_create_user(12345, "Test User")
    assert same_user["id"] == user["id"]


@pytest.mark.asyncio
async def test_update_language(db):
    user = await get_or_create_user(100, "Lang User")
    await update_language(100, "tj")
    updated = await get_user_by_telegram_id(100)
    assert updated["language"] == "tj"


@pytest.mark.asyncio
async def test_update_phone(db):
    await get_or_create_user(200, "Phone User")
    await update_phone(200, "+992900123456")
    updated = await get_user_by_telegram_id(200)
    assert updated["phone"] == "+992900123456"


@pytest.mark.asyncio
async def test_is_admin(db):
    assert await is_admin(0) is True
    assert await is_admin(99999) is False


@pytest.mark.asyncio
async def test_operator_crud(db):
    await add_operator(555, "Operator One")
    assert await is_operator(555) is True
    assert await get_admin_role(555) == "operator"
    await remove_operator(555)
    assert await is_operator(555) is False


@pytest.mark.asyncio
async def test_user_tags(db):
    user = await get_or_create_user(300, "Tag User")
    await add_user_tag(user["id"], "vip", "Good customer")
    tags = await get_user_tags(user["id"])
    assert len(tags) == 1
    assert tags[0]["tag"] == "vip"

    await remove_user_tag(user["id"], "vip")
    tags = await get_user_tags(user["id"])
    assert len(tags) == 0


@pytest.mark.asyncio
async def test_get_all_tags_includes_new(db):
    user = await get_or_create_user(400, "New User")
    all_tags = await get_all_tags(user["id"])
    assert "new" in [t.lower() for t in all_tags]
```

- [ ] **Step 2: Implement models/user.py**

```python
import database


async def get_or_create_user(telegram_id: int, full_name: str | None = None) -> dict:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
    )
    row = await cursor.fetchone()
    if row:
        return dict(row)
    await db.execute(
        "INSERT INTO users (telegram_id, full_name) VALUES (?, ?)",
        (telegram_id, full_name),
    )
    await db.commit()
    cursor = await db.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
    )
    return dict(await cursor.fetchone())


async def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def update_language(telegram_id: int, lang: str) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE users SET language = ? WHERE telegram_id = ?", (lang, telegram_id)
    )
    await db.commit()


async def update_phone(telegram_id: int, phone: str) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE users SET phone = ? WHERE telegram_id = ?", (phone, telegram_id)
    )
    await db.commit()


async def is_admin(telegram_id: int) -> bool:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT 1 FROM admins WHERE telegram_id = ? AND role = 'admin'",
        (telegram_id,),
    )
    return await cursor.fetchone() is not None


async def is_operator(telegram_id: int) -> bool:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT 1 FROM admins WHERE telegram_id = ? AND role = 'operator'",
        (telegram_id,),
    )
    return await cursor.fetchone() is not None


async def get_admin_role(telegram_id: int) -> str | None:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT role FROM admins WHERE telegram_id = ?", (telegram_id,)
    )
    row = await cursor.fetchone()
    return row[0] if row else None


async def get_all_admins_and_operators() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM admins ORDER BY role, name")
    return [dict(row) for row in await cursor.fetchall()]


async def add_operator(telegram_id: int, name: str) -> None:
    db = await database.get_db()
    await db.execute(
        "INSERT OR REPLACE INTO admins (telegram_id, role, name) VALUES (?, 'operator', ?)",
        (telegram_id, name),
    )
    await db.commit()


async def remove_operator(telegram_id: int) -> None:
    db = await database.get_db()
    await db.execute(
        "DELETE FROM admins WHERE telegram_id = ? AND role = 'operator'",
        (telegram_id,),
    )
    await db.commit()
```

- [ ] **Step 3: Implement models/tag.py**

```python
import config
import database


async def get_user_tags(user_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM user_tags WHERE user_id = ?", (user_id,)
    )
    return [dict(row) for row in await cursor.fetchall()]


async def add_user_tag(user_id: int, tag: str, comment: str | None = None) -> None:
    db = await database.get_db()
    await db.execute(
        "INSERT INTO user_tags (user_id, tag, comment) VALUES (?, ?, ?)",
        (user_id, tag, comment),
    )
    await db.commit()


async def remove_user_tag(user_id: int, tag: str) -> None:
    db = await database.get_db()
    await db.execute(
        "DELETE FROM user_tags WHERE user_id = ? AND tag = ?",
        (user_id, tag),
    )
    await db.commit()


async def get_auto_tags(user_id: int) -> list[str]:
    db = await database.get_db()
    tags = []

    cursor = await db.execute(
        "SELECT COUNT(*) FROM orders WHERE user_id = ? AND status = 'delivered'",
        (user_id,),
    )
    order_count = (await cursor.fetchone())[0]

    if order_count == 0:
        tags.append("Новый")
    elif order_count >= config.REGULAR_ORDER_COUNT:
        tags.append("Постоянник")

    cursor = await db.execute(
        "SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = ? AND status = 'delivered'",
        (user_id,),
    )
    total_spent = (await cursor.fetchone())[0]

    if total_spent >= config.HIGH_VALUE_TOTAL:
        tags.append("Дорогой клиент")

    return tags


async def get_all_tags(user_id: int) -> list[str]:
    auto = await get_auto_tags(user_id)
    manual_rows = await get_user_tags(user_id)
    manual = [row["tag"] for row in manual_rows]
    return auto + manual
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_models_user.py -v
```
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: user, admin, and tag models with CRUD and auto-tags"
```

---

### Task 4: Product, Ingredient, and Category Models

**Files:**
- Create: `~/Desktop/paprika-bot/models/product.py`
- Create: `~/Desktop/paprika-bot/models/ingredient.py`
- Create: `~/Desktop/paprika-bot/tests/test_models_product.py`

**Interfaces:**
- Consumes: `database.get_db()`
- Produces: `product.create_category(name_ru: str, name_tj: str | None, name_en: str | None, sort_order: int = 0) -> int`
- Produces: `product.get_active_categories() -> list[dict]`
- Produces: `product.create_product(category_id: int, name_ru: str, ..., ingredient_ids: list[int] | None = None) -> int`
- Produces: `product.get_products_by_category(category_id: int) -> list[dict]` — only active + ingredient-available
- Produces: `product.get_product(product_id: int) -> dict | None`
- Produces: `product.get_product_sizes(product_id: int) -> list[dict]`
- Produces: `product.get_product_ingredients_text(product_id: int, lang: str) -> str`
- Produces: `product.create_product_size(product_id: int, size_name: str, price: float) -> int`
- Produces: `product.toggle_product(product_id: int, is_active: int) -> None`
- Produces: `product.toggle_product_size(size_id: int, is_active: int) -> None`
- Produces: `product.update_product(product_id: int, **kwargs) -> None`
- Produces: `product.delete_product(product_id: int) -> None`
- Produces: `product.get_extras_for_category(category_id: int) -> list[dict]`
- Produces: `product.create_extra(category_id: int, name_ru: str, ..., price: float) -> int`
- Produces: `product.get_available_alternatives(product_id: int) -> list[dict]`
- Produces: `ingredient.create_ingredient(name_ru: str, name_tj: str | None, name_en: str | None) -> int`
- Produces: `ingredient.get_all_ingredients() -> list[dict]`
- Produces: `ingredient.toggle_ingredient(ingredient_id: int, is_available: int) -> list[dict]` — returns affected products
- Produces: `ingredient.get_affected_products(ingredient_id: int) -> list[dict]`
- Produces: `ingredient.is_product_available(product_id: int) -> bool` — checks both is_active and all ingredients available

- [ ] **Step 1: Write tests/test_models_product.py**

```python
import pytest
from models.ingredient import (
    create_ingredient, get_all_ingredients, toggle_ingredient,
    is_product_available, get_affected_products,
)
from models.product import (
    create_category, get_active_categories, create_product,
    get_products_by_category, get_product, get_product_sizes,
    create_product_size, toggle_product, get_product_ingredients_text,
    get_extras_for_category, create_extra, get_available_alternatives,
)


@pytest.mark.asyncio
async def test_category_crud(db):
    cat_id = await create_category("Пицца", "Пицца", "Pizza")
    cats = await get_active_categories()
    assert any(c["id"] == cat_id for c in cats)


@pytest.mark.asyncio
async def test_ingredient_crud(db):
    ing_id = await create_ingredient("Тесто", "Хамир", "Dough")
    ings = await get_all_ingredients()
    assert any(i["id"] == ing_id for i in ings)


@pytest.mark.asyncio
async def test_product_with_ingredients(db):
    cat_id = await create_category("Пицца", None, None)
    ing1 = await create_ingredient("Тесто", None, None)
    ing2 = await create_ingredient("Сыр моцарелла", None, None)

    prod_id = await create_product(
        cat_id, "Маргарита", None, None, None, None, None,
        ingredient_ids=[ing1, ing2],
    )
    await create_product_size(prod_id, "Малая", 35.0)
    await create_product_size(prod_id, "Большая", 65.0)

    product = await get_product(prod_id)
    assert product["name_ru"] == "Маргарита"

    sizes = await get_product_sizes(prod_id)
    assert len(sizes) == 2

    text = await get_product_ingredients_text(prod_id, "ru")
    assert "Тесто" in text
    assert "Сыр моцарелла" in text


@pytest.mark.asyncio
async def test_ingredient_toggle_cascades(db):
    cat_id = await create_category("Пицца", None, None)
    cheese = await create_ingredient("Моцарелла", None, None)
    prod_id = await create_product(
        cat_id, "4 сыра", None, None, None, None, None,
        ingredient_ids=[cheese],
    )
    await create_product_size(prod_id, "Малая", 45.0)

    assert await is_product_available(prod_id) is True

    affected = await toggle_ingredient(cheese, 0)
    assert any(p["id"] == prod_id for p in affected)
    assert await is_product_available(prod_id) is False

    await toggle_ingredient(cheese, 1)
    assert await is_product_available(prod_id) is True


@pytest.mark.asyncio
async def test_get_available_alternatives(db):
    cat_id = await create_category("Пицца", None, None)
    ing = await create_ingredient("Тесто", None, None)

    p1 = await create_product(cat_id, "Маргарита", None, None, None, None, None, ingredient_ids=[ing])
    await create_product_size(p1, "Малая", 35.0)
    p2 = await create_product(cat_id, "Пепперони", None, None, None, None, None, ingredient_ids=[ing])
    await create_product_size(p2, "Малая", 45.0)

    await toggle_product(p1, 0)
    alts = await get_available_alternatives(p1)
    assert any(a["id"] == p2 for a in alts)


@pytest.mark.asyncio
async def test_extras_crud(db):
    cat_id = await create_category("Пицца", None, None)
    ext_id = await create_extra(cat_id, "Сыр моцарелла", None, None, 10.0)
    extras = await get_extras_for_category(cat_id)
    assert len(extras) == 1
    assert extras[0]["price"] == 10.0
```

- [ ] **Step 2: Implement models/ingredient.py**

```python
import database


async def create_ingredient(name_ru: str, name_tj: str | None, name_en: str | None) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        "INSERT INTO ingredients (name_ru, name_tj, name_en) VALUES (?, ?, ?)",
        (name_ru, name_tj, name_en),
    )
    await db.commit()
    return cursor.lastrowid


async def get_all_ingredients() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM ingredients ORDER BY name_ru")
    return [dict(row) for row in await cursor.fetchall()]


async def get_affected_products(ingredient_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT p.* FROM products p
           JOIN product_ingredients pi ON p.id = pi.product_id
           WHERE pi.ingredient_id = ?""",
        (ingredient_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def toggle_ingredient(ingredient_id: int, is_available: int) -> list[dict]:
    db = await database.get_db()
    await db.execute(
        "UPDATE ingredients SET is_available = ? WHERE id = ?",
        (is_available, ingredient_id),
    )
    await db.commit()
    return await get_affected_products(ingredient_id)


async def is_product_available(product_id: int) -> bool:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT is_active FROM products WHERE id = ?", (product_id,)
    )
    row = await cursor.fetchone()
    if not row or not row[0]:
        return False

    cursor = await db.execute(
        """SELECT COUNT(*) FROM product_ingredients pi
           JOIN ingredients i ON pi.ingredient_id = i.id
           WHERE pi.product_id = ? AND i.is_available = 0""",
        (product_id,),
    )
    unavailable_count = (await cursor.fetchone())[0]
    return unavailable_count == 0


async def update_ingredient(ingredient_id: int, **kwargs) -> None:
    db = await database.get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [ingredient_id]
    await db.execute(f"UPDATE ingredients SET {sets} WHERE id = ?", values)
    await db.commit()


async def delete_ingredient(ingredient_id: int) -> None:
    db = await database.get_db()
    await db.execute("DELETE FROM product_ingredients WHERE ingredient_id = ?", (ingredient_id,))
    await db.execute("DELETE FROM ingredients WHERE id = ?", (ingredient_id,))
    await db.commit()
```

- [ ] **Step 3: Implement models/product.py**

```python
import database


async def create_category(name_ru: str, name_tj: str | None, name_en: str | None, sort_order: int = 0) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        "INSERT INTO categories (name_ru, name_tj, name_en, sort_order) VALUES (?, ?, ?, ?)",
        (name_ru, name_tj, name_en, sort_order),
    )
    await db.commit()
    return cursor.lastrowid


async def get_active_categories() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name_ru"
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_all_categories() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM categories ORDER BY sort_order, name_ru")
    return [dict(row) for row in await cursor.fetchall()]


async def update_category(category_id: int, **kwargs) -> None:
    db = await database.get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [category_id]
    await db.execute(f"UPDATE categories SET {sets} WHERE id = ?", values)
    await db.commit()


async def delete_category(category_id: int) -> None:
    db = await database.get_db()
    await db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    await db.commit()


async def create_product(
    category_id: int,
    name_ru: str,
    name_tj: str | None,
    name_en: str | None,
    description_ru: str | None,
    description_tj: str | None,
    description_en: str | None,
    ingredient_ids: list[int] | None = None,
    sort_order: int = 0,
) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        """INSERT INTO products (category_id, name_ru, name_tj, name_en,
           description_ru, description_tj, description_en, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (category_id, name_ru, name_tj, name_en,
         description_ru, description_tj, description_en, sort_order),
    )
    product_id = cursor.lastrowid

    if ingredient_ids:
        for ing_id in ingredient_ids:
            await db.execute(
                "INSERT INTO product_ingredients (product_id, ingredient_id) VALUES (?, ?)",
                (product_id, ing_id),
            )

    await db.commit()
    return product_id


async def get_products_by_category(category_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT p.* FROM products p
           WHERE p.category_id = ? AND p.is_active = 1
           AND NOT EXISTS (
               SELECT 1 FROM product_ingredients pi
               JOIN ingredients i ON pi.ingredient_id = i.id
               WHERE pi.product_id = p.id AND i.is_available = 0
           )
           ORDER BY p.sort_order, p.name_ru""",
        (category_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_all_products_by_category(category_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM products WHERE category_id = ? ORDER BY sort_order, name_ru",
        (category_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_product(product_id: int) -> dict | None:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_product_sizes(product_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM product_sizes WHERE product_id = ? ORDER BY price",
        (product_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_active_product_sizes(product_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM product_sizes WHERE product_id = ? AND is_active = 1 ORDER BY price",
        (product_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def create_product_size(product_id: int, size_name: str, price: float) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        "INSERT INTO product_sizes (product_id, size_name, price) VALUES (?, ?, ?)",
        (product_id, size_name, price),
    )
    await db.commit()
    return cursor.lastrowid


async def get_product_ingredients_text(product_id: int, lang: str) -> str:
    db = await database.get_db()
    col = f"name_{lang}" if lang in ("ru", "tj", "en") else "name_ru"
    cursor = await db.execute(
        f"""SELECT COALESCE(i.{col}, i.name_ru) as name
            FROM product_ingredients pi
            JOIN ingredients i ON pi.ingredient_id = i.id
            WHERE pi.product_id = ?
            ORDER BY i.name_ru""",
        (product_id,),
    )
    rows = await cursor.fetchall()
    return ", ".join(row[0] for row in rows)


async def toggle_product(product_id: int, is_active: int) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE products SET is_active = ? WHERE id = ?", (is_active, product_id)
    )
    await db.commit()


async def toggle_product_size(size_id: int, is_active: int) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE product_sizes SET is_active = ? WHERE id = ?", (is_active, size_id)
    )
    await db.commit()


async def update_product(product_id: int, **kwargs) -> None:
    db = await database.get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [product_id]
    await db.execute(f"UPDATE products SET {sets} WHERE id = ?", values)
    await db.commit()


async def delete_product(product_id: int) -> None:
    db = await database.get_db()
    await db.execute("DELETE FROM product_ingredients WHERE product_id = ?", (product_id,))
    await db.execute("DELETE FROM product_sizes WHERE product_id = ?", (product_id,))
    await db.execute("DELETE FROM products WHERE id = ?", (product_id,))
    await db.commit()


async def get_extras_for_category(category_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM extras WHERE category_id = ? AND is_active = 1 ORDER BY name_ru",
        (category_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def create_extra(category_id: int, name_ru: str, name_tj: str | None, name_en: str | None, price: float) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        "INSERT INTO extras (category_id, name_ru, name_tj, name_en, price) VALUES (?, ?, ?, ?, ?)",
        (category_id, name_ru, name_tj, name_en, price),
    )
    await db.commit()
    return cursor.lastrowid


async def get_available_alternatives(product_id: int) -> list[dict]:
    product = await get_product(product_id)
    if not product:
        return []
    return await get_products_by_category(product["category_id"])
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_models_product.py -v
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: product, ingredient, category, and extras models"
```

---

### Task 5: Delivery and Geo Models

**Files:**
- Create: `~/Desktop/paprika-bot/utils/geo.py`
- Create: `~/Desktop/paprika-bot/models/delivery.py`
- Create: `~/Desktop/paprika-bot/tests/test_geo.py`

**Interfaces:**
- Produces: `geo.calculate_road_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float | None` — km via OSRM, None on error
- Produces: `delivery.get_delivery_settings() -> dict`
- Produces: `delivery.update_delivery_settings(**kwargs) -> None`
- Produces: `delivery.calculate_delivery_fee(distance_km: float) -> tuple[float, bool]` — (fee, is_within_range)
- Produces: `delivery.get_delivery_zones() -> list[dict]`
- Produces: `delivery.create_delivery_zone(name_ru: str, ..., price: float) -> int`
- Produces: `delivery.update_delivery_zone(zone_id: int, **kwargs) -> None`
- Produces: `delivery.delete_delivery_zone(zone_id: int) -> None`

- [ ] **Step 1: Write tests/test_geo.py**

```python
import pytest
from models.delivery import get_delivery_settings, calculate_delivery_fee, update_delivery_settings
from utils.geo import haversine_distance


def test_haversine_distance():
    lat1, lng1 = 38.536270, 68.780498
    lat2, lng2 = 38.560000, 68.800000
    dist = haversine_distance(lat1, lng1, lat2, lng2)
    assert 2.0 < dist < 5.0


@pytest.mark.asyncio
async def test_delivery_fee_free_zone(db):
    settings = await get_delivery_settings()
    assert settings["free_zone_km"] == 3.0

    fee, ok = await calculate_delivery_fee(2.0)
    assert fee == 0.0
    assert ok is True


@pytest.mark.asyncio
async def test_delivery_fee_paid(db):
    fee, ok = await calculate_delivery_fee(5.0)
    assert fee == 25.0  # 5 km * 5 som/km = 25
    assert ok is True


@pytest.mark.asyncio
async def test_delivery_fee_too_far(db):
    fee, ok = await calculate_delivery_fee(20.0)
    assert ok is False


@pytest.mark.asyncio
async def test_delivery_fee_boundary(db):
    fee, ok = await calculate_delivery_fee(3.0)
    assert fee == 0.0
    assert ok is True
```

- [ ] **Step 2: Implement utils/geo.py**

```python
import math
import httpx


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def calculate_road_distance(
    lat1: float, lng1: float, lat2: float, lng2: float
) -> float | None:
    url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{lng1},{lat1};{lng2},{lat2}?overview=false"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") == "Ok" and data.get("routes"):
                meters = data["routes"][0]["distance"]
                return round(meters / 1000, 1)
    except Exception:
        pass
    return None
```

- [ ] **Step 3: Implement models/delivery.py**

```python
import math
import database


async def get_delivery_settings() -> dict:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM delivery_settings WHERE id = 1")
    row = await cursor.fetchone()
    return dict(row) if row else {}


async def update_delivery_settings(**kwargs) -> None:
    db = await database.get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values())
    await db.execute(f"UPDATE delivery_settings SET {sets} WHERE id = 1", values)
    await db.commit()


async def calculate_delivery_fee(distance_km: float) -> tuple[float, bool]:
    settings = await get_delivery_settings()
    max_km = settings["max_distance_km"]
    free_km = settings["free_zone_km"]
    price_per_km = settings["price_per_km"]

    if distance_km > max_km:
        return 0.0, False

    if distance_km <= free_km:
        return 0.0, True

    fee = math.ceil(distance_km * price_per_km)
    return float(fee), True


async def get_delivery_zones() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY name_ru"
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_all_delivery_zones() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM delivery_zones ORDER BY name_ru")
    return [dict(row) for row in await cursor.fetchall()]


async def create_delivery_zone(
    name_ru: str, name_tj: str | None, name_en: str | None, price: float
) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        "INSERT INTO delivery_zones (name_ru, name_tj, name_en, price) VALUES (?, ?, ?, ?)",
        (name_ru, name_tj, name_en, price),
    )
    await db.commit()
    return cursor.lastrowid


async def update_delivery_zone(zone_id: int, **kwargs) -> None:
    db = await database.get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [zone_id]
    await db.execute(f"UPDATE delivery_zones SET {sets} WHERE id = ?", values)
    await db.commit()


async def delete_delivery_zone(zone_id: int) -> None:
    db = await database.get_db()
    await db.execute("DELETE FROM delivery_zones WHERE id = ?", (zone_id,))
    await db.commit()
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_geo.py -v
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: geo distance calculation and delivery fee models"
```

---

### Task 6: Order and Promo Models

**Files:**
- Create: `~/Desktop/paprika-bot/models/order.py`
- Create: `~/Desktop/paprika-bot/models/promo.py`
- Create: `~/Desktop/paprika-bot/tests/test_models_order.py`

**Interfaces:**
- Produces: `order.create_order(user_id: int, delivery_type: str, subtotal: float, total: float, **kwargs) -> int`
- Produces: `order.add_order_item(order_id: int, product_id: int, product_size_id: int, quantity: int, unit_price: float, total_price: float) -> int`
- Produces: `order.add_order_item_extra(order_item_id: int, extra_id: int, price: float) -> None`
- Produces: `order.update_order_status(order_id: int, status: str) -> None`
- Produces: `order.get_order(order_id: int) -> dict | None`
- Produces: `order.get_order_items(order_id: int) -> list[dict]`
- Produces: `order.get_order_item_extras(order_item_id: int) -> list[dict]`
- Produces: `order.get_active_orders() -> list[dict]`
- Produces: `order.get_user_orders(user_id: int, limit: int = 10) -> list[dict]`
- Produces: `order.set_payment_screenshot(order_id: int, file_id: str) -> None`
- Produces: `promo.create_promo(code: str, discount_percent: float, ...) -> int`
- Produces: `promo.validate_promo(code: str) -> dict | None`
- Produces: `promo.use_promo(code: str) -> None`
- Produces: `promo.get_all_promos() -> list[dict]`
- Produces: `promo.toggle_promo(promo_id: int, is_active: int) -> None`
- Produces: `promo.is_promos_enabled() -> bool`
- Produces: `promo.set_promos_enabled(enabled: bool) -> None`

- [ ] **Step 1: Write tests/test_models_order.py**

```python
import pytest
from models.user import get_or_create_user
from models.product import create_category, create_product, create_product_size, create_extra
from models.ingredient import create_ingredient
from models.order import (
    create_order, add_order_item, add_order_item_extra,
    update_order_status, get_order, get_order_items,
    get_order_item_extras, get_active_orders, get_user_orders,
)
from models.promo import (
    create_promo, validate_promo, use_promo,
    is_promos_enabled, set_promos_enabled,
)


@pytest.mark.asyncio
async def test_full_order_flow(db):
    user = await get_or_create_user(1000, "Order User")
    cat_id = await create_category("Пицца", None, None)
    ing = await create_ingredient("Тесто", None, None)
    prod_id = await create_product(cat_id, "Маргарита", None, None, None, None, None, ingredient_ids=[ing])
    size_id = await create_product_size(prod_id, "Большая", 65.0)
    ext_id = await create_extra(cat_id, "Моцарелла", None, None, 10.0)

    order_id = await create_order(
        user_id=user["id"],
        delivery_type="delivery",
        subtotal=75.0,
        total=85.0,
        delivery_fee=10.0,
        payment_method="cash",
        delivery_address="ул. Рудаки 100",
    )
    assert order_id > 0

    item_id = await add_order_item(order_id, prod_id, size_id, 1, 65.0, 65.0)
    await add_order_item_extra(item_id, ext_id, 10.0)

    order = await get_order(order_id)
    assert order["status"] == "new"
    assert order["total"] == 85.0

    items = await get_order_items(order_id)
    assert len(items) == 1

    extras = await get_order_item_extras(item_id)
    assert len(extras) == 1
    assert extras[0]["price"] == 10.0


@pytest.mark.asyncio
async def test_order_status_flow(db):
    user = await get_or_create_user(1001, "Status User")
    order_id = await create_order(user["id"], "pickup", 50.0, 50.0)

    for status in ["confirmed", "cooking", "delivering", "delivered"]:
        await update_order_status(order_id, status)
        order = await get_order(order_id)
        assert order["status"] == status


@pytest.mark.asyncio
async def test_active_orders(db):
    user = await get_or_create_user(1002, "Active User")
    oid = await create_order(user["id"], "pickup", 30.0, 30.0)
    active = await get_active_orders()
    assert any(o["id"] == oid for o in active)

    await update_order_status(oid, "delivered")
    active = await get_active_orders()
    assert not any(o["id"] == oid for o in active)


@pytest.mark.asyncio
async def test_promo_flow(db):
    await set_promos_enabled(True)
    assert await is_promos_enabled() is True

    await create_promo("SALE20", 20.0)
    promo = await validate_promo("SALE20")
    assert promo is not None
    assert promo["discount_percent"] == 20.0

    await use_promo("SALE20")

    assert await validate_promo("INVALID") is None

    await set_promos_enabled(False)
    assert await is_promos_enabled() is False
```

- [ ] **Step 2: Implement models/order.py**

```python
import database


async def create_order(
    user_id: int,
    delivery_type: str,
    subtotal: float,
    total: float,
    **kwargs,
) -> int:
    db = await database.get_db()
    columns = ["user_id", "delivery_type", "subtotal", "total"]
    values = [user_id, delivery_type, subtotal, total]
    for key, val in kwargs.items():
        columns.append(key)
        values.append(val)
    placeholders = ", ".join("?" for _ in values)
    col_str = ", ".join(columns)
    cursor = await db.execute(
        f"INSERT INTO orders ({col_str}) VALUES ({placeholders})", values
    )
    await db.commit()
    return cursor.lastrowid


async def add_order_item(
    order_id: int, product_id: int, product_size_id: int,
    quantity: int, unit_price: float, total_price: float,
) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        """INSERT INTO order_items (order_id, product_id, product_size_id, quantity, unit_price, total_price)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (order_id, product_id, product_size_id, quantity, unit_price, total_price),
    )
    await db.commit()
    return cursor.lastrowid


async def add_order_item_extra(order_item_id: int, extra_id: int, price: float) -> None:
    db = await database.get_db()
    await db.execute(
        "INSERT INTO order_item_extras (order_item_id, extra_id, price) VALUES (?, ?, ?)",
        (order_item_id, extra_id, price),
    )
    await db.commit()


async def update_order_status(order_id: int, status: str) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, order_id),
    )
    await db.commit()


async def get_order(order_id: int) -> dict | None:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    row = await cursor.fetchone()
    return dict(row) if row else None


async def get_order_items(order_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT oi.*, p.name_ru as product_name, p.name_tj as product_name_tj,
           p.name_en as product_name_en, ps.size_name
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           JOIN product_sizes ps ON oi.product_size_id = ps.id
           WHERE oi.order_id = ?""",
        (order_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_order_item_extras(order_item_id: int) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT oie.*, e.name_ru, e.name_tj, e.name_en
           FROM order_item_extras oie
           JOIN extras e ON oie.extra_id = e.id
           WHERE oie.order_item_id = ?""",
        (order_item_id,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_active_orders() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT o.*, u.full_name, u.phone, u.telegram_id as user_tg_id
           FROM orders o JOIN users u ON o.user_id = u.id
           WHERE o.status NOT IN ('delivered', 'cancelled')
           ORDER BY o.created_at DESC""",
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_user_orders(user_id: int, limit: int = 10) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def set_payment_screenshot(order_id: int, file_id: str) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE orders SET payment_screenshot = ?, status = 'payment_pending' WHERE id = ?",
        (file_id, order_id),
    )
    await db.commit()


async def get_order_stats(days: int = 1) -> dict:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
           FROM orders
           WHERE status = 'delivered'
           AND created_at >= datetime('now', ?)""",
        (f"-{days} days",),
    )
    row = await cursor.fetchone()
    return {"count": row[0], "revenue": row[1]}


async def get_popular_products(limit: int = 5) -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT p.name_ru, SUM(oi.quantity) as total_qty
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           JOIN orders o ON oi.order_id = o.id
           WHERE o.status = 'delivered'
           GROUP BY p.id ORDER BY total_qty DESC LIMIT ?""",
        (limit,),
    )
    return [dict(row) for row in await cursor.fetchall()]


async def get_customer_count() -> int:
    db = await database.get_db()
    cursor = await db.execute("SELECT COUNT(DISTINCT user_id) FROM orders")
    return (await cursor.fetchone())[0]
```

- [ ] **Step 3: Implement models/promo.py**

```python
import database


async def create_promo(
    code: str,
    discount_percent: float,
    valid_until: str | None = None,
    usage_limit: int | None = None,
) -> int:
    db = await database.get_db()
    cursor = await db.execute(
        """INSERT INTO promo_codes (code, discount_percent, valid_until, usage_limit)
           VALUES (?, ?, ?, ?)""",
        (code.upper(), discount_percent, valid_until, usage_limit),
    )
    await db.commit()
    return cursor.lastrowid


async def validate_promo(code: str) -> dict | None:
    db = await database.get_db()
    cursor = await db.execute(
        """SELECT * FROM promo_codes
           WHERE code = ? AND is_active = 1
           AND (valid_until IS NULL OR valid_until > datetime('now'))
           AND (usage_limit IS NULL OR used_count < usage_limit)""",
        (code.upper(),),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def use_promo(code: str) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?",
        (code.upper(),),
    )
    await db.commit()


async def get_all_promos() -> list[dict]:
    db = await database.get_db()
    cursor = await db.execute("SELECT * FROM promo_codes ORDER BY code")
    return [dict(row) for row in await cursor.fetchall()]


async def toggle_promo(promo_id: int, is_active: int) -> None:
    db = await database.get_db()
    await db.execute(
        "UPDATE promo_codes SET is_active = ? WHERE id = ?", (is_active, promo_id)
    )
    await db.commit()


async def delete_promo(promo_id: int) -> None:
    db = await database.get_db()
    await db.execute("DELETE FROM promo_codes WHERE id = ?", (promo_id,))
    await db.commit()


async def is_promos_enabled() -> bool:
    db = await database.get_db()
    cursor = await db.execute(
        "SELECT value FROM bot_settings WHERE key = 'promos_enabled'"
    )
    row = await cursor.fetchone()
    return row is not None and row[0] == "1"


async def set_promos_enabled(enabled: bool) -> None:
    db = await database.get_db()
    await db.execute(
        "INSERT OR REPLACE INTO bot_settings (key, value) VALUES ('promos_enabled', ?)",
        ("1" if enabled else "0",),
    )
    await db.commit()
```

- [ ] **Step 4: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_models_order.py -v
```
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: order, order items, and promo code models"
```

---

### Task 7: Seed Data — Full PAPRIKA Menu

**Files:**
- Create: `~/Desktop/paprika-bot/seed_data.py`
- Create: `~/Desktop/paprika-bot/tests/test_seed.py`

**Interfaces:**
- Consumes: all model modules from Tasks 3-6
- Produces: `seed_data.seed_menu() -> None` — populates all categories, ingredients, products, sizes, extras from the PAPRIKA menu photos

- [ ] **Step 1: Create seed_data.py with full menu**

```python
from models.ingredient import create_ingredient
from models.product import (
    create_category, create_product, create_product_size,
    create_extra, get_active_categories,
)
import database


async def seed_menu() -> None:
    db = await database.get_db()
    cursor = await db.execute("SELECT COUNT(*) FROM categories")
    count = (await cursor.fetchone())[0]
    if count > 0:
        return

    # === INGREDIENTS ===
    ings = {}
    ingredient_list = [
        ("Тесто", "Хамир", "Dough"),
        ("Лаваш малый", "Лаваши хурд", "Small lavash"),
        ("Лаваш средний", "Лаваши миёна", "Medium lavash"),
        ("Лаваш большой", "Лаваши калон", "Large lavash"),
        ("Тортилья", "Тортилья", "Tortilla"),
        ("Соус томатный", "Соуси помидорӣ", "Tomato sauce"),
        ("Соус сливочный", "Соуси сливочный", "Cream sauce"),
        ("Соус фирменный", "Соуси фирменный", "House sauce"),
        ("Соус барбекю", "Соуси барбекю", "BBQ sauce"),
        ("Курица", "Мурғ", "Chicken"),
        ("Говядина", "Гӯшти гов", "Beef"),
        ("Сервелат", "Сервелат", "Cervelat"),
        ("Колбаски пепперони", "Колбаскаи пепперонӣ", "Pepperoni sausage"),
        ("Сыр моцарелла", "Панири моцарелла", "Mozzarella"),
        ("Сыр чеддер", "Панири чеддер", "Cheddar"),
        ("Сыр дор-блю", "Панири дор-блю", "Dor-blue cheese"),
        ("Сыр пармезан", "Панири пармезан", "Parmesan"),
        ("Сыр страчателла", "Панири страчателла", "Stracciatella"),
        ("Помидоры", "Помидор", "Tomatoes"),
        ("Томаты вяленые", "Помидори хушк", "Sun-dried tomatoes"),
        ("Шампиньоны", "Замбурӯғ", "Mushrooms"),
        ("Перец халапенью", "Қаламфури халапенью", "Jalapeno"),
        ("Перец сладкий", "Қаламфури ширин", "Bell pepper"),
        ("Огурцы маринованные", "Бодиринги маринад", "Pickled cucumbers"),
        ("Салат айсберг", "Салати айсберг", "Iceberg lettuce"),
        ("Гренки", "Нони бирён", "Croutons"),
        ("Зелень", "Сабзӣ", "Greens"),
        ("Лук", "Пиёз", "Onion"),
        ("Кунжут", "Кунҷид", "Sesame"),
        ("Язык говяжий", "Забони гов", "Beef tongue"),
        ("Яйцо", "Тухм", "Egg"),
        ("Сливочное масло", "Равғани масла", "Butter"),
        ("Баранина (фарш)", "Гӯшти бара (кима)", "Lamb (ground)"),
        ("Фарш", "Кима", "Ground meat"),
        ("Курица гриль", "Мурғи гриль", "Grilled chicken"),
        ("Куриная грудка", "Синаи мурғ", "Chicken breast"),
    ]
    for name_ru, name_tj, name_en in ingredient_list:
        ings[name_ru] = await create_ingredient(name_ru, name_tj, name_en)

    # === CATEGORIES ===
    cat_twister = await create_category("Твистеры", "Твистерҳо", "Twisters", 1)
    cat_quesadilla = await create_category("Кесадильи", "Кесадильяҳо", "Quesadillas", 2)
    cat_pizza = await create_category("Пицца", "Пицца", "Pizza", 3)
    cat_chicken = await create_category("Курица", "Мурғ", "Fried Chicken", 4)
    cat_khachapuri = await create_category("Хачапури", "Хачапурӣ", "Khachapuri", 5)
    cat_sauce = await create_category("Соусы", "Соусҳо", "Sauces", 6)
    cat_hot_drinks = await create_category("Горячие напитки", "Нӯшокиҳои гарм", "Hot Drinks", 7)
    cat_cold_drinks = await create_category("Холодные напитки", "Нӯшокиҳои хунук", "Cold Drinks", 8)

    # Helper
    async def add_product(cat_id, name_ru, name_tj, name_en, sizes, ingredient_names):
        ing_ids = [ings[n] for n in ingredient_names if n in ings]
        pid = await create_product(cat_id, name_ru, name_tj, name_en, None, None, None, ingredient_ids=ing_ids)
        for size_name, price in sizes:
            await create_product_size(pid, size_name, price)
        return pid

    # === TWISTERS ===
    await add_product(cat_twister, "Твистер с курицей", "Твистер бо мурғ", "Chicken Twister",
        [("Малый", 17), ("Средний", 23), ("Большой", 30)],
        ["Курица", "Лаваш малый", "Лаваш средний", "Лаваш большой", "Соус фирменный"])
    await add_product(cat_twister, "Твистер с говядиной", "Твистер бо гӯшти гов", "Beef Twister",
        [("Малый", 30), ("Средний", 35), ("Большой", 38)],
        ["Говядина", "Лаваш малый", "Лаваш средний", "Лаваш большой", "Соус фирменный"])

    # === QUESADILLAS ===
    await add_product(cat_quesadilla, "Кесадилья с курицей", "Кесадилья бо мурғ", "Chicken Quesadilla",
        [("Стандарт", 30)],
        ["Тортилья", "Соус фирменный", "Сыр моцарелла", "Курица", "Огурцы маринованные"])
    await add_product(cat_quesadilla, "Кесадилья с говядиной", "Кесадилья бо гӯшти гов", "Beef Quesadilla",
        [("Стандарт", 30)],
        ["Тортилья", "Соус фирменный", "Сыр моцарелла", "Говядина", "Огурцы маринованные"])
    await add_product(cat_quesadilla, "Кесадилья с помидорами", "Кесадилья бо помидор", "Tomato Quesadilla",
        [("Стандарт", 27)],
        ["Тортилья", "Соус фирменный", "Сыр моцарелла", "Помидоры", "Огурцы маринованные"])

    # === PIZZA (17 types) ===
    await add_product(cat_pizza, "Цезарь", "Цезарь", "Caesar",
        [("Малая", 40), ("Средняя", 60), ("Большая", 70)],
        ["Тесто", "Соус сливочный", "Курица", "Помидоры", "Салат айсберг", "Гренки", "Сыр моцарелла", "Сыр пармезан"])
    await add_product(cat_pizza, "Мясной пир", "Ҷашни гӯштӣ", "Meat Feast",
        [("Малая", 55), ("Средняя", 75), ("Большая", 95)],
        ["Тесто", "Соус томатный", "Говядина", "Томаты вяленые", "Сыр моцарелла"])
    await add_product(cat_pizza, "Маргарита", "Маргарита", "Margherita",
        [("Малая", 35), ("Средняя", 50), ("Большая", 65)],
        ["Тесто", "Соус томатный", "Помидоры", "Сыр моцарелла"])
    await add_product(cat_pizza, "4 сыра", "4 панир", "4 Cheese",
        [("Малая", 45), ("Средняя", 60), ("Большая", 70)],
        ["Тесто", "Соус томатный", "Сыр чеддер", "Сыр дор-блю", "Сыр пармезан", "Сыр моцарелла"])
    await add_product(cat_pizza, "Пепперони", "Пепперонӣ", "Pepperoni",
        [("Малая", 45), ("Средняя", 65), ("Большая", 85)],
        ["Тесто", "Соус томатный", "Шампиньоны", "Колбаски пепперони", "Сыр моцарелла"])
    await add_product(cat_pizza, "Салями", "Салямӣ", "Salami",
        [("Малая", 40), ("Средняя", 60), ("Большая", 80)],
        ["Тесто", "Соус томатный", "Шампиньоны", "Сервелат", "Сыр моцарелла"])
    await add_product(cat_pizza, "Мега пепперони", "Мега пепперонӣ", "Mega Pepperoni",
        [("Малая", 55), ("Средняя", 75), ("Большая", 90)],
        ["Тесто", "Соус томатный", "Колбаски пепперони"])
    await add_product(cat_pizza, "Барбекю", "Барбекю", "BBQ",
        [("Малая", 45), ("Средняя", 70), ("Большая", 80)],
        ["Тесто", "Соус барбекю", "Куриная грудка", "Колбаски пепперони", "Помидоры", "Шампиньоны", "Сыр моцарелла"])
    await add_product(cat_pizza, "Паприка", "Паприка", "Paprika",
        [("Малая", 50), ("Средняя", 75), ("Большая", 85)],
        ["Тесто", "Соус томатный", "Сервелат", "Шампиньоны", "Говядина", "Перец сладкий", "Сыр моцарелла"])
    await add_product(cat_pizza, "Фирменная", "Фирменная", "House Special",
        [("Малая", 50), ("Средняя", 80), ("Большая", 90)],
        ["Тесто", "Соус томатный", "Курица гриль", "Говядина", "Сервелат", "Помидоры", "Сыр моцарелла", "Сыр страчателла"])
    await add_product(cat_pizza, "Мега салями", "Мега салямӣ", "Mega Salami",
        [("Малая", 50), ("Средняя", 75), ("Большая", 85)],
        ["Тесто", "Соус томатный", "Говядина", "Колбаски пепперони", "Перец халапенью", "Огурцы маринованные", "Сыр моцарелла"])
    await add_product(cat_pizza, "Каприз", "Каприз", "Caprice",
        [("Малая", 45), ("Средняя", 75), ("Большая", 85)],
        ["Тесто", "Соус сливочный", "Курица", "Язык говяжий", "Говядина", "Огурцы маринованные", "Сыр моцарелла"])
    await add_product(cat_pizza, "Мясное ассорти", "Ассортии гӯшт", "Meat Assorted",
        [("Малая", 50), ("Средняя", 65), ("Большая", 80)],
        ["Тесто", "Соус томатный", "Говядина", "Курица", "Сервелат", "Помидоры", "Сыр моцарелла"])
    await add_product(cat_pizza, "Мексиканская", "Мексиканӣ", "Mexican",
        [("Малая", 45), ("Средняя", 70), ("Большая", 80)],
        ["Тесто", "Соус томатный", "Говядина", "Колбаски пепперони", "Перец халапенью", "Огурцы маринованные", "Сыр моцарелла"])
    await add_product(cat_pizza, "Куриная", "Мурғона", "Chicken",
        [("Малая", 40), ("Средняя", 60), ("Большая", 70)],
        ["Тесто", "Соус фирменный", "Курица", "Сыр моцарелла"])
    await add_product(cat_pizza, "Ассорти", "Ассортӣ", "Assorted",
        [("Малая", 50), ("Средняя", 70), ("Большая", 80)],
        ["Тесто", "Соус томатный", "Курица", "Говядина", "Помидоры", "Сыр моцарелла"])
    await add_product(cat_pizza, "Мясная", "Гӯштӣ", "Meat",
        [("Малая", 50), ("Средняя", 70), ("Большая", 80)],
        ["Тесто", "Соус томатный", "Сервелат", "Говядина", "Помидоры", "Сыр моцарелла"])

    # === FRIED CHICKEN ===
    await add_product(cat_chicken, "Стрипсы оригинальные", "Стрипсҳои асл", "Original Strips",
        [("1 порция", 20), ("1 кг", 85)], ["Курица"])
    await add_product(cat_chicken, "Стрипсы острые", "Стрипсҳои тунд", "Spicy Strips",
        [("1 порция", 20), ("1 кг", 90)], ["Курица"])
    await add_product(cat_chicken, "Стрипсы супер острые", "Стрипсҳои хеле тунд", "Super Spicy Strips",
        [("1 порция", 25), ("1 кг", 95)], ["Курица"])
    await add_product(cat_chicken, "Крылышки острые", "Болҳои тунд", "Spicy Wings",
        [("1 порция", 25), ("1 кг", 90)], ["Курица"])
    await add_product(cat_chicken, "Крылышки супер острые", "Болҳои хеле тунд", "Super Spicy Wings",
        [("1 порция", 25), ("1 кг", 95)], ["Курица"])
    await add_product(cat_chicken, "Курица целая", "Мурғи пурра", "Whole Chicken",
        [("1 шт (700-800гр)", 60)], ["Курица"])
    await add_product(cat_chicken, "Крылышки во фритюре", "Болҳои фритюр", "Deep Fried Wings",
        [("1 кг", 95)], ["Курица"])

    # === KHACHAPURI ===
    await add_product(cat_khachapuri, "Хачапури аджарский", "Хачапурии аҷарӣ", "Adjarian Khachapuri",
        [("Стандарт", 50)], ["Тесто", "Яйцо", "Сыр моцарелла", "Сливочное масло"])
    await add_product(cat_khachapuri, "Хачапури паприка", "Хачапурии паприка", "Paprika Khachapuri",
        [("Стандарт", 50)],
        ["Тесто", "Говядина", "Курица", "Сыр моцарелла", "Баранина (фарш)", "Помидоры", "Перец сладкий", "Лук", "Зелень", "Кунжут"])
    await add_product(cat_khachapuri, "Хачапури с фаршом", "Хачапурии кимадор", "Khachapuri with Meat",
        [("Стандарт", 50)], ["Тесто", "Фарш", "Сыр моцарелла", "Зелень", "Соус томатный"])

    # === SAUCES ===
    for name_ru, name_tj, name_en, price in [
        ("Фирменный чесночный", "Сирӣ фирменный", "House Garlic", 4),
        ("Острый спайси", "Тунди спайсӣ", "Hot Spicy", 4),
        ("Горчичный", "Хардалӣ", "Mustard", 4),
        ("Heinz сырный", "Heinz панирӣ", "Heinz Cheese", 5),
        ("Heinz томатный", "Heinz помидорӣ", "Heinz Tomato", 5),
        ("Heinz кисло сладкий", "Heinz турушширин", "Heinz Sweet & Sour", 5),
        ("Heinz барбекю", "Heinz барбекю", "Heinz BBQ", 5),
    ]:
        pid = await create_product(cat_sauce, name_ru, name_tj, name_en, None, None, None)
        await create_product_size(pid, "Стандарт", price)

    # === HOT DRINKS ===
    for name_ru, name_tj, name_en, sizes in [
        ("Двойной эспрессо", "Эспрессои дугона", "Double Espresso", [("Стандарт", 10)]),
        ("Американо", "Американо", "Americano", [("0.2л", 12)]),
        ("Латте", "Латте", "Latte", [("0.2л", 15), ("0.3л", 20)]),
        ("Капучино", "Капучино", "Cappuccino", [("0.2л", 15), ("0.3л", 20)]),
        ("Чай зеленый/черный", "Чойи сабз/сиёҳ", "Green/Black Tea", [("Стакан", 2), ("Чайник", 3)]),
        ("Чай с лимоном", "Чойи лимонӣ", "Lemon Tea", [("Стакан", 3), ("Чайник", 5)]),
        ("Мохито", "Моҳито", "Mojito", [("Стандарт", 10)]),
        ("Фруктовый чай", "Чойи мевагӣ", "Fruit Tea", [("Стандарт", 15)]),
    ]:
        pid = await create_product(cat_hot_drinks, name_ru, name_tj, name_en, None, None, None)
        for size_name, price in sizes:
            await create_product_size(pid, size_name, price)

    # === COLD DRINKS ===
    for name_ru, name_tj, name_en, sizes in [
        ("Кола, Фанта, Пепси", "Кола, Фанта, Пепси", "Cola, Fanta, Pepsi", [("0.5л", 7), ("1л", 11), ("1.5л", 13)]),
        ("Сок Добрый", "Шарбати Добрый", "Dobry Juice", [("1л", 25)]),
        ("Сок Нури Зулол", "Шарбати Нури Зулол", "Nuri Zulol Juice", [("1л", 10)]),
        ("Энергетический напиток", "Нӯшокии энергетикӣ", "Energy Drink", [("0.25л", 10), ("0.5л", 13)]),
        ("Вода без газа", "Оби бе газ", "Still Water", [("0.5л", 3), ("1л", 5), ("1.5л", 7)]),
        ("Сок Добрый детский", "Шарбати Добрый кӯдакона", "Dobry Kids Juice", [("0.2л", 8)]),
    ]:
        pid = await create_product(cat_cold_drinks, name_ru, name_tj, name_en, None, None, None)
        for size_name, price in sizes:
            await create_product_size(pid, size_name, price)

    # === EXTRAS (per category) ===
    # Pizza extras
    for name_ru, name_tj, name_en, price in [
        ("Сыр моцарелла", "Панири моцарелла", "Mozzarella", 10),
        ("Шампиньоны", "Замбурӯғ", "Mushrooms", 7),
        ("Помидоры", "Помидор", "Tomatoes", 6),
        ("Перец Халапенью", "Қаламфури халапенью", "Jalapeno", 9),
        ("Колбаски пепперони", "Колбаскаи пепперонӣ", "Pepperoni", 12),
        ("Говядина", "Гӯшти гов", "Beef", 12),
        ("Сервелат", "Сервелат", "Cervelat", 12),
        ("Огурцы маринованные", "Бодиринги маринад", "Pickled cucumbers", 6),
        ("Курица", "Мурғ", "Chicken", 10),
        ("Перец сладкий (паприка)", "Қаламфури ширин", "Bell pepper", 9),
    ]:
        await create_extra(cat_pizza, name_ru, name_tj, name_en, price)

    # Quesadilla extras
    for name_ru, name_tj, name_en, price in [
        ("Сыр чеддер", "Панири чеддер", "Cheddar", 3),
        ("Сыр моцарелла", "Панири моцарелла", "Mozzarella", 4),
        ("Перец халапенью", "Қаламфури халапенью", "Jalapeno", 4),
        ("Мясо кур/гов", "Гӯшти мурғ/гов", "Chicken/Beef meat", 8),
    ]:
        await create_extra(cat_quesadilla, name_ru, name_tj, name_en, price)

    # Chicken extras (sides)
    for name_ru, name_tj, name_en, price in [
        ("Картофель фри 70гр", "Картошкаи фри 70гр", "French fries 70g", 10),
        ("Картофель фри 100гр", "Картошкаи фри 100гр", "French fries 100g", 15),
        ("Картофель фри 200гр", "Картошкаи фри 200гр", "French fries 200g", 20),
        ("Картофель по-деревенски 70гр", "Картошкаи деревенскӣ 70гр", "Country potatoes 70g", 12),
        ("Картофель по-деревенски 100гр", "Картошкаи деревенскӣ 100гр", "Country potatoes 100g", 16),
        ("Картофель по-деревенски 200гр", "Картошкаи деревенскӣ 200гр", "Country potatoes 200g", 22),
    ]:
        await create_extra(cat_chicken, name_ru, name_tj, name_en, price)

    # Khachapuri extras
    for name_ru, name_tj, name_en, price in [
        ("Сыр моцарелла", "Панири моцарелла", "Mozzarella", 10),
        ("Перец халапенью", "Қаламфури халапенью", "Jalapeno", 5),
    ]:
        await create_extra(cat_khachapuri, name_ru, name_tj, name_en, price)

    await db.commit()
```

- [ ] **Step 2: Write tests/test_seed.py**

```python
import pytest
from seed_data import seed_menu
from models.product import get_active_categories, get_products_by_category, get_product_sizes, get_extras_for_category


@pytest.mark.asyncio
async def test_seed_creates_categories(db):
    await seed_menu()
    cats = await get_active_categories()
    cat_names = [c["name_ru"] for c in cats]
    assert "Пицца" in cat_names
    assert "Курица" in cat_names
    assert "Твистеры" in cat_names
    assert len(cats) == 8


@pytest.mark.asyncio
async def test_seed_creates_pizzas(db):
    await seed_menu()
    cats = await get_active_categories()
    pizza_cat = next(c for c in cats if c["name_ru"] == "Пицца")
    products = await get_products_by_category(pizza_cat["id"])
    assert len(products) == 17

    margherita = next(p for p in products if p["name_ru"] == "Маргарита")
    sizes = await get_product_sizes(margherita["id"])
    assert len(sizes) == 3
    prices = sorted(s["price"] for s in sizes)
    assert prices == [35.0, 50.0, 65.0]


@pytest.mark.asyncio
async def test_seed_creates_extras(db):
    await seed_menu()
    cats = await get_active_categories()
    pizza_cat = next(c for c in cats if c["name_ru"] == "Пицца")
    extras = await get_extras_for_category(pizza_cat["id"])
    assert len(extras) == 10


@pytest.mark.asyncio
async def test_seed_idempotent(db):
    await seed_menu()
    await seed_menu()
    cats = await get_active_categories()
    assert len(cats) == 8
```

- [ ] **Step 3: Run tests**

```bash
cd ~/Desktop/paprika-bot && python -m pytest tests/test_seed.py -v
```
Expected: all 4 tests pass.

- [ ] **Step 4: Wire seed into database.init_db()**

In `database.py`, add at the end of `init_db()`:
```python
    from seed_data import seed_menu
    await seed_menu()
```

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: seed full PAPRIKA menu (8 categories, 50+ products, all extras)"
```

---

### Task 8: Common Handler — /start, Language Selection, Main Menu

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/common.py`
- Create: `~/Desktop/paprika-bot/keyboards/client_kb.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register handlers, load locales

**Interfaces:**
- Consumes: `i18n.t()`, `i18n.load_locales()`, `user.get_or_create_user()`, `user.update_language()`
- Produces: `/start` command handler, language selection callback, main menu display

- [ ] **Step 1: Create keyboards/client_kb.py**

```python
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton
from utils.i18n import t


def language_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🇷🇺 Русский", callback_data="lang_ru"),
            InlineKeyboardButton(text="🇹🇯 Тоҷикӣ", callback_data="lang_tj"),
            InlineKeyboardButton(text="🇬🇧 English", callback_data="lang_en"),
        ]
    ])


def main_menu_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=t("btn_menu", lang)), KeyboardButton(text=t("btn_cart", lang))],
            [KeyboardButton(text=t("btn_my_orders", lang)), KeyboardButton(text=t("btn_contacts", lang))],
            [KeyboardButton(text=t("btn_settings", lang))],
        ],
        resize_keyboard=True,
    )
```

- [ ] **Step 2: Create handlers/common.py**

```python
from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery

from keyboards.client_kb import language_keyboard, main_menu_keyboard
from models.user import get_or_create_user, update_language, get_user_by_telegram_id
from models.tag import get_all_tags
from utils.i18n import t

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message):
    await get_or_create_user(message.from_user.id, message.from_user.full_name)
    await message.answer(
        "Добро пожаловать в PAPRIKA!\nWelcome to PAPRIKA!\nХуш омадед ба PAPRIKA!",
        reply_markup=language_keyboard(),
    )


@router.callback_query(F.data.startswith("lang_"))
async def set_language(callback: CallbackQuery):
    lang = callback.data.split("_")[1]
    await update_language(callback.from_user.id, lang)

    user = await get_user_by_telegram_id(callback.from_user.id)
    tags = await get_all_tags(user["id"])

    if "blacklist" in [tg.lower() for tg in tags]:
        await callback.message.answer(t("blacklisted", lang))
        await callback.answer()
        return

    await callback.message.answer(
        t("main_menu", lang),
        reply_markup=main_menu_keyboard(lang),
    )
    await callback.answer()
```

- [ ] **Step 3: Update bot.py to register handlers and load locales**

```python
import asyncio
import logging

from aiogram import Bot, Dispatcher

import config
import database
from utils.i18n import load_locales
from handlers.common import router as common_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=config.BOT_TOKEN)
dp = Dispatcher()

dp.include_router(common_router)


async def main() -> None:
    load_locales()
    await database.init_db()
    logger.info("Database initialized, bot starting...")
    try:
        await dp.start_polling(bot)
    finally:
        await database.close_db()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Create `__init__.py` files for packages**

```bash
touch ~/Desktop/paprika-bot/handlers/__init__.py
touch ~/Desktop/paprika-bot/handlers/client/__init__.py
touch ~/Desktop/paprika-bot/handlers/admin/__init__.py
touch ~/Desktop/paprika-bot/handlers/operator/__init__.py
touch ~/Desktop/paprika-bot/keyboards/__init__.py
touch ~/Desktop/paprika-bot/models/__init__.py
touch ~/Desktop/paprika-bot/utils/__init__.py
```

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: /start handler, language selection, main menu keyboard"
```

---

### Task 9: Client Menu Browsing Handler

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/client/menu.py`
- Create: `~/Desktop/paprika-bot/utils/availability.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register menu router

**Interfaces:**
- Consumes: `product.*`, `ingredient.is_product_available()`, `i18n.t()`, `i18n.get_localized_name()`
- Produces: category list handler, product list handler, product card with sizes, extras selection, quantity picker, add-to-cart callback

- [ ] **Step 1: Create utils/availability.py**

```python
from models.product import get_product, get_active_product_sizes, get_available_alternatives, get_extras_for_category
from models.ingredient import is_product_available
from utils.i18n import get_localized_name, t


async def check_product_availability(product_id: int, lang: str) -> dict:
    product = await get_product(product_id)
    if not product:
        return {"available": False, "message": "", "alternatives": []}

    available = await is_product_available(product_id)
    if available:
        return {"available": True}

    alts = await get_available_alternatives(product_id)
    alts = [a for a in alts if a["id"] != product_id]
    name = get_localized_name(product, lang)

    return {
        "available": False,
        "message": t("item_unavailable", lang, name=name),
        "alternatives": alts,
    }


async def check_size_availability(product_id: int, size_id: int, lang: str) -> dict:
    product = await get_product(product_id)
    sizes = await get_active_product_sizes(product_id)
    name = get_localized_name(product, lang) if product else ""

    active_ids = {s["id"] for s in sizes}
    if size_id in active_ids:
        return {"available": True}

    return {
        "available": False,
        "message": t("size_unavailable", lang, name=name, size=""),
        "available_sizes": sizes,
    }
```

- [ ] **Step 2: Create handlers/client/menu.py**

```python
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton

from models.user import get_user_by_telegram_id
from models.product import (
    get_active_categories, get_products_by_category, get_product,
    get_active_product_sizes, get_product_ingredients_text,
    get_extras_for_category,
)
from models.ingredient import is_product_available
from utils.i18n import t, get_localized_name
from utils.availability import check_product_availability

router = Router()


async def _get_lang(telegram_id: int) -> str:
    user = await get_user_by_telegram_id(telegram_id)
    return user["language"] if user else "ru"


@router.message(F.text.in_(["🍕 Меню", "🍕 Menu"]))
async def show_categories(message: Message):
    lang = await _get_lang(message.from_user.id)
    categories = await get_active_categories()
    buttons = []
    for cat in categories:
        name = get_localized_name(cat, lang)
        buttons.append([InlineKeyboardButton(text=name, callback_data=f"cat_{cat['id']}")])
    await message.answer(
        t("categories_title", lang),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )


@router.callback_query(F.data.startswith("cat_"))
async def show_products(callback: CallbackQuery):
    lang = await _get_lang(callback.from_user.id)
    cat_id = int(callback.data.split("_")[1])
    products = await get_products_by_category(cat_id)

    if not products:
        await callback.answer("Empty", show_alert=True)
        return

    buttons = []
    for prod in products:
        name = get_localized_name(prod, lang)
        buttons.append([InlineKeyboardButton(text=name, callback_data=f"prod_{prod['id']}")])
    buttons.append([InlineKeyboardButton(text=t("btn_back", lang), callback_data="back_categories")])

    await callback.message.edit_text(
        t("products_title", lang),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    await callback.answer()


@router.callback_query(F.data == "back_categories")
async def back_to_categories(callback: CallbackQuery):
    lang = await _get_lang(callback.from_user.id)
    categories = await get_active_categories()
    buttons = []
    for cat in categories:
        name = get_localized_name(cat, lang)
        buttons.append([InlineKeyboardButton(text=name, callback_data=f"cat_{cat['id']}")])
    await callback.message.edit_text(
        t("categories_title", lang),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("prod_"))
async def show_product_card(callback: CallbackQuery):
    lang = await _get_lang(callback.from_user.id)
    product_id = int(callback.data.split("_")[1])

    check = await check_product_availability(product_id, lang)
    if not check["available"]:
        text = check["message"]
        alts = check.get("alternatives", [])
        if alts:
            text += "\n\n" + t("alternatives_title", lang)
            buttons = [[InlineKeyboardButton(
                text=get_localized_name(a, lang),
                callback_data=f"prod_{a['id']}",
            )] for a in alts[:5]]
        else:
            buttons = []
        buttons.append([InlineKeyboardButton(text=t("btn_back", lang), callback_data=f"cat_{(await get_product(product_id))['category_id']}")])
        await callback.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))
        await callback.answer()
        return

    product = await get_product(product_id)
    name = get_localized_name(product, lang)
    ingredients_text = await get_product_ingredients_text(product_id, lang)
    sizes = await get_active_product_sizes(product_id)

    text = f"**{name}**\n"
    text += t("product_card", lang, ingredients=ingredients_text)

    buttons = []
    for size in sizes:
        btn_text = f"{size['size_name']} — {int(size['price'])}с"
        buttons.append([InlineKeyboardButton(text=btn_text, callback_data=f"size_{product_id}_{size['id']}")])
    buttons.append([InlineKeyboardButton(text=t("btn_back", lang), callback_data=f"cat_{product['category_id']}")])

    await callback.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons), parse_mode="Markdown")
    await callback.answer()


@router.callback_query(F.data.startswith("size_"))
async def select_size(callback: CallbackQuery):
    lang = await _get_lang(callback.from_user.id)
    parts = callback.data.split("_")
    product_id = int(parts[1])
    size_id = int(parts[2])

    product = await get_product(product_id)
    extras = await get_extras_for_category(product["category_id"])

    if extras:
        buttons = []
        for ext in extras:
            name = get_localized_name(ext, lang)
            buttons.append([InlineKeyboardButton(
                text=f"+ {name} — {int(ext['price'])}с",
                callback_data=f"ext_{product_id}_{size_id}_1_{ext['id']}",
            )])
        buttons.append([InlineKeyboardButton(
            text=t("btn_skip_extras", lang),
            callback_data=f"qty_{product_id}_{size_id}_1_none",
        )])
        await callback.message.edit_text(
            t("choose_extras", lang),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        )
    else:
        buttons = [
            [
                InlineKeyboardButton(text="-", callback_data=f"qdec_{product_id}_{size_id}_1_none"),
                InlineKeyboardButton(text="1", callback_data="noop"),
                InlineKeyboardButton(text="+", callback_data=f"qinc_{product_id}_{size_id}_1_none"),
            ],
            [InlineKeyboardButton(text=t("btn_add_to_cart", lang), callback_data=f"add_{product_id}_{size_id}_1_none")],
        ]
        await callback.message.edit_text(
            t("choose_quantity", lang),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
        )
    await callback.answer()
```

- [ ] **Step 3: Register menu router in bot.py**

Add to bot.py imports:
```python
from handlers.client.menu import router as menu_router
```
Add after `dp.include_router(common_router)`:
```python
dp.include_router(menu_router)
```

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: client menu browsing with categories, products, sizes, and availability checks"
```

---

### Task 10: Cart Handler

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/client/cart.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register cart router

**Interfaces:**
- Consumes: `product.get_product()`, `product.get_product_sizes()`, `i18n.t()`, `i18n.get_localized_name()`
- Produces: in-memory cart per user (dict in module scope), add/remove/clear/view cart handlers

The cart is stored in memory as a module-level dict keyed by `telegram_id`. Each entry is a list of cart items:
```python
_carts: dict[int, list[CartItem]] = {}
# CartItem = {"product_id": int, "size_id": int, "quantity": int, "extras": list[int]}
```

- [ ] **Step 1: Create handlers/client/cart.py with full cart logic**

Implement the cart as an in-memory dict. Include handlers for:
- Adding items (from menu flow callback `add_{product_id}_{size_id}_{qty}_{extras}`)
- Viewing cart (reply keyboard button)
- Changing quantity (+/-)
- Removing items
- Clearing cart
- Formatting cart text with prices from DB

- [ ] **Step 2: Register cart router in bot.py**

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: in-memory cart with add, remove, quantity change, and display"
```

---

### Task 11: Order Flow Handler (Delivery, Payment, Checkout)

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/client/order.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register order router

**Interfaces:**
- Consumes: cart from Task 10, `delivery.*`, `geo.*`, `order.*`, `promo.*`, `user.*`, `i18n.t()`
- Produces: checkout flow (delivery/pickup → location → address → phone → promo → payment → confirm → place order → notify operators)

The order handler uses aiogram FSM (Finite State Machine) for the multi-step checkout:
```python
class OrderStates(StatesGroup):
    choosing_delivery = State()
    sending_location = State()
    choosing_zone = State()
    entering_address = State()
    entering_phone = State()
    entering_promo = State()
    choosing_payment = State()
    sending_screenshot = State()
    confirming = State()
```

- [ ] **Step 1: Implement handlers/client/order.py with full checkout FSM**

Include:
- Delivery type selection (delivery/pickup)
- Location request (GPS via Telegram location sharing)
- Manual zone selection fallback
- OSRM distance calculation + delivery fee
- Address input
- Phone input (if not saved)
- Promo code input (if promos enabled)
- Payment method selection
- Dushanbe City screenshot flow
- Order confirmation with summary
- Order creation in DB
- Notification to all admins/operators

- [ ] **Step 2: Register order router in bot.py**

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: complete order checkout flow with delivery, payment, and notifications"
```

---

### Task 12: My Orders Handler

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/client/my_orders.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register my_orders router

**Interfaces:**
- Consumes: `order.get_user_orders()`, `order.get_order_items()`, `i18n.t()`
- Produces: "My Orders" button handler showing recent orders with statuses

- [ ] **Step 1: Implement handlers/client/my_orders.py**

Show last 10 orders with status, items summary, and total.

- [ ] **Step 2: Register and commit**

```bash
git add . && git commit -m "feat: my orders handler showing order history and status"
```

---

### Task 13: Operator Order Management Handler

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/operator/orders.py`
- Create: `~/Desktop/paprika-bot/keyboards/operator_kb.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register operator router

**Interfaces:**
- Consumes: `order.*`, `user.is_operator()`, `user.is_admin()`, `tag.*`, `i18n.t()`
- Produces: order status change callbacks (accept → cooking → delivering → delivered), payment screenshot confirmation, customer tag management from order view

- [ ] **Step 1: Implement keyboards/operator_kb.py**

Order action buttons (accept/cooking/delivering/delivered/cancel), payment confirmation buttons.

- [ ] **Step 2: Implement handlers/operator/orders.py**

Handle all order status transitions. When a status changes, notify the customer. Include payment screenshot confirmation for Dushanbe City orders.

- [ ] **Step 3: Register and commit**

```bash
git add . && git commit -m "feat: operator order management with status updates and payment confirmation"
```

---

### Task 14: Admin Panel — Main Menu, Menu Management, Ingredients

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/admin/panel.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/menu_mgmt.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/ingredients.py`
- Create: `~/Desktop/paprika-bot/keyboards/admin_kb.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register admin routers

**Interfaces:**
- Consumes: `user.is_admin()`, `product.*`, `ingredient.*`, `i18n.t()`
- Produces: `/admin` command, admin panel keyboard, CRUD for categories/products/sizes/extras, CRUD for ingredients with cascade toggle

- [ ] **Step 1: Implement keyboards/admin_kb.py**

Admin panel main menu, category/product/ingredient list keyboards with action buttons.

- [ ] **Step 2: Implement handlers/admin/panel.py**

`/admin` command with role check, main admin menu.

- [ ] **Step 3: Implement handlers/admin/menu_mgmt.py**

FSM-based flows for:
- Add/edit/delete category
- Add product (select category → enter name → select ingredients → add sizes → save)
- Edit product (change name, prices, ingredients)
- Delete product
- Toggle product/size active status

- [ ] **Step 4: Implement handlers/admin/ingredients.py**

- List all ingredients with availability status
- Add new ingredient
- Toggle ingredient (with cascade preview + confirm)
- Delete ingredient

- [ ] **Step 5: Register and commit**

```bash
git add . && git commit -m "feat: admin panel with menu management and ingredient cascade system"
```

---

### Task 15: Admin — Delivery, Customers, Operators, Promos, Stats

**Files:**
- Create: `~/Desktop/paprika-bot/handlers/admin/delivery.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/customers.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/operators.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/promos.py`
- Create: `~/Desktop/paprika-bot/handlers/admin/stats.py`
- Modify: `~/Desktop/paprika-bot/bot.py` — register all admin routers

**Interfaces:**
- Consumes: `delivery.*`, `user.*`, `tag.*`, `order.*`, `promo.*`
- Produces: all remaining admin panel sections

- [ ] **Step 1: Implement handlers/admin/delivery.py**

Edit free zone km, price per km, max distance. CRUD delivery zones.

- [ ] **Step 2: Implement handlers/admin/customers.py**

Search customers by name/phone, view order history, add/remove tags.

- [ ] **Step 3: Implement handlers/admin/operators.py**

Add/remove operators by Telegram ID.

- [ ] **Step 4: Implement handlers/admin/promos.py**

CRUD promo codes, toggle promo system on/off.

- [ ] **Step 5: Implement handlers/admin/stats.py**

Show order count/revenue for today/week/month, popular products, customer count.

- [ ] **Step 6: Register all routers and commit**

```bash
git add . && git commit -m "feat: admin delivery, customers, operators, promos, and stats"
```

---

### Task 16: Settings, Contacts, and Polish

**Files:**
- Modify: `~/Desktop/paprika-bot/handlers/common.py` — add settings and contacts handlers
- Modify: various handler files for edge cases

**Interfaces:**
- Consumes: `user.*`, `i18n.t()`
- Produces: settings handler (change language), contacts handler, general edge case handling

- [ ] **Step 1: Add settings handler to common.py**

Handle "Settings" button → show language change option. Handle "Contacts" button → show restaurant info.

- [ ] **Step 2: Add error handling middleware**

Add a basic error handler to the dispatcher that logs errors and sends a generic message to the user.

- [ ] **Step 3: Final integration test**

Run the bot locally with a test token and verify:
- /start → language selection → main menu
- Menu browsing → add to cart → checkout
- Admin panel → menu management
- Full order lifecycle

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: settings, contacts, error handling, and final polish"
```
