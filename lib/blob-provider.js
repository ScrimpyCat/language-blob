'use babel';

import { Point } from 'atom';

export default {
    selector: ".source.blob",
    inclusionPriority: 1,
    excludeLowerPriority: true,

    getSuggestions(suggestions){
        var scope = [this.api];
        let scopes = suggestions.scopeDescriptor.getScopesArray();
        for (type of scopes)
        {
            if (type.startsWith("meta.entity.name.function"))
            {
                let func = type.slice(26+14,-5);
                let currentScope = scope[scope.length - 1];

                if (currentScope.functions != undefined)
                {
                    let newScope = currentScope.functions.find((e) => e.name === func);
                    if (newScope != undefined) scope.push(newScope);
                }
            }

            else if (type.startsWith("meta.entity.name.type.object.option"))
            {

            }
        }

        let prevPoint = suggestions.bufferPosition.translate(new Point(0, -suggestions.prefix.length));
        // let nextPoint = suggestions.bufferPosition.translate(new Point(0, 1));
        let prevType = suggestions.editor.scopeDescriptorForBufferPosition(prevPoint).getScopesArray();
        let prefixType = prevType[prevType.length - 1];

        var prefix;
        if (prefixType.indexOf("blob-function") != -1) prefix = "functions";
        else if (prefixType.indexOf("blob-option") != -1) prefix = "options";
        else if (prefixType.indexOf("blob-inputs") != -1) prefix = "inputs";
        else if (prefixType.indexOf("blob-states") != -1) prefix = "states";
        else if (prefixType.indexOf("blob-enums") != -1) prefix = "enums";
        else if (prefixType.indexOf("blob-atoms") != -1) prefix = "atoms";

        var completions = [];
        for (context of scope.reverse())
        {
            if (context.functions != undefined)
            {
                for (func of context.functions)
                {
                    if ((func.name != undefined) && (func.name.startsWith(suggestions.prefix)))
                    {
                        complete = {
                            type: "function",
                            text: func.name,
                            description: func.description
                        };

                        var snippet;
                        if (func.args != undefined)
                        {
                            for (e of func.args)
                            {
                                var text = func.name;
                                if (Array.isArray(e))
                                {
                                    e.forEach((arg, index) => {
                                        index += 1;

                                        if (Array.isArray(arg))
                                        {
                                            text += " ${" + index + ":expression}";
                                        }

                                        else
                                        {
                                            text += " ${" + index + ":" + arg.type + "}";
                                        }
                                    });
                                }

                                else
                                {
                                    //object
                                }

                                complete.snippet = text;
                                completions.push(complete);
                            }
                        }

                        else completions.push(complete);
                    }
                }
            }

            if (context.states != undefined)
            {

            }

            if (context.inputs != undefined)
            {

            }

            if (context.enums != undefined)
            {

            }
        }

        return completions;
    }
}
