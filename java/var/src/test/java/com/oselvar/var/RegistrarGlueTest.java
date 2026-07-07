package com.oselvar.var;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.oselvar.var.core.Registry;
import org.junit.jupiter.api.Test;

class RegistrarGlueTest {

    @Test
    void framesOfRegistrarGlueAnnotatedClassesAreSkipped() {
        RegistryRegistrar registrar = new RegistryRegistrar();
        StateBinder<GlueForwarder.Ctx> binder = registrar.steps(GlueForwarder.Ctx::new);

        GlueForwarder.forwardAction(binder, "I do a forwarded thing");

        Registry.StepRegistration step = registrar.registry().steps().get(0);
        // The registration must be attributed to THIS test (the glue's caller),
        // not to GlueForwarder.java.
        assertEquals("RegistrarGlueTest.java", step.expressionSourceFile());
    }
}
