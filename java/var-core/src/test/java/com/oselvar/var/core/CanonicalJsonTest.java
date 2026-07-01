package com.oselvar.var.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port (concept only — no library) of {@code var-core/tests/canonical-json.test.ts}. */
class CanonicalJsonTest {

    @Test
    void sortsKeysIndentsAndTrailingNewline() {
        var value = Map.of("b", 1, "a", List.of(2, Map.of("d", 4, "c", 3)));
        assertEquals(
                "{\n  \"a\": [\n    2,\n    {\n      \"c\": 3,\n      \"d\": 4\n    }\n  ],\n  \"b\": 1\n}\n",
                CanonicalJson.canonicalStringify(value));
    }

    @Test
    void nonAsciiIsEmittedRaw() {
        var value = Map.of("x", "café 😀");
        assertEquals("{\n  \"x\": \"café 😀\"\n}\n", CanonicalJson.canonicalStringify(value));
    }

    @Test
    void emptyContainersRenderOnOneLine() {
        var value = Map.of("a", List.of(), "b", Map.of());
        assertEquals("{\n  \"a\": [],\n  \"b\": {}\n}\n", CanonicalJson.canonicalStringify(value));
    }

    @Test
    void sortsKeysRegardlessOfInputMapIterationOrder() {
        // Map.of's iteration order is unspecified — build two maps with keys inserted in
        // opposite order and assert both produce the same, key-sorted output.
        var value1 = new java.util.LinkedHashMap<String, Object>();
        value1.put("z", 1);
        value1.put("a", 2);
        value1.put("m", 3);

        var value2 = new java.util.LinkedHashMap<String, Object>();
        value2.put("m", 3);
        value2.put("a", 2);
        value2.put("z", 1);

        String expected = "{\n  \"a\": 2,\n  \"m\": 3,\n  \"z\": 1\n}\n";
        assertEquals(expected, CanonicalJson.canonicalStringify(value1));
        assertEquals(expected, CanonicalJson.canonicalStringify(value2));
    }

    @Test
    void escapesQuotesBackslashesAndControlCharacters() {
        var value = Map.of("s", "a\"b\\c\nd\te");
        assertEquals(
                "{\n  \"s\": \"a\\\"b\\\\c\\nd\\te\"\n}\n", CanonicalJson.canonicalStringify(value));
    }

    @Test
    void serializesNumbersBooleansAndNull() {
        var value = new java.util.LinkedHashMap<String, Object>();
        value.put("int", 1);
        value.put("long", 2L);
        value.put("double", 1.5);
        value.put("bool", true);
        value.put("nul", null);
        assertEquals(
                "{\n  \"bool\": true,\n  \"double\": 1.5,\n  \"int\": 1,\n  \"long\": 2,\n  \"nul\": null\n}\n",
                CanonicalJson.canonicalStringify(value));
    }

    @Test
    void serializesNestedArraysOfObjects() {
        var value = List.of(Map.of("b", 1), Map.of("a", 2));
        assertEquals(
                "[\n  {\n    \"b\": 1\n  },\n  {\n    \"a\": 2\n  }\n]\n",
                CanonicalJson.canonicalStringify(value));
    }

    @Test
    void topLevelScalarSerializesWithoutIndentButWithTrailingNewline() {
        assertEquals("\"hello\"\n", CanonicalJson.canonicalStringify("hello"));
        assertEquals("42\n", CanonicalJson.canonicalStringify(42));
        assertEquals("null\n", CanonicalJson.canonicalStringify(null));
    }
}
