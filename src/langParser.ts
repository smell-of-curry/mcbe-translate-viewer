import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface for a translation entry.
 */
export interface TranslationEntry {
  key: string;
  value: string;
  line: number;
  filePath: string;
}

/**
 * Interface for a translation map.
 */
export interface TranslationMap {
  [key: string]: TranslationEntry;
}

/**
 * Parses a Minecraft Bedrock .lang file and returns a map of translation keys to values.
 *
 * .lang file format:
 * - Lines starting with ## are comments
 * - Empty lines are ignored
 * - Format: key=value
 * - Keys can contain dots, underscores, and other characters
 *
 * @param filePath - The path to the .lang file.
 * @returns A map of translation keys to values.
 */
export function parseLangFile(filePath: string): TranslationMap {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const translations: TranslationMap = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('##') || line.startsWith('#')) {
      continue;
    }

    // Find the first = sign (keys can't contain =, but values can)
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.substring(0, equalIndex);
    const value = line.substring(equalIndex + 1);

    if (key) {
      translations[key] = {
        key,
        value,
        line: i + 1, // 1-indexed line numbers
        filePath,
      };
    }
  }

  return translations;
}

/**
 * Finds available language files in a texts directory
 */
export function findAvailableLanguages(textsDir: string): string[] {
  if (!fs.existsSync(textsDir)) {
    return [];
  }

  const files = fs.readdirSync(textsDir);
  const languages: string[] = [];

  for (const file of files) {
    if (file.endsWith('.lang')) {
      // Remove .lang extension to get language code
      const langCode = file.replace('.lang', '');
      languages.push(langCode);
    }
  }

  return languages;
}

/**
 * Gets the path to a specific language file
 * @param textsDir - The path to the texts directory.
 * @param language - The language code.
 * @returns The path to the specific language file.
 */
export function getLangFilePath(textsDir: string, language: string): string {
  return path.join(textsDir, `${language}.lang`);
}

/**
 * Loads translations for a specific language from a resource pack
 * @param resourcePackPath - The path to the resource pack.
 * @param language - The language code.
 * @returns A map of translation keys to values.
 */
export function loadTranslations(resourcePackPath: string, language: string): TranslationMap {
  const textsDir = path.join(resourcePackPath, 'texts');
  const langFilePath = getLangFilePath(textsDir, language);
  return parseLangFile(langFilePath);
}
