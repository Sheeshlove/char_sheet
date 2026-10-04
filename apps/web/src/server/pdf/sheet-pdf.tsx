import { join } from 'node:path';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { ABILITIES, SKILLS, type CharacterBuild, type CharacterState } from '@ps/content-schema';
import {
  ABILITY_LABEL_RU,
  ABILITY_SHORT_RU,
  DAMAGE_TYPE_LABEL_RU,
  SKILL_LABEL_RU,
  type ComputedSheet,
  type ContentIndex,
} from '@ps/rules-engine';
import { ru } from '@/i18n/ru';
import { formatDamage } from '@/lib/format';

const P = ru.pdf;

let fontsReady = false;
/** TTF с кириллицей (PT Sans, OFL) из пакета проекта (SPEC §12.3). */
function registerFonts() {
  if (fontsReady) return;
  const dir = process.env.PDF_FONT_DIR ?? join(process.cwd(), 'assets', 'fonts');
  Font.register({
    family: 'PT Sans',
    fonts: [
      { src: join(dir, 'PTSans-Regular.ttf') },
      { src: join(dir, 'PTSans-Bold.ttf'), fontWeight: 'bold' },
      { src: join(dir, 'PTSans-Italic.ttf'), fontStyle: 'italic' },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

const s = StyleSheet.create({
  page: { fontFamily: 'PT Sans', fontSize: 9, padding: 28, color: '#1f1b16' },
  h1: { fontSize: 18, fontWeight: 'bold' },
  h2: { fontSize: 11, fontWeight: 'bold', marginTop: 8, marginBottom: 4, borderBottom: '1pt solid #b8860b', paddingBottom: 2 },
  sub: { color: '#5c5247', marginTop: 2 },
  row: { flexDirection: 'row', gap: 6 },
  col: { flexDirection: 'column', gap: 2 },
  box: { border: '1pt solid #8b7355', borderRadius: 4, padding: 4, alignItems: 'center', minWidth: 52 },
  boxLabel: { fontSize: 7, color: '#5c5247' },
  boxValue: { fontSize: 14, fontWeight: 'bold' },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1, borderBottom: '0.5pt solid #e4dccf' },
  muted: { color: '#5c5247' },
  small: { fontSize: 8 },
  table: { borderTop: '0.5pt solid #8b7355' },
  th: { fontWeight: 'bold', fontSize: 8 },
  footer: { position: 'absolute', bottom: 14, left: 28, right: 28, fontSize: 7, color: '#8b7355', textAlign: 'center' },
});

const sg = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Markdown → простой текст для PDF (без разметки). */
function plain(md: string | undefined): string {
  return (md ?? '')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** Отметка владения рисуется фигурой: в PT Sans нет символов кругов. */
function Mark({ level }: { level: 'none' | 'half' | 'proficient' | 'expertise' }) {
  const fill = level === 'none' ? undefined : level === 'half' ? '#d8c3a0' : '#8b5a2b';
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        border: `${level === 'expertise' ? 1.6 : 0.8}pt solid #8b5a2b`,
        backgroundColor: fill,
        marginRight: 3,
        marginTop: 2,
      }}
    />
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <Text style={s.boxValue}>{String(value)}</Text>
    </View>
  );
}

function Footer({ name }: { name: string }) {
  return (
    <Text
      style={s.footer}
      fixed
      render={({ pageNumber, totalPages }) => `${name} · Party Sheet · ${P.page(pageNumber, totalPages)}`}
    />
  );
}

type Props = { sheet: ComputedSheet; build: CharacterBuild; state: CharacterState; content: ContentIndex };

function SheetDocument({ sheet, build, state, content }: Props) {
  const id = build.identity;
  const name = sheet.identity.name || id.name;
  const sc = sheet.spellcasting;
  const hasSpells = sc.classes.length > 0 || sc.grants.length > 0;
  return (
    <Document title={name} author="Party Sheet" language="ru">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{name}</Text>
        <Text style={s.sub}>
          {[sheet.identity.raceLabelRu, sheet.identity.classLabelRu, sheet.identity.backgroundLabelRu].filter(Boolean).join(' · ')}
          {id.alignment ? ` · ${id.alignment}` : ''}
        </Text>
        <Text style={s.sub}>
          {P.level(sheet.level.total)} · {P.xp}: {sheet.xp.current}
          {sheet.xp.nextLevelAt !== null ? ` / ${sheet.xp.nextLevelAt}` : ''}
        </Text>

        <View style={[s.row, { marginTop: 8, flexWrap: 'wrap' }]}>
          <Box label={P.ac} value={sheet.ac.value} />
          <Box label={P.initiative} value={sg(sheet.initiative.value)} />
          <Box label={P.speed} value={sheet.speed.walk?.value ?? 0} />
          <Box label={P.pb} value={sg(sheet.pb.value)} />
          <Box label={P.hpMax} value={sheet.hp.max.value} />
          <Box label={P.hpCurrent} value={`${sheet.hp.current}${sheet.hp.temp ? ` +${sheet.hp.temp}` : ''}`} />
          <Box label={P.hitDice} value={sheet.hitDice.map((h) => `${h.total}к${h.die}`).join(' ')} />
        </View>

        <View style={[s.row, { marginTop: 8 }]}>
          <View style={[s.col, { width: '32%' }]}>
            <Text style={s.h2}>{P.abilities}</Text>
            {ABILITIES.map((a) => (
              <View key={a} style={s.line}>
                <Text>
                  {ABILITY_LABEL_RU[a]} {sheet.abilities[a].score.value}
                </Text>
                <Text style={{ fontWeight: 'bold' }}>{sg(sheet.abilities[a].mod)}</Text>
              </View>
            ))}
            <Text style={s.h2}>{P.saves}</Text>
            {ABILITIES.map((a) => (
              <View key={a} style={s.line}>
                <View style={{ flexDirection: 'row' }}>
                  <Mark level={sheet.abilities[a].saveProficient ? 'proficient' : 'none'} />
                  <Text>{ABILITY_LABEL_RU[a]}</Text>
                </View>
                <Text>{sg(sheet.abilities[a].save.value)}</Text>
              </View>
            ))}
            <Text style={s.h2}>{P.passives}</Text>
            <View style={s.line}>
              <Text>{ru.sheet.passives.perception}</Text>
              <Text>{sheet.passives.perception.value}</Text>
            </View>
            <View style={s.line}>
              <Text>{ru.sheet.passives.insight}</Text>
              <Text>{sheet.passives.insight.value}</Text>
            </View>
            <View style={s.line}>
              <Text>{ru.sheet.passives.investigation}</Text>
              <Text>{sheet.passives.investigation.value}</Text>
            </View>
          </View>
          <View style={[s.col, { width: '32%' }]}>
            <Text style={s.h2}>{P.skills}</Text>
            {SKILLS.map((k) => {
              const sk = sheet.skills[k];
              return (
                <View key={k} style={s.line}>
                  <View style={{ flexDirection: 'row' }}>
                    <Mark level={sk.prof} />
                    <Text>
                      {SKILL_LABEL_RU[k]} <Text style={s.muted}>({ABILITY_SHORT_RU[sk.ability]})</Text>
                    </Text>
                  </View>
                  <Text>{sg(sk.value.value)}</Text>
                </View>
              );
            })}
          </View>
          <View style={[s.col, { width: '36%' }]}>
            <Text style={s.h2}>{P.attacks}</Text>
            {sheet.attacks.map((a) => (
              <View key={a.id} style={s.line} wrap={false}>
                <Text style={{ width: '45%' }}>{a.nameRu}</Text>
                <Text style={{ width: '15%' }}>{a.toHit ? sg(a.toHit.value) : a.saveDc ? `${P.dc} ${a.saveDc.value}` : ''}</Text>
                <Text style={{ width: '40%', textAlign: 'right' }}>
                  {a.damage.map((d) => formatDamage(d, DAMAGE_TYPE_LABEL_RU)).join(', ')}
                </Text>
              </View>
            ))}
            <Text style={s.h2}>{P.proficiencies}</Text>
            <Text style={s.small}>
              <Text style={s.muted}>{ru.sheet.armor}: </Text>
              {sheet.proficiencies.armor.join(', ') || '—'}
            </Text>
            <Text style={s.small}>
              <Text style={s.muted}>{ru.sheet.weapons}: </Text>
              {sheet.proficiencies.weapons.join(', ') || '—'}
            </Text>
            <Text style={s.small}>
              <Text style={s.muted}>{ru.sheet.tools}: </Text>
              {sheet.proficiencies.tools.join(', ') || '—'}
            </Text>
            <Text style={s.small}>
              <Text style={s.muted}>{ru.sheet.languages}: </Text>
              {sheet.proficiencies.languages.join(', ') || '—'}
            </Text>
            {sheet.resources.length > 0 && <Text style={s.h2}>{P.resources}</Text>}
            {sheet.resources.map((r) => (
              <View key={r.id} style={s.line}>
                <Text>{r.nameRu}</Text>
                <Text>
                  {r.max - r.used}/{r.max}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.h2}>{P.features}</Text>
        {sheet.features.map((src) => (
          <Text key={src.sourceKey} style={[s.small, { marginBottom: 2 }]}>
            <Text style={{ fontWeight: 'bold' }}>{src.sourceLabelRu}: </Text>
            {src.features.map((f) => f.nameRu).join(', ')}
          </Text>
        ))}
        <Footer name={name} />
      </Page>

      {hasSpells && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>{P.spells}</Text>
          {sc.classes.map((c) => (
            <View key={c.classKey} style={{ marginTop: 6 }}>
              <Text style={s.h2}>
                {c.nameRu}: {P.dc} {c.dc.value}, {P.spellAttack} {sg(c.attack.value)}
              </Text>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                .filter((l) => c.spells.some((sp) => sp.level === l))
                .map((l) => (
                  <Text key={l} style={{ marginBottom: 2 }}>
                    <Text style={{ fontWeight: 'bold' }}>{l === 0 ? P.cantrips : P.spellLevel(l)}: </Text>
                    {c.spells
                      .filter((sp) => sp.level === l)
                      .map((sp) => `${sp.prepared && l > 0 ? '• ' : ''}${sp.nameRu}${sp.ritual ? ` (${P.ritual})` : ''}`)
                      .join(', ')}
                  </Text>
                ))}
            </View>
          ))}
          <Text style={s.h2}>{P.slots}</Text>
          <Text>
            {sc.slots
              .filter((x) => x.max > 0)
              .map((x) => `${P.spellLevel(x.level)}: ${x.max - x.used}/${x.max}`)
              .join(' · ') || '—'}
            {sc.pact ? ` · ${P.pact(sc.pact.level)}: ${sc.pact.max - sc.pact.used}/${sc.pact.max}` : ''}
          </Text>
          {sc.grants.length > 0 && (
            <>
              <Text style={s.h2}>{P.grants}</Text>
              {sc.grants.map((g) => (
                <Text key={g.id}>
                  {g.nameRu} <Text style={s.muted}>({g.sourceLabelRu})</Text>
                </Text>
              ))}
            </>
          )}
          <Footer name={name} />
        </Page>
      )}

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{P.gearAndBio}</Text>
        <Text style={s.h2}>{P.inventory}</Text>
        {state.inventory.length === 0 && <Text style={s.muted}>—</Text>}
        {state.inventory.map((it) => (
          <View key={it.id} style={s.line} wrap={false}>
            <Text>
              {it.equipped ? '• ' : ''}
              {it.customName ?? (it.key ? content.get(it.key)?.nameRu : undefined) ?? it.key ?? '?'}
              {it.attuned ? ` (${P.attuned})` : ''}
            </Text>
            <Text>×{it.qty}</Text>
          </View>
        ))}
        <Text style={{ marginTop: 4 }}>
          {P.coins}: {state.currency.pp} {ru.sheet.coins.pp}, {state.currency.gp} {ru.sheet.coins.gp}, {state.currency.ep} {ru.sheet.coins.ep},{' '}
          {state.currency.sp} {ru.sheet.coins.sp}, {state.currency.cp} {ru.sheet.coins.cp}
        </Text>
        <Text style={s.muted}>
          {P.carrying}: {sheet.carrying.weightLb} / {sheet.carrying.capacityLb} {ru.library.lb}
        </Text>

        <Text style={s.h2}>{P.personality}</Text>
        {(['traits', 'ideals', 'bonds', 'flaws'] as const).map((k) =>
          id.personality[k] ? (
            <Text key={k} style={{ marginBottom: 2 }}>
              <Text style={{ fontWeight: 'bold' }}>{ru.builder.background[k]}: </Text>
              {id.personality[k]}
            </Text>
          ) : null,
        )}
        {id.appearanceMd && (
          <>
            <Text style={s.h2}>{ru.sheet.appearance}</Text>
            <Text>{plain(id.appearanceMd)}</Text>
          </>
        )}
        {id.backstoryMd && (
          <>
            <Text style={s.h2}>{ru.sheet.backstory}</Text>
            <Text>{plain(id.backstoryMd)}</Text>
          </>
        )}
        <Footer name={name} />
      </Page>
    </Document>
  );
}

export async function renderSheetPdf(props: Props): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SheetDocument {...props} />);
}
