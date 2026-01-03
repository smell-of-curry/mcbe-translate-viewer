import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { findAllTranslateKeys, getMatchRange } from './translateKeyFinder';

export class TranslationDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private missingDecorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];

  constructor(private translationManager: TranslationManager) {
    // Create decoration types
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
    });

    this.missingDecorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editorWarning.background'),
      border: '1px solid',
      borderColor: new vscode.ThemeColor('editorWarning.foreground'),
      after: {
        contentText: ' ⚠️ Missing translation',
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
    });

    // Subscribe to events
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.updateDecorations(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
          this.updateDecorations(editor);
        }
      }),
      translationManager.onDidChangeTranslations(() => {
        const editor = vscode.window.activeTextEditor;
        if (editor) this.updateDecorations(editor);
      })
    );

    // Initial decoration update
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }
  }

  /**
   * Updates decorations for the given editor
   */
  public updateDecorations(editor: vscode.TextEditor): void {
    const config = vscode.workspace.getConfiguration('mcbeTranslateViewer');
    const showInline = config.get<boolean>('showInlineTranslations', true);
    const highlightMissing = config.get<boolean>('highlightMissingTranslations', true);
    const maxLength = config.get<number>('inlineMaxLength', 60);

    if (!showInline && !highlightMissing) {
      editor.setDecorations(this.decorationType, []);
      editor.setDecorations(this.missingDecorationType, []);
      return;
    }

    const document = editor.document;
    const matches = findAllTranslateKeys(document);

    const foundDecorations: vscode.DecorationOptions[] = [];
    const missingDecorations: vscode.DecorationOptions[] = [];

    for (const match of matches) {
      const translation = this.translationManager.getTranslation(match.key);
      const range = getMatchRange(match);

      if (translation) {
        if (showInline) {
          // Truncate long translations
          let displayValue = this.formatDisplayValue(translation.value);
          if (displayValue.length > maxLength) {
            displayValue = displayValue.substring(0, maxLength - 3) + '...';
          }

          foundDecorations.push({
            range,
            renderOptions: {
              after: {
                contentText: `→ ${displayValue}`,
              },
            },
          });
        }
      } else if (highlightMissing) {
        missingDecorations.push({ range });
      }
    }

    editor.setDecorations(this.decorationType, foundDecorations);
    editor.setDecorations(this.missingDecorationType, missingDecorations);
  }

  /**
   * Formats the translation value for display (removes Minecraft formatting codes)
   */
  private formatDisplayValue(value: string): string {
    // Remove Minecraft formatting codes
    return value.replace(/§[0-9a-fk-or]/gi, '');
  }

  /**
   * Triggers a refresh of all visible editors
   */
  public refreshAllEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  public dispose(): void {
    this.decorationType.dispose();
    this.missingDecorationType.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

