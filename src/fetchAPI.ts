/* eslint-disable @typescript-eslint/naming-convention */
import {
    Position,
    TextDocument,
    Range,
    Command,
    window,
    commands,
    workspace
} from "vscode";
import * as fetchH2 from 'fetch-h2';


// curl https://inference.smallcloud.ai/v1/contrast \
//   -H 'Content-Type: application/json' \
//   -H "Authorization: Bearer $SMALLCLOUD_API_KEY" \
//   -d '{
//   "model": "CONTRASTcode/large",
//   "sources": {"hello.py": "def hello_world():\n    pass\n\ndef a_distraction_function():\n    print(\"there to distract!\")\n\n"},
//   "intent": "Implement hello_world function",
//   "function": "highlight",
//   "cursor_file": "hello.py",
//   "cursor0": 25,
//   "cursor1": 25,
//   "stream": false,
//   "temperature": 0.7,
//   "max_tokens": 50
// }'

// "properties": [
//     {
//         "id": "plugin-vscode.contrastUrl",
//         "title": "Use CONTRAST model at this URL",
//         "type": "string",
//         "default": "https://inference.smallcloud.ai/v1/contrast"

export function fetchAPI(
    sources: { [key: string]: string },
    intent: string,
    functionName: string,
    cursorFile: string,
    cursor0: number,
    cursor1: number,
    maxTokens: number,
    maxEdits: number,
) {
    const url = "https://inference.smallcloud.ai/v1/contrast";
    // const url = window.env.get("plugin-vscode.contrastUrl");
    const body = JSON.stringify({
        "model": workspace.getConfiguration().get('mate.model'),
        "sources": sources,
        "intent": intent,
        "function": functionName,
        "cursor_file": cursorFile,
        "cursor0": cursor0,
        "cursor1": cursor1,
        "temperature": 0.2,
        "max_tokens": maxTokens,
        "max_edits": maxEdits
    });
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer AAA1337`,
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        body: body,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    let promise = fetchH2.fetch(req);
    return promise;
}
