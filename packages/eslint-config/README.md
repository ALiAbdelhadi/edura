# `@repo/eslint-config`

Collection of internal eslint configurations.

## Why this package pins TypeScript 5.9.3

Every app and package in this repo typechecks with **TypeScript 7** (the native
compiler). This package is the one exception, and the pin is load-bearing:
`typescript-eslint` refuses to load against TS 7 at all —

```
Error: typescript-eslint does not support TS 7.0.
```

— so the linter needs a TypeScript it supports. `typescript` in this package's
`devDependencies` is what the whole ESLint toolchain resolves.

That is also why the three Next apps import `@repo/eslint-config/next-app`
instead of `eslint-config-next` directly: that preset depends on
`typescript-eslint`, whose peer `typescript` resolves from whichever package
imports it. Importing it from an app binds the linter to the app's TypeScript 7
and every lint run dies. Routing it through here binds it to 5.9.3 instead, with
an identical rule set.

Both of these go away when typescript-eslint supports TS >= 7.1
(typescript-eslint#10940): raise this pin, and the apps can import the preset
directly again.
