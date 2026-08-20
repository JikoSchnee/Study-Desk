"use client";

import { ChangeEvent, KeyboardEvent, type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { appendUniqueValues, matchingOptions } from "@/lib/select-options";

type CommonProps = {
  options: string[];
  placeholder: string;
  ariaLabel: string;
  allowCustom?: boolean;
  emptyText?: string;
  required?: boolean;
  variant?: "form" | "filter";
  menuHeader?: ReactNode;
  menuPlacement?: "auto" | "top";
};

type SingleProps = CommonProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultipleProps = CommonProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type PopoverPosition = { left: number; width: number; top?: number; bottom?: number };

function MatchingLabel({ value, query }: { value: string; query: string }) {
  const cleanQuery = query.trim();
  const index = cleanQuery ? value.toLocaleLowerCase().indexOf(cleanQuery.toLocaleLowerCase()) : -1;
  if (index < 0) return <>{value}</>;
  const end = index + cleanQuery.length;
  return <>{value.slice(0, index)}<mark>{value.slice(index, end)}</mark>{value.slice(end)}</>;
}

export function SearchableSelect(props: SingleProps | MultipleProps) {
  const { options, placeholder, ariaLabel, allowCustom = false, emptyText = "没有匹配项", required = false, variant = "form", menuHeader, menuPlacement = "auto" } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedValuesRef = useRef<string[]>([]);
  const isComposingRef = useRef(false);
  const listboxId = useId();
  const values = props.multiple ? props.value : props.value ? [props.value] : [];
  selectedValuesRef.current = values;
  const [query, setQuery] = useState(props.multiple ? "" : props.value);
  const [open, setOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => matchingOptions(options, query, props.multiple ? props.value : []), [options, props.multiple, props.value, query]);
  const keepsTypedValueOnEnter = props.multiple && allowCustom;
  const placementIsFixedAbove = menuPlacement === "top";
  const containsSelectNode = (target: EventTarget | null) => target instanceof Node && Boolean(rootRef.current?.contains(target) || popoverRef.current?.contains(target));

  useEffect(() => {
    if (!props.multiple) setQuery(props.value);
  }, [props.multiple, props.value]);

  useEffect(() => {
    // Do not close from the input's blur event. A pointer interaction that
    // opens the popover can briefly move focus while React mounts its content,
    // which made the list appear and immediately disappear. Closing is based
    // on an interaction that is definitively outside this select instead.
    const closeOnOutsideInteraction = (event: PointerEvent | FocusEvent) => {
      if (containsSelectNode(event.target)) return;
      if (event.type === "pointerdown") commitQuery();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("focusin", closeOnOutsideInteraction);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("focusin", closeOnOutsideInteraction);
    };
  });

  useLayoutEffect(() => {
    if (!open) { setPopoverPosition(null); return; }
    const updateDirection = () => {
      const root = rootRef.current;
      if (!root) return;
      const control = root.getBoundingClientRect();
      const modal = root.closest<HTMLElement>(".card-editor-modal");
      const modalBounds = modal?.getBoundingClientRect();
      const topBoundary = Math.max(0, modalBounds?.top ?? 0);
      const modalBottom = Math.min(window.innerHeight, modalBounds?.bottom ?? window.innerHeight);
      const actionTop = modal?.querySelector<HTMLElement>(".card-editor-actions")?.getBoundingClientRect().top;
      // A sticky action bar consumes the lower part of the dialog, even though
      // it is technically still inside the modal's bounding rectangle.
      const bottomBoundary = actionTop && actionTop > control.bottom ? Math.min(modalBottom, actionTop) : modalBottom;
      const spaceAbove = control.top - topBoundary - 6;
      const spaceBelow = bottomBoundary - control.bottom - 6;
      const popover = popoverRef.current;
      const menuHeight = popover?.getBoundingClientRect().height ?? Math.min(226, Math.max(48, matches.length * 35 + 14));
      const shouldOpenUpward = placementIsFixedAbove || spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const width = Math.min(control.width, Math.max(0, window.innerWidth - 16));
      const left = Math.max(8, Math.min(control.left, window.innerWidth - width - 8));
      setOpensUpward(shouldOpenUpward);
      setPopoverPosition(shouldOpenUpward ? { left, width, bottom: window.innerHeight - control.top + 6 } : { left, width, top: control.bottom + 6 });
    };
    updateDirection();
    window.addEventListener("resize", updateDirection);
    window.addEventListener("scroll", updateDirection, true);
    return () => {
      window.removeEventListener("resize", updateDirection);
      window.removeEventListener("scroll", updateDirection, true);
    };
  }, [menuHeader, open, matches.length, placementIsFixedAbove]);

  const selectSingle = (value: string) => {
    if (props.multiple) return;
    props.onChange(value);
    setQuery(value);
    setOpen(false);
  };
  const selectMultiple = (valuesToAdd: string[]) => {
    if (!props.multiple) return;
    const next = appendUniqueValues(selectedValuesRef.current, valuesToAdd);
    selectedValuesRef.current = next;
    props.onChange(next);
    setQuery("");
    setActiveIndex(0);
  };
  const selectOption = (option: string) => {
    if (props.multiple) selectMultiple([option]);
    else selectSingle(option);
  };
  const selectWithPointer = (event: { preventDefault: () => void }, option: string) => {
    event.preventDefault();
    selectOption(option);
  };
  const commitQuery = () => {
    if (isComposingRef.current) return;
    const candidate = query.trim();
    if (!candidate) return;
    if (props.multiple) {
      const tokens = candidate.split(/[，,|]/).map((item) => item.trim()).filter(Boolean);
      if (allowCustom) selectMultiple(tokens);
      else if (matches[0]) selectMultiple([matches[0]]);
      return;
    }
    if (allowCustom) selectSingle(candidate);
    else if (matches[0]) selectSingle(matches[0]);
    else setQuery(props.value);
  };
  const removeValue = (value: string) => {
    if (!props.multiple) return;
    // Remove only the chip that was targeted. This also keeps old cards with
    // duplicate tags from losing more than one value in a single action.
    const index = selectedValuesRef.current.indexOf(value);
    if (index < 0) return;
    const next = selectedValuesRef.current.filter((_, itemIndex) => itemIndex !== index);
    selectedValuesRef.current = next;
    props.onChange(next);
  };
  const clearSingle = () => {
    if (props.multiple) return;
    props.onChange("");
    setQuery("");
    inputRef.current?.focus({ preventScroll: true });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter is used by Chinese/Japanese/Korean IMEs to confirm a composition.
    // Treating it as a selection here turns the half-composed text into a tag.
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0))); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(index - 1, 0)); return; }
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); setQuery(props.multiple ? "" : props.value); return; }
    if (event.key === "Enter") { event.preventDefault(); const active = matches[activeIndex]; if (active) selectOption(active); else commitQuery(); return; }
    if (props.multiple && [",", "，", "|"].includes(event.key)) { event.preventDefault(); commitQuery(); }
    if (props.multiple && event.key === "Backspace" && !query && selectedValuesRef.current.length) removeValue(selectedValuesRef.current.at(-1)!);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isComposingRef.current) {
      setQuery(value);
      setOpen(true);
      setActiveIndex(0);
      return;
    }
    if (props.multiple && /[，,|]$/.test(value)) {
      selectMultiple(value.split(/[，,|]/).filter(Boolean));
      return;
    }
    setQuery(value);
    setOpen(true);
    setActiveIndex(keepsTypedValueOnEnter ? -1 : 0);
  };

  const popoverStyle: CSSProperties = popoverPosition ? { left: popoverPosition.left, width: popoverPosition.width, ...(popoverPosition.bottom === undefined ? { top: popoverPosition.top } : { bottom: popoverPosition.bottom }) } : { visibility: "hidden" };
  const popover = open && typeof document !== "undefined" ? createPortal(<div ref={popoverRef} className="searchable-select-popover" style={popoverStyle}>{menuHeader}<div className="searchable-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>{matches.length ? matches.map((option, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={option} onPointerDown={(event) => selectWithPointer(event, option)} onClick={(event) => { if (event.detail === 0) selectOption(option); }}>{props.multiple && <span>+</span>}<MatchingLabel value={option} query={query}/></button>) : allowCustom && query.trim() ? <button type="button" className="searchable-select-create" onPointerDown={(event) => selectWithPointer(event, query.trim())} onClick={(event) => { if (event.detail === 0) selectOption(query.trim()); }}><span>+</span>添加“{query.trim()}”</button> : <p>{emptyText}</p>}</div></div>, document.body) : null;

  return <><div className={`searchable-select ${variant} ${open ? "open" : ""} ${placementIsFixedAbove || opensUpward ? "opens-upward" : ""}`} ref={rootRef}>
    <div className="searchable-select-control" onMouseDown={(event) => { if (!(event.target as HTMLElement).closest("[data-tag-remove], [data-select-toggle]")) inputRef.current?.focus({ preventScroll: true }); }}>
      <input ref={inputRef} value={query} required={required} aria-label={ariaLabel} aria-autocomplete="list" aria-controls={listboxId} aria-expanded={open} role="combobox" placeholder={values.length && props.multiple ? "继续输入标签" : placeholder} onFocus={() => { setOpen(true); setActiveIndex(keepsTypedValueOnEnter && query ? -1 : 0); }} onBlur={(event) => { if (!containsSelectNode(event.relatedTarget)) { commitQuery(); setOpen(false); } }} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={(event) => { isComposingRef.current = false; setQuery(event.currentTarget.value); setOpen(true); setActiveIndex(keepsTypedValueOnEnter ? -1 : 0); }} onChange={handleChange} onKeyDown={handleKeyDown} />
      {props.multiple && values.map((value) => <span className="searchable-select-chip" key={value}>#{value}<button type="button" data-tag-remove onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); removeValue(value); }} aria-label={`移除标签 ${value}`}><X size={13}/></button></span>)}
      {!props.multiple && props.value && <button type="button" className="searchable-select-clear" onMouseDown={(event) => event.preventDefault()} onClick={clearSingle} aria-label={`清除${ariaLabel}`}><X size={15}/></button>}
      <button type="button" className="searchable-select-toggle" data-select-toggle onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpen((isOpen) => !isOpen); inputRef.current?.focus({ preventScroll: true }); }} aria-label={open ? `收起${ariaLabel}选项` : `展开${ariaLabel}选项`} aria-expanded={open} aria-controls={listboxId}><ChevronDown className="searchable-select-arrow" size={17}/></button>
    </div>
  </div>{popover}</>;
}
