import { buildChargeChips, parseInfo, type ChipSpec } from './chargeFormat';
import { CHARGE, quote } from './config';
import { byId } from './dom';
import { exec } from './ksu';

const chips = new Map<string, HTMLElement>();

/**
 * Updates the chips in place. Replacing them on every refresh made each one replay its
 * entrance animation, so the whole card flickered every couple of seconds.
 */
function sync(box: HTMLElement, specs: readonly ChipSpec[]): void {
  const wanted = new Set(specs.map((spec) => spec.key));
  for (const [key, node] of chips) {
    if (!wanted.has(key)) {
      node.remove();
      chips.delete(key);
    }
  }

  specs.forEach((spec, index) => {
    let node = chips.get(spec.key);
    if (!node) {
      node = document.createElement('span');
      chips.set(spec.key, node);
    }
    const className = spec.state ? `chip ${spec.state}` : 'chip';
    if (node.className !== className) node.className = className;
    if (node.textContent !== spec.text) node.textContent = spec.text;
    // Moving a node restarts its animation, so only touch the order when it really changed.
    if (box.children[index] !== node) box.insertBefore(node, box.children[index] ?? null);
  });
}

export async function loadCharge(): Promise<void> {
  const { stdout } = await exec(`${quote(CHARGE)} info`);
  sync(byId('chargeInfo'), buildChargeChips(parseInfo(stdout)));
}
