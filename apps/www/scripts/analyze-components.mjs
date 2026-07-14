import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC_DIRS = ["src/features", "src/components", "src/app"];
const API_DIR = "src/app/api/v1";

// 1. Get all valid API routes
function walk(dir) {
  const out = [];
  try {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (e === "route.ts") out.push(p);
    }
  } catch(e) {}
  return out;
}

const apiRoutes = walk(API_DIR).map(f => {
  let route = f.replace(API_DIR, "").replace(/\/route\.ts$/, "");
  if (route.startsWith("/")) route = route.slice(1);
  return route;
});

// Convert a route like 'courses/[id]/cancel' to a regex: /^courses\/[^/]+\/cancel$/
const routeRegexes = apiRoutes.map(r => {
  const pattern = r.split('/').map(seg => seg.startsWith('[') && seg.endsWith(']') ? "[^/]+" : seg).join('\\/');
  return { path: r, regex: new RegExp(`^${pattern}$`) };
});

// Add some known special routes that might not be in apiRoutes array directly
routeRegexes.push({ path: 'auth/login', regex: /^auth\/login$/ });
routeRegexes.push({ path: 'messages', regex: /^messages$/ }); 
routeRegexes.push({ path: 'messages/threads', regex: /^messages\/threads$/ });
routeRegexes.push({ path: 'messages/threads/[id]', regex: /^messages\/threads\/[^/]+$/ });

function isValidRoute(url) {
  if (!url) return false;
  // clean up query params if any hardcoded
  url = url.split('?')[0];
  if (url.startsWith('/')) url = url.slice(1);
  return routeRegexes.some(r => r.regex.test(url));
}

// 2. Data provider mapping from src/lib/refine/data-provider.ts
const RESOURCE_MAP = {
  students: "roster/students",
  teachers: "roster/teachers",
  courses: "courses",
  grades: "grades",
  payments: "payments",
  sessions: "sessions",
  enrollments: "enrollments",
  expenses: "expenses",
  rooms: "rooms",
  "enrollment-requests": "enrollment-requests",
  reports: "reports",
  "me-children": "me/children",
  "me-attendance": "me/attendance",
  "dashboards-student": "dashboards/student",
  "dashboards-teacher": "dashboards/teacher",
  "dashboards-admin": "dashboards/admin",
  materials: "materials",
  notifications: "notifications",
  "parent-links": "parent-links",
  reviews: "reviews",
  "messages/threads": "messages/threads"
};

// 3. Scan frontend files
let brokenLinks = 0;
let filesScanned = 0;

function scanFrontend(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!p.includes("/api")) scanFrontend(p);
    } else if (p.endsWith(".ts") || p.endsWith(".tsx")) {
      filesScanned++;
      const content = readFileSync(p, "utf-8");
      
      // Look for resource: "something" or resource: `something`
      const resourceMatches = content.matchAll(/resource:\s*["'`]([^"'`]+)["'`]/g);
      for (const m of resourceMatches) {
        const resource = m[1];
        const endpoint = RESOURCE_MAP[resource] || resource;
        if (!isValidRoute(endpoint)) {
          console.log(`❌ Invalid resource mapping in ${p} line ${getLineNum(content, m.index)}: resource "${resource}" -> endpoint "${endpoint}"`);
          brokenLinks++;
        }
      }

      // Look for url: "something" or url: `something`
      const urlMatches = content.matchAll(/url:\s*["'`]([^"'`]+)["'`]/g);
      for (const m of urlMatches) {
        let url = m[1];
        // naive template literal evaluation for [id] parameters (just replace ${...} with a mock id)
        url = url.replace(/\$\{[^}]+\}/g, "12345"); 
        if (url.startsWith("http")) continue; // external
        if (!isValidRoute(url)) {
          console.log(`❌ Invalid URL usage in ${p} line ${getLineNum(content, m.index)}: url "${m[1]}"`);
          brokenLinks++;
        }
      }
    }
  }
}

function getLineNum(content, index) {
  return content.substring(0, index).split('\n').length;
}

for (const dir of SRC_DIRS) scanFrontend(dir);

console.log(`\nScan complete. Scanned ${filesScanned} files.`);
console.log(`Found ${brokenLinks} broken API references.`);
if (brokenLinks > 0) process.exit(1);
