/**
 * Shared imperative shell for var test-runner adapters: config, spec discovery,
 * step loading, run orchestration, and failure rendering. The only place besides
 * an adapter (e.g. var-junit) that touches the filesystem/classpath. Deliberately
 * free of any JUnit-Platform dependency so it can be reused by future adapters.
 */
package com.oselvar.var.runner;
