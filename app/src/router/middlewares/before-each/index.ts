import { authBeforeEach } from './auth';
import { dialogBeforeEach } from './dialog';
import { ErrorHandlerBeforeEach } from './error-handler';
import { i18NBeforeEach } from './i18n';

export default [i18NBeforeEach, ErrorHandlerBeforeEach, authBeforeEach, dialogBeforeEach];
