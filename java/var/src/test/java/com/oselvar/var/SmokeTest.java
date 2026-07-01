package com.oselvar.var;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Proves the var module compiles, depends on var-core, and its Jupiter test suite runs. */
class SmokeTest {

    @Test
    void moduleIsImportableAndTestable() {
        assertEquals(2, 1 + 1);
    }
}
