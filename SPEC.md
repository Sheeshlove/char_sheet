# Party Sheet — техническая спецификация

Веб-приложение для закрытой группы друзей: автоматизированный лист персонажа D&D 5e по правилам 2014 года, кампании с мастером, заметки игроков. Контент — SRD 5.1 плюс импорт с dnd.su.

Документ написан как задание для Claude Code. Идентификаторы, имена файлов, таблиц и типов — на английском; интерфейс — на русском.

---

## 0. Как работать с этим документом (для Claude Code)

1. Работай по вехам из раздела 17 строго по порядку. Одна веха — одна или несколько логичных git-коммитов. После каждой вехи обнови `PROGRESS.md`: что сделано, что отложено, известные проблемы.
2. Веха закрыта, только когда выполнены все пункты её «Критериев приёмки», проходят `pnpm lint`, `pnpm typecheck`, `pnpm test`.
3. **Не выдумывай правила.** Всё, что касается механики D&D, берётся из этого документа, из SRD 5.1 или из импортированного контента. Если правило неоднозначно — реализуй самый распространённый вариант (RAW 2014), пометь `// RULES-NOTE:` и добавь строку в `docs/rules-decisions.md`.
4. Если механику способности нельзя автоматизировать — она остаётся текстом (`text`-эффект) с ручным переключателем. Лист никогда не должен показывать неверное число молча: лучше «ручное» значение с пометкой.
5. Движок правил (`packages/rules-engine`) — чистые детерминированные функции без I/O. Любая логика правил живёт только там, а не в React-компонентах и не в API.
6. Все пользовательские строки — через словарь `apps/web/src/i18n/ru.ts` (одна локаль, но строки не хардкодятся в компонентах).
7. Перед тем как писать парсеры dnd.su, скачай и сохрани реальные страницы-образцы (раздел 7.3) и пиши селекторы по ним. Структура HTML в этом документе описана по наблюдениям и может отличаться.

---

## 1. Масштаб и допущения

- Пользователей: до ~50, одновременно активных — до ~15. Одна инсталляция на одном VPS.
- Регистрация только по инвайт-коду администратора сайта. Публичной регистрации нет.
- Правила: только D&D 5e 2014 (PHB/DMG 2014 + дополнения, выходившие под эту редакцию). Правила 2024 не поддерживаются.
- Языки: интерфейс русский. Контент — русский (dnd.su), английские названия хранятся параллельно для сопоставления с SRD.
- Мобильные: адаптивная веб-вёрстка + PWA (установка на телефон, иконка, работа при кратковременной потере сети в режиме «только чтение»). Нативных приложений нет.
- Реальное время: достаточно опроса каждые 5 секунд на открытых листах и панели мастера. WebSocket не нужен.

---

## 2. Технологический стек

| Слой | Технология | Примечание |
| --- | --- | --- |
| Язык | TypeScript (strict) везде | `"strict": true`, `noUncheckedIndexedAccess: true` |
| Монорепозиторий | pnpm workspaces + Turborepo | |
| Веб-приложение | Next.js (App Router, последняя стабильная), React | один процесс: и UI, и API |
| API | tRPC v11 + zod | типобезопасные процедуры, входы валидируются zod |
| Данные на клиенте | TanStack Query (через tRPC) | опрос 5 с для «живых» экранов |
| UI-компоненты | Tailwind CSS + shadcn/ui (Radix) + lucide-react | тёмная и светлая темы, по умолчанию тёмная |
| Формы | react-hook-form + zod resolver | |
| Редактор заметок | TipTap (ProseMirror) | свои расширения: wiki-ссылки, упоминания |
| Холст улик, граф | React Flow (`@xyflow/react`) | |
| ORM и миграции | Drizzle ORM + drizzle-kit | миграции в `apps/web/drizzle` |
| БД | PostgreSQL 16 | JSONB, полнотекстовый поиск `russian` |
| Пароли | `@node-rs/argon2` (Argon2id) | |
| Сессии | собственная реализация: таблица `sessions`, токен в httpOnly cookie | паттерн из руководства Lucia (библиотека не нужна) |
| Выражения в эффектах | `jsep` (парсер) + собственный вычислитель | никаких `eval`/`new Function` |
| Импортёр | Node CLI: `undici` + `tough-cookie`, `cheerio`, `turndown`; запасной путь — Playwright | |
| PDF листа | `@react-pdf/renderer` на сервере | |
| Тесты | Vitest (юнит), Playwright (e2e) | |
| Линт/формат | ESLint (typescript-eslint) + Prettier | |
| Деплой | Docker Compose: `web`, `db`, `caddy`, `backup` | HTTPS через Caddy |

Не использовать: Redis, отдельный поисковик, S3 — для этого масштаба не нужны. Файлы (портреты, картинки в заметках) хранятся на диске в томе `uploads`.

---

## 3. Структура репозитория

```
party-sheet/
├─ CLAUDE.md
├─ SPEC.md                      # этот документ
├─ PROGRESS.md
├─ docs/
│  ├─ rules-decisions.md        # принятые трактовки правил
│  └─ content-coverage.md       # генерируется: покрытие эффектами
├─ apps/
│  └─ web/
│     ├─ src/
│     │  ├─ app/                # маршруты Next.js (см. раздел 12)
│     │  ├─ components/         # UI
│     │  ├─ features/           # character/, builder/, notes/, gm/, content/ — логика экранов
│     │  ├─ server/
│     │  │  ├─ db/              # drizzle schema.ts, client.ts
│     │  │  ├─ auth/            # sessions, password, guards
│     │  │  ├─ trpc/            # routers/*.ts, context.ts
│     │  │  ├─ services/        # characters, notes, content, campaigns...
│     │  │  └─ content-cache.ts # ContentIndex в памяти
│     │  ├─ i18n/ru.ts
│     │  └─ lib/
│     ├─ drizzle/               # миграции
│     └─ e2e/                   # Playwright
├─ packages/
│  ├─ rules-engine/             # чистый движок правил (раздел 8)
│  │  ├─ src/
│  │  │  ├─ types.ts
│  │  │  ├─ expr/               # парсер и вычислитель выражений
│  │  │  ├─ pipeline/           # стадии расчёта
│  │  │  ├─ tables/             # таблицы правил 2014
│  │  │  ├─ builder/            # pendingChoices, validate
│  │  │  ├─ state/              # команды игрового состояния
│  │  │  └─ index.ts
│  │  └─ test/
│  │     └─ golden/             # эталонные персонажи *.input.json + *.expected.json
│  ├─ content-schema/           # zod-схемы сущностей и эффектов, общие типы
│  ├─ content-data/
│  │  ├─ srd/                   # пакет SRD 5.1 (сгенерированный JSON)
│  │  ├─ dndsu/                 # пакет dnd.su (сгенерированный JSON)
│  │  ├─ overlays/              # ручные эффекты поверх импортированного текста
│  │  └─ dictionaries/          # словари RU-термин → id
│  └─ importer/                 # CLI импорта dnd.su и SRD (раздел 7)
│     ├─ src/
│     ├─ fixtures/              # сохранённые HTML-страницы для тестов парсеров
│     └─ cache/                 # сырой HTML (в .gitignore)
├─ docker/
│  ├─ Dockerfile
│  ├─ docker-compose.yml
│  └─ Caddyfile
└─ package.json / pnpm-workspace.yaml / turbo.json
```

---

## 4. Модель данных (PostgreSQL, Drizzle)

Все `id` — `uuid` (`gen_random_uuid()`), время — `timestamptz`, по умолчанию `now()`. У изменяемых таблиц есть `created_at`, `updated_at`.

### 4.1 Пользователи и доступ

```ts
users: {
  id, email (unique, lowercased), username (unique, 3–32, [a-z0-9_]),
  display_name, password_hash, is_admin boolean default false,
  avatar_path nullable, created_at, updated_at
}
sessions: {
  id text PK            // sha256(token) в hex; сам токен только в cookie
  user_id → users.id on delete cascade,
  expires_at, created_at, user_agent, ip
}
site_invites: {
  code text PK (12 символов base32), created_by → users.id,
  used_by → users.id nullable, used_at nullable, expires_at nullable, note text
}
password_resets: {
  token_hash PK, user_id, expires_at   // ссылку выдаёт админ вручную (почтовый сервер не обязателен)
}
```

Первый зарегистрированный пользователь (через `pnpm admin:bootstrap` или при пустой таблице `users`) становится `is_admin`.

### 4.2 Кампании

```ts
campaigns: {
  id, name, description, owner_id → users.id,
  settings jsonb (CampaignSettings, см. ниже), archived_at nullable
}
campaign_members: {
  campaign_id, user_id, role enum('gm','co_gm','player'), joined_at
  PK(campaign_id, user_id)
}
campaign_invites: {
  code PK, campaign_id, created_by, expires_at nullable, max_uses int nullable, uses int default 0
}
```

```ts
type CampaignSettings = {
  allowedPacks: string[];            // ключи пакетов контента: ['srd', 'dndsu-official', 'dndsu-homebrew', 'hb-<uuid>']
  allowedSources: string[] | 'all';  // фильтр по книгам внутри пакетов, напр. ['PHB','XGE','TCE']
  featsAllowed: boolean;             // по умолчанию true
  multiclassAllowed: boolean;        // true
  hpMethod: 'average' | 'roll' | 'player_choice';   // 'player_choice'
  abilityMethods: ('standard_array' | 'point_buy' | 'roll' | 'manual')[];
  encumbrance: 'none' | 'basic' | 'variant';        // 'basic'
  leveling: 'xp' | 'milestone';      // 'xp'
  partySheetVisibility: 'none' | 'summary' | 'full';// 'summary'
  customLanguages: string[];         // доп. языки сеттинга
  startingLevel: number;             // 1
  startingGoldMode: 'equipment' | 'gold' | 'both';
};
```

### 4.3 Персонажи

Персонаж хранится как **входные данные** (сборка) + **игровое состояние**. Производные значения никогда не хранятся в БД как источник истины (только кэш для панели мастера, см. `computed_cache`).

```ts
characters: {
  id, owner_id → users.id, campaign_id → campaigns.id nullable (on delete set null),
  name text, portrait_path nullable,
  build jsonb   (CharacterBuild, раздел 8.2),
  state jsonb   (CharacterState, раздел 8.2),
  version int default 1,         // оптимистическая блокировка
  computed_cache jsonb nullable, // последний ComputedSheet-summary для списков и панели мастера
  engine_version text,           // версия движка, посчитавшего кэш
  archived_at nullable, created_at, updated_at
}
character_events: {           // журнал изменений (аудит)
  id, character_id, actor_id → users.id,
  kind text,                   // 'build.update' | 'state.command' | 'gm.grant' | ...
  payload jsonb,               // команда или diff
  created_at
  index(character_id, created_at desc)
}
```

Все изменения `build` и `state` идут через сервис, который:
1. проверяет права (раздел 5);
2. проверяет `expectedVersion` (иначе `CONFLICT`);
3. применяет изменение (для `state` — через команды движка, раздел 8.10);
4. увеличивает `version`, пересчитывает `computed_cache`, пишет `character_events`.

### 4.4 Контент

```ts
content_packs: {
  key text PK,                 // 'srd' | 'dndsu-official' | 'dndsu-homebrew' | 'hb-<uuid>'
  name, source_type enum('srd','dndsu','homebrew'),
  owner_user_id nullable, campaign_id nullable,   // для homebrew
  visibility enum('global','campaign','private'),
  version text, imported_at nullable
}
content_entities: {
  key text PK,                 // '<pack>/<kind>/<slug>', напр. 'dndsu-official/spell/fireball'
  pack_key → content_packs.key,
  kind enum('race','subrace','class','subclass','background','feat','spell',
            'item','weapon','armor','gear','tool','language','condition','feature'),
  slug text, name_ru text, name_en text nullable,
  source_book text nullable,   // 'PHB','XGE','TCE','VGM','MPMM','SCAG','EGW','FTD', 'Homebrew: <автор>'...
  source_url text nullable,
  data jsonb,                  // типизированные данные сущности (раздел 6), БЕЗ длинного текста
  text_md text,                // полное описание в Markdown
  effects_status enum('complete','partial','text_only'),
  status enum('draft','proposed','approved','rejected') default 'approved',  // для homebrew; импорт всегда approved
  review_comment text nullable,
  search tsvector generated (russian: name_ru, name_en, text_md),
  removed_at nullable,         // при повторном импорте сущность не удаляется, а помечается
  updated_at
  index(pack_key, kind), gin(search)
}
```

Персонаж ссылается на контент по `key`. Ключи стабильны между переимпортами (slug берётся из URL dnd.su, см. 7.4).

### 4.5 Заметки

```ts
notes: {
  id, author_id → users.id, campaign_id nullable, character_id nullable,
  type enum('general','session','npc','location','quest','faction','item','clue'),
  title text, body jsonb (TipTap JSON), body_text text (плоский текст для поиска),
  fields jsonb (поля типа, раздел 11.2),
  visibility enum('private','gm','party'),
  is_handout boolean default false,
  session_no int nullable, game_date text nullable, real_date date nullable,
  pinned boolean default false, deleted_at nullable,
  search tsvector generated always as (
    setweight(to_tsvector('russian', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('russian', coalesce(body_text,'')), 'B')) stored,
  created_at, updated_at
  gin(search), index(campaign_id, type), index(author_id)
}
note_shares: { note_id, user_id, read_at nullable, PK(note_id,user_id) }   // адресные раздаточные материалы
tags: { id, scope_type enum('user','campaign'), scope_id uuid, name, color, unique(scope_type, scope_id, lower(name)) }
note_tags: { note_id, tag_id, PK }
note_links: {                 // пересобирается при каждом сохранении заметки
  from_note_id, target_type enum('note','character','content'), target_id text,
  PK(from_note_id, target_type, target_id), index(target_type, target_id)
}
note_versions: { id, note_id, title, body jsonb, author_id, created_at }   // не чаще 1 версии в 5 минут на заметку
boards: { id, campaign_id nullable, owner_id, name, visibility enum('private','gm','party') }
board_nodes: { id, board_id, note_id nullable, label text nullable, x real, y real, color text nullable }
board_edges: { id, board_id, from_node_id, to_node_id, label text nullable, style enum('solid','dashed') }
saved_filters: { id, owner_id, campaign_id nullable, name, query jsonb }
```

### 4.6 Файлы

```ts
files: { id, owner_id, path, mime, size_bytes,
         attached_type enum('portrait','note','campaign'), attached_id uuid, created_at }
```

Доступ к файлу равен доступу к сущности, к которой он прикреплён (раздел 15).

### 4.7 Броски (опционально, веха M9)

```ts
roll_log: { id, campaign_id nullable, character_id nullable, user_id, expression text,
            result jsonb, label text, visibility enum('private','gm','party'), created_at }
```

---

## 5. Аутентификация и права доступа

### 5.1 Аутентификация

- Регистрация: `email`, `username`, `display_name`, пароль (минимум 10 символов), обязательный `inviteCode` (таблица `site_invites`).
- Вход по email или username + пароль. Ограничение: 10 неудачных попыток за 15 минут на IP+логин (счётчик в памяти процесса — допустимо для одного инстанса).
- Сессия: случайный токен 32 байта, в БД хранится `sha256`, cookie `ps_session`: `httpOnly`, `secure`, `sameSite=lax`, срок 30 дней, продление при активности, если осталось меньше 15 дней.
- Выход удаляет сессию. Смена пароля удаляет все сессии пользователя, кроме текущей.
- Сброс пароля: админ в админке генерирует одноразовую ссылку (24 ч) и сам передаёт её другу. Почта не нужна.
- CSRF: все мутации идут через tRPC POST с проверкой заголовка `Origin` против `APP_URL`.

### 5.2 Роли

- **Админ сайта** (`users.is_admin`): инвайты, сброс паролей, управление пакетами контента, запуск импорта.
- В кампании: **мастер** (`gm`, один — владелец), **со-мастер** (`co_gm`, права мастера, кроме удаления кампании и смены ролей), **игрок** (`player`).
- Один пользователь может быть мастером в одной кампании и игроком в другой.

### 5.3 Матрица прав

| Действие | Владелец персонажа | Другой игрок кампании | Мастер/со-мастер кампании | Админ сайта |
| --- | --- | --- | --- | --- |
| Видеть лист | да | по `partySheetVisibility`: ничего / краткая карточка / полностью | да | нет (только если сам в кампании) |
| Менять build | да | нет | да (с записью в журнал) | нет |
| Менять state (хиты, ячейки…) | да | нет | да | нет |
| Выдать опыт/предмет/состояние | нет | нет | да | нет |
| Прикрепить к кампании | да (если он участник) | нет | нет | нет |
| Отвязать от кампании | да | нет | да | нет |
| Удалить (в архив) | да | нет | нет | нет |
| Заметка `private` | только автор | нет | нет | нет |
| Заметка `gm` | автор | нет | да | нет |
| Заметка `party` | автор (правка) | чтение | чтение + правка | нет |
| Handout (`note_shares`) | — | адресат читает | автор (мастер) | нет |
| Homebrew кампании | предложить (статус `proposed`) | видеть одобренный | одобрить/отклонить/создать | нет |

Реализация: функции-гарды в `server/auth/guards.ts`:
`requireUser(ctx)`, `requireCampaignRole(ctx, campaignId, roles[])`, `canViewCharacter(ctx, character): 'none'|'summary'|'full'`, `canEditCharacter(ctx, character)`, `canViewNote(ctx, note)`, `canEditNote(ctx, note)`. Каждая tRPC-процедура обязана вызвать гард; для этого есть юнит-тесты на матрицу выше (таблица → параметризованный тест).

---

## 6. Контент: схемы сущностей и язык эффектов

Схемы описываются в `packages/content-schema` на zod; TypeScript-типы выводятся из них (`z.infer`). Ниже — целевая форма данных. Все схемы строгие (`.strict()`), неизвестные поля — ошибка импорта.

### 6.1 Базовые типы

```ts
type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
type SkillId =
  | 'acrobatics' | 'animal_handling' | 'arcana' | 'athletics' | 'deception' | 'history'
  | 'insight' | 'intimidation' | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleight_of_hand' | 'stealth' | 'survival';
type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
type DamageType = 'acid' | 'bludgeoning' | 'cold' | 'fire' | 'force' | 'lightning' | 'necrotic'
  | 'piercing' | 'poison' | 'psychic' | 'radiant' | 'slashing' | 'thunder';
type ConditionId = 'blinded' | 'charmed' | 'deafened' | 'exhaustion' | 'frightened' | 'grappled'
  | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned' | 'prone'
  | 'restrained' | 'stunned' | 'unconscious';
type Expr = string;       // выражение, раздел 6.4
type ContentKey = string; // '<pack>/<kind>/<slug>'

type Feature = {
  key: string;            // slug внутри родителя: 'rage', 'unarmored-defense'
  nameRu: string;
  nameEn?: string;
  level?: number;         // уровень класса/подкласса, на котором получено (для рас — нет)
  textMd: string;
  effects: Effect[];
  effectsStatus: 'complete' | 'partial' | 'text_only';
  hidden?: boolean;       // служебные «умения» (например, ASI-строка таблицы), не показывать карточкой
};
```

### 6.2 Данные сущностей по видам (`content_entities.data`)

```ts
type RaceData = {
  size: Size;
  speed: { walk: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  subraceRequired: boolean;
  features: Feature[];          // ASI, тёмное зрение, языки и т. п. — как эффекты
  ageMd?: string; alignmentMd?: string;
};

type SubraceData = { raceKey: ContentKey; features: Feature[] };

type MulticlassRequirement = { all?: [Ability, number][]; any?: [Ability, number][] };

type ClassData = {
  hitDie: 6 | 8 | 10 | 12;
  savingThrows: [Ability, Ability];
  multiclassRequirement: MulticlassRequirement;
  proficiencies: {
    armor: ('light' | 'medium' | 'heavy' | 'shield')[];
    weapons: string[];            // 'simple' | 'martial' | slug конкретного оружия
    tools: string[];              // slug инструментов или 'choice:<n>:<group>'
    skills: { choose: number; from: SkillId[] | 'any' };
  };
  multiclassProficiencies: {
    armor: ('light' | 'medium' | 'heavy' | 'shield')[];
    weapons: string[];
    tools: string[];
    skills?: { choose: number; from: SkillId[] | 'class_list' | 'any' };
  };
  startingEquipment: EquipmentChoiceGroup[];
  startingGold: string;           // '5d4*10'
  subclassLevel: number;
  subclassLabelRu: string;        // 'Путь дикости', 'Божественный домен'
  asiLevels: number[];            // [4,8,12,16,19]; воин [4,6,8,12,14,16,19]; плут [4,8,10,12,16,19]
  spellcasting?: ClassSpellcasting;
  columns: { key: string; labelRu: string }[];              // доп. колонки таблицы класса
  levels: { level: number; featureKeys: string[]; values: Record<string, string | number> }[]; // 20 строк
  features: Feature[];
};

type ClassSpellcasting = {
  ability: Ability;
  progression: 'full' | 'half' | 'half_up' | 'third' | 'pact';
  preparation: 'known' | 'prepared' | 'spellbook';
  spellListKey: string;           // 'wizard', 'cleric', ... — список заклинаний класса
  cantripsKnown?: number[];       // длина 20, по уровню класса
  spellsKnown?: number[];         // для 'known'
  preparedFormula?: Expr;         // для 'prepared'/'spellbook', напр. 'max(1, CLASS_LEVEL + WIS)'
  ritualCasting: 'none' | 'prepared_only' | 'from_book';
  schoolRestriction?: { schools: string[]; freePicksAtLevels: number[] }; // Мистический рыцарь/ловкач
};

type SubclassData = {
  classKey: ContentKey;
  spellcasting?: ClassSpellcasting;                 // Мистический рыцарь, Мистический ловкач
  alwaysPrepared?: { classLevel: number; spells: ContentKey[] }[];   // домены, клятвы, круги земли
  expandedSpellList?: { spellLevel: number; spells: ContentKey[] }[];// покровители колдуна
  features: Feature[];
};

type BackgroundData = {
  skills: SkillId[] | { choose: number; from: SkillId[] };
  tools: string[]; languages: { choose: number } | string[];
  equipmentMd: string; gold: number;
  feature: Feature;
  characteristics: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
};

type FeatData = {
  prerequisite?: { textRu: string; check?: Predicate };
  repeatable: boolean;
  features: Feature[];            // обычно один Feature с эффектами
};

type SpellData = {
  level: number;                  // 0 = заговор
  school: 'abjuration' | 'conjuration' | 'divination' | 'enchantment' | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';
  castingTime: { textRu: string; unit: 'action' | 'bonus_action' | 'reaction' | 'minute' | 'hour' | 'special'; amount: number };
  ritual: boolean;
  range: { textRu: string; feet?: number; kind: 'self' | 'touch' | 'ranged' | 'sight' | 'unlimited' | 'special' };
  components: { v: boolean; s: boolean; m: boolean; materialRu?: string; costGp?: number; consumed?: boolean };
  duration: { textRu: string; concentration: boolean };
  classes: string[];              // ключи списков: 'wizard','sorcerer',...
  subclasses: ContentKey[];
  attack?: 'melee' | 'ranged';
  save?: Ability;
  damage?: { dice: string; type: DamageType; scaling?: 'slot' | 'cantrip' }[];
  heal?: { dice: string; addSpellMod: boolean; scaling?: 'slot' };
  higherLevelsMd?: string;
};

type WeaponData = {
  category: 'simple' | 'martial'; range: 'melee' | 'ranged';
  damage: { dice: string; type: DamageType };
  versatileDice?: string;
  properties: ('ammunition' | 'finesse' | 'heavy' | 'light' | 'loading' | 'range' | 'reach' | 'special' | 'thrown' | 'two_handed' | 'versatile')[];
  rangeFt?: { normal: number; long: number };
  costCp: number; weightLb: number;
  monkWeapon: boolean;            // простое рукопашное без «двуручного» и «тяжёлого», или короткий меч
};

type ArmorData = {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;                 // щит: 2
  dexCap: number | null;          // лёгкий: null (без ограничения), средний: 2, тяжёлый: 0
  strRequirement?: number;
  stealthDisadvantage: boolean;
  costCp: number; weightLb: number;
};

type GearData = { costCp: number; weightLb: number; capacityLb?: number; kind: 'gear' | 'ammunition' | 'pack' | 'focus' | 'tool' | 'mount' | 'trade_good' };

type MagicItemData = {
  itemType: 'weapon' | 'armor' | 'shield' | 'wondrous' | 'ring' | 'rod' | 'staff' | 'wand' | 'potion' | 'scroll' | 'ammunition';
  baseItem?: ContentKey | { anyOf: 'any_weapon' | 'any_armor' | 'any_sword' | 'any_axe' | 'light_armor' | 'medium_or_heavy_armor' | 'ammunition' };
  rarity: 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact' | 'varies';
  attunement: false | { byRu?: string; check?: Predicate };
  charges?: { max: Expr; rechargeRu: string; reset: 'dawn' | 'long' | 'short' | 'none' };
  effects: Effect[];              // действуют, когда предмет надет/в руке и (если нужно) настроен
  effectsStatus: 'complete' | 'partial' | 'text_only';
};
```

`EquipmentChoiceGroup` — «(a) X или (b) Y»: `{ options: { items: { key: ContentKey | 'any:<filter>'; qty: number }[] }[] }`.

### 6.3 Эффекты (DSL)

У каждого эффекта есть необязательные поля `id?: string` (уникален внутри Feature) и `when?: Predicate`. Движок подставляет контекст источника: `sourceKey`, `classKey` (если источник — класс/подкласс), `level` получения.

```ts
type Effect =
  // Характеристики
  | { type: 'ability'; ability: Ability; op: 'add'; value: Expr }                     // расовый бонус, ASI
  | { type: 'ability'; ability: Ability; op: 'set_min'; value: Expr }                 // Пояс силы великана: значение = max(текущее, N)
  | { type: 'ability_cap'; ability: Ability; max: number }                            // Первобытный чемпион: предел 24

  // Владения
  | { type: 'proficiency'; target: ProfTarget; level: 'proficient' | 'expertise' }
  | { type: 'half_proficiency'; scope: 'checks' | Ability[]; rounding: 'down' | 'up'; includeInitiative: boolean }
      // «Мастер на все руки» (checks, down, initiative=true); «Выдающийся атлет» (['str','dex','con'], up, true)

  // Числовые бонусы
  | { type: 'bonus'; target: StatTarget; value: Expr; bonusType?: string; labelRu?: string }

  // Класс доспеха
  | { type: 'ac_formula'; id: string; labelRu: string; base: Expr; allowShield: boolean; requires: 'no_armor' | 'no_armor_no_shield' | 'any' }

  // Передвижение и чувства
  | { type: 'speed'; mode: 'walk' | 'fly' | 'swim' | 'climb' | 'burrow' | 'all'; op: 'set' | 'add' | 'equal_walk' | 'zero'; value?: Expr }
  | { type: 'sense'; sense: 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight'; rangeFt: number; op: 'set_max' | 'add' }
  | { type: 'size'; size: Size }
  | { type: 'carry'; sizeSteps: number }                                              // «Мощное телосложение»: +1

  // Защиты
  | { type: 'defense'; kind: 'resistance' | 'immunity' | 'vulnerability'; damageType: DamageType | 'nonmagical_bps'; noteRu?: string }
  | { type: 'condition_immunity'; condition: ConditionId }
  | { type: 'auto_fail'; saves: Ability[]; noteRu?: string }                        // парализован, оглушён…
  | { type: 'roll_mode'; mode: 'advantage' | 'disadvantage'; target: RollTarget; noteRu: string; conditional?: boolean }
      // conditional=true (по умолчанию) — только подсказка у броска; false — действует всегда и влияет на пассивные значения (±5)
  | { type: 'roll_mode'; mode: 'advantage' | 'disadvantage'; target: 'attacks_against_you'; noteRu: string }

  // Хиты
  | { type: 'hp_max'; value: Expr }                                                   // «Крепкий»: 2*LEVEL; холмовой дварф: LEVEL

  // Бой
  | { type: 'attack'; id: string; nameRu: string; ability: Ability | 'str_or_dex' | 'spell'; proficient: boolean;
      damage: { dice: Expr; type: DamageType; addAbilityMod: boolean }[]; reachFt?: number; rangeFt?: { normal: number; long: number } }
  | { type: 'weapon_option'; filter: WeaponFilter; allowAbilities?: Ability[]; minDamageDie?: Expr; labelRu: string }
      // «Боевые искусства» монаха: filter monk_weapons+unarmed, allowAbilities ['dex'], minDamageDie 'col("martial_arts")'
  | { type: 'extra_attack'; attacks: number }                                         // итог = max, не сумма
  | { type: 'crit_range'; min: number }                                               // итог = min
  | { type: 'unarmed_damage'; dice: Expr }
  | { type: 'armor_rule'; category: 'light' | 'medium' | 'heavy'; dexCap?: number; noStealthDisadvantage?: boolean; ignoreStrSpeedPenalty?: boolean }
      // «Мастер средних доспехов»: medium, dexCap 3, noStealthDisadvantage; дварф: heavy, ignoreStrSpeedPenalty
  | { type: 'combat_rule'; rule: 'twf_ability_mod' | 'ignore_loading' | 'no_ranged_disadvantage_in_melee' | 'great_weapon_reroll' | 'versatile_d_up'; noteRu?: string }

  // Ресурсы и заклинания
  | { type: 'resource'; id: string; nameRu: string; max: Expr; reset: 'short' | 'long' | 'dawn' | 'none'; die?: Expr }
  | { type: 'spell_grant'; spell: ContentKey | { choice: string }; ability: Ability | 'class';
      mode: 'always_prepared' | 'known' | 'innate'; uses?: { count: Expr; reset: 'short' | 'long' | 'dawn' }; castAtLevel?: number; minCharacterLevel?: number }
  | { type: 'spell_list_extend'; list: string; spells: ContentKey[] }

  // Выборы и переключатели
  | { type: 'choice'; id: string; labelRu: string; choose: number | Expr; options: ChoiceSource; replaceOnLevelUp?: boolean }
      // choose может зависеть от уровня: 'col("invocations_known")'; если выбрано меньше — это незавершённый выбор
  | { type: 'toggle'; id: string; labelRu: string; effects: Effect[]; cost?: { resource: string; amount: number }; exclusiveGroup?: string }

  // Нет автоматизации
  | { type: 'text'; noteRu?: string };

type ProfTarget =
  | `skill:${SkillId}` | `save:${Ability}` | `armor:${'light' | 'medium' | 'heavy' | 'shield'}`
  | `weapon:${string}` | `tool:${string}` | `language:${string}`;

type StatTarget =
  | 'ac' | 'initiative' | 'hp_max' | `speed:${'walk' | 'fly' | 'swim' | 'climb' | 'burrow'}`
  | `save:${Ability}` | 'save:*' | `check:${Ability}` | 'check:*' | `skill:${SkillId}` | `passive:${SkillId}`
  | 'attack:melee_weapon' | 'attack:ranged_weapon' | 'attack:spell'
  | 'damage:melee_weapon' | 'damage:ranged_weapon'
  | 'spell_dc' | 'carry_capacity';

type RollTarget = StatTarget | 'attack:*' | 'death_save' | 'concentration';

type ChoiceSource =
  | { kind: 'list'; items: { value: string; labelRu: string; effects: Effect[] }[] }
  | { kind: 'skills'; from: SkillId[] | 'any'; grant: 'proficient' | 'expertise'; requireProficient?: boolean }
  | { kind: 'languages' } | { kind: 'tools'; group?: 'artisan' | 'musical' | 'gaming' | 'any' }
  | { kind: 'ability_increase'; points: number; maxPerAbility: number; abilities?: Ability[] }
  | { kind: 'feat' } | { kind: 'spells'; list: string; level: number | 'cantrip'; school?: string[] }
  | { kind: 'fighting_style'; styles: string[] };

type WeaponFilter = { category?: 'simple' | 'martial'; range?: 'melee' | 'ranged'; properties?: string[]; notProperties?: string[]; keys?: string[]; monkWeapon?: boolean; includeUnarmed?: boolean };
```

**Правила наложения:**
- `bonus` с одинаковым `bonusType` не складываются — берётся максимальный. Без `bonusType` — складываются.
- Один и тот же эффект (тот же `sourceKey` + `feature.key` + `id`) применяется один раз, даже если источник получен дважды.
- `ac_formula`: движок считает все допустимые формулы (включая формулу надетого доспеха) и берёт максимальную; к ней прибавляются `bonus` на `ac` и щит (если `allowShield`).
- `sense` `set_max`: итоговая дальность — максимум, `add` — прибавка к максимуму.
- `extra_attack` — максимум, не сумма; `crit_range` — минимум.
- `speed` `set`: берётся максимум из установок, затем все `add`, затем штрафы (раздел 8.6).

### 6.4 Выражения (`Expr`) и предикаты

Выражение парсится `jsep` и вычисляется собственным интерпретатором (белый список узлов: литералы, идентификаторы, бинарные/унарные операторы, `?:`, вызовы разрешённых функций). Результат — число или boolean. Ошибка вычисления = ошибка валидации контента, а не падение листа (значение 0 + предупреждение).

| Переменная | Значение |
| --- | --- |
| `STR` `DEX` `CON` `INT` `WIS` `CHA` | модификаторы |
| `STR_SCORE` … `CHA_SCORE` | значения характеристик |
| `PB` | бонус мастерства |
| `LEVEL` | общий уровень персонажа |
| `CLASS_LEVEL` | уровень в классе-источнике эффекта (для рас и черт — `LEVEL`) |
| `LEVEL_<classSlug>` | уровень в конкретном классе, напр. `LEVEL_monk` |
| `SPELL_MOD` | модификатор заклинательной характеристики класса-источника |
| `ARMOR` | `'none' | 'light' | 'medium' | 'heavy'` |
| `SHIELD` | boolean |

Функции: `floor`, `ceil`, `min`, `max`, `abs`, `col("<column>")` — значение колонки таблицы класса-источника на текущем `CLASS_LEVEL` (например, `col("rage_damage")`), `toggle("<id>")` — активен ли переключатель, `has("<contentKey>")` — есть ли у персонажа источник.

`Predicate` — либо `Expr`, возвращающее boolean, либо объект:

```ts
type Predicate =
  | Expr
  | { armor: 'none' | 'light' | 'medium' | 'heavy' | 'not_heavy' | 'any' }
  | { shield: boolean }
  | { toggle: string }
  | { wielding: 'one_melee_weapon_no_other' | 'two_weapons' | 'ranged_weapon' | 'heavy_weapon' | 'finesse_or_ranged' }
  | { attackAbility: Ability }          // проверяется для конкретной атаки: какой характеристикой она сделана
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate };
```

### 6.5 Примеры эффектов (эталон стиля для оверлеев)

```jsonc
// Варвар: Защита без доспехов, Ярость
{
  "unarmored-defense": { "effects": [
    { "type": "ac_formula", "id": "barbarian-ud", "labelRu": "Защита без доспехов",
      "base": "10 + DEX + CON", "allowShield": true, "requires": "no_armor" } ] },
  "rage": { "effects": [
    { "type": "resource", "id": "rage", "nameRu": "Ярость", "max": "col(\"rages\")", "reset": "long" },
    { "type": "toggle", "id": "raging", "labelRu": "В ярости", "cost": { "resource": "rage", "amount": 1 },
      "effects": [
        { "type": "roll_mode", "mode": "advantage", "target": "check:str", "noteRu": "Проверки Силы" },
        { "type": "roll_mode", "mode": "advantage", "target": "save:str", "noteRu": "Спасброски Силы" },
        { "type": "bonus", "target": "damage:melee_weapon", "value": "col(\"rage_damage\")",
          "when": { "all": [ { "not": { "armor": "heavy" } }, { "attackAbility": "str" } ] }, "labelRu": "Урон ярости (атаки Силой)" },
        { "type": "defense", "kind": "resistance", "damageType": "bludgeoning" },
        { "type": "defense", "kind": "resistance", "damageType": "piercing" },
        { "type": "defense", "kind": "resistance", "damageType": "slashing" }
      ] } ] }
}

// Дварф: базовая раса
{
  "features": {
    "asi": { "effects": [ { "type": "ability", "ability": "con", "op": "add", "value": "2" } ] },
    "darkvision": { "effects": [ { "type": "sense", "sense": "darkvision", "rangeFt": 60, "op": "set_max" } ] },
    "dwarven-resilience": { "effects": [
      { "type": "roll_mode", "mode": "advantage", "target": "save:*", "noteRu": "Против яда" },
      { "type": "defense", "kind": "resistance", "damageType": "poison" } ] },
    "dwarven-combat-training": { "effects": [
      { "type": "proficiency", "target": "weapon:battleaxe", "level": "proficient" },
      { "type": "proficiency", "target": "weapon:handaxe", "level": "proficient" },
      { "type": "proficiency", "target": "weapon:light-hammer", "level": "proficient" },
      { "type": "proficiency", "target": "weapon:warhammer", "level": "proficient" } ] },
    "tool-proficiency": { "effects": [
      { "type": "choice", "id": "tool", "labelRu": "Инструменты ремесленника", "choose": 1,
        "options": { "kind": "list", "items": [
          { "value": "smiths-tools", "labelRu": "Инструменты кузнеца", "effects": [ { "type": "proficiency", "target": "tool:smiths-tools", "level": "proficient" } ] },
          { "value": "brewers-supplies", "labelRu": "Инструменты пивовара", "effects": [ { "type": "proficiency", "target": "tool:brewers-supplies", "level": "proficient" } ] },
          { "value": "masons-tools", "labelRu": "Инструменты каменщика", "effects": [ { "type": "proficiency", "target": "tool:masons-tools", "level": "proficient" } ] } ] } } ] },
    "languages": { "effects": [
      { "type": "proficiency", "target": "language:common", "level": "proficient" },
      { "type": "proficiency", "target": "language:dwarvish", "level": "proficient" } ] }
  }
}
// Холмовой дварф (подраса): +1 Мдр, +1 хит за уровень
{ "features": {
    "asi": { "effects": [ { "type": "ability", "ability": "wis", "op": "add", "value": "1" } ] },
    "dwarven-toughness": { "effects": [ { "type": "hp_max", "value": "LEVEL" } ] } } }

// Черта «Бдительный»
{ "features": { "alert": { "effects": [
    { "type": "bonus", "target": "initiative", "value": "5" },
    { "type": "text", "noteRu": "Нельзя застать врасплох; скрытые существа не получают преимущества" } ] } } }

// Воин: боевой стиль «Оборона»
{ "type": "choice", "id": "fighting-style", "labelRu": "Боевой стиль", "choose": 1,
  "options": { "kind": "list", "items": [
    { "value": "defense", "labelRu": "Оборона",
      "effects": [ { "type": "bonus", "target": "ac", "value": "1", "when": { "not": { "armor": "none" } } } ] },
    { "value": "archery", "labelRu": "Стрельба",
      "effects": [ { "type": "bonus", "target": "attack:ranged_weapon", "value": "2" } ] },
    { "value": "dueling", "labelRu": "Дуэлянт",
      "effects": [ { "type": "bonus", "target": "damage:melee_weapon", "value": "2", "when": { "wielding": "one_melee_weapon_no_other" } } ] }
    /* …остальные стили */ ] } }
```

---

## 7. Импорт контента

### 7.1 Пакеты

| Пакет | Откуда | Что в нём | По умолчанию в кампаниях |
| --- | --- | --- | --- |
| `srd` | SRD 5.1, JSON из репозитория `5e-bits/5e-database` (данные 2014) | обычное оружие, доспехи, снаряжение, инструменты, языки, состояния; английские названия и механика как эталон для сверки | включён |
| `dndsu-official` | dnd.su, официальные книги | классы, подклассы, расы, подрасы, предыстории, черты, заклинания, магические предметы | включён |
| `dndsu-homebrew` | dnd.su, разделы homebrew | то же для homebrew | выключен, мастер включает |
| `hb-<uuid>` | редактор в приложении | homebrew мастера или игрока | по привязке |

Русские названия для пакета `srd` берутся из словаря `packages/content-data/dictionaries/srd-ru.json` (заполнить по терминологии dnd.su, раздел 18).

### 7.2 Команды CLI (`packages/importer`)

```
pnpm import:srd                     # собрать пакет srd из 5e-database → content-data/srd/*.json
pnpm import:dndsu crawl  [--section <s>] [--homebrew] [--since <ISO>] [--limit N]
pnpm import:dndsu parse  [--section <s>]           # cache/*.html → parsed/*.json
pnpm import:dndsu build                            # parsed + словари + оверлеи → content-data/dndsu*/*.json
pnpm import:dndsu diff                             # отчёт: новые / изменённые / пропавшие сущности
pnpm content:validate                              # zod + вычисление всех Expr на тестовом персонаже
pnpm content:coverage                              # docs/content-coverage.md
pnpm content:load                                  # upsert JSON-пакетов в БД (content_packs, content_entities)
```

Секции: `classes`, `races`, `backgrounds`, `feats`, `spells`, `items`. Бестиарий не импортируется.

Приложение само сеть не использует: импорт — ручная админская операция на машине разработчика, результат (JSON) коммитится в репозиторий, на сервере выполняется только `content:load` (при старте контейнера, если версия пакета изменилась).

### 7.3 Шаг 0 — образцы страниц (обязательно до парсеров)

Скачать и положить в `packages/importer/fixtures/` минимум по 3 страницы каждого типа, включая «трудные»:

- классы: Варвар `https://dnd.su/class/87-barbarian/`, Волшебник, Колдун, Воин; подкласс с заклинаниями (Мистический рыцарь), домен жреца;
- расы: Дварф `https://dnd.su/race/78-dwarf/`, раса без подрас (Полуорк), раса из дополнения;
- заклинания: `https://dnd.su/spells/205-fireball/`, ритуал, заговор, заклинание с дорогим материальным компонентом;
- предыстория, черта, магический предмет с настройкой и зарядами, homebrew-класс `https://dnd.su/homebrew/class/853-alternate-barbarian/`;
- страницы-списки каждого раздела.

Наблюдения, которые надо проверить на образцах:
- URL: `/<section>/<id>-<slug>/`, homebrew — `/homebrew/<section>/<id>-<slug>/` (секции в URL: `class`, `race`, `backgrounds`, `feats`, `spells`, `items`).
- `<title>`: «Название / Раздел D&D 5 / Источник», например «Варвар / Классы D&D 5 / Player's Handbook».
- Заголовок сущности часто содержит английское название в квадратных скобках: «Огненный шар [Fireball]».
- Источник указан строкой вида «Источник: «Player's handbook»».
- У класса есть таблица с колонками «Уровень», «Бонус мастерства», «Умения» и классовыми колонками (у варвара — «Ярость», «Урон ярости»), блоки умений по уровням, раздел подклассов со ссылками на отдельные страницы.
- При запросах без cookies возможен цикл редиректов (он наблюдался при проверке). Использовать cookie-jar (`tough-cookie`) и нормальный `User-Agent`; если цикл остаётся — запасной транспорт на Playwright (headless Chromium), который проходит клиентские проверки.

### 7.4 Crawl

- Транспорт: `undici` + cookie-jar; заголовки `User-Agent: PartySheetImporter/1.0 (+контакт владельца инсталляции)`, `Accept-Language: ru`.
- Вежливость: 1 запрос за раз, пауза 1500 мс ± 500 мс, уважать `robots.txt`, на 429/5xx — экспоненциальная пауза до 5 попыток.
- Обнаружение: начинать со страниц-списков; собирать ссылки по регулярке URL-шаблона секции; для классов — дополнительно ссылки на подклассы со страницы класса. Если список рендерится скриптом и в HTML ссылок нет — брать страницу через Playwright.
- Кэш: `cache/<section>/<externalId>-<slug>.html` + `cache/manifest.json` (`url`, `fetchedAt`, `sha256`, `status`). Повторный `crawl` без `--force` не качает страницы моложе 30 дней.
- Ключ сущности: `slug` — часть URL после `<id>-`. Если в одном пакете и виде slug повторяется (часто у homebrew) — `slug-<externalId>`. Соответствие `externalId → key` фиксируется в `content-data/dndsu/key-map.json` и больше никогда не меняется, чтобы не ломать ссылки персонажей.

### 7.5 Parse

Для каждой секции — парсер `parse<Section>(html, url): ParsedRecord`, построенный на `cheerio`. Текст описаний конвертируется в Markdown через `turndown` (таблицы — GFM). Картинки, рекламные блоки, комментарии, навигация отбрасываются.

```ts
type ParsedRecord = {
  externalId: number; url: string; section: string; homebrew: boolean;
  nameRu: string; nameEn?: string; sourceBook?: string;
  fields: Record<string, unknown>;   // структурированные поля секции (ниже)
  blocks: { headingRu: string; headingEn?: string; level?: number; md: string }[];  // умения/разделы
  bodyMd: string;
};
```

Поля по секциям:
- **spells**: уровень и школа (строка вида «3 уровень, воплощение» / «Заговор, …»), время накладывания, дистанция, компоненты (В, С, М + текст материала, стоимость в зм, «расходуется»), длительность (+ «Концентрация»), ритуал, классы, архетипы, текст «На больших уровнях».
- **classes**: кость хитов, хиты на 1 и следующих уровнях, владения (доспехи, оружие, инструменты, спасброски, навыки «выберите N из …»), снаряжение, таблица класса (все колонки, 20 строк), блоки умений с уровнем (уровень берётся из текста «На N уровне…» или из таблицы по названию умения), ссылки на подклассы.
- **subclasses**: родительский класс, блоки умений с уровнями, таблицы заклинаний подкласса.
- **races**: увеличение характеристик, возраст, мировоззрение, размер, скорость, языки, блоки особенностей, подрасы (как отдельные блоки на той же странице или отдельные страницы — определить по образцам).
- **backgrounds**: навыки, инструменты, языки, снаряжение, умение, таблицы d8/d6 черт, идеалов, привязанностей, слабостей.
- **feats**: требование, текст.
- **items**: тип, редкость, требуется ли настройка (и кем), текст.

Каждый парсер покрыт снапшот-тестами на фикстурах: `parse(fixture)` → сравнение с `*.expected.json`, который проверен человеком.

### 7.6 Build: из текста в механику

`build` превращает `ParsedRecord` в сущности пакета (схемы из раздела 6) в три слоя, каждый следующий перекрывает предыдущий:

1. **Автоматическое извлечение** (детерминированные правила + словари `dictionaries/*.json`, RU-термин → id):
   - заклинания: все поля `SpellData`; урон — регулярка по кубам «(\d+)к(\d+)» и типу урона из словаря, `scaling` по фразам «на больших уровнях» / уровни заговора 5/11/17;
   - классы: `hitDie`, `savingThrows`, `proficiencies`, `skills.choose/from`, `columns` и `levels` из таблицы, `asiLevels` по строкам «Увеличение характеристик», `subclassLevel` по первой строке с названием подкласса;
   - ячейки заклинаний и «Известные заговоры/заклинания» — из колонок таблицы класса;
   - расы: ASI по фразам «Значение вашей <характеристики> увеличивается на N», скорость «Ваша базовая скорость ходьбы составляет N футов», размер, тёмное зрение «в пределах N футов», языки;
   - предыстории: навыки, инструменты, языки;
   - предметы: тип, редкость, настройка, «+N к броскам атаки и урона» → `bonus` на оружии, «+N к КД» → `bonus ac`.
   Всё, что не распознано, остаётся `text`-эффектом.
2. **Эталон SRD**: для сущностей, у которых `nameEn` совпадает с сущностью SRD, числовые поля (кость хитов, спасброски, таблицы, ячейки) сверяются с SRD; расхождение → предупреждение в отчёте `diff`, значение SRD побеждает для механики.
3. **Оверлеи** `packages/content-data/overlays/<pack>/<kind>/<slug>.json`: вручную (или Claude Code партиями) написанные эффекты для умений. Формат:

```jsonc
{
  "target": "dndsu-official/class/barbarian",
  "data": { },                         // необязательные исправления полей data
  "features": {                        // по Feature.key
    "rage": { "effects": [ /* … */ ], "effectsStatus": "complete" }
  }
}
```

`Feature.key` = английское название из скобок в заголовке блока, переведённое в slug; если английского нет — транслитерация русского. После первого импорта ключи фиксируются в `key-map.json`.

`effectsStatus` сущности: `complete`, если все её Feature `complete`; `text_only`, если ни у одного нет эффектов; иначе `partial`.

**Порядок заполнения оверлеев (приоритет):** 1) все 12 классов PHB + изобретатель, их умения 1–20 уровней; 2) подклассы PHB; 3) расы и подрасы PHB; 4) черты PHB; 5) XGE и TCE (подклассы, черты, расы); 6) VGM/MPMM и прочие расы; 7) остальное по запросу игроков. Заклинания и предметы оверлеев почти не требуют — их механика в структурированных полях.

### 7.7 Load и обновления

- `content:load` делает upsert по `key`. Сущности, пропавшие из пакета, получают `removed_at`, но не удаляются: персонажи продолжают их видеть (с пометкой «удалено из источника»).
- Версия пакета = sha256 от содержимого JSON; при старте контейнер сравнивает с `content_packs.version` и загружает только изменённые.
- После загрузки сервер сбрасывает `ContentIndex`-кэш и пересчитывает `computed_cache` всех персонажей в фоне.

### 7.8 Отчёт покрытия

`pnpm content:coverage` пишет `docs/content-coverage.md`: по каждому пакету и виду — число сущностей `complete / partial / text_only`, и список Feature без эффектов, отсортированный по числу персонажей, у которых это умение есть (если доступна БД). Это рабочий список для следующих оверлеев.

### 7.9 Источник в интерфейсе

Каждая карточка контента показывает «Источник: <книга>» и ссылку «Открыть на dnd.su» (`source_url`), чтобы можно было свериться с оригиналом.

---

## 8. Движок правил (`packages/rules-engine`)

### 8.1 Публичный API

```ts
export const ENGINE_VERSION: string;                 // semver, повышать при изменении расчётов

export function compute(build: CharacterBuild, state: CharacterState, content: ContentIndex, rules: CampaignSettings): ComputedSheet;
export function pendingChoices(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): PendingChoice[];
export function validateBuild(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): Issue[];   // severity: 'error' | 'warning'
export function levelUpOptions(build: CharacterBuild, content: ContentIndex, rules: CampaignSettings): LevelUpOptions;
export function applyLevelUp(build: CharacterBuild, decision: LevelUpDecision, content: ContentIndex, rules: CampaignSettings): CharacterBuild;
export function undoLastLevel(build: CharacterBuild): CharacterBuild;
export function applyCommand(build: CharacterBuild, state: CharacterState, cmd: StateCommand, content: ContentIndex, rules: CampaignSettings):
  { state: CharacterState; events: EngineEvent[] };   // события: 'concentration_check', 'dropped_to_zero', 'died', 'stabilized'…
export function summarize(sheet: ComputedSheet): SheetSummary;   // для computed_cache и панели мастера
export function evalExpr(expr: Expr, ctx: ExprContext): number | boolean;
```

`ContentIndex` — `Map<ContentKey, ContentEntity>` + индексы по виду и по спискам заклинаний; строится сервером из БД (только поля `data`, без `text_md`) и отдаётся клиенту одним JSON-бандлом на кампанию (ETag = хэш версий пакетов). Движок работает одинаково в браузере и на сервере.

### 8.2 Входные данные

```ts
type CharacterBuild = {
  schemaVersion: 1;
  status: 'draft' | 'ready';
  identity: {
    name: string; alignment?: string; age?: string; height?: string; weight?: string;
    eyes?: string; skin?: string; hair?: string; appearanceMd?: string; backstoryMd?: string;
    personality: { traits: string; ideals: string; bonds: string; flaws: string };
    alliesMd?: string;
  };
  abilities: { method: 'standard_array' | 'point_buy' | 'roll' | 'manual'; base: Record<Ability, number>; rolls?: number[][] };
  race: ContentKey; subrace?: ContentKey;
  background: ContentKey;
  classes: { classKey: ContentKey; subclassKey?: ContentKey }[];   // первый элемент — стартовый класс
  levels: {                                                       // одна запись на каждый уровень персонажа, по порядку
    classKey: ContentKey;
    hp: { method: 'max' | 'average' | 'roll'; roll?: number };
    asi?: { kind: 'asi'; increases: Partial<Record<Ability, 1 | 2>> } | { kind: 'feat'; featKey: ContentKey };
  }[];
  choices: Record<ChoiceKey, string[]>;   // ChoiceKey = '<sourceKey>#<featureKey>#<effectId>'
  knownSpells: { classKey: ContentKey; cantrips: ContentKey[]; spells: ContentKey[]; spellbook?: ContentKey[] }[];
  manualEffects: { id: string; labelRu: string; enabled: boolean; effects: Effect[] }[];
  overrides: Record<string, { value: number; reasonRu: string }>;   // ключ — путь в ComputedSheet, напр. 'ac', 'skills.stealth'
};

type CharacterState = {
  hp: { current: number; temp: number };
  hitDiceUsed: Record<'d6' | 'd8' | 'd10' | 'd12', number>;
  deathSaves: { successes: number; failures: number; stable: boolean; dead: boolean };
  slotsUsed: number[];            // индекс = круг (1..9), [0] не используется
  pactSlotsUsed: number;
  resourcesUsed: Record<string, number>;
  grantUsesUsed: Record<string, number>;
  toggles: string[];
  conditions: ConditionId[];
  exhaustion: number;             // 0..6
  concentration?: { spellKey: ContentKey; sinceIso: string };
  inspiration: boolean;
  xp: number;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  inventory: InventoryItem[];
  prepared: Record<ContentKey /* classKey */, ContentKey[]>;
};

type InventoryItem = {
  id: string; key?: ContentKey; customName?: string; customWeightLb?: number;
  qty: number; equipped: boolean; attuned: boolean;
  hand?: 'main' | 'off' | 'both';           // для оружия и щита
  containerId?: string; charges?: number; notesMd?: string;
};
```

Инвентарь, монеты, опыт и подготовленные заклинания лежат в `state`, потому что меняются за столом через команды.

### 8.3 Выходные данные

Каждое число листа — `Val` с расшифровкой. Интерфейс показывает её по нажатию на число.

```ts
type Val = { value: number; parts: { labelRu: string; sourceKey?: string; value: number }[];
             overridden?: { computed: number; reasonRu: string } };

type ComputedSheet = {
  engineVersion: string;
  level: { total: number; byClass: Record<ContentKey, number> };
  pb: Val;
  abilities: Record<Ability, { score: Val; mod: number; save: Val; saveProficient: boolean; autoFail: boolean }>;
  skills: Record<SkillId, { ability: Ability; value: Val; prof: 'none' | 'half' | 'proficient' | 'expertise'; modes: RollModeInfo[] }>;
  passives: { perception: Val; investigation: Val; insight: Val };
  initiative: Val;
  ac: Val & { formulaLabelRu: string };
  speed: Partial<Record<'walk' | 'fly' | 'swim' | 'climb' | 'burrow', Val>>;
  size: Size;
  senses: { sense: string; rangeFt: number }[];
  hp: { max: Val; current: number; temp: number };
  hitDice: { die: 6 | 8 | 10 | 12; total: number; used: number }[];
  defenses: { resistances: DefenseLine[]; immunities: DefenseLine[]; vulnerabilities: DefenseLine[]; conditionImmunities: ConditionId[] };
  rollModes: RollModeInfo[];                     // все активные преимущества/помехи с пояснением
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  attacks: AttackLine[];                          // name, toHit: Val, damage: DamageLine[], range, properties, notes
  attacksPerAction: number; critMin: number;
  resources: { id: string; nameRu: string; max: number; used: number; reset: string; die?: string }[];
  toggles: { id: string; labelRu: string; active: boolean; cost?: { resource: string; amount: number } }[];
  spellcasting: {
    classes: { classKey: ContentKey; ability: Ability; dc: Val; attack: Val; cantripsMax?: number; knownMax?: number;
               preparedMax?: number; maxSpellLevel: number; ritual: string }[];
    slots: { level: number; max: number; used: number }[];
    pact?: { level: number; max: number; used: number };
    grants: { id: string; spellKey: ContentKey; mode: string; uses?: { max: number; used: number; reset: string } }[];
  };
  carrying: { weightLb: number; capacityLb: number; pushDragLiftLb: number; status: 'ok' | 'encumbered' | 'heavily_encumbered' | 'over_capacity' };
  features: { sourceKey: ContentKey; sourceLabelRu: string; features: { key: string; nameRu: string; level?: number; textMd?: string; automated: 'complete' | 'partial' | 'text_only' }[] }[];
  pendingChoices: PendingChoice[];
  issues: Issue[];
  xp: { current: number; nextLevelAt: number | null; canLevelUp: boolean };
};
```

### 8.4 Порядок расчёта

1. **Источники.** Раса, подраса, предыстория; для каждого класса — умения класса с `level ≤ уровень в классе`; подкласс — так же; черты из `levels[].asi` и выборов; надетые предметы (`equipped`, а если требуется настройка — только `attuned`); активные состояния и истощение (встроенные сущности `srd/condition/*`); активные переключатели; `manualEffects` с `enabled`.
2. **Выборы.** Каждый `choice` заменяется эффектами выбранных опций из `build.choices`. Недостающие выборы → `pendingChoices`.
3. **Характеристики.** `base + Σ ability add`, ограничить пределом (20 или `ability_cap`), затем применить `set_min` (предметы могут поднимать выше предела).
4. **Модификаторы и бонус мастерства** (по общему уровню).
5. **Владения.** Спасброски — только от первого класса. Доспехи/оружие/инструменты/навыки — от первого класса полностью, от остальных — `multiclassProficiencies`. Плюс раса, предыстория, черты, выборы.
6. **Спасброски, проверки, навыки, пассивные значения, инициатива.**
7. **КД.**
8. **Скорость, размер, чувства, грузоподъёмность.**
9. **Хиты и кости хитов.**
10. **Атаки.**
11. **Заклинательство.**
12. **Ресурсы, переключатели, список умений.**
13. **Переопределения** (`build.overrides`) — последними, с сохранением вычисленного значения в `overridden.computed`.
14. **Проверки** (`issues`).

Каждая стадия — отдельный модуль в `pipeline/` с юнит-тестами.

### 8.5 Характеристики, навыки, спасброски

- Модификатор: `floor((score − 10) / 2)`.
- Бонус мастерства: `2 + floor((LEVEL − 1) / 4)` → 1–4: +2, 5–8: +3, 9–12: +4, 13–16: +5, 17–20: +6.
- Спасбросок: `mod + (PB, если владеет) + Σ bonus save:<ab> + Σ bonus save:*`.
- Навык: `mod(ability навыка) + prof + Σ bonus skill:<id> + Σ bonus check:<ab> + Σ bonus check:*`, где `prof` = `PB` (владение), `2·PB` (компетентность), `floor(PB/2)` или `ceil(PB/2)` (`half_proficiency`, только если нет владения), иначе 0.
- Навыки и характеристики: Атлетика — Сил; Акробатика, Ловкость рук, Скрытность — Лов; Анализ, История, Магия, Природа, Религия — Инт; Внимательность, Выживание, Медицина, Проницательность, Уход за животными — Мдр; Выступление, Запугивание, Обман, Убеждение — Хар.
- Пассивное значение: `10 + навык + 5 (безусловное преимущество) − 5 (безусловная помеха)` (+ `bonus passive:<skill>`, напр. черта «Наблюдательный»).
- Инициатива: `DEX + Σ bonus initiative + half_proficiency (если includeInitiative и нет владения)`.
- `auto_fail` (парализован, оглушён, окаменел, без сознания): спасброски Сил и Лов помечаются «автоматический провал».

### 8.6 КД, скорость, нагрузка

**КД** — максимум из кандидатов, у которых выполнено `requires`:
- без доспеха: `10 + DEX`;
- надетый доспех: лёгкий `base + DEX`; средний `base + min(DEX, dexCap)` (dexCap 2, или из `armor_rule`); тяжёлый `base`; магический бонус доспеха прибавляется;
- все `ac_formula` из эффектов (`no_armor` — нет нательного доспеха; `no_armor_no_shield` — ещё и без щита).

Затем: `+ щит (2 + магический бонус щита)`, если щит надет и формула допускает щит; `+ Σ bonus ac` (с проверкой `when`). Больше одного нательного доспеха или щита — `issue: error`. Доспех без владения — `issue: warning` + помеха на проверки, спасброски и атаки Сил/Лов + пометка «нельзя накладывать заклинания».

**Скорость** (для каждого вида): максимум из `set` (для ходьбы стартовое значение — скорость расы) → `+ Σ add` → `equal_walk` → штрафы:
- тяжёлый доспех при Сил ниже `strRequirement`: −10 фт (если нет `armor_rule.ignoreStrSpeedPenalty`);
- вариант нагрузки (`encumbrance: 'variant'`): вес > `STR_SCORE × 5` — −10 фт; > `STR_SCORE × 10` — −20 фт и помеха на проверки, атаки и спасброски Сил/Лов/Тел;
- истощение 2+: скорость вдвое (округление вниз), 5+: 0;
- `speed op zero` (схвачен, опутан, парализован и т. д.): 0.

**Грузоподъёмность:** `STR_SCORE × 15 × множитель размера`; толкать/тянуть/поднимать — ×2 от этого. Множители: крошечный ×0.5, маленький и средний ×1, большой ×2, огромный ×4, громадный ×8; `carry.sizeSteps` сдвигает размер на N ступеней только для этого расчёта. При `encumbrance: 'basic'` показывается только превышение грузоподъёмности; `'none'` — вес не считается. Вес монет: 50 монет = 1 фунт.

### 8.7 Хиты

- Первый уровень персонажа: максимум кости хитов первого класса.
- Каждый следующий уровень: `average` → `die/2 + 1` (d6 → 4, d8 → 5, d10 → 6, d12 → 7); `roll` → значение броска (1..die); `max` — только для уровня 1 или если мастер разрешил (переопределение).
- `max HP = Σ по уровням (часть от кости + CON)`, каждая часть не меньше 1 (`// RULES-NOTE`, записать в rules-decisions), `+ Σ hp_max`. Изменение Тел пересчитывает хиты за все уровни.
- Истощение 4+: максимум хитов вдвое (округление вниз). Текущие хиты при уменьшении максимума обрезаются до него.
- Кости хитов: по классам, количество = уровень в классе.

### 8.8 Атаки

Строки атак строятся для: каждого надетого оружия, безоружного удара и эффектов `attack`.
- Характеристика: рукопашное — Сил; дальнобойное — Лов; «фехтовальное» — лучшая из Сил/Лов; метательное рукопашное оружие использует ту же характеристику, что и в ближнем бою; `weapon_option.allowAbilities` добавляет варианты (берётся лучший).
- Бросок атаки: `mod + (PB при владении) + магический бонус + Σ bonus attack:melee_weapon|ranged_weapon (с when)`.
- Урон: кость оружия (универсальное — большая кость, если `hand: 'both'` и нет щита/второго оружия) `+ mod + магический бонус + Σ bonus damage:*`. `weapon_option.minDamageDie` заменяет кость, если она больше.
- Второе оружие (`hand: 'off'`, оба «лёгкие»): атака бонусным действием, положительный модификатор к урону не добавляется, если нет `combat_rule twf_ability_mod`.
- Безоружный удар: `1 + STR` дробящего (владение есть у всех); `unarmed_damage` заменяет 1 на кость.
- `attacksPerAction = 1 + max(extra_attack)`; `critMin = min(20, crit_range…)`.
- Заклинания с атакой или спасброском тоже попадают в список атак (вкладка «Бой»), с DC/атакой их класса и уроном из `SpellData.damage` (масштабирование заговоров на 5/11/17 уровне персонажа).

### 8.9 Заклинательство

**Класс считается заклинателем**, если его уровень не ниже уровня получения умения «Использование заклинаний»: жрец, друид, волшебник, бард, чародей, колдун (договор), изобретатель — с 1-го; паладин, следопыт — со 2-го; Мистический рыцарь, Мистический ловкач — с 3-го уровня класса.

**Для каждого класса-заклинателя:** Сл спасброска `8 + PB + mod + Σ bonus spell_dc`; атака `PB + mod + Σ bonus attack:spell`; число заговоров и известных заклинаний — из таблиц класса; подготовленных — `preparedFormula` (минимум 1). Стандартные формулы: жрец, друид — `CLASS_LEVEL + WIS`; волшебник — `CLASS_LEVEL + INT`; паладин — `floor(CLASS_LEVEL/2) + CHA`; изобретатель — `floor(CLASS_LEVEL/2) + INT`. Максимальный круг, который можно выучить/подготовить, определяется уровнем в этом классе так, как если бы он был единственным.

**Ячейки** (обычные, без магии договора):
- Ровно один класс-заклинатель (подкласс с заклинаниями тоже считается): ячейки по его собственной прогрессии, через таблицу ниже по «эффективному уровню»: `full` — уровень класса; `half` (паладин, следопыт) — `ceil(L/2)` при L ≥ 2; `half_up` (изобретатель) — `ceil(L/2)`; `third` (МР, МЛ) — `ceil(L/3)` при L ≥ 3.
- Два и больше класса-заклинателя: уровень заклинателя = `Σ full + Σ floor(half/2) + Σ ceil(half_up/2) + Σ floor(third/3)`, ячейки — по той же таблице.
- `content:validate` сверяет эти расчёты с колонками таблиц классов из импорта и выдаёт предупреждения при расхождении.

| Уровень заклинателя | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2 | | | | | | | | |
| 2 | 3 | | | | | | | | |
| 3 | 4 | 2 | | | | | | | |
| 4 | 4 | 3 | | | | | | | |
| 5 | 4 | 3 | 2 | | | | | | |
| 6 | 4 | 3 | 3 | | | | | | |
| 7 | 4 | 3 | 3 | 1 | | | | | |
| 8 | 4 | 3 | 3 | 2 | | | | | |
| 9 | 4 | 3 | 3 | 3 | 1 | | | | |
| 10 | 4 | 3 | 3 | 3 | 2 | | | | |
| 11 | 4 | 3 | 3 | 3 | 2 | 1 | | | |
| 12 | 4 | 3 | 3 | 3 | 2 | 1 | | | |
| 13 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | | |
| 14 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | | |
| 15 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | |
| 16 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | |
| 17 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | 1 |
| 18 | 4 | 3 | 3 | 3 | 3 | 1 | 1 | 1 | 1 |
| 19 | 4 | 3 | 3 | 3 | 3 | 2 | 1 | 1 | 1 |
| 20 | 4 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 1 |

**Магия договора** (колдун, отдельно от обычных ячеек, восстанавливается на коротком отдыхе):

| Уровень колдуна | Ячеек | Круг ячеек |
| --- | --- | --- |
| 1 | 1 | 1 |
| 2 | 2 | 1 |
| 3–4 | 2 | 2 |
| 5–6 | 2 | 3 |
| 7–8 | 2 | 4 |
| 9–10 | 2 | 5 |
| 11–16 | 3 | 5 |
| 17–20 | 4 | 5 |

Таинственный арканум (11, 13, 15, 17 уровни — заклинания 6–9 круга по 1 разу за долгий отдых) задаётся оверлеем как `spell_grant` с `uses`.

**Прочее:**
- Книга волшебника: 6 заклинаний на 1 уровне + 2 за каждый следующий уровень волшебника бесплатно; дополнительные копируются (подсказка: 50 зм и 2 часа за круг). Ритуалы волшебник может накладывать из книги без подготовки.
- Список доступных заклинаний класса: `SpellData.classes` содержит `spellListKey` класса, плюс `spell_list_extend`, плюс `alwaysPrepared` подкласса (не считаются в лимит подготовки).
- Ограничение школ для МР и МЛ: `schoolRestriction` (ограждение/воплощение и очарование/иллюзия соответственно), кроме «свободных» выборов на указанных уровнях.

### 8.10 Команды игрового состояния

Все изменения `state` — только через `applyCommand`. Сервер принимает команду, применяет, сохраняет. Два человека (игрок и мастер) могут одновременно слать команды без потери данных, потому что команда применяется к актуальному состоянию.

```ts
type StateCommand =
  | { type: 'damage'; amount: number; damageType?: DamageType; critical?: boolean }
  | { type: 'heal'; amount: number }
  | { type: 'set_temp_hp'; amount: number }
  | { type: 'set_hp'; current: number }                        // ручная правка
  | { type: 'death_save'; result: 'success' | 'failure' | 'nat1' | 'nat20' }
  | { type: 'spend_slot'; level: number; pact?: boolean } | { type: 'restore_slot'; level: number; pact?: boolean }
  | { type: 'use_resource'; id: string; amount?: number } | { type: 'restore_resource'; id: string; amount?: number }
  | { type: 'use_grant'; id: string } | { type: 'set_toggle'; id: string; on: boolean }
  | { type: 'add_condition'; condition: ConditionId } | { type: 'remove_condition'; condition: ConditionId }
  | { type: 'set_exhaustion'; level: number }
  | { type: 'concentrate'; spellKey: ContentKey } | { type: 'drop_concentration' }
  | { type: 'short_rest'; hitDice: { die: 6 | 8 | 10 | 12; roll: number }[] }
  | { type: 'long_rest' } | { type: 'new_day' }
  | { type: 'gain_xp'; amount: number } | { type: 'set_currency'; currency: CharacterState['currency'] }
  | { type: 'inventory_add'; item: Omit<InventoryItem, 'id'> } | { type: 'inventory_update'; id: string; patch: Partial<InventoryItem> }
  | { type: 'inventory_remove'; id: string; qty?: number }
  | { type: 'set_prepared'; classKey: ContentKey; spells: ContentKey[] }
  | { type: 'set_inspiration'; value: boolean };
```

Правила команд:
- **Урон:** иммунитет → 0; сопротивление → `floor(amount/2)`; уязвимость → ×2 (если указан тип). Сначала списываются временные хиты. Если хиты падают до 0: остаток урона ≥ максимума хитов → смерть; иначе состояние «без сознания», сброс спасбросков от смерти. Урон при 0 хитов → +1 провал (+2 при `critical`). Если есть концентрация — событие `concentration_check` со Сл `max(10, floor(урон/2))`.
- **Лечение** при 0 хитах: хиты = количество лечения, сброс спасбросков от смерти, снять «без сознания». Хиты не выше максимума.
- **Временные хиты** не складываются: `temp = max(temp, amount)`.
- **Спасброски от смерти:** 3 успеха → стабилен; 3 провала → смерть; `nat20` → 1 хит и в сознании; `nat1` → 2 провала.
- **Переключатель со стоимостью:** при включении списывает ресурс; если ресурса нет — ошибка команды.
- **Короткий отдых:** за каждую потраченную кость: `max(0, roll + CON)` хитов, кость помечается использованной; восстанавливаются ресурсы `reset: 'short'` и ячейки договора.
- **Долгий отдых:** хиты = максимум, временные = 0; вернуть использованные кости хитов в количестве `max(1, floor(всего костей / 2))`, начиная с крупных; все ячейки; ресурсы `short` и `long`; `grantUses`; истощение −1; сброс спасбросков от смерти; снять концентрацию.
- **Новый день** (`new_day`): ресурсы и заряды с `reset: 'dawn'`.
- **Опыт:** после `gain_xp` в `ComputedSheet.xp.canLevelUp` становится `true`, если порог достигнут; уровень повышается только через мастер повышения.

### 8.11 Состояния и истощение

Состояния — встроенные сущности пакета `srd` (`srd/condition/<id>`) с эффектами:

| Состояние | Автоматизируется |
| --- | --- |
| Ослеплённый | помеха на свои атаки; атаки по вам с преимуществом; подсказка: провал проверок, требующих зрения |
| Очарованный, Оглохший | только текст |
| Испуганный | помеха на проверки и атаки (условно: пока источник виден) |
| Схваченный | скорость 0 |
| Недееспособный | текст: нет действий и реакций |
| Невидимый | преимущество на атаки; атаки по вам с помехой |
| Парализованный | недееспособен, скорость 0, автопровал спасбросков Сил и Лов, атаки по вам с преимуществом, крит при попадании в пределах 5 фт |
| Окаменевший | как парализованный + сопротивление всему урону, иммунитет к яду и болезням |
| Отравленный | помеха на атаки и проверки характеристик |
| Сбитый с ног | помеха на атаки; подсказка про атаки по вам |
| Опутанный | скорость 0, помеха на атаки и спасброски Лов, атаки по вам с преимуществом |
| Ошеломлённый | недееспособен, скорость 0, автопровал спасбросков Сил и Лов, атаки по вам с преимуществом |
| Бессознательный | недееспособен, скорость 0, сбит с ног, автопровал спасбросков Сил и Лов, атаки по вам с преимуществом, крит в пределах 5 фт |

Истощение: 1 — помеха на проверки характеристик; 2 — скорость вдвое; 3 — помеха на атаки и спасброски; 4 — максимум хитов вдвое; 5 — скорость 0; 6 — смерть. Эффекты накапливаются.

### 8.12 Таблицы правил 2014 (в `packages/rules-engine/src/tables/`)

**Опыт для уровня:** 1 — 0; 2 — 300; 3 — 900; 4 — 2 700; 5 — 6 500; 6 — 14 000; 7 — 23 000; 8 — 34 000; 9 — 48 000; 10 — 64 000; 11 — 85 000; 12 — 100 000; 13 — 120 000; 14 — 140 000; 15 — 165 000; 16 — 195 000; 17 — 225 000; 18 — 265 000; 19 — 305 000; 20 — 355 000.

**Покупка характеристик:** бюджет 27; стоимость значения 8 — 0, 9 — 1, 10 — 2, 11 — 3, 12 — 4, 13 — 5, 14 — 7, 15 — 9. Значения только 8–15 до расовых бонусов. **Стандартный набор:** 15, 14, 13, 12, 10, 8. **Броски:** 4к6, отбросить наименьший, 6 раз.

**Справочник классов** (используется для проверки импортированных данных, а не вместо них):

| Класс | Кость | Спасброски | Закл. характ. | Прогрессия | Подкласс с уровня | Мультикласс: требование | Мультикласс: владения |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Бард | d8 | Лов, Хар | Хар | full | 3 | Хар 13 | лёгкие доспехи, 1 навык, 1 музыкальный инструмент |
| Варвар | d12 | Сил, Тел | — | — | 3 | Сил 13 | щиты, простое и воинское оружие |
| Воин | d10 | Сил, Тел | (МР: Инт) | (МР: third) | 3 | Сил 13 или Лов 13 | лёгкие и средние доспехи, щиты, простое и воинское оружие |
| Волшебник | d6 | Инт, Мдр | Инт | full | 2 | Инт 13 | — |
| Друид | d8 | Инт, Мдр | Мдр | full | 2 | Мдр 13 | лёгкие и средние доспехи, щиты |
| Жрец | d8 | Мдр, Хар | Мдр | full | 1 | Мдр 13 | лёгкие и средние доспехи, щиты |
| Изобретатель | d8 | Тел, Инт | Инт | half_up | 3 | Инт 13 | лёгкие и средние доспехи, щиты, воровские инструменты, инструменты ремонтника |
| Колдун | d8 | Мдр, Хар | Хар | pact | 1 | Хар 13 | лёгкие доспехи, простое оружие |
| Монах | d8 | Сил, Лов | — | — | 3 | Лов 13 и Мдр 13 | простое оружие, короткие мечи |
| Паладин | d10 | Мдр, Хар | Хар | half | 3 | Сил 13 и Хар 13 | лёгкие и средние доспехи, щиты, простое и воинское оружие |
| Плут | d8 | Лов, Инт | (МЛ: Инт) | (МЛ: third) | 3 | Лов 13 | лёгкие доспехи, 1 навык из списка класса, воровские инструменты |
| Следопыт | d10 | Сил, Лов | Мдр | half | 3 | Лов 13 и Мдр 13 | лёгкие и средние доспехи, щиты, простое и воинское оружие, 1 навык из списка класса |
| Чародей | d6 | Тел, Хар | Хар | full | 1 | Хар 13 | — |

Мультикласс разрешён, только если персонаж удовлетворяет требованию **и нового класса, и каждого из текущих**.

**Повышение характеристик:** все классы — 4, 8, 12, 16, 19; воин дополнительно 6 и 14; плут — 10. Выбор: +2 к одной или +1 к двум характеристикам (не выше предела) либо черта (если `featsAllowed`).

### 8.13 Эталонные персонажи (тесты)

`packages/rules-engine/test/golden/NN-name.input.json` (build + state) и `NN-name.expected.json` (выбранные поля `ComputedSheet`). Ожидаемые значения считаются вручную по правилам, а не копируются из вывода движка; рядом `NN-name.md` с арифметикой. Минимальный набор:

| № | Персонаж | Что проверяет |
| --- | --- | --- |
| 01 | Человек-воин 1, кольчуга, длинный меч + щит, стиль «Оборона» | КД 16+2+1, атаки, спасброски |
| 02 | Холмовой дварф-жрец 1 (Жизнь) | +1 хит/уровень, тяжёлый доспех без штрафа скорости, число подготовленных |
| 03 | Высший эльф-волшебник 1 | заговор расы, книга на 6 заклинаний, «Доспехи мага» как переключатель |
| 04 | Полурослик-плут 3 (Вор) | компетентность, пассивная Внимательность |
| 05 | Варвар 5 (Берсерк) | Защита без доспехов, переключатель ярости, доп. атака, быстрое передвижение |
| 06 | Монах 6 (Открытая ладонь) | КД без щита, кость боевых искусств, ки, скорость без доспеха |
| 07 | Паладин 5 | ячейки 4/2, подготовленные = 2 + Хар |
| 08 | Следопыт 3 | 3 ячейки 1 круга, известные заклинания |
| 09 | Колдун 5 | 2 ячейки договора 3 круга, восстановление на коротком отдыхе |
| 10 | Чародей 3 (Драконья кровь) | КД 13 + Лов, +1 хит/уровень |
| 11 | Бард 3 | «Мастер на все руки» в навыках и инициативе |
| 12 | Изобретатель 1 | 2 ячейки на 1 уровне (half_up) |
| 13 | Воин 7 (Мистический рыцарь) | ячейки 4/2 (third), ограничение школ |
| 14 | Паладин 2 / Чародей 3 | уровень заклинателя 1 + 3 = 4 → 4/3 |
| 15 | Воин 5 / Волшебник 1 | один класс-заклинатель → 2 ячейки; спасброски только от воина |
| 16 | Колдун 3 / Чародей 2 | 3 обычные ячейки + 2 ячейки договора 2 круга |
| 17 | Жрец 1 / Паладин 1 / Следопыт 1 | паладин и следопыт 1 — не заклинатели → 2 ячейки |
| 18 | Воин 20 (Чемпион) | крит на 18–20, «Выдающийся атлет» |
| 19 | Варвар 20 | Сил и Тел до 24 |
| 20 | Волшебник 20 | полная таблица ячеек |
| 21 | Любой персонаж с вариантом нагрузки | штрафы скорости и помехи |
| 22 | Персонаж с истощением 4 | максимум хитов вдвое, скорость вдвое |
| 23 | Персонаж с чертой «Крепкий», затем +Тел на 8 уровне | ретроактивный пересчёт хитов |
| 24 | Чародей с черепашьей бронёй поверх Драконьей устойчивости и «Доспехами мага» | выбор максимальной формулы КД |

Эталоны сначала гоняются на рукописном мини-наборе контента `test/fixtures/content-mini.json` (только нужные расы, классы, предметы с эффектами), чтобы движок не зависел от импорта. После вехи M6 тот же набор эталонов запускается второй раз на реальных пакетах `srd` + `dndsu-official` (ключи сопоставляются через `test/fixtures/key-aliases.json`).

Покрытие `packages/rules-engine` тестами — не ниже 90 % строк.

---

## 9. Конструктор персонажа

Маршрут `/characters/new` → черновик создаётся сразу (`build.status = 'draft'`), каждый шаг автосохраняется.

1. **Раса и подраса.** Карточки с фильтром по источнику; справа — что даёт выбор. Выборы расы (языки, навыки, инструменты, заговор) — сразу на этом шаге.
2. **Класс.** Карточки 13 классов + homebrew из разрешённых пакетов. Выбор навыков класса. Если `startingLevel > 1` — после шага 7 автоматически запускается мастер повышения для уровней 2..N.
3. **Характеристики.** Разрешённые мастером методы; при покупке — счётчик очков; при бросках — встроенный бросок 4к6 (результат пишется в `abilities.rolls` и в лог бросков, видный мастеру) или ручной ввод. Итог показывается с расовыми бонусами.
4. **Предыстория.** Навыки (при пересечении с уже имеющимися — предложить заменить, как по правилам PHB), инструменты, языки, черты характера (выбор из таблиц или свой текст).
5. **Снаряжение.** Стартовые наборы класса (группы «a или b») + снаряжение предыстории, либо стартовое золото (бросок по формуле класса) и покупка из справочника SRD.
6. **Заклинания.** Заговоры и заклинания по правилам класса; для волшебника — 6 заклинаний в книгу; подготовленные — выбираются в листе.
7. **Описание.** Имя (обязательно), мировоззрение, внешность, история, портрет (загрузка ≤ 5 МБ, обрезка до квадрата 512×512, WebP).

Правая колонка на всех шагах — живой предпросмотр листа (`compute` на клиенте). Внизу — список незавершённых выборов со ссылками на шаги. Кнопка «Готово» активна, когда `validateBuild` не возвращает ошибок.

---

## 10. Повышение уровня

- **Когда:** в режиме опыта — когда `xp ≥ порог следующего уровня`; в режиме вех — после команды мастера «Выдать уровень». Кнопка «Повысить уровень» в шапке листа.
- **Шаги мастера повышения:**
  1. Класс: продолжить существующий или взять новый (если `multiclassAllowed` и выполнены требования, см. 8.12). Недоступные варианты показываются серыми с причиной.
  2. Хиты: среднее / бросок в приложении / ввод броска — по `hpMethod` кампании.
  3. Новые умения уровня (карточки) и их выборы.
  4. Подкласс, если это `subclassLevel`.
  5. ASI или черта, если уровень есть в `asiLevels`.
  6. Заклинания: новые заговоры/известные; для классов с «известными» — опция заменить одно известное заклинание; для волшебника — 2 заклинания в книгу.
  7. Итог: сравнение «было → стало» по ключевым числам.
- **Отмена:** «Отменить последнее повышение» удаляет последнюю запись `levels` и выборы, ставшие недействительными (с подтверждением и записью в журнал).
- Выборы с `choose` в виде выражения (воззвания, метамагия, приёмы мастера боевых искусств и т. п.) при росте значения автоматически становятся незавершёнными и попадают в шаг 3.

---

## 11. Заметки

### 11.1 Редактор

TipTap: StarterKit, Placeholder, TaskList/TaskItem, Table, Link, Highlight, Image (загрузка через `/api/files`), плюс собственные расширения:

- **WikiLink** — ввод `[[` открывает подсказку по заголовкам заметок в той же области видимости (кампания или личные). Узел хранит `{ noteId, label }`. Если заметки нет — пункт «Создать заметку «X»» создаёт пустую заметку типа `general` и вставляет ссылку.
- **Mention** — ввод `@` ищет персонажей кампании, заметки и сущности контента (заклинания, предметы, расы, классы…). Узел хранит `{ targetType, targetId, label }`, рендерится чипом; по наведению — карточка-превью.
- **Автосохранение:** дебаунс 1,5 с; `notes.update` с `expectedUpdatedAt`. При конфликте — диалог «Оставить мою версию / Взять их версию / Сохранить мою как копию».
- При сохранении сервер: извлекает `body_text` из JSON; пересобирает `note_links` по узлам WikiLink и Mention; создаёт `note_versions`, если с последней версии прошло ≥ 5 минут.

### 11.2 Типы заметок и их поля (`notes.fields`, zod по типу)

| Тип | Поля |
| --- | --- |
| `general` | — |
| `session` | `sessionNo`, `realDate`, `gameDate`, `participants: characterId[]` |
| `npc` | `status: 'alive' \| 'dead' \| 'unknown'`, `attitude: 'hostile' \| 'neutral' \| 'friendly' \| 'ally'`, `location?: noteId`, `faction?: noteId`, `firstMetSession?` |
| `location` | `region?`, `parent?: noteId` |
| `quest` | `status: 'active' \| 'completed' \| 'failed' \| 'paused'`, `giver?: noteId`, `rewardRu?`, `priority: 1–3` |
| `faction` | `attitude`, `leader?: noteId` |
| `item` | `holder?: characterId`, `foundSession?` |
| `clue` | `reliability: 'confirmed' \| 'doubtful' \| 'false'`, `sourceRu?` |

Ссылки из полей (`location`, `giver` и т. п.) тоже попадают в `note_links`.

### 11.3 Список, фильтры, поиск

- Экран заметок: слева — типы, теги, сохранённые фильтры, закреплённые; в центре — список; справа — открытая заметка.
- Фильтр: `{ types[], tagsAll[], tagsAny[], visibility[], sessionFrom?, sessionTo?, characterId?, authorId?, text?, sort: 'updated' | 'created' | 'title' | 'session' }`, сохраняется в `saved_filters`.
- Полнотекстовый поиск: `websearch_to_tsquery('russian', q)` по `notes.search`, сниппеты через `ts_headline`. Глобальный поиск `Ctrl/Cmd+K`: заметки, персонажи, контент — одним списком по группам.
- Теги: цветные чипы, область — кампания (общие для её заметок) или пользователь (для личных заметок).

### 11.4 Сопоставление

- **Рядом:** `/campaigns/:id/notes/compare?ids=a,b,c` — до 3 заметок в колонках, синхронная прокрутка (переключатель), подсветка общих тегов и общих ссылок.
- **Обратные ссылки:** панель под заметкой — все заметки, которые ссылаются на эту (через WikiLink, Mention или поля), с контекстом-сниппетом.
- **Доска улик:** React Flow; узлы — заметки (перетаскиванием из списка) или свободные подписи; связи с подписью и стилем (сплошная/пунктир); позиции сохраняются с дебаунсом; видимость доски как у заметок.
- **Граф связей:** все заметки кампании и `note_links` (раскладка `elkjs` или `d3-force`), фильтр по типам, клик открывает заметку.
- **Хронология:** заметки, сгруппированные по `sessionNo`, с датами.
- **Канбан квестов:** колонки по `status`, перетаскивание меняет статус.

### 11.5 Версии, корзина, экспорт

- История версий: просмотр, сравнение с текущей (текстовый diff), восстановление.
- Удаление — в корзину (`deleted_at`), через 30 дней — окончательно (ежедневная задача `node-cron` в процессе `web`).
- Экспорт: одна заметка → `.md`; вся кампания → `.zip` с папками по типам; WikiLink → `[[Заголовок]]`, теги → YAML-frontmatter.
- Импорт: `.md` или `.zip` (формат Obsidian): frontmatter `tags` → теги, `[[…]]` → ссылки, разрешаемые по заголовку после импорта всех файлов.

### 11.6 Раздаточные материалы

Мастер в заметке нажимает «Отправить игрокам» → выбирает всех участников или конкретных → `is_handout = true` + `note_shares`. У получателей — раздел «Раздаточные материалы» со счётчиком непрочитанного (`note_shares.read_at`).

### 11.7 Заметки в листе персонажа

Вкладка «Заметки» в листе показывает заметки с `character_id` этого персонажа и кнопку быстрой заметки (тип `general`, видимость `private`).

---

## 12. Экраны и маршруты

| Маршрут | Экран |
| --- | --- |
| `/login`, `/register?invite=CODE`, `/reset/:token` | вход, регистрация по инвайту, сброс пароля |
| `/` | главная: мои персонажи, мои кампании, последние заметки, раздаточные материалы |
| `/characters`, `/characters/new` | список персонажей, конструктор |
| `/characters/:id?tab=` | лист (вкладки: `main`, `combat`, `spells`, `gear`, `features`, `bio`, `notes`) |
| `/characters/:id?mode=play` | игровой режим |
| `/characters/:id/level-up` | мастер повышения |
| `/characters/:id/pdf` | экспорт PDF (route handler) |
| `/campaigns`, `/join/:code` | кампании, вступление по ссылке |
| `/campaigns/:id` | обзор: участники, персонажи, ближайшие квесты |
| `/campaigns/:id/gm` | панель мастера |
| `/campaigns/:id/notes`, `/campaigns/:id/notes/:noteId`, `/campaigns/:id/notes/compare` | заметки |
| `/campaigns/:id/boards/:boardId`, `/campaigns/:id/graph`, `/campaigns/:id/timeline`, `/campaigns/:id/quests` | доска улик, граф, хронология, канбан |
| `/campaigns/:id/settings` | настройки кампании (только мастер) |
| `/notes` | личные заметки вне кампаний |
| `/library`, `/library/:kind/:pack/:slug` | справочник контента |
| `/homebrew`, `/homebrew/new`, `/homebrew/:key/edit` | homebrew |
| `/admin` | инвайты, пользователи, сброс паролей, пакеты контента |
| `/settings` | профиль, пароль, активные сессии |

### 12.1 Лист персонажа

- **Десктоп:** шапка (имя, раса, класс/уровни, опыт, вдохновение), три колонки: характеристики и спасброски / навыки и пассивы / бой и хиты; остальные вкладки ниже.
- **Телефон:** липкая шапка (имя, полоса хитов, КД, инициатива, скорость, бонус мастерства), вкладки горизонтальной лентой.
- Вкладки:
  - **Основное:** характеристики, спасброски, навыки, пассивы, владения, языки, чувства, защиты.
  - **Бой:** атаки, КД с формулой, хиты, кости хитов, спасброски от смерти, состояния, истощение, переключатели, ресурсы.
  - **Заклинания:** трекер ячеек (кружки), Сл и атака по классам, список по кругам с отметками «подготовлено», кнопка «Наложить» (выбор круга ячейки → `spend_slot`, для концентрационных — `concentrate`), фильтр ритуалов.
  - **Снаряжение:** таблица инвентаря (надеть, настроить, количество, вес, контейнер), монеты, итог веса и статус нагрузки.
  - **Умения:** умения по источникам с бейджем автоматизации (полностью / частично / вручную).
  - **Описание** и **Заметки**.
- Каждое число — кнопка: поповер с расшифровкой `Val.parts` и кнопкой «Переопределить» (значение + причина). Переопределённые числа помечены значком.
- Незавершённые выборы — жёлтая плашка вверху со ссылкой на выбор.

### 12.2 Игровой режим

Крупные элементы для телефона: кнопки «Урон» / «Лечение» / «Врем. хиты» с цифровой клавиатурой; ячейки и ресурсы кружками; «Короткий отдых» (диалог выбора костей хитов с вводом бросков или броском в приложении) и «Долгий отдых»; чипы состояний; спасброски от смерти; кнопки бросков навыков и спасбросков (веха M9).

### 12.3 PDF

`@react-pdf/renderer`, собственный макет в духе классического листа (2–3 страницы: основное, заклинания, снаряжение и описание). Обязательно зарегистрировать TTF-шрифт с кириллицей (например, Inter или PT Sans из пакета проекта).

### 12.4 Общие требования к интерфейсу

- Тёмная тема по умолчанию, переключатель в настройках; шрифт Inter (кириллица) через `next/font`.
- Цели касания не меньше 44 px; всё доступно с клавиатуры; уведомления — `sonner`.
- Markdown контента рендерится `react-markdown` + `remark-gfm` + `rehype-sanitize`; сырой HTML не вставляется никогда.
- Все даты — локаль `ru-RU`, часовой пояс пользователя.

---

## 13. Панель мастера

- Таблица персонажей кампании: имя и игрок, класс/уровни, хиты (текущие/макс/временные, полоса), КД, пассивные Внимательность/Проницательность/Анализ, скорость, 6 спасбросков, Сл заклинаний, ячейки (свободно/всего по кругам), состояния, истощение, концентрация, вдохновение, опыт. Сортировка, выбор видимых колонок, данные из `computed_cache` + `state`, опрос 5 с.
- Клик по строке — полный лист с правами редактирования.
- Массовые действия над выбранными: «Опыт каждому», «Опыт поровну» (сумма делится с округлением вниз), «Выдать уровень» (режим вех), «Короткий отдых» (без костей хитов — игроки тратят сами), «Долгий отдых», «Урон/лечение», «Добавить/снять состояние», «Выдать предмет» (поиск по контенту или свой предмет), «Выдать монеты», «Вдохновение». Каждое действие — `characters.bulkCommand`: команды применяются по персонажам в одной транзакции, в журнал пишется автор.
- Вкладка «Журнал»: `character_events` по кампании с фильтрами (персонаж, тип, автор, дата).
- Вкладка «Homebrew на одобрение».

---

## 14. Редактор homebrew

- Статус homebrew-сущности — `content_entities.status` (раздел 4.4); в бандл контента попадают только `approved` (и собственные черновики автора).
- Создание сущности любого вида из раздела 6.2; форма строится по zod-схеме вида; описание — Markdown с предпросмотром.
- Список умений: название, уровень, текст, эффекты.
- **Редактор эффектов:** строки эффектов; выбор `type` меняет форму полей; поля `Expr` проверяются на лету (парсинг + вычисление на тестовом персонаже с показом результата); режим «JSON» (CodeMirror 6, подсветка JSON, валидация zod).
- **Предпросмотр:** выбрать своего персонажа или тестового; показать, как изменится лист («было → стало» по ключевым числам), если применить сущность.
- Сохранение: личный пакет `hb-<uuid>` пользователя или пакет кампании (мастер). Игрок может предложить сущность в кампанию (`proposed`), мастер одобряет или отклоняет с комментарием.
- «Клонировать в homebrew» у любой сущности: копия с теми же текстами и эффектами для правки.
- Админ может скачать эффекты сущности в формате оверлея (раздел 7.6) и закоммитить их в репозиторий.

---

## 15. API (tRPC)

Все процедуры валидируют вход zod-схемой и вызывают гарды из раздела 5.3. Ошибки: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (устаревшая версия), `BAD_REQUEST`; тексты ошибок для пользователя — из `i18n/ru.ts` по коду.

| Роутер | Процедуры |
| --- | --- |
| `auth` | `register`, `login`, `logout`, `me`, `changePassword`, `sessions.list`, `sessions.revoke`, `resetWithToken` |
| `admin` | `invites.create/list/revoke`, `users.list`, `users.createResetLink`, `users.setAdmin`, `packs.list`, `packs.reload` |
| `campaigns` | `list`, `get`, `create`, `update`, `updateSettings`, `archive`, `invites.create/list/revoke`, `join`, `leave`, `members.list`, `members.setRole`, `members.remove` |
| `characters` | `listMine`, `listByCampaign`, `get` (с учётом видимости: `summary` или `full`), `create`, `updateBuild` (`expectedVersion`), `command`, `bulkCommand`, `levelUp`, `undoLevel`, `attach`, `detach`, `archive`, `duplicate`, `events` (курсор) |
| `content` | `search`, `get` (с `text_md`), `list` (вид, фильтры, курсор) |
| `homebrew` | `list`, `get`, `create`, `update`, `submit`, `review`, `delete`, `clone`, `exportOverlay` |
| `notes` | `list` (фильтр, курсор), `get`, `create`, `update` (`expectedUpdatedAt`), `trash`, `restore`, `purge`, `versions.list`, `versions.restore`, `share`, `markRead`, `backlinks`, `search` |
| `tags` | `list`, `create`, `update`, `delete`, `setForNote` |
| `boards` | `list`, `get`, `create`, `update`, `delete`, `nodes.upsert`, `nodes.delete`, `edges.upsert`, `edges.delete` |
| `filters` | `list`, `save`, `delete` |
| `rolls` (M9) | `roll`, `list` |

Обычные route handlers (не tRPC): `GET /api/content/bundle?campaign=<id>` (ContentIndex, ETag, `Cache-Control: private`), `POST /api/files` (загрузка), `GET /api/files/:id` (с проверкой доступа), `GET /characters/:id/pdf`, `GET /api/notes/export`, `POST /api/notes/import`.

Файлы (таблица 4.6): картинки ≤ 5 МБ, png/jpeg/webp, конвертация в WebP через `sharp`; доступ к файлу = доступ к сущности, к которой он прикреплён.

---

## 16. Безопасность, деплой, резервные копии

### 16.1 Переменные окружения

`DATABASE_URL`, `APP_URL` (для проверки Origin и ссылок), `UPLOAD_DIR`, `ADMIN_EMAIL` и `ADMIN_PASSWORD` (только для первичного создания админа), `DOMAIN` (для Caddy), `BACKUP_RETENTION_DAYS` (14), `SENTRY_DSN` (необязательно), `LOG_LEVEL`.

### 16.2 Docker Compose (продакшен)

- `db`: `postgres:16`, том `pgdata`, без публикации порта наружу.
- `web`: multi-stage Dockerfile, Next.js `output: 'standalone'`; entrypoint: миграции drizzle → `content:load` (если изменились версии пакетов) → запуск. Том `uploads`.
- `caddy`: порты 80/443, автоматический HTTPS для `DOMAIN`, прокси на `web:3000`, заголовки безопасности.
- `backup`: ежедневно в 03:30 `pg_dump | gzip` в том `backups`, хранение `BACKUP_RETENTION_DAYS` дней; раз в неделю архив `uploads`. Инструкция восстановления — `docs/restore.md`, проверенная вручную.

Для разработки: `docker-compose.dev.yml` только с `db`, приложение — `pnpm dev`. `pnpm db:seed` создаёт админа, демо-кампанию и двух персонажей.

### 16.3 Безопасность

- Проверка прав — в сервисах, а не только в UI; гарды покрыты тестами по матрице 5.3.
- CSP и заголовки через `next.config` (без `unsafe-eval`); `X-Frame-Options: DENY`.
- Никакого `dangerouslySetInnerHTML` с пользовательским или импортированным HTML.
- Выражения эффектов — только собственный интерпретатор, без `eval`.
- Логи — `pino`, без паролей, токенов и тел заметок.

### 16.4 PWA

`manifest.webmanifest` (название, иконки, тёмная тема), service worker (`serwist`): кэш статики и последних открытых листов для просмотра без сети; мутации без сети запрещены с понятным сообщением.

### 16.5 Производительность

- `compute` для персонажа 20 уровня с мультиклассом — не дольше 10 мс в браузере (бенчмарк в тестах движка).
- Бандл контента: без `text_md`, gzip; описания подгружаются по требованию (`content.get`).
- Первый экран листа на телефоне — Lighthouse Performance ≥ 85.

---

## 17. Вехи и критерии приёмки

### M0. Каркас
Монорепозиторий, Next.js, Tailwind + shadcn/ui, Drizzle + dev-БД в Docker, ESLint/Prettier, Vitest, Playwright, GitHub Actions (lint, typecheck, test), `CLAUDE.md`, `PROGRESS.md`, `docs/rules-decisions.md`.
- [ ] `pnpm dev` открывает стартовую страницу; `pnpm test`, `pnpm lint`, `pnpm typecheck` проходят; CI зелёный.

### M1. Аккаунты и админка
Таблицы 4.1, регистрация по инвайту, вход, выход, сессии, смена пароля, ссылки сброса, админка инвайтов и пользователей, ограничение попыток входа.
- [ ] e2e: админ создаёт инвайт → друг регистрируется → входит → выходит.
- [ ] Без инвайта регистрация невозможна; просроченный или использованный инвайт отклоняется.
- [ ] 11-я неудачная попытка входа за 15 минут блокируется.

### M2. Кампании и права
Таблицы 4.2, создание кампании, приглашения, вступление, роли, форма `CampaignSettings`, гарды 5.3.
- [ ] e2e: мастер создаёт кампанию → игрок вступает по ссылке → видит кампанию в списке.
- [ ] Параметризованные тесты матрицы прав (все строки таблицы 5.3) проходят.

### M3. Движок правил
`content-schema`, вычислитель выражений, стадии расчёта 8.4, таблицы 8.12, команды 8.10, `pendingChoices`, `validateBuild`, `applyLevelUp`, мини-набор контента, эталоны 01–24.
- [ ] Все эталоны проходят; покрытие движка ≥ 90 %; бенчмарк ≤ 10 мс.
- [ ] Пакет движка не импортирует ничего из `apps/`, React, Node-API.

### M4. Пакет SRD и инфраструктура контента
`import:srd`, словарь `srd-ru.json`, таблицы 4.4, `content:validate`, `content:load`, эндпоинт бандла, справочник `/library` (просмотр, поиск, фильтр по виду и источнику).
- [ ] В справочнике есть всё оружие, доспехи и снаряжение SRD с русскими названиями, весом и ценой.
- [ ] Повторный запрос бандла с тем же ETag возвращает 304.

### M5. Импортёр dnd.su
Фикстуры (7.3), crawl, parse со снапшот-тестами, build (автоизвлечение), diff, coverage, загрузка `dndsu-official` и `dndsu-homebrew`.
- [ ] Импортированы все классы, подклассы, расы и подрасы, предыстории, черты, заклинания и магические предметы официального раздела; числа сверены с количеством на страницах-списках, расхождения перечислены в отчёте.
- [ ] Для официальных заклинаний структурированные поля (круг, школа, время, дистанция, компоненты, длительность, концентрация, ритуал, классы) распознаны у 100 % либо каждое исключение перечислено в отчёте.
- [ ] Повторный `crawl` без `--force` не делает сетевых запросов к свежим страницам; ключи сущностей не меняются между запусками.

### M6. Оверлеи базовых механик
Эффекты для всех умений 13 классов (1–20 уровни), подклассов PHB, рас и подрас PHB, черт PHB; эталоны на реальных пакетах.
- [ ] `content-coverage.md` показывает `complete` для перечисленного.
- [ ] Эталоны 01–24 проходят на пакетах `srd` + `dndsu-official`.

### M7. Персонажи: конструктор, лист, повышение, игровой режим
Раздел 4.3, 8.10, 9, 10, 12.1–12.3; журнал изменений; портрет; PDF.
- [ ] e2e: игрок создаёт эльфа-волшебника 1 уровня через конструктор; числа совпадают с эталоном 03.
- [ ] e2e: повышение до 3 уровня, получение урона, короткий отдых с костью хитов, долгий отдых — значения корректны.
- [ ] e2e на мобильном вьюпорте (390×844): игровой режим, урон и лечение, трата ячейки.
- [ ] Одновременные команды игрока и мастера (два клиента) не теряют изменений.
- [ ] PDF открывается, кириллица отображается.

### M8. Заметки
Раздел 11 целиком.
- [ ] e2e: создать заметку НИП, сослаться на неё из заметки сессии через `[[`, увидеть обратную ссылку.
- [ ] Поиск «дракона» находит заметку со словом «дракон».
- [ ] Личная заметка не видна мастеру; заметка «для мастера» не видна другим игрокам (тест API, не только UI).
- [ ] Сравнение 3 заметок, доска улик с сохранением позиций, граф, хронология, канбан квестов работают.
- [ ] Экспорт кампании в zip и обратный импорт восстанавливают заметки, теги и ссылки.

### M9. Панель мастера, homebrew, броски
Разделы 13, 14, 4.7.
- [ ] e2e: мастер выдаёт группе 900 опыта поровну из трёх персонажей → у каждого +300; журнал показывает мастера автором.
- [ ] Homebrew-черта с `bonus initiative +2`, созданная в редакторе без JSON, меняет инициативу персонажа после одобрения.
- [ ] Броски: `1d20+5`, преимущество, помеха; лог с видимостью.

### M10. Деплой и доводка
Раздел 16.
- [ ] `docker compose up -d` на чистом VPS поднимает сайт по HTTPS.
- [ ] Резервная копия создаётся ночью; восстановление по `docs/restore.md` проверено на тестовой машине.
- [ ] PWA устанавливается на телефон; последний открытый лист виден без сети.

---

## 18. Глоссарий (терминология dnd.su)

| id | Русский |
| --- | --- |
| `str` `dex` `con` `int` `wis` `cha` | Сила, Ловкость, Телосложение, Интеллект, Мудрость, Харизма (сокр.: Сил, Лов, Тел, Инт, Мдр, Хар) |
| `acrobatics` | Акробатика |
| `animal_handling` | Уход за животными |
| `arcana` | Магия |
| `athletics` | Атлетика |
| `deception` | Обман |
| `history` | История |
| `insight` | Проницательность |
| `intimidation` | Запугивание |
| `investigation` | Анализ |
| `medicine` | Медицина |
| `nature` | Природа |
| `perception` | Внимательность |
| `performance` | Выступление |
| `persuasion` | Убеждение |
| `religion` | Религия |
| `sleight_of_hand` | Ловкость рук |
| `stealth` | Скрытность |
| `survival` | Выживание |
| классы | Бард, Варвар, Воин, Волшебник, Друид, Жрец, Изобретатель, Колдун, Монах, Паладин, Плут, Следопыт, Чародей |
| состояния | Ослеплённый, Очарованный, Оглохший, Истощение, Испуганный, Схваченный, Недееспособный, Невидимый, Парализованный, Окаменевший, Отравленный, Сбитый с ног, Опутанный, Ошеломлённый, Бессознательный |
| типы урона | Кислота, Дробящий, Холод, Огонь, Силовое поле, Электричество, Некротическая энергия, Колющий, Яд, Психическая энергия, Излучение, Рубящий, Звук |
| школы магии | Ограждение, Вызов, Прорицание, Очарование, Воплощение, Иллюзия, Некромантия, Преобразование |
| размеры | Крошечный, Маленький, Средний, Большой, Огромный, Громадный |
| прочее | Бонус мастерства, Класс доспеха (КД), Хиты, Кость хитов, Спасбросок, Преимущество, Помеха, Концентрация, Ритуал, Ячейка заклинаний, Короткий/Долгий отдых, Настройка, Компетентность, Вдохновение |

Если на dnd.su термин отличается от таблицы — верна терминология dnd.su: исправить глоссарий и словари.
