import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const nextAppConfig = [...nextCoreWebVitals, ...nextTypescript];

export default nextAppConfig;
