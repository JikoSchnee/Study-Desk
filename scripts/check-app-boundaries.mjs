import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const workspace = join(import.meta.dirname, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"]);

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    if ([".next", "dist", "node_modules"].includes(entry)) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (sourceExtensions.has(extname(entry))) files.push(path);
  }
  return files;
}

const rules = [
  {
    root: join(workspace, "apps", "desktop"),
    forbidden: [
      /from\s+["']@service\//,
      /apps\/service\/server/,
      /SUPABASE_SERVICE_ROLE_KEY/,
      /PADDLE_API_KEY/,
      /PADDLE_WEBHOOK_SECRET/,
      /grant_study_desk_membership/,
      /revoke_study_desk_membership_transaction/,
    ],
    label: "桌面端不得依赖云服务实现或服务端密钥",
  },
  {
    root: join(workspace, "apps", "service"),
    forbidden: [
      /from\s+["']@\//,
      /apps\/desktop\/src/,
      /better-sqlite3/,
      /STUDY_DESK_TRANSFER_KEY_(?:CURRENT|PREVIOUS)/,
    ],
    label: "云服务不得依赖桌面本地实现或迁移密钥",
  },
];

const failures = [];
for (const rule of rules) {
  for (const file of sourceFiles(rule.root)) {
    const content = readFileSync(file, "utf8");
    for (const pattern of rule.forbidden) {
      if (pattern.test(content)) failures.push(`${rule.label}: ${relative(workspace, file)} 命中 ${pattern}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("应用边界检查通过：桌面端、云服务端和共享代码保持单向依赖。 ");
