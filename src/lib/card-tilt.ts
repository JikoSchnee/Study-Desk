import type { PointerEvent } from "react";

const cardTiltMediaQuery = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const cardTiltLimit = 10;

type TiltState = {
  bounds: DOMRect;
  pointerId: number;
  onPointerMove: (event: globalThis.PointerEvent) => void;
};

const activeTilts = new WeakMap<HTMLElement, TiltState>();

function canTiltCard(event: PointerEvent<HTMLElement>) {
  return event.pointerType === "mouse" && window.matchMedia(cardTiltMediaQuery).matches;
}

export function beginCardTilt(event: PointerEvent<HTMLElement>) {
  if (!canTiltCard(event)) return;

  const card = event.currentTarget;
  cancelCardTilt(card);

  // A transformed element's hit area moves with it. Keep the original bounds
  // as the interaction area, so a pointer near an edge cannot repeatedly leave
  // and re-enter while the card tilts back to its resting position.
  const state: TiltState = {
    bounds: card.getBoundingClientRect(),
    pointerId: event.pointerId,
    onPointerMove: () => {},
  };
  state.onPointerMove = (pointerEvent) => {
    if (pointerEvent.pointerId !== state.pointerId) return;
    if (!isInsideBounds(pointerEvent, state.bounds)) {
      cancelCardTilt(card);
      return;
    }
    applyCardTilt(card, pointerEvent.clientX, pointerEvent.clientY, state.bounds);
  };

  activeTilts.set(card, state);
  document.addEventListener("pointermove", state.onPointerMove);
  card.dataset.tilting = "true";
}

export function updateCardTilt(event: PointerEvent<HTMLElement>) {
  if (!canTiltCard(event)) return;

  const card = event.currentTarget;
  const bounds = activeTilts.get(card)?.bounds ?? card.getBoundingClientRect();
  applyCardTilt(card, event.clientX, event.clientY, bounds);
}

export function resetCardTilt(event: PointerEvent<HTMLElement>) {
  const state = activeTilts.get(event.currentTarget);
  if (state && isInsideBounds(event, state.bounds)) return;
  cancelCardTilt(event.currentTarget);
}

function applyCardTilt(card: HTMLElement, clientX: number, clientY: number, bounds: DOMRect) {
  const offsetX = (clientX - bounds.left) / bounds.width - .5;
  const offsetY = (clientY - bounds.top) / bounds.height - .5;
  card.style.setProperty("--card-rotate-x", `${-offsetY * cardTiltLimit * 2}deg`);
  card.style.setProperty("--card-rotate-y", `${offsetX * cardTiltLimit * 2}deg`);
}

function isInsideBounds(event: Pick<globalThis.PointerEvent, "clientX" | "clientY">, bounds: DOMRect) {
  return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function cancelCardTilt(card: HTMLElement) {
  const state = activeTilts.get(card);
  if (state) {
    document.removeEventListener("pointermove", state.onPointerMove);
    activeTilts.delete(card);
  }
  delete card.dataset.tilting;
  card.style.removeProperty("--card-rotate-x");
  card.style.removeProperty("--card-rotate-y");
}
