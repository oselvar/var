package com.oselvar.var;

/**
 * Implemented by a step-definition class to register its steps. The runner discovers the
 * class (by convention or configuration, resolved in a later task), instantiates it, and
 * calls {@link #defineSteps} with a fresh {@link Registrar} — mirroring the JUnit 5
 * {@code Extension} / Cucumber-JVM glue-class idiom rather than static-init side effects.
 */
public interface StepDefinitions {

    /** Register this file's {@code context}/{@code action}/{@code sensor} steps. */
    void defineSteps(Registrar registrar);
}
