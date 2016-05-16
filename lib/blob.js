'use babel';

import config from './config-schema.json';
import BlobProvider from './blob-provider';
import { CompositeDisposable, Range, Point } from 'atom';
import FS from 'fs';
import Path from 'path';

export default {
    config: config,

    includeAPI(globalAPI, api, dir){
        for (attribute in api)
        {
            if ((Array.isArray(api[attribute])) && (attribute.match(/(functions|options|inputs|states|enums|includes)/)))
            {
                if (attribute == "includes") this.loadAPIFiles(api.includes.map((file) => Path.join(dir, file)), globalAPI);
                else
                {
                    for (attr of api[attribute])
                    {
                        this.includeAPI(attr, attr, dir);
                    }
                }
            }
        }
    },

    loadAPI(globalAPI, dir, err, data){
        if (err) throw err;
        let api = JSON.parse(data);
        for (attribute in api)
        {
            if (Array.isArray(api[attribute]))
            {
                if (Array.isArray(globalAPI[attribute])) globalAPI[attribute].push(...api[attribute]);
                else globalAPI[attribute] = api[attribute];
            }
        }

        this.includeAPI(globalAPI, api, dir);
    },

    loadAPIFiles(files, globalAPI){
        for (file of files)
        {
            FS.readFile(file, "utf8", this.loadAPI.bind(this, globalAPI, Path.dirname(file)));
        }
    },

    activate(state){
        this.loadAPIFiles(atom.config.get("language-blob.apiSpecs"), BlobProvider.api);
        this.subscriptions = new CompositeDisposable();

        this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {
            this.subscriptions.add(editor.observeGrammar((grammar) => {
                if (grammar.scopeName == "source.blob")
                {
                    editor.blobSubscription = editor.onDidStopChanging((changes) => {
                        for (diff of changes.changes)
                        {
                            let buffer = editor.getBuffer();
                            for (let cursor = diff.start, countY = diff.start.row + diff.newExtent.row; cursor.row <= countY; cursor.row++)
                            {
                                for (let countX = cursor.row == diff.newExtent.row ? diff.newExtent.column : buffer.lineLengthForRow(cursor.row); cursor.column < countX; cursor.column += 7) //the max amount of characters to not skip (enum!) and (state!)
                                {
                                    let type = editor.scopeDescriptorForBufferPosition(cursor).getScopesArray().find((e) => e.match(/blob-function-(state|enum)!/) != null);
                                    if (type)
                                    {
                                        if (type.includes(".blob-function-state!."))
                                        {
                                            for (state of editor.blobAPI.states)
                                            {
                                                if (!state.marker.getBufferRange().containsPoint(cursor, false))
                                                {
                                                    //TODO: Later workout range for state and add it to the API instead of doing this expensive operation
                                                    this.buildAPIForEditor(editor, grammar);
                                                    return;
                                                }
                                            }
                                        }

                                        else if (type.includes(".blob-function-enum!."))
                                        {
                                            for (constant of editor.blobAPI.enums)
                                            {
                                                if (constant.enumMarker != undefined)
                                                {
                                                    if (!constant.enumMarker.getBufferRange().containsPoint(cursor, false))
                                                    {
                                                        //TODO: Later workout range for enum and add it to the API instead of doing this expensive operation
                                                        this.buildAPIForEditor(editor, grammar);
                                                        return;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                cursor.column = 0;
                            }
                        }
                    });

                    this.subscriptions.add(editor.blobSubscription);
                    this.buildAPIForEditor(editor, grammar);
                }

                else if (editor.blobSubscription)
                {
                    this.subscriptions.remove(editor.blobSubscription);
                    editor.blobSubscription.dispose();
                    editor.blobSubscription = null;
                }
            }));
        }));
    },

    deactivate(){
        this.subscriptions.dispose();
    },

    provide(){
        return BlobProvider;
    },

    apiForTokens(lines){
        let api = {
            states: [],
            enums: []
        };
        let complete = [];
        let start;

        const KIND = {
            NONE: 0,
            STATE: 1,
            ENUM: 2
        };
        let kind = KIND.NONE, row = 0;
        for (line of lines)
        {
            let column = 0;
            for (token of line)
            {
                let type = token.scopes[token.scopes.length - 1];
                if (kind === KIND.NONE)
                {
                    start = [row, column];
                    if (type.includes(".blob-function-state!.")) kind = KIND.STATE;
                    else if (type.includes(".blob-function-enum!.")) kind = KIND.ENUM;
                }

                else if ((token.value === ")") && (type.match(/blob-function-(state|enum)!/)))
                {
                    if (complete.length)
                    {
                        //TODO: Comments on the same line as the declaration could possibly be used for the description
                        if (kind === KIND.STATE)
                        {
                            let inferredType = { type: "expression" };
                            if (complete.length > 1)
                            {
                                if (complete[1].type.includes("blob-atom")) inferredType = { type: "atom" };
                                else if (complete[1].type.includes("blob-number")) inferredType = { type: "number" };
                                else if (complete[1].type.includes("blob-bool")) inferredType = { type: "boolean" };
                                else if (complete[1].type.includes("blob-string")) inferredType = { type: "string" };
                                else if (complete[1].type.includes("blob-expression")) inferredType = { type: "list" };
                                else if (complete[1].type.includes("blob-enum")) inferredType = { type: "integer" };
                            }

                            api.states.push({
                                name: complete[0].value.startsWith(".") ? complete[0].value.substr(1) : complete[0].value,
                                return: inferredType,
                                args: [[inferredType]],
                                range: new Range(start, [row, column + 1])
                            });
                        }

                        else
                        {
                            let constants = [];
                            for (item of complete)
                            {
                                if (item.type.includes("blob-string"))
                                {
                                    let constant = {
                                        name: item.value.startsWith("&") ? item.value.substr(1) : item.value,
                                        return: { "type": "integer" },
                                        range: new Range([item.start[0], item.start[1] - 1], [item.start[0], item.start[1] + item.value.length + 1])
                                    };
                                    api.enums.push(constant);
                                    constants.push(constant);
                                }
                            }

                            if (constants.length)
                            {
                                constants[0].enumRange = new Range(start, [row, column + 1]);
                                constants[0].constants = constants;
                            }
                        }
                    }

                    complete = [];
                    kind = KIND.NONE;
                }

                else if ((!token.value.match(/^[\s\"]*$/)) && (type !== "comment.blob"))
                {
                    complete.push({
                        value: token.value,
                        type: type,
                        start: [row, column]
                    });
                }

                column += token.value.length;
            }

            row++;
        }

        return api;
    },

    markEnumsInEditor(editor, grammar, enums, currentMarker){
        /*
        FIXME: Kind of works but has some issues with updating enums. Current workaround
               is to insert a newline and then delete so the entire enum is regenerated.
        */
        let adjust = currentMarker ? new Point(currentMarker.getStartBufferPosition().row, 0) : new Point(0, 0);
        for (constant of enums)
        {
            let marker = editor.markBufferRange(constant.range.translate(adjust), { invalidate: "inside" });
            constant.marker = marker;

            marker.onDidChange(function(constant, change){
                let text = editor.getTextInBufferRange(new Range(change.newTailBufferPosition, change.newHeadBufferPosition)).slice(1, -1);
                constant.name = text.startsWith("&") ? text.substr(1) : text;
            }.bind(this, constant));

            if (constant.enumRange != undefined)
            {
                if (currentMarker != undefined) constant.enumMarker = currentMarker;
                else constant.enumMarker = editor.markBufferRange(constant.enumRange, { invalidate: "inside" });

                constant.currentMarker = constant.enumMarker.onDidChange(function(constant, change){
                    let text = editor.getTextInBufferRange(new Range(change.newTailBufferPosition, change.newHeadBufferPosition));
                    let api = this.apiForTokens(grammar.tokenizeLines(text));

                    if (api.enums.length != constant.constants.length)
                    {
                        let index = editor.blobAPI.enums.indexOf(constant);
                        constant.marker.destroy();
                        constant.currentMarker.dispose();

                        if (api.enums.length) this.markEnumsInEditor(editor, grammar, api.enums, constant.enumMarker);
                        else constant.enumMarker.destroy();

                        editor.blobAPI.enums.splice(index, constant.constants.length, ...api.enums);
                    }
                }.bind(this, constant));
            }
        }
    },

    buildAPIForEditor(editor, grammar){
        editor.blobAPI = this.apiForTokens(grammar.tokenizeLines(editor.getText()));

        for (state of editor.blobAPI.states)
        {
            let marker = editor.markBufferRange(state.range, { invalidate: "inside" });
            state.marker = marker;

            marker.onDidChange(function(state, change){
                let text = editor.getTextInBufferRange(new Range(change.newTailBufferPosition, change.newHeadBufferPosition));
                let api = this.apiForTokens(grammar.tokenizeLines(text));
                if ((api.enums.length) || (api.states.length != 1))
                {
                    editor.blobAPI.states.splice(editor.blobAPI.states.indexOf(state), 1);
                    state.marker.destroy();
                }

                else
                {
                    state.name = api.states[0].name;
                    state.return = api.states[0].return;
                    state.args = api.states[0].args;
                }
            }.bind(this, state));
        }

        this.markEnumsInEditor(editor, grammar, editor.blobAPI.enums);
    }
};
