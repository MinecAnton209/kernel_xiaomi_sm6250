import type { ChipSpec } from '../logic/chargeFormat';

export interface ChipList {
  update(specs: readonly ChipSpec[]): void;
}

/** Restarts the highlight on a chip whose value just changed, so the change is noticed. */
function flash(node: HTMLElement): void {
  node.classList.remove('changed');
  void node.offsetWidth;
  node.classList.add('changed');
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
        // The changed flag lives on the node, so the base classes are compared on their own.
        const className = spec.state ? `chip ${spec.state}` : 'chip';
        if (node.dataset['base'] !== className) {
          node.dataset['base'] = className;
          node.className = className;
        }
        if (node.textContent !== spec.text) {
          const isNew = node.textContent === '';
          node.textContent = spec.text;
          if (!isNew) flash(node);
        }
        // Moving a node restarts its animation, so only touch the order when it really changed.
        if (box.children[index] !== node) box.insertBefore(node, box.children[index] ?? null);
      });
    },
  };
}
