import * as vscode from 'vscode';
import {
  TranslationMap,
  TranslationEntry,
  loadTranslations,
  findAvailableLanguages,
} from './langParser';
import { getAllResourcePacks, ResourcePackInfo } from './resourcePackScanner';
import { VanillaTranslationProvider } from './vanillaTranslations';

export class TranslationManager {
  private translations: TranslationMap = {};
  private currentLanguage: string = 'en_US';
  private resourcePacks: ResourcePackInfo[] = [];
  private availableLanguages: string[] = [];
  private vanillaProvider: VanillaTranslationProvider | null = null;

  private readonly onDidChangeTranslationsEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTranslations = this.onDidChangeTranslationsEmitter.event;

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Initializes the vanilla translation provider with extension storage path
   */
  public initVanillaProvider(globalStoragePath: string): void {
    this.vanillaProvider = new VanillaTranslationProvider(globalStoragePath);
  }

  /**
   * Loads configuration from VS Code settings
   */
  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('mcbeTranslateViewer');
    this.currentLanguage = config.get<string>('defaultLanguage') ?? 'en_US';
  }

  /**
   * Refreshes the translation data by rescanning resource packs
   * Loads vanilla translations first, then layers user translations on top
   */
  public async refresh(): Promise<void> {
    this.loadConfiguration();
    this.resourcePacks = getAllResourcePacks();
    this.translations = {};
    this.availableLanguages = [];

    const allLanguages = new Set<string>();

    // Load vanilla translations first (these serve as the base/default)
    if (this.vanillaProvider) {
      try {
        const vanillaTranslations = await this.vanillaProvider.loadTranslations(
          this.currentLanguage
        );
        this.translations = { ...vanillaTranslations };

        // Add vanilla available languages
        const vanillaLanguages = this.vanillaProvider.getAvailableLanguages();
        vanillaLanguages.forEach(lang => allLanguages.add(lang));

        console.log(
          `MCBE Translate Viewer: Loaded ${Object.keys(vanillaTranslations).length} vanilla translations`
        );
      } catch (error) {
        console.warn('MCBE Translate Viewer: Failed to load vanilla translations:', error);
      }
    }

    // Load user resource pack translations (these override vanilla)
    for (const pack of this.resourcePacks) {
      if (!pack.hasTexts) continue;

      // Find available languages in this pack
      const languages = findAvailableLanguages(pack.textsPath);
      languages.forEach(lang => allLanguages.add(lang));

      // Load translations for the current language
      const packTranslations = loadTranslations(pack.path, this.currentLanguage);

      // Merge translations (user packs override vanilla and earlier packs)
      this.translations = { ...this.translations, ...packTranslations };
    }

    this.availableLanguages = Array.from(allLanguages).sort();
    this.onDidChangeTranslationsEmitter.fire();
  }

  /**
   * Gets a translation value for a key
   * @param key - The key to get the translation value for.
   * @returns The translation value for the key.
   */
  public getTranslation(key: string): TranslationEntry | undefined {
    return this.translations[key];
  }

  /**
   * Gets the translation value as a string (just the value)
   * @param key - The key to get the translation value for.
   * @returns The translation value for the key.
   */
  public getTranslationValue(key: string): string | undefined {
    return this.translations[key]?.value;
  }

  /**
   * Checks if a translation key exists
   * @param key - The key to check if it exists.
   * @returns True if the translation key exists, false otherwise.
   */
  public hasTranslation(key: string): boolean {
    return key in this.translations;
  }

  /**
   * Gets all available languages
   * @returns All available languages.
   */
  public getAvailableLanguages(): string[] {
    return this.availableLanguages;
  }

  /**
   * Gets the current language
   * @returns The current language.
   */
  public getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Sets the current language and reloads translations
   * @param language - The language to set.
   */
  public async setLanguage(language: string): Promise<void> {
    this.currentLanguage = language;
    await this.refresh();
  }

  /**
   * Gets the resource packs currently loaded
   * @returns The resource packs currently loaded.
   */
  public getResourcePacks(): ResourcePackInfo[] {
    return this.resourcePacks;
  }

  /**
   * Gets all translation entries (for search/listing purposes)
   * @returns All translation entries.
   */
  public getAllTranslations(): TranslationMap {
    return this.translations;
  }

  /**
   * Searches for translations matching a query
   * @param query - The query to search for.
   * @param limit - The limit of results to return.
   * @returns The search results.
   */
  public searchTranslations(query: string, limit: number = 50): TranslationEntry[] {
    const results: TranslationEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const entry of Object.values(this.translations)) {
      if (
        !entry.key.toLowerCase().includes(lowerQuery) &&
        !entry.value.toLowerCase().includes(lowerQuery)
      )
        continue;

      results.push(entry);
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Clears the vanilla translations cache and forces a re-fetch
   * @returns A promise that resolves when the vanilla translations cache is cleared.
   */
  public async clearVanillaCache(): Promise<void> {
    if (!this.vanillaProvider) return;
    this.vanillaProvider.clearCache();
    await this.refresh();
  }

  /**
   * Checks if vanilla translations are enabled
   * @returns True if vanilla translations are enabled, false otherwise.
   */
  public isVanillaEnabled(): boolean {
    return this.vanillaProvider?.isEnabled() ?? false;
  }

  /**
   * Disposes of the translation manager
   */
  public dispose(): void {
    this.onDidChangeTranslationsEmitter.dispose();
  }
}
