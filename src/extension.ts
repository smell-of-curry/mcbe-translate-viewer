import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { TranslationHoverProvider } from './hoverProvider';
import { TranslationDecorationProvider } from './decorationProvider';

/**
 * Translation manager for the MCBE Translate Viewer extension.
 */
let translationManager: TranslationManager;
/**
 * Decoration provider for the MCBE Translate Viewer extension.
 */
let decorationProvider: TranslationDecorationProvider;

/**
 * Activates the MCBE Translate Viewer extension.
 * @param context - The extension context.
 * @returns A promise that resolves when the extension is activated.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('MCBE Translate Viewer is activating...');

  // Initialize the translation manager with vanilla translations support
  translationManager = new TranslationManager();
  translationManager.initVanillaProvider(context.globalStorageUri.fsPath);
  await translationManager.refresh();

  // Log discovered resource packs
  const packs = translationManager.getResourcePacks();
  if (packs.length > 0) {
    console.log(`MCBE Translate Viewer: Found ${packs.length} resource pack(s):`);
    packs.forEach(pack => console.log(`  - ${pack.name} (${pack.path})`));
  } else console.log('MCBE Translate Viewer: No resource packs found in workspace');

  // Initialize hover provider for all document types
  const hoverProvider = new TranslationHoverProvider(translationManager);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider)
  );

  // Initialize decoration provider
  decorationProvider = new TranslationDecorationProvider(translationManager);
  context.subscriptions.push(decorationProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mcbeTranslateViewer.refreshTranslations', () => {
      void translationManager.refresh().then(() => {
        decorationProvider.refreshAllEditors();

        const packs = translationManager.getResourcePacks();
        const transCount = Object.keys(translationManager.getAllTranslations()).length;
        void vscode.window.showInformationMessage(
          `MCBE Translate Viewer: Loaded ${transCount} translations from ${packs.length} resource pack(s)`
        );
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcbeTranslateViewer.selectLanguage', () => {
      const languages = translationManager.getAvailableLanguages();

      if (languages.length === 0) {
        void vscode.window.showWarningMessage(
          'No languages available. Make sure a resource pack with texts is in the workspace.'
        );
        return;
      }

      const currentLang = translationManager.getCurrentLanguage();
      const items = languages.map(lang => ({
        label: lang,
        description: lang === currentLang ? '(current)' : undefined,
      }));

      void vscode.window
        .showQuickPick(items, {
          placeHolder: 'Select translation language',
        })
        .then(selected => {
          if (!selected) return;
          void translationManager.setLanguage(selected.label).then(() => {
            decorationProvider.refreshAllEditors();
            void vscode.window.showInformationMessage(
              `MCBE Translate Viewer: Language set to ${selected.label}`
            );
          });
        });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mcbeTranslateViewer.goToTranslation',
      (args: { filePath: string; line: number }) => {
        if (!args?.filePath || !args?.line) return;

        void vscode.workspace.openTextDocument(args.filePath).then(
          document => {
            void vscode.window.showTextDocument(document).then(editor => {
              const position = new vscode.Position(args.line - 1, 0);
              const range = new vscode.Range(position, position);

              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            });
          },
          () => {
            void vscode.window.showErrorMessage(`Could not open file: ${args.filePath}`);
          }
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcbeTranslateViewer.clearVanillaCache', () => {
      void translationManager.clearVanillaCache().then(() => {
        decorationProvider.refreshAllEditors();
        void vscode.window.showInformationMessage(
          'MCBE Translate Viewer: Vanilla translations cache cleared and refreshed'
        );
      });
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('mcbeTranslateViewer')) {
        await translationManager.refresh();
        decorationProvider.refreshAllEditors();
      }
    })
  );

  // Watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await translationManager.refresh();
      decorationProvider.refreshAllEditors();
    })
  );

  // Watch for .lang file changes
  const langFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.lang');
  context.subscriptions.push(
    langFileWatcher,
    langFileWatcher.onDidChange(async () => {
      await translationManager.refresh();
      decorationProvider.refreshAllEditors();
    }),
    langFileWatcher.onDidCreate(async () => {
      await translationManager.refresh();
      decorationProvider.refreshAllEditors();
    }),
    langFileWatcher.onDidDelete(async () => {
      await translationManager.refresh();
      decorationProvider.refreshAllEditors();
    })
  );

  // Store translation manager for disposal
  context.subscriptions.push(translationManager);

  // Show status message
  const transCount = Object.keys(translationManager.getAllTranslations()).length;
  if (transCount > 0) {
    const vanillaStatus = translationManager.isVanillaEnabled() ? ' + vanilla' : '';
    vscode.window.setStatusBarMessage(
      `$(globe) MCBE: ${transCount} translations loaded (${translationManager.getCurrentLanguage()}${vanillaStatus})`,
      5000
    );
  }

  console.log('MCBE Translate Viewer activated successfully');
}

export function deactivate(): void {
  console.log('MCBE Translate Viewer deactivated');
}
