import * as vscode from 'vscode';

export interface TranslateKeyMatch {
  key: string;
  line: number;
  startCol: number;
  endCol: number;
  fullMatch: string;
  quoteChar: string;
}

/**
 * Patterns to match translate keys in code
 *
 * Supports various patterns:
 * - translate: 'key'
 * - translate: "key"
 * - translate: `key`
 * - { translate: 'key' }
 * - rawtext with translate
 */
const TRANSLATE_PATTERNS: RegExp[] = [
  // translate: 'key' or translate: "key" or translate: `key`
  /translate\s*:\s*(['"`])([^'"`\n]+)\1/g,
  // { "translate": "key" } (JSON style)
  /"translate"\s*:\s*"([^"]+)"/g,
];

/**
 * Finds all translate key matches in a document
 */
export function findAllTranslateKeys(document: vscode.TextDocument): TranslateKeyMatch[] {
  const matches: TranslateKeyMatch[] = [];
  const text = document.getText();

  for (const pattern of TRANSLATE_PATTERNS) {
    // Reset the regex lastIndex
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      // The key is in different capture groups depending on the pattern
      const key = match[2] || match[1];
      if (!key) continue;

      // Find the position of the key in the full match
      const keyStartInMatch = fullMatch.indexOf(key);
      const matchStart = match.index;
      const keyStart = matchStart + keyStartInMatch;
      const keyEnd = keyStart + key.length;

      // Convert offset to position
      const startPos = document.positionAt(keyStart);
      const endPos = document.positionAt(keyEnd);

      // Determine quote character
      const quoteMatch = fullMatch.match(/['"`]/);
      const quoteChar = quoteMatch ? quoteMatch[0] : "'";

      matches.push({
        key,
        line: startPos.line,
        startCol: startPos.character,
        endCol: endPos.character,
        fullMatch,
        quoteChar,
      });
    }
  }

  return matches;
}

/**
 * Finds a translate key at a specific position in the document
 */
export function findTranslateKeyAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): TranslateKeyMatch | null {
  const allMatches = findAllTranslateKeys(document);

  for (const match of allMatches) {
    if (match.line !== position.line) continue;
    if (position.character >= match.startCol && position.character <= match.endCol) return match;
  }

  return null;
}

/**
 * Gets the range of a translate key match
 * @param match - The translate key match.
 * @returns The range of the translate key match.
 */
export function getMatchRange(match: TranslateKeyMatch): vscode.Range {
  return new vscode.Range(
    new vscode.Position(match.line, match.startCol),
    new vscode.Position(match.line, match.endCol)
  );
}
