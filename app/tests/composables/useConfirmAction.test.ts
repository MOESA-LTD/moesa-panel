import { useConfirmAction } from '@/composables/useConfirmAction';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Options = {
   accept: () => Promise<void> | void;
   reject: () => void;
   onHide: () => void;
   acceptProps: { label: string };
   header: string;
   message: string;
};

const require = vi.fn();
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require }) }));

const options = () => require.mock.calls.at(-1)![0] as Options;

describe('useConfirmAction', () => {
   beforeEach(() => require.mockReset());

   it('passes header, message and the accept label to the confirm dialog', () => {
      void useConfirmAction()({ header: 'H', message: 'M', acceptLabel: 'Go', accept: vi.fn() });
      expect(options()).toMatchObject({ header: 'H', message: 'M', acceptProps: { label: 'Go' } });
   });

   it('resolves true only after accept settles', async () => {
      let finish = () => {};
      const accept = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      let result: boolean | undefined;
      const pending = useConfirmAction()({ header: 'H', message: 'M', accept }).then(
         (value) => (result = value)
      );

      void options().accept();
      // PrimeVue hides the dialog right after calling accept: that is not a cancel.
      options().onHide();
      await Promise.resolve();
      expect(accept).toHaveBeenCalledOnce();
      expect(result).toBeUndefined();

      finish();
      await pending;
      expect(result).toBe(true);
   });

   it('resolves false on reject without running accept', async () => {
      const accept = vi.fn();
      const pending = useConfirmAction()({ header: 'H', message: 'M', accept });
      options().reject();
      options().onHide();
      await expect(pending).resolves.toBe(false);
      expect(accept).not.toHaveBeenCalled();
   });

   it('resolves false when the dialog is hidden without a choice', async () => {
      const pending = useConfirmAction()({ header: 'H', message: 'M', accept: vi.fn() });
      options().onHide();
      await expect(pending).resolves.toBe(false);
   });

   it('rejects with what accept throws', async () => {
      const error = new Error('x');
      const pending = useConfirmAction()({
         header: 'H',
         message: 'M',
         accept: () => Promise.reject(error)
      });
      void options().accept();
      options().onHide();
      await expect(pending).rejects.toBe(error);
   });
});
