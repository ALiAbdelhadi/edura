const TARGET = "@neondatabase/serverless";
export async function resolve(specifier, context, nextResolve) {
  if (specifier === TARGET) {
    return { url: new URL("./neon-compat.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
