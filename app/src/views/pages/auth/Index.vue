<script setup>
const lightX = ref(`center`);
const lightY = ref(`center`);

const onMouseMove = _throttle((e) => {
   lightX.value = `${e.x}px`;
   lightY.value = `${e.y}px`;
}, 30);
</script>

<template>
   <div class="min-h-full flex py-4" @mousemove="(e) => onMouseMove(e)">
      <div class="flex-1 p-1 flex flex-col md:flex-row items-stretch justify-center text-surface-0">
         <div
            class="welcome-bg p-12 md:p-12 -mb-12 me-0 md:mb-0 md:-me-12 flex-auto self-stretch flex flex-col gap-8 justify-center items-center rounded-[var(--content-border-radius)]"
         >
            <span
               class="flex justify-center flex-col gap-8 p-12 bg-surface-900/25 backdrop-blur-sm text-center rounded-[inherit]"
            >
               <div class="text-5xl font-medium" v-text="$t('auth.welcome.title')" />
               <span class="font-medium" v-text="$t('auth.welcome.text')" />
               <span id="auth-banner-button" class="contents" />
               <Teleport defer to="#auth-banner-button">
                  <RouterLink
                     custom
                     :to="{
                        name: $route.name == 'auth-login' ? 'auth-register' : 'auth-login',
                        replace: true
                     }"
                     v-slot="{ href, navigate }"
                  >
                     <Button
                        as="a"
                        :href="href"
                        @click="navigate"
                        :label="
                           $route.name == 'auth-login'
                              ? $t('route.label.register')
                              : $t('route.label.login')
                        "
                        class="!px-24 !py !text-xl"
                     />
                  </RouterLink>
               </Teleport>
            </span>
         </div>

         <div
            class="flex-auto md:!max-w-[25vw] md:!min-w-[32rem] md:flex-1 flex justify-self-start p-1 pb-0 z-[1] text-surface-900 dark:text-surface-0 rounded-[calc(var(--content-border-radius)*6)] bg-gradient-to-b from-[var(--primary-color)] via-[rgba(33,150,243,0)] to-transparent"
         >
            <div class="card flex-auto flex items-center justify-center rounded-[inherit] p-12">
               <CustomRouteView
                  :transitionProps="{
                     class: 'transition-[filter,transform] duration-[calc(var(--transition-duration))]',
                     enterFromClass: 'blur-xl scale-y-90',
                     leaveToClass: 'blur-xl scale-y-110'
                  }"
               />
            </div>
         </div>
      </div>
   </div>
</template>

<style lang="scss" scoped>
.welcome-bg {
   --light-x: v-bind(lightX);
   --light-y: v-bind(lightY);
   --bg-color-1: var(--p-primary-400);
   --bg-color-2: var(--p-primary-700);
   --inner-size: 1vw;
   --outer-size: 1vw;

   position: relative;
   background-color: white;
   opacity: 0.8;
   background-image:
      radial-gradient(
         circle at var(--light-x, center) var(--light-y, center),
         var(--bg-color-1),
         var(--bg-color-2)
      ),
      repeating-radial-gradient(
         circle at center center,
         var(--p-primary-300),
         var(--p-primary-900),
         var(--inner-size),
         transparent calc(var(--inner-size) * 2),
         transparent var(--outer-size)
      );
   background-blend-mode: multiply;
   overflow: hidden;

   &::before {
      content: '';
      pointer-events: none;
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
   }

   &:where(.dark, .dark *) {
      --bg-color-1: var(--p-primary-300);
      --bg-color-2: var(--p-primary-900);

      &::before {
         transition: box-shadow 1s ease-out !important;
         box-shadow: inset 0 0 4vw 5vw var(--surface-ground);
      }
   }
}
</style>
