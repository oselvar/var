---
title: Install Vár
description: Install and configure Vár
area: guides
order: 1
---

# Install Vár

The `@oselvar/var` npm package is all you need to get started. 
It doesn't matter if you are installing it into an existing project or starting one from scratch.

Open a terminal and install var:

```terminal
pnpm install -D @oselvar/var
```

Initialize your project:

```terminal
pnpx var init
```

This will create `var.config.ts` and an example test document.

With this in place, we can run our first *oath*:

```
pnpx var run
```

You should see that the oath is *broken*:

```
Expected: 42. Actual: 43 
```

Fix the test. Open `src/var/hello.steps.ts` in your editor and change `43` to `42`.
Run var again:

```
pnpx var run
```

The oath is now *kept*:

```
1 example, 1 passed.
```