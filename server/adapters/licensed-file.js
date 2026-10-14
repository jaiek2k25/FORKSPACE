/**
 * Licensed-file adapter.
 *
 * Reads JSON exports from a folder that is deliberately NOT web-served and is
 * git-ignored (default: data-imports/, configurable with LICENSED_DATA_DIR).
 *
 * Rules, all enforced here:
 *   - a file without a licence declaration is ignored entirely, with a log line
 *   - a record missing source name, kind, attribution or licence is rejected
 *   - nothing is fetched from the network: the operator obtains the export
 *     under their own agreement and drops it in the folder
 *
 * Expected file shape (an export delivered under a licence):
 *
 *   {
 *     "licence": "Licensed partner agreement 2026-04",
 *     "source": { "id": "partner-a", "name": "Partner A", "kind": "feed",
 *                 "attribution": "Partner A", "termsUrl": "https://…" },
 *     "records": [ { …listing fields…, "source": {…}, "provenance": {…} } ]
 *   }
 *
 * A bare array is also accepted, but only when the file name declares the
 * licence in a sibling `*.licence.json`, so a licence can never be assumed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateSource } from '../../assets/js/data/schema.js';
import { logger } from '../logger.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read one export file and return { records, rejected, licence }. */
export function parseExport(text, fileName) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { records: [], rejected: [{ file: fileName, reason: 'file is not valid JSON' }], licence: null };
  }

  const licence = isPlainObject(parsed) ? parsed.licence || parsed.license || null : null;
  const fileSource = isPlainObject(parsed) ? parsed.source || null : null;
  const rawRecords = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.records) ? parsed.records : null;

  if (!rawRecords) {
    return { records: [], rejected: [{ file: fileName, reason: 'file has no "records" array' }], licence };
  }
  if (!licence) {
    return { records: [], rejected: [], licence: null, ignored: 'no licence declared in the file, so every record in it was ignored' };
  }
  if (fileSource) {
    const sourceCheck = validateSource(fileSource);
    if (!sourceCheck.ok) {
      return { records: [], rejected: [{ file: fileName, reason: `file-level source is incomplete: ${sourceCheck.errors.join('; ')}` }], licence };
    }
  }

  const records = [];
  const rejected = [];
  for (const [index, record] of rawRecords.entries()) {
    const merged = isPlainObject(record) ? { ...record } : null;
    if (!merged) {
      rejected.push({ file: fileName, index, reason: 'record is not an object' });
      continue;
    }
    if (!merged.licence && licence) merged.licence = licence;
    if (fileSource) {
      merged.source = { ...fileSource, ...(isPlainObject(merged.source) ? merged.source : {}) };
    }
    const sourceCheck = validateSource(merged.source);
    if (!sourceCheck.ok) {
      rejected.push({ file: fileName, index, id: merged.id, reason: `record source is incomplete: ${sourceCheck.errors.join('; ')}` });
      continue;
    }
    // Records must declare where they came from; a licensed export is never "demo".
    merged.provenance = { ...(merged.provenance || {}), isDemo: false };
    records.push(merged);
  }
  return { records, rejected, licence };
}

/**
 * Load every *.json export in the folder.
 * @returns {Promise<{records: Array, status: object}>}
 */
export async function loadLicensedFile(dir) {
  const status = { configured: Boolean(dir), directory: dir ? path.basename(dir) : null, files: 0, accepted: 0, ignored: [], rejected: [] };
  if (!dir) return { records: [], status };

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // A missing folder is normal: it means no licensed data has been imported.
    status.state = 'empty';
    return { records: [], status };
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json') && !entry.name.includes('.licence.'))
    .map((entry) => entry.name)
    .sort();

  const records = [];
  for (const name of files) {
    const filePath = path.join(dir, name);
    let text;
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > MAX_FILE_BYTES) {
        status.rejected.push({ file: name, reason: 'file exceeds the 25 MB import limit' });
        continue;
      }
      text = await fs.readFile(filePath, 'utf8');
    } catch {
      status.rejected.push({ file: name, reason: 'file could not be read' });
      continue;
    }
    const result = parseExport(text, name);
    status.files += 1;
    status.accepted += result.records.length;
    if (result.ignored) status.ignored.push({ file: name, reason: result.ignored });
    if (result.rejected?.length) status.rejected.push(...result.rejected);
    for (const record of result.records) {
      records.push({
        ...record,
        provenance: {
          ...record.provenance,
          fetchedAt: record.provenance?.fetchedAt || new Date().toISOString(),
          schemaVersion: record.provenance?.schemaVersion || '1.1.0'
        }
      });
    }
  }

  status.state = status.accepted > 0 ? 'loaded' : status.files > 0 ? 'nothing_imported' : 'empty';
  if (status.ignored.length) {
    logger.warn(`licensed-file adapter ignored ${status.ignored.length} file(s) with no licence declaration`);
  }
  if (status.rejected.length) {
    logger.warn(`licensed-file adapter rejected ${status.rejected.length} record(s) or file(s)`, status.rejected.map((entry) => `${entry.file}: ${entry.reason}`));
  }
  return { records, status };
}
