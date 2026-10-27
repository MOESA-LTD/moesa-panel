import { inject, type InjectionKey } from 'vue';

/** Decides whether a route dialog may close, e.g. after asking about unsaved changes. */
export type DialogCloseGuard = () => boolean | Promise<boolean>;

export type RouteDialogContext = {
   /** Registers a guard; returns its removal. */
   addCloseGuard: (guard: DialogCloseGuard) => () => void;
   /** Closes the dialog once every guard allows it. */
   close: () => Promise<void>;
};

export const ROUTE_DIALOG: InjectionKey<RouteDialogContext> = Symbol('route-dialog');

/** The route dialog this component is rendered in, or null outside one. */
export const useRouteDialog = () => inject(ROUTE_DIALOG, null);
