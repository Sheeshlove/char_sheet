/**
 * `pnpm db:seed` — демо-данные для разработки (SPEC §16.2): администратор, два игрока,
 * демо-кампания и два готовых персонажа 1 уровня. Повторный запуск ничего не дублирует.
 */
import { and, eq } from 'drizzle-orm';
import { DEFAULT_CAMPAIGN_SETTINGS, emptyBuild, type CharacterBuild } from '@ps/content-schema';
import { getDb, getSql, type Db } from './client';
import { campaignMembers, campaigns, characters, contentPacks, users } from './schema';
import { hashPassword } from '../auth/password';
import { loadContentPacks } from '../content/load';
import { createCharacter, engineContextFor, runCommand, updateBuild } from '../services/characters';

const DEMO_CAMPAIGN = 'Затерянный рудник Фанделвера';

type SeedUser = { email: string; username: string; displayName: string; password: string; isAdmin: boolean };

async function ensureUser(db: Db, u: SeedUser): Promise<string> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, u.username));
  if (existing) return existing.id;
  const [row] = await db
    .insert(users)
    .values({ email: u.email, username: u.username, displayName: u.displayName, passwordHash: await hashPassword(u.password), isAdmin: u.isAdmin })
    .returning({ id: users.id });
  return row!.id;
}

function build(name: string, patch: Partial<CharacterBuild>): CharacterBuild {
  const b = emptyBuild(name);
  return {
    ...b,
    ...patch,
    identity: { ...b.identity, ...patch.identity, name },
  };
}

const CLERIC = build('Торин Дубощит', {
  identity: {
    name: '',
    alignment: 'Законно-добрый',
    age: '96',
    personality: {
      traits: 'Цитирую священные тексты по любому поводу.',
      ideals: 'Традиция. Древние обычаи надо хранить.',
      bonds: 'Готов умереть, защищая свой храм.',
      flaws: 'Слишком доверяю храмовой иерархии.',
    },
    backstoryMd: 'Жрец Морадина из горного храма, ушедший искать утраченную кузню своего клана.',
  },
  abilities: { method: 'standard_array', base: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 } },
  race: 'srd/race/dwarf',
  subrace: 'srd/subrace/hill-dwarf',
  background: 'srd/background/acolyte',
  classes: [{ classKey: 'srd/class/cleric', subclassKey: 'srd/subclass/life' }],
  levels: [{ classKey: 'srd/class/cleric', hp: { method: 'max' } }],
  choices: {
    'srd/race/dwarf#tool-proficiency#tool': ['smiths-tools'],
    'srd/class/cleric#proficiencies#skills': ['medicine', 'persuasion'],
    'srd/background/acolyte#proficiencies#languages': ['elvish', 'giant'],
    'equipment:srd/class/cleric#0': ['0'],
    'equipment:srd/class/cleric#1': ['0'],
    'equipment:srd/class/cleric#2': ['0'],
    'equipment:srd/class/cleric#3': ['0'],
    'equipment:srd/class/cleric#4': ['0'],
    'equipment:srd/class/cleric#4:0:0': ['srd/gear/amulet'],
    'equipment:srd/class/cleric#5': ['0'],
  },
  knownSpells: [{ classKey: 'srd/class/cleric', cantrips: ['srd/spell/sacred-flame', 'srd/spell/guidance', 'srd/spell/light'], spells: [] }],
});

const WIZARD = build('Лианна Звездопад', {
  identity: {
    name: '',
    alignment: 'Хаотично-добрая',
    age: '124',
    personality: {
      traits: 'Всегда ношу с собой три пера и чернильницу.',
      ideals: 'Знание. Путь к силе лежит через понимание.',
      bonds: 'Ищу книгу заклинаний своего наставника.',
      flaws: 'Не могу пройти мимо запертой двери.',
    },
  },
  abilities: { method: 'standard_array', base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } },
  race: 'srd/race/elf',
  subrace: 'srd/subrace/high-elf',
  background: 'srd/background/acolyte',
  classes: [{ classKey: 'srd/class/wizard' }],
  levels: [{ classKey: 'srd/class/wizard', hp: { method: 'max' } }],
  choices: {
    'srd/subrace/high-elf#high-elf-cantrip#cantrip': ['srd/spell/minor-illusion'],
    'srd/subrace/high-elf#extra-language#language': ['draconic'],
    'srd/class/wizard#proficiencies#skills': ['arcana', 'history'],
    'srd/background/acolyte#proficiencies#languages': ['dwarvish', 'halfling'],
    'equipment:srd/class/wizard#0': ['0'],
    'equipment:srd/class/wizard#1': ['0'],
    'equipment:srd/class/wizard#2': ['0'],
    'equipment:srd/class/wizard#3': ['0'],
  },
  knownSpells: [
    {
      classKey: 'srd/class/wizard',
      cantrips: ['srd/spell/fire-bolt', 'srd/spell/light', 'srd/spell/mage-hand'],
      spells: [],
      spellbook: [
        'srd/spell/mage-armor',
        'srd/spell/magic-missile',
        'srd/spell/shield',
        'srd/spell/burning-hands',
        'srd/spell/sleep',
        'srd/spell/detect-magic',
      ],
    },
  ],
});

async function seedCharacter(db: Db, ownerId: string, campaignId: string, b: CharacterBuild, prepared: { classKey: string; spells: string[] }) {
  const [existing] = await db
    .select({ id: characters.id, build: characters.build })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.name, b.identity.name)));
  if (existing && (existing.build as { status?: string }).status === 'ready') return { id: existing.id, created: false };
  // Незавершённый демо-персонаж (прерванный запуск) пересоздаётся.
  if (existing) await db.delete(characters).where(eq(characters.id, existing.id));
  const row = await createCharacter(db, ownerId, { name: b.identity.name, campaignId });
  const ctx = await engineContextFor(db, row);
  // Только существующие группы снаряжения: у классов SRD их разное число.
  const groups = ctx.content.getOf(b.classes[0]!.classKey, 'class')?.data.startingEquipment.length ?? 0;
  const choices = Object.fromEntries(
    Object.entries(b.choices).filter(([k]) => !k.startsWith('equipment:') || Number(k.split('#').at(-1)) < groups),
  );
  const { row: ready } = await updateBuild(db, ownerId, row, { ...b, choices, status: 'ready' }, row.version);
  // Надеть доспех, щит и первое оружие; подготовить заклинания.
  const state = ready.state as { inventory: { id: string; key?: string }[] };
  let weaponDone = false;
  for (const it of state.inventory) {
    const kind = it.key ? ctx.content.get(it.key)?.kind : undefined;
    if (kind === 'armor' || (kind === 'weapon' && !weaponDone)) {
      if (kind === 'weapon') weaponDone = true;
      await runCommand(db, ownerId, row.id, {
        type: 'inventory_update',
        id: it.id,
        patch: { equipped: true, ...(kind === 'weapon' ? { hand: 'main' as const } : {}) },
      });
    }
  }
  await runCommand(db, ownerId, row.id, { type: 'set_prepared', classKey: prepared.classKey, spells: prepared.spells });
  return { id: row.id, created: true };
}

export async function seed() {
  const db = getDb();
  const [pack] = await db.select({ key: contentPacks.key }).from(contentPacks).limit(1);
  if (!pack) await loadContentPacks(db, {});

  const adminPassword = process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 10 ? process.env.ADMIN_PASSWORD : 'admin-password';
  const adminId = await ensureUser(db, {
    email: (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase(),
    username: 'admin',
    displayName: 'Мастер',
    password: adminPassword,
    isAdmin: true,
  });
  const p1 = await ensureUser(db, { email: 'player1@example.com', username: 'player1', displayName: 'Игрок 1', password: 'player-password-1', isAdmin: false });
  const p2 = await ensureUser(db, { email: 'player2@example.com', username: 'player2', displayName: 'Игрок 2', password: 'player-password-2', isAdmin: false });

  let [camp] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.name, DEMO_CAMPAIGN));
  if (!camp) {
    [camp] = await db
      .insert(campaigns)
      .values({
        name: DEMO_CAMPAIGN,
        description: 'Демо-кампания: гоблины, заброшенный рудник и таинственный Чёрный Паук.',
        ownerId: adminId,
        settings: DEFAULT_CAMPAIGN_SETTINGS,
      })
      .returning({ id: campaigns.id });
    await db.insert(campaignMembers).values([
      { campaignId: camp!.id, userId: adminId, role: 'gm' },
      { campaignId: camp!.id, userId: p1, role: 'player' },
      { campaignId: camp!.id, userId: p2, role: 'player' },
    ]);
  }
  const c1 = await seedCharacter(db, p1, camp!.id, CLERIC, {
    classKey: 'srd/class/cleric',
    spells: ['srd/spell/healing-word', 'srd/spell/shield-of-faith', 'srd/spell/guiding-bolt'],
  });
  const c2 = await seedCharacter(db, p2, camp!.id, WIZARD, {
    classKey: 'srd/class/wizard',
    spells: ['srd/spell/mage-armor', 'srd/spell/magic-missile', 'srd/spell/shield', 'srd/spell/sleep'],
  });
  return { adminPassword, campaignId: camp!.id, characters: [c1, c2] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(async (r) => {
      console.log('Демо-данные готовы.');
      console.log(`  admin / ${r.adminPassword} (мастер), player1 / player-password-1, player2 / player-password-2`);
      console.log(`  Кампания: /campaigns/${r.campaignId}`);
      for (const c of r.characters) console.log(`  Персонаж: /characters/${c.id}${c.created ? '' : ' (уже был)'}`);
      await getSql().end();
    })
    .catch(async (e) => {
      console.error(e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : e);
      await getSql().end();
      process.exit(1);
    });
}
