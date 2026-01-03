import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import { TranslationMap } from './langParser';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/ZtechNetwork/MCBVanillaResourcePack/master/texts';
const CACHE_DURATION_HOURS = 24;

interface CacheMetadata {
  fetchedAt: number;
  version: string;
}

/**
 * Fetches content from a URL using https
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        fetchUrl(redirectUrl).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: Failed to fetch ${url}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parses .lang file content (string) into a TranslationMap
 * Note: filePath is set to 'vanilla' to indicate these are vanilla translations
 */
function parseLangContent(content: string, language: string): TranslationMap {
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
        line: i + 1,
        filePath: `vanilla:${language}`,
      };
    }
  }

  return translations;
}

export class VanillaTranslationProvider {
  private cacheDir: string;
  private enabled: boolean = true;

  constructor(globalStoragePath: string) {
    this.cacheDir = path.join(globalStoragePath, 'vanilla-translations');
    this.ensureCacheDir();
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('mcbeTranslateViewer');
    this.enabled = config.get<boolean>('useVanillaTranslations') ?? true;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCachePath(language: string): string {
    return path.join(this.cacheDir, `${language}.lang`);
  }

  private getMetadataPath(language: string): string {
    return path.join(this.cacheDir, `${language}.meta.json`);
  }

  private isCacheValid(language: string): boolean {
    const metaPath = this.getMetadataPath(language);
    const cachePath = this.getCachePath(language);

    if (!fs.existsSync(metaPath) || !fs.existsSync(cachePath)) {
      return false;
    }

    try {
      const metadata: CacheMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const ageHours = (Date.now() - metadata.fetchedAt) / (1000 * 60 * 60);
      return ageHours < CACHE_DURATION_HOURS;
    } catch {
      return false;
    }
  }

  private readFromCache(language: string): string | null {
    const cachePath = this.getCachePath(language);
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      return fs.readFileSync(cachePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private writeToCache(language: string, content: string): void {
    const cachePath = this.getCachePath(language);
    const metaPath = this.getMetadataPath(language);

    fs.writeFileSync(cachePath, content, 'utf-8');
    fs.writeFileSync(metaPath, JSON.stringify({
      fetchedAt: Date.now(),
      version: '1.0',
    } satisfies CacheMetadata), 'utf-8');
  }

  /**
   * Fetches available languages from the vanilla resource pack
   */
  public async getAvailableLanguages(): Promise<string[]> {
    // Common MCBE languages - we can't easily list the directory from GitHub raw
    // So we return the most common ones
    return [
      'en_US', 'en_GB', 'de_DE', 'es_ES', 'es_MX', 'fr_FR', 'fr_CA',
      'it_IT', 'ja_JP', 'ko_KR', 'nl_NL', 'pl_PL', 'pt_BR', 'pt_PT',
      'ru_RU', 'zh_CN', 'zh_TW', 'tr_TR', 'uk_UA', 'ar_SA', 'bg_BG',
      'cs_CZ', 'da_DK', 'el_GR', 'fi_FI', 'hu_HU', 'id_ID', 'nb_NO',
      'ro_RO', 'sk_SK', 'sv_SE', 'th_TH', 'vi_VN'
    ];
  }

  /**
   * Loads vanilla translations for a specific language
   * First checks cache, then fetches from GitHub if needed
   */
  public async loadTranslations(language: string): Promise<TranslationMap> {
    if (!this.enabled) {
      return {};
    }

    // Check cache first
    if (this.isCacheValid(language)) {
      const cached = this.readFromCache(language);
      if (cached) {
        console.log(`MCBE Translate Viewer: Loaded vanilla translations for ${language} from cache`);
        return parseLangContent(cached, language);
      }
    }

    // Fetch from GitHub
    const url = `${GITHUB_RAW_BASE}/${language}.lang`;

    try {
      console.log(`MCBE Translate Viewer: Fetching vanilla translations for ${language}...`);
      const content = await fetchUrl(url);
      this.writeToCache(language, content);
      console.log(`MCBE Translate Viewer: Fetched and cached vanilla translations for ${language}`);
      return parseLangContent(content, language);
    } catch (error) {
      console.warn(`MCBE Translate Viewer: Could not fetch vanilla translations for ${language}:`, error);

      // Try to use stale cache if available
      const staleCache = this.readFromCache(language);
      if (staleCache) {
        console.log(`MCBE Translate Viewer: Using stale cache for ${language}`);
        return parseLangContent(staleCache, language);
      }

      return {};
    }
  }

  /**
   * Clears the cache for all or a specific language
   */
  public clearCache(language?: string): void {
    if (language) {
      const cachePath = this.getCachePath(language);
      const metaPath = this.getMetadataPath(language);
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    } else {
      // Clear all
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    }
  }

  /**
   * Forces a refresh of vanilla translations by clearing cache and re-fetching
   */
  public async forceRefresh(language: string): Promise<TranslationMap> {
    this.clearCache(language);
    return this.loadTranslations(language);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
