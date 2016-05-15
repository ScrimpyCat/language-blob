'use babel';

import BlobProvider from './blob-provider';
import { CompositeDisposable, Range, Point } from 'atom';
import FS from 'fs';

export default {
    activate(state){
        var file = "src/scripting/api.json";
        FS.readFile(file, "utf8", (err, data) => {
            if (err) throw err;
            BlobProvider.api = JSON.parse(data);

            this.subscriptions = new CompositeDisposable();

            this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {
                this.subscriptions.add(editor.observeGrammar((grammar) => {
                    if (grammar.scopeName == "source.blob")
                    {
                        // editor.blobSubscription = editor.onDidStopChanging((changes) => {
                        //     for (diff of changes.changes)
                        //     {
                        //         if (diff.newText == "")
                        //         {
                        //             //TODO: workout better way
                        //             this.buildAPIForEditor(editor, grammar);
                        //             break;
                        //         }
                        //
                        //         let range = new Range(diff.start, diff.start.translate(diff.newExtent));
                        //         let text = editor.getTextInBufferRange(range));
                        //         for (line of text.split("\n"))
                        //         {
                        //             //iterate and get scope descriptors to see if changed
                        //         }
                        //     }
                        // });

                        // this.subscriptions.add(editor.blobSubscription);
                        this.buildAPIForEditor(editor, grammar);
                    }

                    // else if (editor.blobSubscription)
                    // {
                    //     this.subscriptions.remove(editor.blobSubscription);
                    //     editor.blobSubscription.dispose();
                    //     editor.blobSubscription = null;
                    // }
                }));
            }));
        });
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
