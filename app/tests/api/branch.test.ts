import type { Tenant } from '@/api/access';
import { toBranchTree, type BranchNode } from '@/api/branch';
import { describe, expect, it } from 'vitest';

const tenant = (id: string, parent_id: string | null, owned = false): Tenant => ({
   id,
   display_name: id,
   parent_id,
   owned
});

const find = (nodes: BranchNode[], key: string): BranchNode | undefined =>
   nodes.flatMap((node) => [node, ...node.children]).find((node) => node.key === key) ??
   nodes.map((node) => find(node.children, key)).find(Boolean);

describe('toBranchTree', () => {
   it('nests branches under their parents, sorted by name', () => {
      const tree = toBranchTree([
         tenant('root', null, true),
         tenant('b', 'root', true),
         tenant('a', 'root', true),
         tenant('a1', 'a', true)
      ]);

      expect(tree.map(({ key }) => key)).toEqual(['root']);
      expect(tree[0]!.children.map(({ key }) => key)).toEqual(['a', 'b']);
      expect(tree[0]!.children[0]!.children.map(({ key }) => key)).toEqual(['a1']);
   });

   it('shows a branch whose parent the user cannot use as a root', () => {
      const tree = toBranchTree([tenant('member-of', 'hidden-parent')]);

      expect(tree.map(({ key }) => key)).toEqual(['member-of']);
      expect(tree[0]!.data.canDelete).toBe(false);
   });

   it('lets owners open branches, and remove only leaves under a tenant they own', () => {
      const tree = toBranchTree([
         tenant('root', null, true),
         tenant('a', 'root', true),
         tenant('a1', 'a', true),
         tenant('other', null),
         tenant('invited', 'other')
      ]);

      expect(find(tree, 'root')!.data).toMatchObject({ canAddBranch: true, canDelete: false });
      expect(find(tree, 'a')!.data).toMatchObject({ canAddBranch: true, canDelete: false });
      expect(find(tree, 'a1')!.data).toMatchObject({ canAddBranch: true, canDelete: true });
      expect(find(tree, 'invited')!.data).toMatchObject({ canAddBranch: false, canDelete: false });
   });
});
