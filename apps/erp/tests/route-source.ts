import path from "node:path";

// Every /api route is a plain handler in apps/api (backend separation, phase 4);
// apps/erp holds no route files. A source check reads the handler where it lives.
export const API_ROUTES = path.resolve(__dirname, "../../api/src/routes");
