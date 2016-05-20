# language-blob
An atom package to provide syntax highlighting and auto-completion for my game engine's scripting language. By default auto-completions will be provided for any state or enum definitions in the file being edited, along with inferring their type if they're initialized. To provide other definitions to choose from for the auto-completion, go to the package's settings and add the path to the specification file(s). For more information see: https://github.com/ScrimpyCat/Blob-Game/blob/master/src/scripting/README.md

This package will not be of much interest to anyone else, as this isn't an actual language but rather a language for a particular project.

Example highlighting of the grammar:  
![syntax-highlighting](https://cloud.githubusercontent.com/assets/3411736/15416605/97043066-1e90-11e6-8e7b-d498f2db6119.png)

Example auto-completion:  
![autocomplete](https://cloud.githubusercontent.com/assets/3411736/15416385/1eb28fd8-1e8e-11e6-9277-1fd19f7d3f54.gif)

Example state and enum detection with type inference:  
![detection](https://cloud.githubusercontent.com/assets/3411736/15416591/6e0fbfcc-1e90-11e6-90af-f5713a53f183.gif)
