import * as vscode from 'vscode';
import { TranslationManager } from './translationManager';
import { findTranslateKeyAtPosition } from './translateKeyFinder';

/**
 * Hover provider for the MCBE Translate Viewer extension.
 */
export class TranslationHoverProvider implements vscode.HoverProvider {
  /**
   * Constructor for the TranslationHoverProvider.
   * @param translationManager - The translation manager.
   */
  constructor(private translationManager: TranslationManager) {}

  /**
   * Provides a hover for the given document and position.
   * @param document - The document to provide a hover for.
   * @param position - The position to provide a hover for.
   * @param _token - The cancellation token.
   * @returns A hover for the given document and position.
   */
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | null {
    const match = findTranslateKeyAtPosition(document, position);
    if (!match) return null;

    const translation = this.translationManager.getTranslation(match.key);
    const currentLanguage = this.translationManager.getCurrentLanguage();

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;

    if (translation) {
      // Header with the key
      markdown.appendMarkdown(`**🌐 Translation** *(${currentLanguage})*\n\n`);
      markdown.appendMarkdown(`---\n\n`);

      // The translation value
      markdown.appendMarkdown(`**Key:** \`${match.key}\`\n\n`);
      markdown.appendMarkdown(`**Value:**\n\n`);

      // Handle formatting codes in the value (Minecraft uses § for formatting)
      const displayValue = this.formatMinecraftText(translation.value);
      markdown.appendMarkdown(`> ${displayValue}\n\n`);

      // Show file location
      markdown.appendMarkdown(`---\n\n`);
      markdown.appendMarkdown(
        `*Defined in* \`${translation.filePath}\` *at line ${translation.line}*\n\n`
      );

      // Add command to go to definition
      const args = encodeURIComponent(
        JSON.stringify({
          filePath: translation.filePath,
          line: translation.line,
        })
      );
      markdown.appendMarkdown(
        `[$(go-to-file) Go to Definition](command:mcbeTranslateViewer.goToTranslation?${args})`
      );
    } else {
      // Key not found
      markdown.appendMarkdown(`**⚠️ Translation Not Found**\n\n`);
      markdown.appendMarkdown(`---\n\n`);
      markdown.appendMarkdown(`**Key:** \`${match.key}\`\n\n`);
      markdown.appendMarkdown(
        `No translation found for this key in \`${currentLanguage}.lang\`\n\n`
      );

      const packs = this.translationManager.getResourcePacks();
      if (packs.length === 0) {
        markdown.appendMarkdown(`*No resource packs detected in workspace.*\n`);
      } else {
        markdown.appendMarkdown(`*Searched in ${packs.length} resource pack(s)*\n`);
      }
    }

    const range = new vscode.Range(
      new vscode.Position(match.line, match.startCol),
      new vscode.Position(match.line, match.endCol)
    );

    return new vscode.Hover(markdown, range);
  }

  /**
   * Formats Minecraft formatting codes for display
   * § codes are used for colors and formatting in Minecraft
   */
  private formatMinecraftText(text: string): string {
    // Remove Minecraft formatting codes for cleaner display
    // §0-9, §a-f for colors, §k-o, §r for formatting
    return text.replace(/§[0-9a-fk-or]/gi, '');
  }
}
