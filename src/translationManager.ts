import * as vscode from 'vscode';
import { TranslationMap, TranslationEntry, loadTranslations, findAvailableLanguages, parseLangFile, getLangFilePath } from './langParser';
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
    this.currentLanguage = config.get<string>('defaultLanguage') || 'en_US';
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
        const vanillaTranslations = await this.vanillaProvider.loadTranslations(this.currentLanguage);
        this.translations = { ...vanillaTranslations };
        
        // Add vanilla available languages
        const vanillaLanguages = await this.vanillaProvider.getAvailableLanguages();
        vanillaLanguages.forEach((lang) => allLanguages.add(lang));
        
        console.log(`MCBE Translate Viewer: Loaded ${Object.keys(vanillaTranslations).length} vanilla translations`);
      } catch (error) {
        console.warn('MCBE Translate Viewer: Failed to load vanilla translations:', error);
      }
    }

    // Load user resource pack translations (these override vanilla)
    for (const pack of this.resourcePacks) {
      if (!pack.hasTexts) continue;

      // Find available languages in this pack
      const languages = findAvailableLanguages(pack.textsPath);
      languages.forEach((lang) => allLanguages.add(lang));

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
   */
  public getTranslation(key: string): TranslationEntry | undefined {
    return this.translations[key];
  }

  /**
   * Gets the translation value as a string (just the value)
   */
  public getTranslationValue(key: string): string | undefined {
    return this.translations[key]?.value;
  }

  /**
   * Checks if a translation key exists
   */
  public hasTranslation(key: string): boolean {
    return key in this.translations;
  }

  /**
   * Gets all available languages
   */
  public getAvailableLanguages(): string[] {
    return this.availableLanguages;
  }

  /**
   * Gets the current language
   */
  public getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Sets the current language and reloads translations
   */
  public async setLanguage(language: string): Promise<void> {
    this.currentLanguage = language;
    await this.refresh();
  }

  /**
   * Gets the resource packs currently loaded
   */
  public getResourcePacks(): ResourcePackInfo[] {
    return this.resourcePacks;
  }

  /**
   * Gets all translation entries (for search/listing purposes)
   */
  public getAllTranslations(): TranslationMap {
    return this.translations;
  }

  /**
   * Searches for translations matching a query
   */
  public searchTranslations(query: string, limit: number = 50): TranslationEntry[] {
    const results: TranslationEntry[] = [];
    const lowerQuery = query.toLowerCase();

    for (const entry of Object.values(this.translations)) {
      if (
        entry.key.toLowerCase().includes(lowerQuery) ||
        entry.value.toLowerCase().includes(lowerQuery)
      ) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Clears the vanilla translations cache and forces a re-fetch
   */
  public async clearVanillaCache(): Promise<void> {
    if (this.vanillaProvider) {
      this.vanillaProvider.clearCache();
      await this.refresh();
    }
  }

  /**
   * Checks if vanilla translations are enabled
   */
  public isVanillaEnabled(): boolean {
    return this.vanillaProvider?.isEnabled() ?? false;
  }

  public dispose(): void {
    this.onDidChangeTranslationsEmitter.dispose();
  }
}

s