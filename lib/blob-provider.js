'use babel';

import { Point } from 'atom';

export default {
    selector: ".source.blob",
    inclusionPriority: 100,
    excludeLowerPriority: true,
    api: {
        functions: [],
        inputs: [],
        atoms: [],
        options: [],
        states: [],
        enums: [],
        includes: []
    },

    getPrefix(editor, bufferPosition){
        match = editor.getTextInRange([[bufferPosition.row, 0], bufferPosition]).match(/[^()\s]+$/);
        return match != null ? match[0] : "";
    },

    formatType(type){
        return type.replace("custom:", "")
    },

    formatArg(arg, index){
        var format = "";
        if (Array.isArray(arg))
        {
            // TODO: Handle this later, for now can just make separate variations instead
            format = "${" + index + ":expression}";
        }

        else
        {
            let name = arg.name != undefined ? arg.name : "";
            var input = "", prefix = "", suffix = "";
            switch (arg.type)
            {
                case "string":
                    prefix = '"';
                    suffix = '"';
                    input = name;
                    break;

                case "atom":
                    prefix = ':';
                    input = name;
                    break;

                case "option":
                    suffix = ':';
                    input = name;
                    break;

                case "list":
                    prefix = '(';
                    suffix = ')';
                    if (name.length) name += ":";
                    input = name + this.formatType(arg.type);
                    break;

                default:
                    if (name.length) name += ":";
                    input = name + this.formatType(arg.type);
                    break;
            }

            /*
            TODO: Not sure about the optional arguments, feel like there could be a better way
                  than simply wrapping them with [] and leaving it up to user to remove the
                  optional altogether or modify its contents and then remove the [].
            */
            if (arg.value != undefined)
            {
                if (Array.isArray(arg.value))
                {
                    let tab = index++;
                    values = arg.value.map((value) => {
                        format = this.formatArg(value, index);
                        index += format.tabs;
                        return format.snippet;
                    });

                    if (arg.optional == true) format = `\${${tab}:[${prefix}${values.join(" ")}${suffix}]}`;
                    else format = `${prefix}${values.join(" ")}${suffix}`;
                }

                else
                {
                    if (arg.optional == true) format = `\${${index}:[${prefix}${arg.value}${suffix}]}`;
                    else format = `${prefix}${arg.value}${suffix}`;
                }
            }

            else
            {
                if (arg.optional == true) format = `\${${index}:[${prefix}${input}${suffix}]}`;
                else format = `${prefix}\${${index}:${input}}${suffix}`;
            }
        }

        return { snippet: format, tabs: ++index };
    },

    getArgs(args){
        var arguments = [];
        if (args != undefined)
        {
            for (variation of args)
            {
                var snippet = "";
                if (Array.isArray(variation))
                {
                    let index = 1;
                    for (arg of variation)
                    {
                        let format = this.formatArg(arg, index);
                        index = format.tabs;
                        snippet += ` ${format.snippet}`;
                    }
                }

                else
                {
                    if (variation.set != undefined)
                    {
                        if (Array.isArray(variation.set))
                        {
                            let index = 1;
                            for (arg of variation.set)
                            {
                                let format = this.formatArg(arg, index);
                                index = format.tabs;
                                snippet += ` ${format.snippet}`;
                            }
                        }

                        else
                        {
                            snippet += ` ${this.formatArg(variation.set, 1).snippet}`;
                        }
                    }

                    if (variation.repeat != undefined)
                    {
                        var repeatTypes;
                        if (Array.isArray(variation.repeat))
                        {
                            repeatTypes = variation.repeat.map((arg) => this.formatType(arg.type)).join(":");
                        }

                        else
                        {
                            repeatTypes = this.formatType(variation.repeat.type);
                        }

                        snippet += ` \${1:...:${repeatTypes}}`;
                    }
                }

                arguments.push(snippet);
            }
        }

        else arguments = [""];

        return arguments;
    },

    match(name, string){
        return name.includes(string);
    },

    getSuggestions(suggestions){
        let prefixStr = this.getPrefix(suggestions.editor, suggestions.bufferPosition);
        if ((!prefixStr.length) && (!suggestions.activatedManually)) return;

        var scope = [suggestions.editor.blobAPI, this.api];
        let scopes = suggestions.scopeDescriptor.getScopesArray();
        for (type of scopes)
        {
            if (type.startsWith("meta.entity.name.function"))
            {
                let func = type.slice(26+14,-5);
                for (currentScope of scope)
                {
                    if (currentScope.functions != undefined)
                    {
                        let newScope = currentScope.functions.find((e) => e.name === func);
                        if (newScope != undefined) scope.push(newScope);
                    }
                }
            }

            else if (type.startsWith("meta.entity.name.type.object.option"))
            {
                let option = type.slice(36+12,-5);
                for (currentScope of scope)
                {
                    if (currentScope.options != undefined)
                    {
                        let newScope = currentScope.options.find((e) => e.name === option);
                        if (newScope != undefined) scope.push(newScope);
                    }
                }
            }
        }

        let prevPoint = suggestions.bufferPosition.translate(new Point(0, -suggestions.prefix.length));
        // let nextPoint = suggestions.bufferPosition.translate(new Point(0, 1));
        let prevType = suggestions.editor.scopeDescriptorForBufferPosition(prevPoint).getScopesArray();
        let prefixType = prevType[prevType.length - 1];

        var prefix;
        if (prefixType.includes("blob-function")) prefix = "functions";
        else if (prefixType.includes("blob-option")) prefix = "options";
        else if (prefixType.includes("blob-input")) prefix = "inputs";
        else if (prefixType.includes("blob-state")) prefix = "states";
        else if (prefixType.includes("blob-enum")) prefix = "enums";
        else if (prefixType.includes("blob-atom")) prefix = "atoms";
        else if ((prefixType.includes("blob-expression")) || (prefixType == "source.blob")) prefix = "expression";
        else return [];

        var completions = [];
        for (context of scope.reverse())
        {
            if (context.functions != undefined)
            {
                for (func of context.functions)
                {
                    if ((func.name != undefined) && (this.match(func.name, prefixStr)))
                    {
                        for (snippet of this.getArgs(func.args))
                        {
                            completions.push({
                                type: "function",
                                leftLabel: func.return != undefined ? this.formatType(func.return.type) : "expression",
                                text: func.name,
                                snippet: `(${func.name}${snippet})`,
                                description: func.description,
                                replacementPrefix: prefixStr
                            });
                        }
                    }
                }
            }

            if (context.options != undefined)
            {
                if ((context.name != undefined) && ((prefixType.endsWith(`blob-function-${context.name}.blob`)) || (prefixType.endsWith(`blob-option-${context.name}.blob`))))
                {
                    for (option of context.options)
                    {
                        if ((option.name != undefined) && (this.match(option.name, prefixStr)))
                        {
                            for (snippet of this.getArgs(option.args))
                            {
                                completions.push({
                                    type: "type",
                                    iconHTML: '<span class="icon-letter">o</span>',
                                    // leftLabel: option.return != undefined ? this.formatType(option.return.type) : "expression",
                                    text: option.name,
                                    snippet: `(${option.name}:${snippet})`,
                                    description: option.description,
                                    replacementPrefix: prefixStr
                                });
                            }
                        }
                    }
                }
            }

            if (context.states != undefined)
            {
                let str = prefixStr.startsWith(".") ? prefixStr.substr(1) : prefixStr;
                for (state of context.states)
                {
                    if ((state.name != undefined) && (this.match(state.name, str)))
                    {
                        completions.push({
                            type: "variable",
                            iconHTML: '<span class="icon-letter">s</span>',
                            leftLabel: state.return != undefined ? this.formatType(state.return.type) : "expression",
                            text: state.name,
                            snippet: `.${state.name}`,
                            description: state.description,
                            replacementPrefix: prefixStr
                        });

                        for (snippet of this.getArgs(state.args))
                        {
                            if (snippet.length)
                            {
                                completions.push({
                                    type: "variable",
                                    iconHTML: '<span class="icon-letter">s</span>',
                                    leftLabel: state.return != undefined ? this.formatType(state.return.type) : "expression",
                                    text: state.name,
                                    snippet: `(.${state.name}!${snippet})`,
                                    description: state.description,
                                    replacementPrefix: prefixStr
                                });
                            }
                        }
                    }
                }
            }

            if (context.inputs != undefined)
            {
                let str = prefixStr.startsWith("@") ? prefixStr.substr(1) : prefixStr;
                for (input of context.inputs)
                {
                    if ((input.name != undefined) && (this.match(input.name, str)))
                    {
                        completions.push({
                            type: "tag",
                            iconHTML: '<span class="icon-letter">i</span>',
                            leftLabel: input.return != undefined ? this.formatType(input.return.type) : "expression",
                            text: input.name,
                            snippet: `@${input.name}`,
                            description: input.description,
                            replacementPrefix: prefixStr
                        });

                        for (snippet of this.getArgs(input.args))
                        {
                            if (snippet.length)
                            {
                                completions.push({
                                    type: "tag",
                                    iconHTML: '<span class="icon-letter">i</span>',
                                    leftLabel: input.return != undefined ? this.formatType(input.return.type) : "expression",
                                    text: input.name,
                                    snippet: `(@${input.name}!${snippet})`,
                                    description: input.description,
                                    replacementPrefix: prefixStr
                                });
                            }
                        }
                    }
                }
            }

            if (context.enums != undefined)
            {
                let str = prefixStr.startsWith("&") ? prefixStr.substr(1) : prefixStr;
                for (constant of context.enums)
                {
                    if ((constant.name != undefined) && (this.match(constant.name, str)))
                    {
                        completions.push({
                            type: "constant",
                            iconHTML: '<span class="icon-letter">e</span>',
                            leftLabel: constant.return != undefined ? this.formatType(constant.return.type) : "expression",
                            text: constant.name,
                            snippet: `&${constant.name}`,
                            description: constant.description,
                            replacementPrefix: prefixStr
                        });
                    }
                }
            }
        }

        return completions;
    }
}
