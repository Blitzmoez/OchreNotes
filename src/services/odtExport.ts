// OpenDocument Text (.odt) Generator in pure TypeScript / Browser
// Generates a valid ODF package readable by LibreOffice, Apache OpenOffice, MS Word, and Google Docs.

function crc32(str: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < str.length; i++) {
    let byte = str[i];
    for (let j = 0; j < 8; j++) {
      const bit = (crc ^ byte) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

interface ZipEntry {
  path: string;
  data: Uint8Array;
}

function createZipArchive(entries: ZipEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const entry of entries) {
    const filenameBytes = encoder.encode(entry.path);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true); // Local file header signature
    dv.setUint16(4, 20, true); // Version needed to extract (2.0)
    dv.setUint16(6, 0, true); // General purpose bit flag
    dv.setUint16(8, 0, true); // Compression method (0 = store / uncompressed)
    dv.setUint16(10, 0, true); // Mod time
    dv.setUint16(12, 0, true); // Mod date
    dv.setUint32(14, crc, true); // CRC-32
    dv.setUint32(18, size, true); // Compressed size
    dv.setUint32(22, size, true); // Uncompressed size
    dv.setUint16(26, filenameBytes.length, true); // Filename length
    dv.setUint16(28, 0, true); // Extra field length
    localHeader.set(filenameBytes, 30);

    parts.push(localHeader);
    parts.push(dataBytes);

    // Central directory header (46 bytes + filename)
    const cdHeader = new Uint8Array(46 + filenameBytes.length);
    const cdv = new DataView(cdHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true); // Central file header signature
    cdv.setUint16(4, 20, true); // Version made by
    cdv.setUint16(6, 20, true); // Version needed
    cdv.setUint16(8, 0, true); // Bit flag
    cdv.setUint16(10, 0, true); // Method
    cdv.setUint16(12, 0, true); // Time
    cdv.setUint16(14, 0, true); // Date
    cdv.setUint32(16, crc, true); // CRC-32
    cdv.setUint32(20, size, true); // Compressed size
    cdv.setUint32(24, size, true); // Uncompressed size
    cdv.setUint16(28, filenameBytes.length, true); // Filename length
    cdv.setUint16(30, 0, true); // Extra field length
    cdv.setUint16(32, 0, true); // Comment length
    cdv.setUint16(34, 0, true); // Disk start
    cdv.setUint16(36, 0, true); // Internal attributes
    cdv.setUint32(38, 0, true); // External attributes
    cdv.setUint32(42, offset, true); // Relative offset of local header
    cdHeader.set(filenameBytes, 46);

    centralDirParts.push(cdHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const cd of centralDirParts) {
    centralDirSize += cd.length;
    parts.push(cd);
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true); // EOCD signature
  edv.setUint16(4, 0, true); // Disk number
  edv.setUint16(6, 0, true); // Start disk
  edv.setUint16(8, entries.length, true); // Records on disk
  edv.setUint16(10, entries.length, true); // Total records
  edv.setUint32(12, centralDirSize, true); // Size of central directory
  edv.setUint32(16, centralDirOffset, true); // Offset of central directory
  edv.setUint16(20, 0, true); // Comment length
  parts.push(eocd);

  return new Blob(parts as any, { type: 'application/vnd.oasis.opendocument.text' });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToOdt(title: string, markdown: string): Blob {
  const encoder = new TextEncoder();

  // 1. mimetype (Must be uncompressed and first entry)
  const mimetypeData = encoder.encode('application/vnd.oasis.opendocument.text');

  // 2. META-INF/manifest.xml
  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  // 3. meta.xml
  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta>
    <meta:generator>OchreNotes ODT Exporter</meta:generator>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:date>${new Date().toISOString()}</dc:date>
  </office:meta>
</office:document-meta>`;

  // 4. styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:text-properties fo:font-size="11pt" fo:font-family="Arial, Helvetica, sans-serif" fo:color="#1a1a1a"/>
    </style:default-style>
  </office:styles>
</office:document-styles>`;

  // 5. content.xml (Parsed from Markdown lines)
  const lines = markdown.split('\n');
  const bodyXmlParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      bodyXmlParts.push('<text:p text:style-name="Standard"/>');
      continue;
    }

    // Headings
    if (trimmed.startsWith('# ')) {
      bodyXmlParts.push(`<text:h text:outline-level="1">${escapeXml(trimmed.slice(2))}</text:h>`);
    } else if (trimmed.startsWith('## ')) {
      bodyXmlParts.push(`<text:h text:outline-level="2">${escapeXml(trimmed.slice(3))}</text:h>`);
    } else if (trimmed.startsWith('### ')) {
      bodyXmlParts.push(`<text:h text:outline-level="3">${escapeXml(trimmed.slice(4))}</text:h>`);
    } else if (trimmed.startsWith('#### ')) {
      bodyXmlParts.push(`<text:h text:outline-level="4">${escapeXml(trimmed.slice(5))}</text:h>`);
    }
    // Tasks: - [ ] or - [x]
    else if (trimmed.match(/^- \[[ xX]\]/)) {
      const isChecked = trimmed.match(/^- \[[xX]\]/);
      const text = trimmed.replace(/^- \[[ xX]\]\s*/, '');
      const checkMark = isChecked ? '☑ ' : '☐ ';
      bodyXmlParts.push(`<text:p><text:span text:style-name="Task">${checkMark}${escapeXml(text)}</text:span></text:p>`);
    }
    // Lists: - or *
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      bodyXmlParts.push(`<text:list><text:list-item><text:p>${escapeXml(trimmed.slice(2))}</text:p></text:list-item></text:list>`);
    }
    // Callouts: > [!NOTE]
    else if (trimmed.startsWith('>')) {
      bodyXmlParts.push(`<text:p text:style-name="Callout">${escapeXml(trimmed.replace(/^>\s*/, ''))}</text:p>`);
    }
    // Standard paragraph
    else {
      bodyXmlParts.push(`<text:p>${escapeXml(trimmed)}</text:p>`);
    }
  }

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:automatic-styles>
    <style:style style:name="Task" style:family="text">
      <style:text-properties fo:font-family="Courier New, monospace" fo:font-size="10.5pt" fo:color="#c87d20"/>
    </style:style>
    <style:style style:name="Callout" style:family="paragraph">
      <style:paragraph-properties fo:margin-left="0.5in" fo:border-left="2pt solid #c87d20" fo:padding-left="0.1in"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${bodyXmlParts.join('\n      ')}
    </office:text>
  </office:body>
</office:document-content>`;

  const entries: ZipEntry[] = [
    { path: 'mimetype', data: mimetypeData },
    { path: 'META-INF/manifest.xml', data: encoder.encode(manifestXml) },
    { path: 'styles.xml', data: encoder.encode(stylesXml) },
    { path: 'meta.xml', data: encoder.encode(metaXml) },
    { path: 'content.xml', data: encoder.encode(contentXml) },
  ];

  return createZipArchive(entries);
}
