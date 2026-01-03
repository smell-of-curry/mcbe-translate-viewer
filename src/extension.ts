import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { TranslationHoverProvider } from './hoverProvider';
import { TranslationDecorationProvider } from './decorationProvider';

let translationManager: TranslationManager;
let decorationProvider: TranslationDecorationProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('MCBE Translate Viewer is activating...');

  // Initialize the translation manager
  translationManager = new TranslationManager();
  await translationManager.refresh();

  // Log discovered resource packs
  const packs = translationManager.getResourcePacks();
  if (packs.length > 0) {
    console.log(`MCBE Translate Viewer: Found ${packs.length} resource pack(s):`);
    packs.forEach((pack) => {
      console.log(`  - ${pack.name} (${pack.path})`);
    });
  } else {
    console.log('MCBE Translate Viewer: No resource packs found in workspace');
  }

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
    vscode.commands.registerCommand('mcbeTranslateViewer.refreshTranslations', async () => {
      await translationManager.refresh();
      decorationProvider.refreshAllEditors();
      
      const packs = translationManager.getResourcePacks();
      const transCount = Object.keys(translationManager.getAllTranslations()).length;
      vscode.window.showInformationMessage(
        `MCBE Translate Viewer: Loaded ${transCount} translations from ${packs.length} resource pack(s)`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcbeTranslateViewer.selectLanguage', async () => {
      const languages = translationManager.getAvailableLanguages();
      
      if (languages.length === 0) {
        vscode.window.showWarningMessage('No languages available. Make sure a resource pack with texts is in the workspace.');
        return;
      }

      const currentLang = translationManager.getCurrentLanguage();
      const items = languages.map((lang) => ({
        label: lang,
        description: lang === currentLang ? '(current)' : undefined,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select translation language',
      });

      if (selected) {
        await translationManager.setLanguage(selected.label);
        decorationProvider.refreshAllEditors();
        vscode.window.showInformationMessage(`MCBE Translate Viewer: Language set to ${selected.label}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcbeTranslateViewer.goToTranslation', async (args: { filePath: string; line: number }) => {
      if (!args?.filePath || !args?.line) return;

      try {
        const document = await vscode.workspace.openTextDocument(args.filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        const position = new vscode.Position(args.line - 1, 0);
        const range = new vscode.Range(position, position);
        
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      } catch (error) {
        vscode.window.showErrorMessage(`Could not open file: ${args.filePath}`);
      }
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
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
    vscode.window.setStatusBarMessage(
      `$(globe) MCBE: ${transCount} translations loaded (${translationManager.getCurrentLanguage()})`,
      5000
    );
  }

  console.log('MCBE Translate Viewer activated successfully');
}

export function deactivate(): void {
  console.log('MCBE Translate Viewer deactivated');
}

