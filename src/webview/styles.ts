/** Returns the CSS rules for the commit builder webview, using VS Code theme variables. */
export function getStyles(): string {
  return /* css */ `
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 8px 12px 16px;
    }
    label {
      display: block;
      margin-top: 10px;
      margin-bottom: 4px;
      font-weight: 600;
    }
    select,
    input[type='text'],
    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 4px 6px;
      font-family: inherit;
      font-size: inherit;
      border-radius: 2px;
    }
    select:focus,
    input:focus,
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    textarea {
      resize: vertical;
      min-height: 60px;
    }
    .row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .row select {
      flex: 1;
    }
    .row input[type='text'] {
      flex: 2;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 10px;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      flex: 0 0 auto;
      padding: 4px 8px;
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    #fillCommit {
      width: 100%;
      margin-top: 14px;
      padding: 6px;
      font-weight: 600;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
    }
    .checkbox-row label {
      margin: 0;
      font-weight: normal;
    }
    #charCounter {
      font-size: 0.85em;
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
    }
    #charCounter.warn {
      color: var(--vscode-editorWarning-foreground);
    }
    #charCounter.over {
      color: var(--vscode-editorError-foreground);
    }
    #preview {
      margin-top: 14px;
      padding: 8px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      min-height: 2em;
    }
    #breakingChangeDescriptionRow {
      display: none;
    }
    #breakingChangeDescriptionRow.visible {
      display: block;
    }
  `;
}
