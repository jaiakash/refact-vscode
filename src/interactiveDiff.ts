/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import * as editChaining from "./editChaining";
import * as storeVersions from './storeVersions';
import * as estate from './estate';
import * as highlight from "./highlight";
import * as codeLens from "./codeLens";
import * as dataCollection from "./dataCollection";


let global_nav_counter: number = 0;


export function on_cursor_moved(editor: vscode.TextEditor, pos: vscode.Position, is_mouse: boolean)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    global_nav_counter += 1;
    for (let i = 0; i < state.sensitive_ranges.length; i++) {
        const element = state.sensitive_ranges[i];
        if (element.range.contains(pos)) {
            let my_counter = global_nav_counter;
            setTimeout(() => {
                if (!state) {
                    return;
                }
                if (global_nav_counter === my_counter) {
                    query_diff(editor, element.range, "diff-atcursor");
                }
            }, is_mouse ? 0 : 300);
        }
    }
    let selection = editor.selection;
    let is_empty = selection.anchor.line === selection.active.line && selection.anchor.character === selection.active.character;
    if (!is_empty && !state.diff_changing_doc) {
        // TODO: this branch doesn't work, check again
        hands_off_dont_remove_presentation(editor);
    }
}


export async function query_diff(editor: vscode.TextEditor, sensitive_area: vscode.Range, model_function: string)
{
    // NOT called from estate switch mode
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    let doc = editor.document;

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    let request = new fetchAPI.PendingRequest(undefined, cancelToken);

    await fetchAPI.cancel_all_requests_and_wait_until_finished();
    await estate.back_to_normal(state);
    request.cancellationTokenSource = cancellationTokenSource;
    let login = await userLogin.inference_login();
    if (!login) { return; }
    await fetchAPI.wait_until_all_requests_finished();
    if (cancelToken.isCancellationRequested) {
        return;
    }
    let file_name = storeVersions.filename_from_document(doc);
    let json: any;
    await estate.switch_mode(state, estate.Mode.DiffWait);
    animation_start(editor, sensitive_area);
    state.diff_lens_pos = sensitive_area.start.line;
    codeLens.quick_refresh();
    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 550;
    let stop_tokens: string[] = [];
    let max_edits = model_function==="diff-atcursor" ? 1 : 10; // the other is "diff-selection"
    let stream = false;
    request.supply_stream(...fetchAPI.fetch_api_promise(
        cancelToken,
        "query_diff",  // scope
        sources,
        estate.global_intent,
        model_function,
        file_name,
        doc.offsetAt(sensitive_area.start),
        doc.offsetAt(sensitive_area.end),
        max_tokens,
        max_edits,
        stop_tokens,
        stream,
    ));
    let feedback = state.data_feedback_candidate;
    if (feedback) {
        feedback.sources = sources;
        feedback.intent = estate.global_intent;
        feedback.function = model_function;
        feedback.cursor_file = file_name;
        feedback.cursor_pos0 = doc.offsetAt(sensitive_area.start);
        feedback.cursor_pos1 = doc.offsetAt(sensitive_area.end);
        feedback.ts = Date.now();
    }
    json = await request.apiPromise;
    if (json === undefined) {
        if (state.get_mode() === estate.Mode.DiffWait) {
            await estate.switch_mode(state, estate.Mode.Normal);
        }
        return;
    }
    if (state.get_mode() !== estate.Mode.DiffWait) {
        return;
    }
    if (cancelToken.isCancellationRequested) {
        if (state.get_mode() === estate.Mode.DiffWait) {
            await estate.switch_mode(state, estate.Mode.Normal);
        }
        return;
    }
    if (!cancelToken.isCancellationRequested) {
        if (json && json["choices"]) {
            let modif_doc = json["choices"][0]["files"][file_name];
            if (feedback) {
                feedback.results = json["choices"][0]["files"];
                feedback.ts = Date.now();
            }
            state.showing_diff_for_range = sensitive_area;
            state.showing_diff_for_function = model_function;
            state.showing_diff_edit_chain = undefined;
            state.showing_diff_modif_doc = modif_doc;
            await estate.switch_mode(state, estate.Mode.Diff);
        }
    }
    if (state.get_mode() === estate.Mode.DiffWait) {
        await estate.switch_mode(state, estate.Mode.Normal);
    }
}

export async function animation_start(editor: vscode.TextEditor, sensitive_area: vscode.Range)
{
    highlight.hl_clear(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    let animation_decos: vscode.TextEditorDecorationType[] = [];
    let animation_ranges: vscode.Range[][] = [];
    for (let c=0; c<20; c++) {
        let phase = c / 10;
        let red =   Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + Math.PI)));
        let blue =  Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + Math.PI / 2)));
        let green = Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + 3 * Math.PI / 2)));
        let red_str = red.toString();
        let green_str = green.toString();
        let blue_str = blue.toString();
        animation_decos.push(vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(' + red_str + ', ' + green_str + ', ' + blue_str + ', 0.3)',
            // isWholeLine: true,
        }));
        animation_ranges.push([]);
    }
    let t = 0;
    while (state.get_mode() === estate.Mode.DiffWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        for (let a=0; a<animation_decos.length; a++) {
            animation_ranges[a].length = 0;
        }
        for (let line_n=sensitive_area.start.line; line_n<=sensitive_area.end.line; line_n++) {
            let line = editor.document.lineAt(line_n);
            for (let c=0; c<line.text.length; c+=2) {
                let a = (line_n + c + t) % animation_decos.length;
                let range = new vscode.Range(
                    new vscode.Position(line_n, c),
                    new vscode.Position(line_n, c+2),
                );
                animation_ranges[a].push(range);
            }
        }
        for (let a=0; a<animation_decos.length; a++) {
            editor.setDecorations(animation_decos[a], animation_ranges[a]);
        }
        t += 1;
    }
    for (let a=0; a<animation_decos.length; a++) {
        animation_decos[a].dispose();
    }
}

export async function present_diff_to_user(editor: vscode.TextEditor, modif_doc: string, move_cursor: boolean)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    _remove_decoration(editor);
    highlight.hl_clear(editor);
    let document = editor.document;
    let whole_doc = document.getText();
    let no_newline = whole_doc[whole_doc.length-1] !== "\n";
    if (no_newline) {   // server side always adds the missing newline, client side diff gets confused
        whole_doc += "\n";
    }
    if (whole_doc === modif_doc) {
        // no change, but go on because we want UI to be the same
    }
    const diff = Diff.diffLines(whole_doc, modif_doc);
    let green_bg_ranges: vscode.Range[] = [];
    let red_bg_ranges: vscode.Range[] = [];
    let very_green_bg_ranges: vscode.Range[] = [];
    let very_red_bg_ranges: vscode.Range[] = [];
    state.diffDeletedLines = [];
    state.diffAddedLines = [];
    state.diff_changing_doc = true;
    await editor.edit((e: vscode.TextEditorEdit) => {
        if (no_newline) {
            e.insert(new vscode.Position(document.lineCount, 0), "\n");
        }
        let line_n = 0;
        let line_n_insert = 0;
        let chunk_remember_removed = '';
        let chunk_remember_removed_line = -1;
        let chunk_remember_added = '';
        let chunk_remember_added_line = -1;
        diff.forEach((part: any) => {
            if (!state) {
                return;
            }
            let span = part.value;
            let span_lines = span.split('\n');
            let span_lines_count = span_lines.length - 1;
            if (part.removed) {
                // console.log(["removed span_lines_count", span_lines_count, span]);
                red_bg_ranges.push(new vscode.Range(
                    new vscode.Position(line_n, 0),
                    new vscode.Position(line_n + span_lines_count - 1, 0),
                ));
                for (let i=0; i<span_lines_count; i++) {
                    state.diffDeletedLines.push(line_n + i);
                }
                chunk_remember_removed = span;
                chunk_remember_removed_line = line_n;
                line_n += span_lines_count;
                line_n_insert += span_lines_count;
            } else if (part.added) {
                // console.log(["added span_lines_count", span_lines_count, span]);
                e.insert(
                    new vscode.Position(line_n_insert, 0),
                    span
                    );
                green_bg_ranges.push(new vscode.Range(
                    new vscode.Position(line_n, 0),
                    new vscode.Position(line_n + span_lines_count - 1, 0),
                ));
                for (let i=0; i<span_lines_count; i++) {
                    state.diffAddedLines.push(line_n + i);
                }
                chunk_remember_added = span;
                chunk_remember_added_line = line_n;
                line_n += span_lines_count;
                if (chunk_remember_removed) {
                    const diff_char = Diff.diffChars(chunk_remember_removed, chunk_remember_added);
                    let char_del_line = chunk_remember_removed_line;
                    let char_ins_line = chunk_remember_added_line;
                    let char_del_pos = 0;
                    let char_ins_pos = 0;
                    diff_char.forEach((part_char: any) => {
                        let txt = part_char.value;
                        if (part_char.removed) {
                            very_red_bg_ranges.push(new vscode.Range(
                                new vscode.Position(char_del_line, char_del_pos),
                                new vscode.Position(char_del_line, char_del_pos + txt.length),
                            ));
                        } else if (part_char.added) {
                            very_green_bg_ranges.push(new vscode.Range(
                                new vscode.Position(char_ins_line, char_ins_pos),
                                new vscode.Position(char_ins_line, char_ins_pos + txt.length),
                            ));
                        }
                        if (part_char.removed || part_char.added === undefined) {
                            for (let c=0; c<txt.length; c++) {
                                if (txt[c] === '\n') {
                                    char_del_line++;
                                    char_del_pos = 0;
                                } else {
                                    char_del_pos++;
                                }
                            }
                        }
                        if (part_char.added || part_char.removed === undefined) {
                            for (let c=0; c<txt.length; c++) {
                                if (txt[c] === '\n') {
                                    char_ins_line++;
                                    char_ins_pos = 0;
                                } else {
                                    char_ins_pos++;
                                }
                            }
                        }
                    });
                }
            } else {
                // console.log(["unchanged", span.length]);
                line_n += span_lines_count;
                line_n_insert += span_lines_count;
                chunk_remember_removed = "";
            }
        });
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        let state = estate.state_of_editor(editor);
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        let norm_fg = new vscode.ThemeColor('editor.foreground');
        // let ghost_text_color = new vscode.ThemeColor('editorGhostText.foreground');
        // let inserted_line_bg = new vscode.ThemeColor('diffEditor.insertedLineBackground');
        // let green_type = vscode.window.createTextEditorDecorationType({
        //     color: ghost_text_color,
        //     isWholeLine: true,
        // });
        let extension_path = vscode.extensions.getExtension('smallcloud.codify')!.extensionPath;
        let green_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.1)',
            color: norm_fg,
            isWholeLine: true,
            gutterIconPath: extension_path + '/images/add_line.svg',
            gutterIconSize: '40%',
        });
        let very_green_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.30)',
            color: norm_fg,
        });
        // let red_path = vscode.Uri.file('././images/add_plus_icon.svg');
        let red_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            isWholeLine: true,
            gutterIconPath: extension_path + '/images/remove_line.svg',
            gutterIconSize: '40%',
        });
        let very_red_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.30)',
        });
        editor.setDecorations(green_type, green_bg_ranges);
        editor.setDecorations(red_type, red_bg_ranges);
        editor.setDecorations(very_green_type, very_green_bg_ranges);
        editor.setDecorations(very_red_type, very_red_bg_ranges);
        let scroll_to: number[] = [];
        if (state.diffAddedLines.length > 0) {
            scroll_to.push(state.diffAddedLines[0]);
            scroll_to.push(state.diffAddedLines[state.diffAddedLines.length - 1]);
        }
        if (state.diffDeletedLines.length > 0) {
            scroll_to.push(state.diffDeletedLines[0]);
            scroll_to.push(state.diffDeletedLines[state.diffDeletedLines.length - 1]);
        }
        if (scroll_to.length > 0) {
            let reveal_range = new vscode.Range(
                new vscode.Position(Math.min(...scroll_to), 0),
                new vscode.Position(Math.max(...scroll_to), 0),
            );
            editor.revealRange(reveal_range);
            if (move_cursor) {
                editor.selection = new vscode.Selection(reveal_range.start, reveal_range.start);
            }
        }
        state.diffDecos.push(green_type);
        state.diffDecos.push(red_type);
        state.diffDecos.push(very_green_type);
        state.diffDecos.push(very_red_type);
    });
    state.diff_lens_pos = Math.min(state.diff_lens_pos, ...state.diffAddedLines, ...state.diffDeletedLines);
    console.log(["code_lens_pos", state.diff_lens_pos]);
    codeLens.quick_refresh();
}


function _remove_decoration(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    for (let deco of state.diffDecos) {
        deco.dispose();
    }
    state.diffDecos.length = 0;
    state.diffAddedLines.length = 0;
    state.diffDeletedLines.length = 0;
}


export async function dislike_and_rollback(editor: vscode.TextEditor)
{
    editChaining.cleanup_edit_chaining_in_state(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.diff_changing_doc = true;
    await editor.edit((e) => {
        if (!state) {
            return;
        }
        for (let i=0; i<state.diffAddedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffAddedLines[i], 0),
                new vscode.Position(state.diffAddedLines[i] + 1, 0),
            ));
        }
    }, { undoStopBefore: false, undoStopAfter: false }).then(async () => {
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        _remove_decoration(editor);
        let feedback = state.data_feedback_candidate;
        if (feedback && feedback.cursor_file) {
            feedback.positive = false;
            await dataCollection.data_collection_save_record(feedback);
        }
        dataCollection.data_collection_reset(state);
    });
}


export async function like_and_accept(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.diff_changing_doc = true;
    state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
    let thenable = editor.edit((e) => {
        if (!state) {
            return;
        }
        for (let i=0; i<state.diffDeletedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffDeletedLines[i], 0),
                new vscode.Position(state.diffDeletedLines[i] + 1, 0),
            ));
        }
    }, { undoStopBefore: false, undoStopAfter: true });
    thenable.then(async () => {
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        _remove_decoration(editor);
        vscode.commands.executeCommand('setContext', 'codify.runTab', false);
        console.log(["TAB OFF DIFF"]);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
        console.log(["ESC OFF DIFF"]);
        if (state.highlight_json_backup) {
            state.highlight_json_backup = undefined;
            await estate.back_to_normal(state);
            highlight.query_highlight(editor, undefined);
        } else {
            state.highlight_json_backup = undefined;
            await estate.back_to_normal(state);
            // console.log(["TRIGGER SUGGEST"]);
            // state.inline_prefer_edit_chaining = true;
            // vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        }
        codeLens.quick_refresh();
        let feedback = state.data_feedback_candidate;
        if (feedback && feedback.cursor_file) {
            feedback.positive = true;
            await dataCollection.data_collection_save_record(feedback);
        }
        dataCollection.data_collection_reset(state);
    });
    await thenable;
}


export async function query_the_same_thing_again(editor: vscode.TextEditor)
{
    editChaining.cleanup_edit_chaining_in_state(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    if (state.showing_diff_edit_chain !== undefined) {
        await editChaining.query_edit_chaining(true);
        let modif_doc = state.edit_chain_modif_doc;
        if (modif_doc) {
            state.showing_diff_for_range = undefined;
            state.showing_diff_for_function = "edit-chain";
            await present_diff_to_user(editor, modif_doc, true);
        }
        return;
    }
    if (state.showing_diff_for_range !== undefined && state.showing_diff_for_function !== undefined) {
        _remove_decoration(editor);
        query_diff(editor, state.showing_diff_for_range, state.showing_diff_for_function);
    }
}


export function hands_off_dont_remove_presentation(editor: vscode.TextEditor)
{
    // Don't delete anything, user has already started same edit, leave it alone
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.edit_chain_modif_doc = undefined;
    _remove_decoration(editor);
}
