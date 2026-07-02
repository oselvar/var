package com.oselvar.var;

/**
 * Test double for a registration-forwarding layer (what var-kotlin's StepsScope
 * is in production): annotated {@link RegistrarGlue}, so {@link RegistryRegistrar}'s
 * StackWalker must skip its frames and attribute the registration to THIS class's
 * caller, not this class.
 */
@RegistrarGlue
final class GlueForwarder {

    private GlueForwarder() {}

    record Ctx() implements State {}

    static void forwardAction(StateBinder<Ctx> binder, String expression) {
        binder.action(expression, (Ctx ctx) -> ctx);
    }
}
