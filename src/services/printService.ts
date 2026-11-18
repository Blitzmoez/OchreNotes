import { parseMarkdownToHtml } from './markdownParser';
import { WikiArticle, MealCycle, Recipe, MealCalendarOverride, ProjectItem } from '../types';
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
  h1 {
    font-size: 20pt;
    color: ${accentColor};
    border-bottom: 2px solid ${accentColor};
    padding-bottom: 8px;
    margin: 0 0 12px 0;
  }
  h2 {
    font-size: 13.5pt;
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
  const statusLabels: Record<string, string> = {
    todo: 'Offen',
    in_progress: 'In Arbeit',
    review: 'Prüfung',
    done: 'Erledigt',
  };
  const priorityLabels: Record<string, string> = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
  };

  const tasks = project.tasks || [];
  const counts = {
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    review: tasks.filter((t) => t.status === 'review').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };

  const sortedTasks = [...tasks].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  const taskRows = sortedTasks
    .map(
      (t) => `
      <tr>
        <td><strong>${escapeHtml(t.title)}</strong>${t.description ? `<br/><span style="font-size:8.5pt;color:#555;">${escapeHtml(t.description)}</span>` : ''}</td>
        <td>${escapeHtml(statusLabels[t.status] || t.status)}</td>
        <td>${escapeHtml(t.assignee || 'Nicht zugewiesen')}</td>
        <td>${escapeHtml(priorityLabels[t.priority] || t.priority)}</td>
        <td style="font-variant-numeric: tabular-nums; white-space: nowrap;">${escapeHtml(t.startDate || '–')} – ${escapeHtml(t.dueDate || '–')}</td>
      </tr>
    `
    )
    .join('');

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
          .meta-bar { font-size: 9pt; color: #666; margin-bottom: 10px; }
          .kpi-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
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
        </style>
      </head>
      <body>
        <div class="meta-bar">
          Ochre Projekte · Eigentümer: <strong>${escapeHtml(project.ownerDisplayName || project.ownerUsername)}</strong> · Sichtbarkeit: ${project.visibility === 'shared' ? `Geteilt (${escapeHtml((project.sharedWithUsers || []).join(', ') || 'Team')})` : 'Privat'}
        </div>
        <h1>${escapeHtml(project.title)}</h1>
        ${project.description ? `<blockquote>${escapeHtml(project.description)}</blockquote>` : ''}
        <div class="kpi-row">
          <div class="kpi-box"><div class="kpi-num">${counts.todo}</div><div class="kpi-lbl">Offen</div></div>
          <div class="kpi-box"><div class="kpi-num">${counts.in_progress}</div><div class="kpi-lbl">In Arbeit</div></div>
          <div class="kpi-box"><div class="kpi-num">${counts.review}</div><div class="kpi-lbl">Prüfung</div></div>
          <div class="kpi-box"><div class="kpi-num">${counts.done}</div><div class="kpi-lbl">Erledigt</div></div>
        </div>
        <h2>Kanban-Aufgaben &amp; Zeitplan (Timeline)</h2>
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
        ${linksHtml}
      </body>
    </html>
  `);
}
