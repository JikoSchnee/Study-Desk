function headingLevel(line: string) { return line.match(/^(#+) /)?.[1].length ?? 0; }

export function insertAtHeading(content: string, path: string, blocks: string[]) {
  const target = path.split(" → ").at(-1)!;
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.replace(/^#+\s+/, "").trim() === target);
  if (index === -1) return `${content.trimEnd()}\n\n#### Imported knowledge\n${blocks.join("\n")}`;
  const level = headingLevel(lines[index]);
  let end = lines.length;
  for (let i = index + 1; i < lines.length; i += 1) if (headingLevel(lines[i]) > 0 && headingLevel(lines[i]) <= level) { end = i; break; }
  lines.splice(end, 0, ...blocks.flatMap((block) => ["", ...block.trim().split("\n")]));
  return lines.join("\n");
}
