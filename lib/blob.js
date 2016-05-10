'use babel';

import BlobProvider from './blob-provider';
import { CompositeDisposable } from 'atom';

export default {
    activate(state){
        //load config
    },

    deactivate(){
    },

    provide(){
        return BlobProvider;
    }
};
