import { parseMarkdownToHtml } from './markdownParser';

export function printNoteA4(title: string, markdownContent: string) {
  const htmlContent = parseMarkdownToHtml(markdownContent);
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
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title || 'Notiz'}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 20mm 15mm 20mm 15mm;
          }
          body {
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #1a1a1a;
            background: #ffffff;
            margin: 0;
            padding: 10px;
          }
          h1 {
            font-size: 22pt;
            color: #C87D20;
            border-bottom: 2px solid #C87D20;
            padding-bottom: 8px;
            margin-top: 0;
            margin-bottom: 16px;
          }
          h2 {
            font-size: 15pt;
            color: #222;
            margin-top: 20px;
            margin-bottom: 8px;
            border-bottom: 1px solid #e0ded7;
            padding-bottom: 4px;
          }
          h3 {
            font-size: 12pt;
            color: #333;
            margin-top: 14px;
            margin-bottom: 6px;
          }
          p {
            margin: 8px 0;
          }
          pre, code {
            font-family: 'JetBrains Mono', monospace;
            background: #f5f4ef;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 9.5pt;
            color: #333;
          }
          pre {
            padding: 12px;
            border: 1px solid #e5e3dc;
            overflow: hidden;
            white-space: pre-wrap;
            word-break: break-all;
          }
          blockquote {
            border-left: 4px solid #C87D20;
            margin: 12px 0;
            padding: 6px 14px;
            background: #fdfaf6;
            color: #555;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 10pt;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background: #f4f3ef;
            font-weight: 600;
          }
          ul, ol {
            padding-left: 20px;
            margin: 8px 0;
          }
          li {
            margin: 4px 0;
          }
          .task-box {
            display: inline-block;
            width: 13px;
            height: 13px;
            border: 1.5px solid #666;
            border-radius: 3px;
            margin-right: 6px;
            vertical-align: middle;
            text-align: center;
            line-height: 11px;
            font-size: 9px;
          }
          .task-checked {
            background-color: #C87D20;
            border-color: #C87D20;
            color: white;
          }
          a {
            color: #C87D20;
            text-decoration: underline;
          }
          hr {
            border: 0;
            border-top: 1px solid #e5e3dc;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <h1>${title || 'Notiz'}</h1>
        <div class="content">${htmlContent}</div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
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
      }, 2000);
    }
  }, 300);
}
