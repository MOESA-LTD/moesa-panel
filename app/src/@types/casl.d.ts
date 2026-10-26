import type { AppAbility } from '@plugins/casl';

// Globals registered by abilitiesPlugin with `useGlobalProperties: true` (see main.ts).
declare module 'vue' {
   interface ComponentCustomProperties {
      $ability: AppAbility;
      $can: AppAbility['can'];
   }
}

export {};
