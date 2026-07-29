"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
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

function MatchingLabel({ value, query }: { value: string; query: string }) {
  const cleanQuery = query.trim();
  const index = cleanQuery ? value.toLocaleLowerCase().indexOf(cleanQuery.toLocaleLowerCase()) : -1;
  if (index < 0) return <>{value}</>;
  const end = index + cleanQuery.length;
  return <>{value.slice(0, index)}<mark>{value.slice(index, end)}</mark>{value.slice(end)}</>;
}

export function SearchableSelect(props: SingleProps | MultipleProps) {
  const { options, placeholder, ariaLabel, allowCustom = false, emptyText = "没有匹配项", required = false, variant = "form" } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedValuesRef = useRef<string[]>([]);
  const isComposingRef = useRef(false);
  const listboxId = useId();
  const values = props.multiple ? props.value : props.value ? [props.value] : [];
  selectedValuesRef.current = values;
  const [query, setQuery] = useState(props.multiple ? "" : props.value);
  const [open, setOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => matchingOptions(options, query, props.multiple ? props.value : []), [options, props.multiple, props.value, query]);

  useEffect(() => {
    if (!props.multiple) setQuery(props.value);
  }, [props.multiple, props.value]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      commitQuery();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  });

  useEffect(() => {
    if (!open) return;
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
      const menuHeight = Math.min(226, Math.max(48, matches.length * 35 + 14));
      setOpensUpward(spaceBelow < menuHeight && spaceAbove > spaceBelow);
    };
    updateDirection();
    window.addEventListener("resize", updateDirection);
    window.addEventListener("scroll", updateDirection, true);
    return () => {
      window.removeEventListener("resize", updateDirection);
      window.removeEventListener("scroll", updateDirection, true);
    };
  }, [open, matches.length]);

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
    inputRef.current?.focus();
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
    setActiveIndex(0);
  };

  return <div className={`searchable-select ${variant} ${open ? "open" : ""} ${opensUpward ? "opens-upward" : ""}`} ref={rootRef}>
    <div className="searchable-select-control" onMouseDown={(event) => { if (event.target === event.currentTarget) inputRef.current?.focus(); }}>
      {props.multiple && values.map((value) => <span className="searchable-select-chip" key={value}>#{value}<button type="button" onPointerDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); removeValue(value); }} aria-label={`移除标签 ${value}`}><X size={13}/></button></span>)}
      <input ref={inputRef} value={query} required={required} aria-label={ariaLabel} aria-autocomplete="list" aria-controls={listboxId} aria-expanded={open} role="combobox" placeholder={values.length && props.multiple ? "继续输入标签" : placeholder} onFocus={() => { setOpen(true); setActiveIndex(0); }} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={(event) => { isComposingRef.current = false; setQuery(event.currentTarget.value); setOpen(true); setActiveIndex(0); }} onChange={handleChange} onKeyDown={handleKeyDown} onBlur={() => window.setTimeout(() => { if (!rootRef.current?.contains(document.activeElement)) { commitQuery(); setOpen(false); } }, 0)} />
      {!props.multiple && props.value && <button type="button" className="searchable-select-clear" onMouseDown={(event) => event.preventDefault()} onClick={clearSingle} aria-label={`清除${ariaLabel}`}><X size={15}/></button>}
      <ChevronDown className="searchable-select-arrow" size={17}/>
    </div>
    {open && <div className="searchable-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>{matches.length ? matches.map((option, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} key={option} onPointerDown={(event) => selectWithPointer(event, option)} onClick={(event) => { if (event.detail === 0) selectOption(option); }}>{props.multiple && <span>+</span>}<MatchingLabel value={option} query={query}/></button>) : allowCustom && query.trim() ? <button type="button" className="searchable-select-create" onPointerDown={(event) => selectWithPointer(event, query.trim())} onClick={(event) => { if (event.detail === 0) selectOption(query.trim()); }}><span>+</span>添加“{query.trim()}”</button> : <p>{emptyText}</p>}</div>}
  </div>;
}
