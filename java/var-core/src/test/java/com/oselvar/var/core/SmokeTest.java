package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/** Proves the var-core module compiles and its Jupiter test suite runs. */
class SmokeTest {

    @Test
    void moduleIsImportableAndTestable() {
        assertEquals(2, 1 + 1);
    }
}
