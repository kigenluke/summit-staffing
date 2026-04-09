import {useAuthStore as useAuthStoreImpl} from './authStore.js';

const _useAuthStore: any = useAuthStoreImpl as any;

export {_useAuthStore as useAuthStore};
