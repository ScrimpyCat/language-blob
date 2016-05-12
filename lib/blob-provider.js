'use babel';

import { Point } from 'atom';

export default {
    selector: ".source.blob",
    inclusionPriority: 1,
    excludeLowerPriority: true,

    getPrefix(editor, bufferPosition){
        match = editor.getTextInRange([[bufferPosition.row, 0], bufferPosition]).match(/[^()\s]+$/);
        return match != null ? match[0] : "";
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
                    input = name + arg.type;
                    break;

                default:
                    if (name.length) name += ":";
                    input = name + arg.type;
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
                        return this.formatArg(value, index++);
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

        return format;
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
                    variation.forEach((arg, index) => {
                        index += 1;
                        snippet += ` ${this.formatArg(arg, index)}`;
                    });
                }

                else
                {
                    if (variation.set != undefined)
                    {
                        if (Array.isArray(variation.set))
                        {
                            variation.set.forEach((arg, index) => {
                                index += 1;
                                snippet += ` ${this.formatArg(arg, index)}`;
                            });
                        }

                        else
                        {
                            snippet += ` ${this.formatArg(variation.set, 1)}`;
                        }
                    }

                    if (variation.repeat != undefined)
                    {
                        var repeatTypes;
                        if (Array.isArray(variation.repeat))
                        {
                            repeatTypes = variation.repeat.map((arg) => arg.type).join(":");
                        }

                        else
                        {
                            repeatTypes = variation.repeat.type;
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
        else if (prefixType.indexOf("blob-input") != -1) prefix = "inputs";
        else if (prefixType.indexOf("blob-state") != -1) prefix = "states";
        else if (prefixType.indexOf("blob-enum") != -1) prefix = "enums";
        else if (prefixType.indexOf("blob-atom") != -1) prefix = "atoms";
        else if ((prefixType == "meta.none.expression.blob") || (prefixType == "source.blob")) prefix = "expression";
        else return [];

        let prefixStr = this.getPrefix(suggestions.editor, suggestions.bufferPosition);

        var completions = [];
        for (context of scope.reverse())
        {
            if (context.functions != undefined)
            {
                for (func of context.functions)
                {
                    if ((func.name != undefined) && (func.name.startsWith(prefixStr)))
                    {
                        for (snippet of this.getArgs(func.args))
                        {
                            completions.push({
                                type: "function",
                                leftLabel: func.return != undefined ? func.return.type : "expression",
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
                for (option of context.options)
                {
                    if ((option.name != undefined) && (option.name.startsWith(prefixStr)))
                    {
                        for (snippet of this.getArgs(option.args))
                        {
                            completions.push({
                                type: "type",
                                iconHTML: '<span class="icon-letter">o</span>',
                                // leftLabel: option.return != undefined ? option.return.type : "expression",
                                text: option.name,
                                snippet: `(${option.name}:${snippet})`,
                                description: option.description,
                                replacementPrefix: prefixStr
                            });
                        }
                    }
                }
            }

            if (context.states != undefined)
            {
                let str = prefixStr.startsWith(".") ? prefixStr.substr(1) : prefixStr;
                for (state of context.states)
                {
                    if ((state.name != undefined) && (state.name.includes(str)))
                    {
                        completions.push({
                            type: "variable",
                            iconHTML: '<span class="icon-letter">s</span>',
                            leftLabel: state.return != undefined ? state.return.type : "expression",
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
                                    leftLabel: state.return != undefined ? state.return.type : "expression",
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
                    if ((input.name != undefined) && (input.name.includes(str)))
                    {
                        completions.push({
                            type: "tag",
                            iconHTML: '<span class="icon-letter">i</span>',
                            leftLabel: input.return != undefined ? input.return.type : "expression",
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
                                    leftLabel: input.return != undefined ? input.return.type : "expression",
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
                    if ((constant.name != undefined) && (constant.name.includes(str)))
                    {
                        completions.push({
                            type: "constant",
                            iconHTML: '<span class="icon-letter">e</span>',
                            leftLabel: constant.return != undefined ? constant.return.type : "expression",
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
