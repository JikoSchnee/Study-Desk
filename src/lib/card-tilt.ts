import type { PointerEvent } from "react";

const cardTiltMediaQuery = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const cardTiltLimit = 10;

function canTiltCard(event: PointerEvent<HTMLElement>) {
  return event.pointerType === "mouse" && window.matchMedia(cardTiltMediaQuery).matches;
}

export function beginCardTilt(event: PointerEvent<HTMLElement>) {
  if (canTiltCard(event)) event.currentTarget.dataset.tilting = "true";
}

export function updateCardTilt(event: PointerEvent<HTMLElement>) {
  if (!canTiltCard(event)) return;

  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const offsetX = (event.clientX - bounds.left) / bounds.width - .5;
  const offsetY = (event.clientY - bounds.top) / bounds.height - .5;
  card.style.setProperty("--card-rotate-x", `${-offsetY * cardTiltLimit * 2}deg`);
  card.style.setProperty("--card-rotate-y", `${offsetX * cardTiltLimit * 2}deg`);
}

export function resetCardTilt(event: PointerEvent<HTMLElement>) {
  delete event.currentTarget.dataset.tilting;
  event.currentTarget.style.removeProperty("--card-rotate-x");
  event.currentTarget.style.removeProperty("--card-rotate-y");
}
