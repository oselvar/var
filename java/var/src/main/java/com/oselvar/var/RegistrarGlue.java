package com.oselvar.var;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a registration-forwarding ("glue") class whose stack frames {@link
 * RegistryRegistrar} must skip when capturing a step's author-side source
 * location. Without this, a facade layered over {@link Registrar} (e.g.
 * var-kotlin's {@code StepsScope}) would be recorded as every step's {@code
 * expressionSourceFile} instead of the author's own step file. Applies to the
 * annotated class and its nested/anonymous classes.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface RegistrarGlue {}
