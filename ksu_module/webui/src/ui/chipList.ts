import type { ChipSpec } from '../logic/chargeFormat';

export interface ChipList {
  update(specs: readonly ChipSpec[]): void;
}

/**
 * A row of chips that is updated in place. Replacing the chips on every refresh made each one
 * replay its entrance animation, so the whole card flickered every couple of seconds.
 */
export function createChipList(box: HTMLElement): ChipList {
  const nodes = new Map<string, HTMLElement>();

  return {
    update(specs) {
      const wanted = new Set(specs.map((spec) => spec.key));
      for (const [key, node] of nodes) {
        if (!wanted.has(key)) {
          node.remove();
          nodes.delete(key);
        }
      }

      specs.forEach((spec, index) => {
        let node = nodes.get(spec.key);
        if (!node) {
          node = document.createElement('span');
          nodes.set(spec.key, node);
        }
        const className = spec.state ? `chip ${spec.state}` : 'chip';
        if (node.className !== className) node.className = className;
        if (node.textContent !== spec.text) node.textContent = spec.text;
        // Moving a node restarts its animation, so only touch the order when it really changed.
        if (box.children[index] !== node) box.insertBefore(node, box.children[index] ?? null);
      });
    },
  };
}
