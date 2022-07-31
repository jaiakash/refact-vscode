// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "plugin-vscode" is now active!');

	let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', () => {
		console.log(["Accepted"]);
	});

	const comp = new MyInlineCompletionProvider();
	vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

	let disposable = vscode.commands.registerCommand('plugin-vscode.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from plugin-vscode!');
	});

	let disposable3 = vscode.commands.registerCommand('plugin-vscode.f1', () => {
        highlight.getHighlight(context);
		vscode.window.showInformationMessage('F1 from plugin-vscode!');
	});

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', () => {
        highlight.clearDecorations();
        // highlight.getHighlight(context);
		vscode.window.showInformationMessage('ESC');
	});


	context.subscriptions.push(disposable);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
}

// this method is called when your extension is deactivated
export function deactivate() {}
