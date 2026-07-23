// Package config is the strict, fail-loud reader for varar.config.json.
//
// Port of @varar/config / var_config / varar-config. The canonical shape is
// { docs: { include, exclude }, steps, snippets }; every key is
// optional and defaults to empty. A missing file yields the empty config;
// malformed JSON, wrong types, or unknown keys fail loudly with the file path.
// Proven by the shared corpus at conformance/config/cases/.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var knownKeys = map[string]bool{"$schema": true, "docs": true, "steps": true, "snippets": true}
var knownDocsKeys = map[string]bool{"include": true, "exclude": true}

// VarConfig is the parsed configuration. All fields default to empty.
type VarConfig struct {
	DocsInclude []string
	DocsExclude []string
	Steps       []string
	Snippets    map[string]string
}

// Default is the empty configuration (all fields empty).
func Default() VarConfig {
	return VarConfig{
		DocsInclude: []string{},
		DocsExclude: []string{},
		Steps:       []string{},
		Snippets:    map[string]string{},
	}
}

// ReadVarConfig reads <root>/varar.config.json. Missing file → empty config. Any
// malformed input → an error beginning with the file path.
func ReadVarConfig(root string) (VarConfig, error) {
	path := filepath.Join(root, "varar.config.json")
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return Default(), nil
	}
	text, err := os.ReadFile(path)
	if err != nil {
		return VarConfig{}, fmt.Errorf("%s: %w", path, err)
	}
	var top any
	if err := json.Unmarshal(text, &top); err != nil {
		return VarConfig{}, fmt.Errorf("%s: invalid JSON: %w", path, err)
	}
	if _, ok := top.(map[string]any); !ok {
		return VarConfig{}, fmt.Errorf("%s: top level must be an object", path)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(text, &obj); err != nil {
		return VarConfig{}, fmt.Errorf("%s: invalid JSON: %w", path, err)
	}

	var unknown []string
	for k := range obj {
		if !knownKeys[k] {
			unknown = append(unknown, k)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return VarConfig{}, fmt.Errorf("%s: unknown key(s): %s", path, strings.Join(unknown, ", "))
	}

	cfg := Default()

	if docsRaw, ok := obj["docs"]; ok && !isNull(docsRaw) {
		var docsTop any
		if err := json.Unmarshal(docsRaw, &docsTop); err != nil {
			return VarConfig{}, fmt.Errorf("%s: invalid JSON: %w", path, err)
		}
		if _, ok := docsTop.(map[string]any); !ok {
			return VarConfig{}, fmt.Errorf("%s: 'docs' must be an object", path)
		}
		var docsObj map[string]json.RawMessage
		_ = json.Unmarshal(docsRaw, &docsObj)
		var unknownDocs []string
		for k := range docsObj {
			if !knownDocsKeys[k] {
				unknownDocs = append(unknownDocs, k)
			}
		}
		if len(unknownDocs) > 0 {
			sort.Strings(unknownDocs)
			return VarConfig{}, fmt.Errorf("%s: unknown docs key(s): %s", path, strings.Join(unknownDocs, ", "))
		}
		if cfg.DocsInclude, err = stringArray(docsObj["include"], "docs.include", path); err != nil {
			return VarConfig{}, err
		}
		if cfg.DocsExclude, err = stringArray(docsObj["exclude"], "docs.exclude", path); err != nil {
			return VarConfig{}, err
		}
	}

	if cfg.Steps, err = stringArray(obj["steps"], "steps", path); err != nil {
		return VarConfig{}, err
	}
	if cfg.Snippets, err = stringMap(obj["snippets"], path); err != nil {
		return VarConfig{}, err
	}
	return cfg, nil
}

func isNull(raw json.RawMessage) bool {
	return raw == nil || strings.TrimSpace(string(raw)) == "null"
}

func stringArray(raw json.RawMessage, key, path string) ([]string, error) {
	if isNull(raw) {
		return []string{}, nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%s: '%s' must be an array of strings", path, key)
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

func stringMap(raw json.RawMessage, path string) (map[string]string, error) {
	if isNull(raw) {
		return map[string]string{}, nil
	}
	var out map[string]string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("%s: 'snippets' must be an object of strings", path)
	}
	if out == nil {
		out = map[string]string{}
	}
	return out, nil
}
