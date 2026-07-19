// Package varcore is the pure functional core of var, ported from the Rust
// crate `varar-core` (itself a port of the TypeScript reference): parse → match
// → plan → execute, diffs, drift/hash, canonical JSON, and the conformance
// projections. It has no filesystem, network, time, or test-framework
// dependencies.
package varcore

import (
	"strings"
	"unicode"
)

// UTF-16 offset helpers — the conversion layer Go needs and Java did not. All
// spans/offsets in the shared conformance goldens are UTF-16 code-unit offsets
// (JS/Java strings are UTF-16 natively); Go strings are UTF-8, so byte offsets
// from strings.Index / the regexp package must be converted to UTF-16 at every
// span-production site. Byte offsets exist only as transient locals; every
// stored offset is UTF-16.

// utf16RuneLen is the UTF-16 code-unit width of r (1 for BMP, 2 for astral).
func utf16RuneLen(r rune) int {
	if r > 0xFFFF {
		return 2
	}
	return 1
}

// utf16Len is the UTF-16 code-unit length of s (JS String.length).
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += utf16RuneLen(r)
	}
	return n
}

// utf16Index converts a byte index within s to a UTF-16 code-unit offset.
// byteIdx must fall on a rune boundary.
func utf16Index(s string, byteIdx int) int {
	return utf16Len(s[:byteIdx])
}

// byteIndex converts a UTF-16 code-unit offset within s to a byte index. Clamps
// to len(s) when u16Idx runs past the end (mirrors JS String.slice).
func byteIndex(s string, u16Idx int) int {
	u16 := 0
	for i, r := range s {
		if u16 >= u16Idx {
			return i
		}
		u16 += utf16RuneLen(r)
	}
	return len(s)
}

// utf16Slice is JS s.substring(startU16, endU16) with UTF-16 indices.
func utf16Slice(s string, startU16, endU16 int) string {
	return s[byteIndex(s, startU16):byteIndex(s, endU16)]
}

// javaTrim is Java String.trim(): strips leading/trailing chars <= U+0020.
func javaTrim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return r <= 0x20 })
}

// javaStrip is Java String.strip(): strips leading/trailing isJavaWhitespace.
func javaStrip(s string) string {
	return strings.TrimFunc(s, isJavaWhitespace)
}

// javaStripLeading is Java String.stripLeading().
func javaStripLeading(s string) string {
	return strings.TrimLeftFunc(s, isJavaWhitespace)
}

// isJavaWhitespace mirrors Java Character.isWhitespace: Unicode White_Space
// excluding the no-break spaces U+00A0/U+2007/U+202F, plus U+001C–U+001F.
func isJavaWhitespace(r rune) bool {
	switch r {
	case 0x00A0, 0x2007, 0x202F:
		return false
	}
	if r >= 0x001C && r <= 0x001F {
		return true
	}
	return unicode.IsSpace(r)
}
