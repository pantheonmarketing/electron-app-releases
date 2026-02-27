/**
 * lib/skill-parser.js — Parse skill .md files for highlight data.
 * Extracts tracked accounts, channels, script paths, config values, etc.
 */

/**
 * Extract highlights from skill file content based on highlight definitions.
 * @param {string} content - The skill .md file content
 * @param {Object[]} highlightDefs - Array of { label, type, pattern }
 * @returns {Object[]} - Array of { label, type, data }
 */
function extractHighlights(content, highlightDefs) {
  if (!content || !highlightDefs || highlightDefs.length === 0) return [];

  const results = [];

  for (const def of highlightDefs) {
    try {
      if (def.type === 'code_array') {
        // Extract all regex matches (capture group 1) from the content
        const regex = new RegExp(def.pattern, 'g');
        const matches = [];
        let m;
        while ((m = regex.exec(content)) !== null) {
          const val = m[1] || m[0];
          if (val && !matches.includes(val)) matches.push(val);
        }
        if (matches.length > 0) {
          results.push({ label: def.label, type: 'list', data: matches });
        }
      } else if (def.type === 'field') {
        // Extract a single regex match (capture group 1)
        const regex = new RegExp(def.pattern);
        const m = regex.exec(content);
        if (m && (m[1] || m[0])) {
          results.push({ label: def.label, type: 'field', data: m[1] || m[0] });
        }
      } else if (def.type === 'table') {
        // Extract markdown table rows matching a pattern section
        const lines = content.split('\n');
        const rows = [];
        let inSection = false;
        const sectionRegex = def.section ? new RegExp(def.section, 'i') : null;

        for (const line of lines) {
          if (sectionRegex && !inSection) {
            if (sectionRegex.test(line)) inSection = true;
            continue;
          }
          if (inSection || !sectionRegex) {
            // Parse markdown table row
            if (line.trim().startsWith('|') && !line.includes('---')) {
              const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
              if (cells.length >= 2) rows.push(cells);
            } else if (inSection && line.trim() && !line.startsWith('|') && !line.startsWith('#')) {
              break; // End of table section
            }
          }
        }
        if (rows.length > 0) {
          results.push({ label: def.label, type: 'table', data: rows });
        }
      } else if (def.type === 'quick_ref') {
        // Extract quick reference section values
        const regex = new RegExp(def.pattern, 'gm');
        const items = [];
        let m;
        while ((m = regex.exec(content)) !== null) {
          if (m[1] && m[2]) items.push([m[1].trim(), m[2].trim()]);
        }
        if (items.length > 0) {
          results.push({ label: def.label, type: 'table', data: items });
        }
      }
    } catch (e) {
      // Skip malformed highlight defs
    }
  }

  return results;
}

module.exports = { extractHighlights };
