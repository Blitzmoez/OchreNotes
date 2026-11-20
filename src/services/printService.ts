import { parseMarkdownToHtml } from './markdownParser';
import { WikiArticle, MealCycle, Recipe, MealCalendarOverride, ProjectItem, ProjectTask } from '../types';
import { getScaledIngredientDisplay } from './portionScaling';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function triggerIframePrint(htmlDoc: string, waitForImages = false) {
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(htmlDoc);
  doc.close();

  const doPrint = () => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (e) {
      console.error('Print iframe error:', e);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 2500);
    }
  };

  if (waitForImages) {
    const imgs = Array.from(doc.querySelectorAll('img'));
    if (imgs.length > 0) {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          setTimeout(doPrint, 150);
        }
      };
      Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
        )
      ).then(finish);
      setTimeout(finish, 2000);
      return;
    }
  }

  setTimeout(doPrint, 300);
}

const BASE_PRINT_STYLES = (accentColor: string) => `
  @page {
    size: A4 portrait;
    margin: 18mm 15mm 18mm 15mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1a1a1a;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
  .meta-bar {
    font-size: 8.5pt;
    color: #666;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #eceae2;
    letter-spacing: 0.01em;
  }
  h1 {
    font-size: 20pt;
    line-height: 1.2;
    color: ${accentColor};
    border-bottom: 2px solid ${accentColor};
    padding-bottom: 8px;
    margin: 0 0 12px 0;
  }
  h2 {
    font-size: 13pt;
    color: #222;
    margin: 18px 0 8px 0;
    border-bottom: 1px solid #e0ded7;
    padding-bottom: 4px;
    break-after: avoid;
  }
  h3 {
    font-size: 11pt;
    color: #333;
    margin: 12px 0 4px 0;
    break-after: avoid;
  }
  p { margin: 6px 0; }
  img { max-width: 100%; }
  pre, code {
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #f5f4ef;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 9pt;
    color: #222;
  }
  pre {
    padding: 10px 12px;
    border: 1px solid #e5e3dc;
    white-space: pre-wrap;
    word-break: break-word;
    break-inside: avoid;
    margin: 6px 0 12px 0;
  }
  blockquote {
    border-left: 3px solid ${accentColor};
    margin: 10px 0;
    padding: 6px 12px;
    background: #fdfaf6;
    color: #555;
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 9.5pt;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f4f3ef;
    font-weight: 700;
  }
  tr {
    break-inside: avoid;
  }
  ul, ol {
    padding-left: 20px;
    margin: 6px 0;
  }
  li { margin: 3px 0; }
  .task-box {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid #666;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: middle;
    text-align: center;
    line-height: 10px;
    font-size: 8px;
  }
  .task-checked {
    background-color: ${accentColor};
    border-color: ${accentColor};
    color: white;
  }
  a { color: ${accentColor}; text-decoration: underline; }
  hr { border: 0; border-top: 1px solid #e5e3dc; margin: 16px 0; }
`;

export function printNoteA4(title: string, markdownContent: string, accentColor = '#C87D20') {
  const htmlContent = parseMarkdownToHtml(markdownContent);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  triggerIframePrint(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>${escapeHtml(title || 'Notiz')}</title>
        <style>${BASE_PRINT_STYLES(accentColor)}</style>
      </head>
      <body>
        <h1>${escapeHtml(title || 'Notiz')}</h1>
        <div class="content">${htmlContent}</div>
      </body>
    </html>
  `);
}

export function printWikiArticleA4(article: WikiArticle, accentColor = '#B87333') {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const updatedStr = article.updatedAt
    ? new Date(article.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const tagsHtml = article.tags?.length ? ` · Tags: ${article.tags.map((t) => `#${escapeHtml(t)}`).join(', ')}` : '';

  const renderTextHtml = (markdown: string) => {
    const withWikilinks = (markdown || '').replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => `<strong>${label || target}</strong>`
    );
    return parseMarkdownToHtml(withWikilinks);
  };

  let orderedBlocksHtml = '';
  if (Array.isArray(article.blocks) && article.blocks.length > 0) {
    orderedBlocksHtml = article.blocks
      .map((blk) => {
        if (blk.type === 'text') {
          const titleHtml = blk.title ? `<h2>${escapeHtml(blk.title)}</h2>` : '';
          return `<div class="content">${titleHtml}${renderTextHtml(blk.content || '')}</div>`;
        }
        if (blk.type === 'media' && blk.mediaUrl) {
          const titleHtml = blk.title ? `<h3>${escapeHtml(blk.title)}</h3>` : '';
          const isVideo =
            blk.mediaKind === 'video' ||
            /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(blk.mediaUrl.split('?')[0]) ||
            /youtube\.com|youtu\.be|vimeo\.com/i.test(blk.mediaUrl);
          if (isVideo) {
            return `
              <div class="wiki-video-print">
                ${titleHtml}
                <div class="video-badge">VIDEO-BAUSTEIN</div>
                <div class="video-title">${escapeHtml(blk.alt || blk.title || 'Verknüpftes Video')}</div>
                ${blk.caption ? `<div class="video-caption">${escapeHtml(blk.caption)}</div>` : ''}
                <div class="video-url">${escapeHtml(blk.mediaUrl)}</div>
              </div>
            `;
          }
          return `
            <figure class="wiki-figure wiki-figure-block">
              ${titleHtml}
              <img src="${escapeHtml(blk.mediaUrl)}" alt="${escapeHtml(blk.alt || article.title)}" />
              ${blk.caption || blk.alt ? `<figcaption>${escapeHtml(blk.caption || blk.alt || '')}</figcaption>` : ''}
            </figure>
          `;
        }
        if (blk.type === 'code') {
          return `
            <div class="wiki-snippet">
              <div class="wiki-snippet-header">
                <span>${escapeHtml(blk.title || 'Code-Block')}</span>
                <span class="lang">${escapeHtml(blk.language || 'bash')}</span>
              </div>
              <pre><code>${escapeHtml(blk.content || '')}</code></pre>
            </div>
          `;
        }
        return '';
      })
      .join('\n');
  } else {
    const bodyHtml = renderTextHtml(article.body || '');
    const imagesHtml =
      article.images && article.images.length > 0
        ? `
        <h2>Fotos &amp; Abbildungen</h2>
        <div class="wiki-images">
          ${article.images
            .map(
              (img) => `
            <figure class="wiki-figure">
              <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.alt || article.title)}" />
              ${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : ''}
            </figure>
          `
            )
            .join('')}
        </div>
      `
        : '';

    const snippetsHtml =
      article.snippets && article.snippets.length > 0
        ? `
        <h2>Code-Ablage</h2>
        ${article.snippets
          .map(
            (snip) => `
          <div class="wiki-snippet">
            <div class="wiki-snippet-header">
              <span>${escapeHtml(snip.title || 'Code-Snippet')}</span>
              <span class="lang">${escapeHtml(snip.language || 'text')}</span>
            </div>
            <pre><code>${escapeHtml(snip.code || '')}</code></pre>
          </div>
        `
          )
          .join('')}
      `
        : '';
    orderedBlocksHtml = `<div class="content">${bodyHtml}</div>${imagesHtml}${snippetsHtml}`;
  }

  triggerIframePrint(
    `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>${escapeHtml(article.title)} - Wiki A4</title>
        <style>
          ${BASE_PRINT_STYLES(accentColor)}
          .meta-bar {
            font-size: 9pt;
            color: #666;
            margin-bottom: 14px;
          }
          .wiki-images {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 8px;
          }
          .wiki-figure {
            margin: 10px 0;
            border: 1px solid #e5e3dc;
            border-radius: 6px;
            padding: 8px;
            background: #faf9f5;
            break-inside: avoid;
            text-align: center;
          }
          .wiki-figure img,
          .content img {
            max-width: 100%;
            max-height: 105mm;
            object-fit: contain;
            display: block;
            margin: 0 auto;
          }
          .wiki-figure figcaption {
            font-size: 8.5pt;
            color: #555;
            margin-top: 5px;
          }
          .wiki-video-print {
            margin: 10px 0;
            border: 1px dashed ${accentColor};
            border-radius: 6px;
            padding: 8px 12px;
            background: #fdfaf5;
            break-inside: avoid;
          }
          .video-badge {
            font-size: 7.5pt;
            font-weight: 800;
            color: ${accentColor};
            letter-spacing: 0.05em;
          }
          .video-title {
            font-weight: 700;
            font-size: 10pt;
            margin-top: 2px;
          }
          .video-caption {
            font-size: 9pt;
            color: #444;
            margin-top: 2px;
          }
          .video-url {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8pt;
            color: #666;
            word-break: break-all;
            margin-top: 3px;
          }
          .wiki-snippet {
            margin: 10px 0;
            break-inside: avoid;
          }
          .wiki-snippet-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f4f3ef;
            border: 1px solid #e5e3dc;
            border-bottom: 0;
            padding: 4px 10px;
            font-size: 9pt;
            font-weight: 700;
            border-radius: 6px 6px 0 0;
          }
          .wiki-snippet-header .lang {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8pt;
            text-transform: uppercase;
            color: ${accentColor};
          }
          .wiki-snippet pre {
            margin: 0;
            border-radius: 0 0 6px 6px;
          }
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Wiki · Kategorie: <strong>${escapeHtml(article.category || 'Allgemein')}</strong>${updatedStr ? ` · Stand: ${escapeHtml(updatedStr)}` : ''}${tagsHtml}
        </div>
        <h1>${escapeHtml(article.title)}</h1>
        ${orderedBlocksHtml}
      </body>
    </html>
  `,
    true
  );
}

export function printMealPlanA4(params: {
  cycle: MealCycle;
  recipes: Recipe[];
  overrides: Record<string, MealCalendarOverride>;
  weekOffset: number;
  ownerName?: string;
  accentColor?: string;
}) {
  const { cycle, recipes, overrides, weekOffset, ownerName, accentColor = '#C26D2D' } = params;
  const base = new Date();
  base.setDate(base.getDate() + weekOffset * 7);
  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.setDate(diff));

  const getRecipeById = (id: string) => recipes.find((r) => r.id === id);

  const days: Array<{
    date: string;
    weekday: string;
    dayMonth: string;
    cycleDayIndex: number;
    isOverridden: boolean;
    portions: number;
    dishes: Recipe[];
  }> = [];

  const uniqueWeekRecipes = new Map<string, { recipe: Recipe; portions: number }>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];

    const start = new Date(cycle.startDate);
    const diffTime = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const cycleIndex = ((diffTime % cycle.cycleLengthDays) + cycle.cycleLengthDays) % cycle.cycleLengthDays;
    const cycleDay = cycle.days.find((cd) => cd.dayIndex === cycleIndex);

    const isOverridden = !!overrides[iso];
    const activeRecipeIds = isOverridden ? overrides[iso].recipeIds : cycleDay?.recipeIds || [];
    const dayPortions =
      (isOverridden ? overrides[iso]?.portions : undefined) ??
      cycleDay?.portions ??
      cycle.defaultPortions ??
      2;
    const dishes = activeRecipeIds.map(getRecipeById).filter((r): r is Recipe => Boolean(r));
    dishes.forEach((r) => {
      if (!uniqueWeekRecipes.has(r.id)) {
        uniqueWeekRecipes.set(r.id, { recipe: r, portions: dayPortions || r.portions || 2 });
      }
    });

    days.push({
      date: iso,
      weekday: d.toLocaleDateString('de-DE', { weekday: 'long' }),
      dayMonth: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      cycleDayIndex: cycleIndex,
      isOverridden,
      portions: dayPortions,
      dishes,
    });
  }

  const rangeStr = `${days[0].dayMonth} – ${days[6].dayMonth}`;

  const tableRowsHtml = days
    .map(
      (d) => `
      <tr>
        <td style="width: 24%;">
          <strong>${escapeHtml(d.weekday)}</strong><br/>
          <span style="font-size: 8.5pt; color: #666;">${escapeHtml(d.dayMonth)}</span><br/>
          <span style="font-size: 8pt; color: ${d.isOverridden ? accentColor : '#777'};">
            ${d.isOverridden ? 'Einmalig geändert' : `Zyklus-Tag ${d.cycleDayIndex + 1}`} · ${d.portions} Port.
          </span>
        </td>
        <td>
          ${
            d.dishes.length === 0
              ? '<span style="color:#888; font-style:italic;">Kein Gericht eingetragen</span>'
              : d.dishes
                  .map(
                    (r) => `
                  <div style="margin-bottom: 4px;">
                    <strong>${escapeHtml(r.title)}</strong>
                    <span style="font-size: 8.5pt; color: #666;"> · ${escapeHtml(r.category)} · ${r.prepTimeMinutes} Min · ${d.portions} Port.</span>
                  </div>
                `
                  )
                  .join('')
          }
        </td>
      </tr>
    `
    )
    .join('');

  const recipeDetailsHtml =
    uniqueWeekRecipes.size > 0
      ? `
      <h2>Benötigte Zutaten &amp; Kurz-Übersicht dieser Woche</h2>
      <div class="recipe-grid">
        ${Array.from(uniqueWeekRecipes.values())
          .map(({ recipe: r, portions }) => {
            const targetP = portions || r.portions || 2;
            return `
          <div class="recipe-box">
            <h3>${escapeHtml(r.title)}</h3>
            <div style="font-size: 8.5pt; color: #666; margin-bottom: 6px;">
              ${escapeHtml(r.category)} · ${r.prepTimeMinutes} Min · ${targetP} Portionen${
              targetP !== r.portions ? ` (skaliert von ${r.portions})` : ''
            }
            </div>
            <ul>
              ${r.ingredients
                .map((ing) => {
                  const scaled = getScaledIngredientDisplay(ing, r.portions, targetP);
                  return `<li>${escapeHtml(scaled.name)}${scaled.amount ? ` (${escapeHtml(scaled.amount)})` : ''}</li>`;
                })
                .join('')}
            </ul>
          </div>
        `;
          })
          .join('')}
      </div>
    `
      : '';

  triggerIframePrint(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Kochplan ${escapeHtml(rangeStr)}</title>
        <style>
          ${BASE_PRINT_STYLES(accentColor)}
          .meta-bar {
            font-size: 9pt;
            color: #666;
            margin-bottom: 8px;
          }
          .recipe-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 8px;
          }
          .recipe-box {
            border: 1px solid #e5e3dc;
            border-radius: 6px;
            padding: 8px 10px;
            background: #faf9f5;
            break-inside: avoid;
          }
          .recipe-box h3 {
            margin: 0 0 2px 0;
            color: ${accentColor};
            font-size: 10.5pt;
          }
          .recipe-box ul {
            margin: 4px 0 0 0;
            padding-left: 16px;
            font-size: 9pt;
          }
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Kochbuch${ownerName ? ` · Plan von ${escapeHtml(ownerName)}` : ''} · Zyklus: ${escapeHtml(cycle.name)} (${cycle.cycleLengthDays} Tage)
        </div>
        <h1>Kochplan: ${escapeHtml(rangeStr)}</h1>
        <table>
          <thead>
            <tr>
              <th>Tag</th>
              <th>Geplante Rezepte</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        ${recipeDetailsHtml}
      </body>
    </html>
  `);
}

export function printRecipeA4(
  recipe: Recipe,
  targetPortions?: number,
  ownerName?: string,
  accentColor = '#C26D2D'
) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const portions = Math.max(1, targetPortions || recipe.portions || 2);
  const coverImg = recipe.images && recipe.images.length > 0 ? recipe.images[0] : '';

  const ingRows = (recipe.ingredients || [])
    .map((ing) => {
      const scaled = getScaledIngredientDisplay(ing, recipe.portions || 2, portions);
      return `<tr>
        <td><strong>${escapeHtml(scaled.name)}</strong></td>
        <td style="width: 34%; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(scaled.amount || 'nach Bedarf')}</td>
      </tr>`;
    })
    .join('');

  const stepsHtml = (recipe.instructions || [])
    .map((step, i) => `<li>${escapeHtml(step)}</li>`)
    .join('');

  triggerIframePrint(
    `
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>${escapeHtml(recipe.title)} – Rezept A4</title>
        <style>
          ${BASE_PRINT_STYLES(accentColor)}
          .meta-bar { font-size: 9pt; color: #666; margin-bottom: 10px; }
          .hero-strip {
            width: 100%;
            max-height: 55mm;
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid #e5e3dc;
            margin-bottom: 12px;
            background: #f6f4ef;
            text-align: center;
          }
          .hero-strip img {
            width: 100%;
            height: 55mm;
            object-fit: cover;
            display: block;
          }
          .summary-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
            font-size: 9pt;
          }
          .pill {
            padding: 4px 10px;
            border: 1px solid #e5e3dc;
            background: #faf9f5;
            border-radius: 6px;
            font-weight: 600;
          }
          ol li {
            margin-bottom: 6px;
          }
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Kochbuch${ownerName ? ` · ${escapeHtml(ownerName)}` : ''} · Kategorie: <strong>${escapeHtml(recipe.category || 'Rezept')}</strong>
        </div>
        <h1>${escapeHtml(recipe.title)}</h1>
        ${coverImg ? `<div class="hero-strip"><img src="${escapeHtml(coverImg)}" alt="${escapeHtml(recipe.title)}" /></div>` : ''}
        <div class="summary-pills">
          <span class="pill">Portionen: ${portions}${portions !== recipe.portions ? ` (Basis ${recipe.portions})` : ''}</span>
          <span class="pill">Zubereitungszeit: ${recipe.prepTimeMinutes || 0} Min.</span>
          ${recipe.mealTypes?.length ? `<span class="pill">Mahlzeit: ${escapeHtml(recipe.mealTypes.join(', '))}</span>` : ''}
        </div>
        ${recipe.description ? `<blockquote>${escapeHtml(recipe.description)}</blockquote>` : ''}
        <h2>Zutaten (${portions} Portionen)</h2>
        ${
          ingRows
            ? `<table><thead><tr><th>Zutat</th><th style="text-align:right;">Menge</th></tr></thead><tbody>${ingRows}</tbody></table>`
            : '<p style="color:#666;">Keine Zutaten hinterlegt.</p>'
        }
        <h2>Arbeitsschritte</h2>
        ${stepsHtml ? `<ol>${stepsHtml}</ol>` : '<p style="color:#666;">Keine Arbeitsschritte hinterlegt.</p>'}
      </body>
    </html>
    `,
    Boolean(coverImg)
  );
}

export function printProjectA4(project: ProjectItem, accentColor = '#B45309') {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const columns =
    project.columns && project.columns.length > 0
      ? project.columns
      : [
          { id: 'todo', label: 'Offen', color: '#6B7280' },
          { id: 'in_progress', label: 'In Arbeit', color: accentColor },
          { id: 'review', label: 'Prüfung', color: '#2563EB' },
          { id: 'done', label: 'Erledigt', color: '#10B981' },
        ];
  const colMap = new Map(columns.map((c) => [c.id, c]));
  const priorityLabels: Record<string, string> = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
  };

  const tasks = project.tasks || [];
  const kpiHtml = columns
    .map((col) => {
      const cnt = tasks.filter((t) => t.status === col.id).length;
      const colColor = col.color || accentColor;
      return `<div class="kpi-box"><div class="kpi-num" style="color:${escapeHtml(colColor)}">${cnt}</div><div class="kpi-lbl">${escapeHtml(col.label)}</div></div>`;
    })
    .join('');

  const sortedTasks = [...tasks].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const taskRows = sortedTasks
    .map((t) => {
      const colInfo = colMap.get(t.status);
      const assigneeDisplay =
        t.assignees && t.assignees.length > 0
          ? t.assignees.join(', ')
          : t.assignee || 'Nicht zugewiesen';
      return `
      <tr>
        <td><strong>${escapeHtml(t.title)}</strong>${t.description ? `<br/><span style="font-size:8.5pt;color:#555;">${escapeHtml(t.description)}</span>` : ''}</td>
        <td>${escapeHtml(colInfo?.label || t.status)}</td>
        <td>${escapeHtml(assigneeDisplay)}</td>
        <td>${escapeHtml(priorityLabels[t.priority] || t.priority)}</td>
        <td style="font-variant-numeric: tabular-nums; white-space: nowrap;">${escapeHtml(t.startDate || '–')} – ${escapeHtml(t.dueDate || '–')}</td>
      </tr>
    `;
    })
    .join('');

  // Visual Gantt / Timeline bars
  let timelineHtml = '';
  const datedTasks = sortedTasks.filter((t) => t.startDate && t.dueDate);
  if (datedTasks.length > 0) {
    const minMs = Math.min(...datedTasks.map((t) => new Date(`${t.startDate}T00:00:00`).getTime()));
    const maxMsRaw = Math.max(...datedTasks.map((t) => new Date(`${t.dueDate}T00:00:00`).getTime()));
    const spanMs = Math.max(86400000, maxMsRaw - minMs + 86400000);
    const minLabel = new Date(minMs).toLocaleDateString('de-DE');
    const maxLabel = new Date(maxMsRaw).toLocaleDateString('de-DE');

    const ganttRows = datedTasks
      .map((t) => {
        const sMs = new Date(`${t.startDate}T00:00:00`).getTime();
        const eMs = Math.max(sMs, new Date(`${t.dueDate}T00:00:00`).getTime()) + 86400000;
        const leftPct = Math.max(0, ((sMs - minMs) / spanMs) * 100);
        const widthPct = Math.max(3, Math.min(100 - leftPct, ((eMs - sMs) / spanMs) * 100));
        const colColor = colMap.get(t.status)?.color || accentColor;
        return `
          <div class="gantt-row">
            <div class="gantt-label">${escapeHtml(t.title)}</div>
            <div class="gantt-track">
              <div class="gantt-bar" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%;background:${escapeHtml(colColor)};"></div>
            </div>
          </div>
        `;
      })
      .join('');

    timelineHtml = `
      <h2>Zeitplan-Übersicht (Gantt · ${escapeHtml(minLabel)} – ${escapeHtml(maxLabel)})</h2>
      <div class="gantt-wrap">${ganttRows}</div>
    `;
  }

  const protocolsHtml =
    project.protocols && project.protocols.length > 0
      ? `<h2>Projekt-Protokoll (${project.protocols.length})</h2>
         <table>
           <thead>
             <tr>
               <th style="width:22%;">Zeitpunkt</th>
               <th style="width:20%;">Autor</th>
               <th>Eintrag</th>
             </tr>
           </thead>
           <tbody>
             ${project.protocols
               .map(
                 (p) => `
               <tr>
                 <td style="font-variant-numeric: tabular-nums; white-space: nowrap;">${escapeHtml(
                   new Date(p.createdAt).toLocaleString('de-DE', {
                     day: '2-digit',
                     month: '2-digit',
                     year: 'numeric',
                     hour: '2-digit',
                     minute: '2-digit',
                   })
                 )}</td>
                 <td><strong>${escapeHtml(p.author)}</strong></td>
                 <td>${escapeHtml(p.text)}</td>
               </tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : '';

  const linkedNotes = project.linkedNotePaths || [];
  const linkedWikis = project.linkedWikiSlugs || [];
  const linksHtml =
    linkedNotes.length + linkedWikis.length > 0
      ? `<h2>Verknüpfte Dokumente (Notes &amp; Wiki)</h2>
       <ul>
         ${linkedNotes.map((p) => `<li><strong>[Notiz]</strong> ${escapeHtml(p)}</li>`).join('')}
         ${linkedWikis.map((s) => `<li><strong>[Wiki]</strong> ${escapeHtml(s)}</li>`).join('')}
       </ul>`
      : '';

  triggerIframePrint(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>${escapeHtml(project.title)} – Projektplan A4</title>
        <style>
          ${BASE_PRINT_STYLES(accentColor)}
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(${Math.min(6, Math.max(1, columns.length))}, 1fr);
            gap: 8px;
            margin: 10px 0 14px 0;
          }
          .kpi-box {
            border: 1px solid #e5e3dc;
            background: #faf9f5;
            border-radius: 6px;
            padding: 8px 10px;
          }
          .kpi-num { font-size: 14pt; font-weight: 800; color: ${accentColor}; }
          .kpi-lbl { font-size: 8pt; color: #666; }
          .gantt-wrap {
            border: 1px solid #e5e3dc;
            border-radius: 6px;
            padding: 8px 10px;
            background: #faf9f5;
            margin-bottom: 12px;
          }
          .gantt-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
          }
          .gantt-row:last-child { margin-bottom: 0; }
          .gantt-label {
            width: 34%;
            font-size: 8.5pt;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .gantt-track {
            flex: 1;
            height: 11px;
            background: #ece9e0;
            border-radius: 4px;
            position: relative;
            overflow: hidden;
          }
          .gantt-bar {
            position: absolute;
            top: 1px;
            bottom: 1px;
            border-radius: 3px;
          }
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Projekte · Eigentümer: <strong>${escapeHtml(project.ownerDisplayName || project.ownerUsername)}</strong> · Sichtbarkeit: ${project.visibility === 'shared' ? `Geteilt (${escapeHtml((project.sharedWithUsers || []).join(', ') || 'Team')})` : 'Privat'}
        </div>
        <h1>${escapeHtml(project.title)}</h1>
        ${project.description ? `<blockquote>${escapeHtml(project.description)}</blockquote>` : ''}
        <div class="kpi-row">${kpiHtml}</div>
        <h2>Kanban-Aufgaben &amp; Details</h2>
        ${
          taskRows
            ? `<table>
                <thead>
                  <tr>
                    <th>Aufgabe</th>
                    <th>Status</th>
                    <th>Zuständig</th>
                    <th>Priorität</th>
                    <th>Zeitraum</th>
                  </tr>
                </thead>
                <tbody>${taskRows}</tbody>
              </table>`
            : '<p style="color:#666;">Noch keine Aufgaben in diesem Projekt.</p>'
        }
        ${timelineHtml}
        ${protocolsHtml}
        ${linksHtml}
      </body>
    </html>
  `);
}

export function printProjectTaskA4(project: ProjectItem, task: ProjectTask, accentColor = '#B45309') {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const columns =
    project.columns && project.columns.length > 0
      ? project.columns
      : [
          { id: 'todo', label: 'Offen', color: '#6B7280' },
          { id: 'in_progress', label: 'In Arbeit', color: accentColor },
          { id: 'review', label: 'Prüfung', color: '#2563EB' },
          { id: 'done', label: 'Erledigt', color: '#10B981' },
        ];
  const colLabel = columns.find((c) => c.id === task.status)?.label || task.status;
  const priorityLabels: Record<string, string> = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
  };
  const assigneeDisplay =
    task.assignees && task.assignees.length > 0
      ? task.assignees.join(', ')
      : task.assignee || 'Nicht zugewiesen';
  const milestone = task.milestoneId
    ? (project.milestones || []).find((m) => m.id === task.milestoneId)
    : undefined;
  const protocols = task.protocols || [];

  triggerIframePrint(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <base href="${origin}/" />
        <title>${escapeHtml(task.title)} – Aufgabe A4</title>
        <style>
          ${BASE_PRINT_STYLES(accentColor)}
          .summary-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 10px 0 14px 0;
            font-size: 9pt;
          }
          .pill {
            padding: 4px 10px;
            border: 1px solid #e5e3dc;
            background: #faf9f5;
            border-radius: 6px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Projekte · Projekt: <strong>${escapeHtml(project.title)}</strong> · Einzelaufgabe
        </div>
        <h1>${escapeHtml(task.title)}</h1>
        <div class="summary-pills">
          <span class="pill">Status: ${escapeHtml(colLabel)}</span>
          <span class="pill">Priorität: ${escapeHtml(priorityLabels[task.priority] || task.priority)}</span>
          <span class="pill">Zuständig: ${escapeHtml(assigneeDisplay)}</span>
          ${task.startDate || task.dueDate ? `<span class="pill">Zeitraum: ${escapeHtml(task.startDate || '–')} bis ${escapeHtml(task.dueDate || '–')}</span>` : ''}
          ${milestone ? `<span class="pill">Meilenstein: ${escapeHtml(milestone.title)} (${escapeHtml(milestone.targetDate)})</span>` : ''}
        </div>
        ${task.description ? `<h2>Beschreibung</h2><blockquote>${escapeHtml(task.description)}</blockquote>` : ''}
        <h2>Aufgaben-Protokoll (${protocols.length})</h2>
        ${
          protocols.length > 0
            ? `<table>
                <thead>
                  <tr>
                    <th style="width:22%;">Zeitpunkt</th>
                    <th style="width:20%;">Autor</th>
                    <th>Eintrag</th>
                  </tr>
                </thead>
                <tbody>
                  ${protocols
                    .map(
                      (p) => `
                    <tr>
                      <td style="font-variant-numeric: tabular-nums; white-space: nowrap;">${escapeHtml(
                        new Date(p.createdAt).toLocaleString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      )}</td>
                      <td><strong>${escapeHtml(p.author)}</strong></td>
                      <td>${escapeHtml(p.text)}</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>`
            : '<p style="color:#666;">Noch keine Protokolleinträge für diese Aufgabe.</p>'
        }
      </body>
    </html>
  `);
}

// Pure client-side PDF 1.4 Generator (supports German WinAnsi characters äöüßÄÖÜ€–„“)
export interface PdfExportSection {
  heading?: string;
  lines: string[];
}

export interface PdfExportDocument {
  title: string;
  subtitle?: string;
  accentColor?: string;
  heroImage?: string;
  sections: PdfExportSection[];
}

function hexToPdfRgb(hex?: string): string {
  const cleaned = (hex || '#B45309').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16) / 255;
    const g = parseInt(cleaned.slice(2, 4), 16) / 255;
    const b = parseInt(cleaned.slice(4, 6), 16) / 255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  }
  return '0.706 0.325 0.035';
}

function stringToLatin1Bytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

async function loadImageAsJpegBytes(
  src?: string
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (!src || typeof document === 'undefined' || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (val: { bytes: Uint8Array; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const timer = window.setTimeout(() => finish(null), 2500);
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const rawW = img.naturalWidth || img.width || 0;
        const rawH = img.naturalHeight || img.height || 0;
        if (rawW <= 0 || rawH <= 0) {
          finish(null);
          return;
        }
        const maxW = 900;
        const scale = rawW > maxW ? maxW / rawW : 1;
        const w = Math.max(1, Math.round(rawW * scale));
        const h = Math.max(1, Math.round(rawH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx < 0) {
          finish(null);
          return;
        }
        const b64 = dataUrl.slice(commaIdx + 1);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        finish({ bytes, width: w, height: h });
      } catch {
        finish(null);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

function encodePdfWinAnsiText(input: string): string {
  const winAnsiSpecials: Record<number, number> = {
    0x20ac: 0x80, // €
    0x201a: 0x82,
    0x201e: 0x84, // „
    0x2026: 0x85, // …
    0x2020: 0x86,
    0x2021: 0x87,
    0x2030: 0x89,
    0x2039: 0x8b,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93, // “
    0x201d: 0x94, // ”
    0x2022: 0x95, // •
    0x2013: 0x96, // –
    0x2014: 0x97, // —
    0x2122: 0x99,
    0x203a: 0x9b,
  };

  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x5c || code === 0x28 || code === 0x29) {
      out += '\\' + input[i];
    } else if (code >= 0x20 && code <= 0x7e) {
      out += input[i];
    } else if (winAnsiSpecials[code]) {
      const oct = winAnsiSpecials[code].toString(8).padStart(3, '0');
      out += `\\${oct}`;
    } else if (code >= 0xa0 && code <= 0xff) {
      const oct = code.toString(8).padStart(3, '0');
      out += `\\${oct}`;
    } else if (code === 0x2192) {
      out += '->';
    } else if (code === 0x2713 || code === 0x2714) {
      out += '[x]';
    } else if (code === 0x2610) {
      out += '[ ]';
    } else {
      out += ' ';
    }
  }
  return out;
}

function wrapPdfLine(text: string, maxChars: number): string[] {
  const clean = String(text || '').replace(/\r/g, '').trimEnd();
  if (!clean) return [''];
  const words = clean.split(/\s+/);
  const result: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) {
      line = w;
    } else if (line.length + 1 + w.length <= maxChars) {
      line += ' ' + w;
    } else {
      result.push(line);
      line = w;
    }
    while (line.length > maxChars) {
      result.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
  }
  if (line) result.push(line);
  return result.length > 0 ? result : [''];
}

function buildPdfBlobInternal(
  doc: PdfExportDocument,
  jpegImage: { bytes: Uint8Array; width: number; height: number } | null
): Blob {
  const PAGE_W = 595; // A4 width pt
  const PAGE_H = 842; // A4 height pt
  const MARGIN_X = 48;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const TOP_Y = 792;
  const BOTTOM_Y = 54;
  const accentRgb = hexToPdfRgb(doc.accentColor);

  interface RenderRow {
    text: string;
    size: number;
    bold: boolean;
    leading: number;
    muted?: boolean;
    accent?: boolean;
    ruleBelow?: boolean;
    spacerPts?: number;
  }

  const rows: RenderRow[] = [];
  wrapPdfLine(doc.title || 'Ochre Suite Export', 52).forEach((l, idx, arr) => {
    rows.push({
      text: l,
      size: 18,
      bold: true,
      leading: 23,
      accent: true,
      ruleBelow: idx === arr.length - 1,
    });
  });
  if (doc.subtitle) {
    wrapPdfLine(doc.subtitle, 82).forEach((l) => {
      rows.push({ text: l, size: 9.5, bold: false, leading: 14, muted: true });
    });
  }
  rows.push({
    text: `Erstellt mit Ochre Suite · ${new Date().toLocaleDateString('de-DE')}`,
    size: 8.5,
    bold: false,
    leading: 14,
    muted: true,
  });

  // Compute embedded hero image geometry if available (placed on Page 1 after title/meta)
  let imgDrawW = 0;
  let imgDrawH = 0;
  if (jpegImage) {
    const maxDrawH = 165;
    const ratio = jpegImage.width / Math.max(1, jpegImage.height);
    imgDrawW = CONTENT_W;
    imgDrawH = imgDrawW / ratio;
    if (imgDrawH > maxDrawH) {
      imgDrawH = maxDrawH;
      imgDrawW = imgDrawH * ratio;
    }
    rows.push({ text: '', size: 10, bold: false, leading: Math.round(imgDrawH + 14), spacerPts: imgDrawH + 10 });
  } else {
    rows.push({ text: '', size: 10, bold: false, leading: 8 });
  }

  for (const sec of doc.sections) {
    if (sec.heading) {
      rows.push({ text: '', size: 10, bold: false, leading: 6 });
      wrapPdfLine(sec.heading, 66).forEach((l) => {
        rows.push({ text: l, size: 12.5, bold: true, leading: 17 });
      });
    }
    for (const rawLine of sec.lines) {
      const paragraphs = String(rawLine || '').split('\n');
      for (const p of paragraphs) {
        if (!p.trim()) {
          rows.push({ text: '', size: 10, bold: false, leading: 8 });
          continue;
        }
        wrapPdfLine(p, 84).forEach((wrapped) => {
          rows.push({ text: wrapped, size: 10, bold: false, leading: 14 });
        });
      }
    }
  }

  // First compute page splits so we know exact total page count
  const pagedRows: RenderRow[][] = [[]];
  let simY = TOP_Y;
  for (const r of rows) {
    if (simY - r.leading < BOTTOM_Y && pagedRows[pagedRows.length - 1].length > 0) {
      pagedRows.push([]);
      simY = TOP_Y;
    }
    pagedRows[pagedRows.length - 1].push(r);
    simY -= r.leading;
  }

  const totalPages = Math.max(1, pagedRows.length);
  const pages: string[] = [];

  pagedRows.forEach((pRows, pIdx) => {
    const ops: string[] = [];
    // Subtle top accent bar on every page
    ops.push(`${accentRgb} rg`);
    ops.push(`0 ${PAGE_H - 6} ${PAGE_W} 6 re f`);

    let cursorY = TOP_Y;
    for (const r of pRows) {
      if (r.spacerPts && jpegImage && pIdx === 0) {
        const imgBottomY = cursorY - imgDrawH + 4;
        const imgLeftX = MARGIN_X + (CONTENT_W - imgDrawW) / 2;
        ops.push('q');
        ops.push(`${imgDrawW.toFixed(2)} 0 0 ${imgDrawH.toFixed(2)} ${imgLeftX.toFixed(2)} ${imgBottomY.toFixed(2)} cm`);
        ops.push('/Im1 Do');
        ops.push('Q');
      } else if (r.text) {
        ops.push('BT');
        ops.push(`${r.bold ? '/F2' : '/F1'} ${r.size} Tf`);
        if (r.accent) {
          ops.push(`${accentRgb} rg`);
        } else {
          ops.push(r.muted ? '0.42 0.42 0.42 rg' : '0.1 0.1 0.1 rg');
        }
        ops.push(`1 0 0 1 ${MARGIN_X} ${cursorY.toFixed(1)} Tm`);
        ops.push(`(${encodePdfWinAnsiText(r.text)}) Tj`);
        ops.push('ET');
        if (r.ruleBelow) {
          const lineY = cursorY - 6;
          ops.push(`${accentRgb} RG`);
          ops.push('1.2 w');
          ops.push(`${MARGIN_X} ${lineY.toFixed(1)} m ${PAGE_W - MARGIN_X} ${lineY.toFixed(1)} l S`);
        }
      }
      cursorY -= r.leading;
    }

    ops.push('BT');
    ops.push('/F1 8.5 Tf');
    ops.push('0.45 0.45 0.45 rg');
    ops.push(`1 0 0 1 ${MARGIN_X} 28 Tm`);
    ops.push(`(${encodePdfWinAnsiText(`Ochre Suite · Seite ${pIdx + 1} / ${totalPages}`)}) Tj`);
    ops.push('ET');
    pages.push(ops.join('\n'));
  });

  // Binary-safe PDF 1.4 assembly using Uint8Array chunks
  // 1 = Catalog, 2 = Pages, 3 = F1 Helvetica, 4 = F2 Helvetica-Bold, [5 = Image XObject if present], then pairs (Page, Content)
  const imageObjNum = jpegImage ? 5 : null;
  const startPageObjNum = jpegImage ? 6 : 5;
  const pageObjNums = pages.map((_, i) => startPageObjNum + i * 2);

  const objBytesList: Uint8Array[] = [];
  objBytesList.push(stringToLatin1Bytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`));
  objBytesList.push(
    stringToLatin1Bytes(
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`
    )
  );
  objBytesList.push(
    stringToLatin1Bytes(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj`)
  );
  objBytesList.push(
    stringToLatin1Bytes(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj`)
  );

  if (jpegImage && imageObjNum) {
    const imgHeader = stringToLatin1Bytes(
      `${imageObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpegImage.width} /Height ${jpegImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegImage.bytes.length} >>\nstream\n`
    );
    const imgFooter = stringToLatin1Bytes(`\nendstream\nendobj`);
    const combined = new Uint8Array(imgHeader.length + jpegImage.bytes.length + imgFooter.length);
    combined.set(imgHeader, 0);
    combined.set(jpegImage.bytes, imgHeader.length);
    combined.set(imgFooter, imgHeader.length + jpegImage.bytes.length);
    objBytesList.push(combined);
  }

  pages.forEach((streamStr, idx) => {
    const pageNum = startPageObjNum + idx * 2;
    const contentNum = pageNum + 1;
    const xObjectDict = imageObjNum ? ` /XObject << /Im1 ${imageObjNum} 0 R >>` : '';
    objBytesList.push(
      stringToLatin1Bytes(
        `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjectDict} >> /Contents ${contentNum} 0 R >>\nendobj`
      )
    );
    objBytesList.push(
      stringToLatin1Bytes(
        `${contentNum} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj`
      )
    );
  });

  const chunks: Uint8Array[] = [];
  const headerBytes = stringToLatin1Bytes('%PDF-1.4\n');
  chunks.push(headerBytes);
  let byteCursor = headerBytes.length;
  const offsets: number[] = [0];
  const nlByte = stringToLatin1Bytes('\n');

  for (const objBytes of objBytesList) {
    offsets.push(byteCursor);
    chunks.push(objBytes);
    chunks.push(nlByte);
    byteCursor += objBytes.length + 1;
  }

  const xrefPos = byteCursor;
  let xrefStr = `xref\n0 ${objBytesList.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objBytesList.length; i++) {
    xrefStr += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  xrefStr += `trailer\n<< /Size ${objBytesList.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  chunks.push(stringToLatin1Bytes(xrefStr));

  const blobParts: BlobPart[] = chunks.map((c) => c.slice().buffer);
  return new Blob(blobParts, { type: 'application/pdf' });
}

export function generatePdfBlob(doc: PdfExportDocument): Blob {
  return buildPdfBlobInternal(doc, null);
}

export async function generatePdfBlobWithMedia(doc: PdfExportDocument): Promise<Blob> {
  const jpeg = await loadImageAsJpegBytes(doc.heroImage);
  return buildPdfBlobInternal(doc, jpeg);
}

export async function shareAsPdfFile(
  filename: string,
  doc: PdfExportDocument
): Promise<{ shared: boolean; downloaded: boolean }> {
  const safeName = (filename.replace(/[^a-zA-Z0-9äöüÄÖÜß._-]/g, '_').replace(/\.pdf$/i, '') || 'Ochre_Export') + '.pdf';
  const blob = await generatePdfBlobWithMedia(doc);
  const file = new File([blob], safeName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const canShareFiles =
      typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true;
    if (canShareFiles) {
      try {
        await navigator.share({
          title: doc.title,
          text: doc.subtitle || doc.title,
          files: [file],
        });
        return { shared: true, downloaded: false };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return { shared: false, downloaded: false };
        }
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { shared: false, downloaded: true };
}

