import { byId } from '../core/dom';
import {
  PAGE_REGIONS,
  REGIONS,
  placeholderGroups,
  wrapperClass,
  type PlaceholderGroup,
  type PlaceholderNode,
  type RegionId,
} from '../logic/skeletonSpecs';

const active = new Map<RegionId, HTMLElement>();

function placeholder(node: PlaceholderNode): HTMLElement {
  const element = document.createElement('div');
  element.className = node.className;
  if (node.width) element.style.width = node.width;
  // A chip takes its height from its text, so it needs some for the placeholder to be as tall.
  if (node.className.startsWith('chip')) element.textContent = ' ';
  return element;
}

function skeletonOf(nodes: readonly PlaceholderNode[]): HTMLElement {
  const skeleton = document.createElement('m3e-skeleton');
  // Pulse repaints a flat fill; wave sweeps a screen wide gradient over every shape.
  skeleton.setAttribute('animation', 'pulse');
  skeleton.setAttribute('shape', 'auto');
  skeleton.append(...nodes.map(placeholder));
  return skeleton;
}

function build(group: PlaceholderGroup, into: HTMLElement): void {
  if (group.className) {
    const wrapper = document.createElement('div');
    wrapper.className = group.className;
    wrapper.append(skeletonOf(group.nodes));
    into.append(wrapper);
  } else {
    into.append(skeletonOf(group.nodes));
  }
}

/** Hides the real container behind placeholders of the same size, until `hideSkeleton` is called. */
export function showSkeleton(id: RegionId): void {
  const box = document.getElementById(id);
  if (!box || active.has(id)) return;

  const spec = REGIONS[id];
  const region = document.createElement('div');
  region.className = `${wrapperClass(spec.kind)} skeleton-region`;
  // The placeholders are decoration; the card announces that it is loading instead.
  region.setAttribute('aria-hidden', 'true');
  for (const group of placeholderGroups(spec)) build(group, region);

  box.hidden = true;
  box.after(region);
  box.closest('.card')?.setAttribute('aria-busy', 'true');
  active.set(id, region);
}

export function hideSkeleton(id: RegionId): void {
  const region = active.get(id);
  if (!region) return;
  active.delete(id);
  region.remove();
  const box = byId(id);
  box.hidden = false;

  const card = box.closest('.card');
  if (card && !card.querySelector('.skeleton-region')) card.removeAttribute('aria-busy');
}

export function showPageSkeletons(page: string): void {
  for (const id of PAGE_REGIONS[page] ?? []) showSkeleton(id);
}

export function hidePageSkeletons(page: string): void {
  for (const id of PAGE_REGIONS[page] ?? []) hideSkeleton(id);
}
