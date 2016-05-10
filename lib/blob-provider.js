'use babel';

export default {
    selector: ".source.blob",
    inclusionPriority: 1,
    excludeLowerPriority: true,

    getSuggestions(suggestions){
        var scopes = suggestions.scopeDescriptor.getScopesArray();
        console.log(scopes);
        return [];
    }
}
