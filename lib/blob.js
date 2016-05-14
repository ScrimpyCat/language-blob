'use babel';

import BlobProvider from './blob-provider';
import { CompositeDisposable } from 'atom';
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
                        editor.blobAPI = {
                            states: [],
                            enums: []
                        };
                        const lines = grammar.tokenizeLines(editor.getText());
                        let complete = [];

                        const KIND = {
                            NONE: 0,
                            STATE: 1,
                            ENUM: 2
                        };
                        let kind = KIND.NONE;
                        for (line of lines)
                        {
                            for (token of line)
                            {
                                let type = token.scopes[token.scopes.length - 1];
                                if (kind === KIND.NONE)
                                {
                                    if (type.includes(".blob-function-state!.")) kind = KIND.STATE;
                                    else if (type.includes(".blob-function-enum!.")) kind = KIND.ENUM;
                                }

                                else if ((token.value === ")") && (type.match(/blob-function-(state|enum)!/)))
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

                                        editor.blobAPI.states.push({
                                            name: complete[0].value.startsWith(".") ? complete[0].value.substr(1) : complete[0].value,
                                            return: inferredType,
                                            args: [[inferredType]]
                                        });
                                    }

                                    else
                                    {

                                    }

                                    complete = [];
                                    kind = KIND.NONE;
                                }

                                else if ((!token.value.match(/^[\s\"]*$/)) && (type !== "comment.blob"))
                                {
                                    complete.push({
                                        value: token.value,
                                        type: type
                                    });
                                }
                            }
                        }
                    }
                }));
            }));
        });
    },

    deactivate(){
        this.subscriptions.dispose();
    },

    provide(){
        return BlobProvider;
    }
};
