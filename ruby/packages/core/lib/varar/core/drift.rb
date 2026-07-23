# frozen_string_literal: true

require 'json'
require 'varar/core/hash'
require 'varar/core/diagnostics'
require 'varar/core/plan'
require 'varar/core/canonical_json'

module Varar
  module Core
    # One example-producing paragraph, as recorded in the baseline.
    BaselineExample = Data.define(:name, :line)
    # The committed baseline for one spec file.
    SpecBaseline = Data.define(:source_hash, :examples)
    # The whole varar.lock.json: every spec keyed by its POSIX path.
    VarLock = Data.define(:version, :specs)
    # A paragraph the baseline says was an example and now matches no step.
    Drift = Data.define(:name, :line, :span)

    # Spec drift detection: a paragraph the committed varar.lock.json baseline
    # recorded as an example that now matches no step. Pure, byte-identical to
    # the TS port so varar.lock.json is shared across languages. Port of drift.ts.
    #
    # BaselineStore is a duck-typed port: #read -> String|nil, #write(contents).
    module Drifts
      # A paragraph may be moved anywhere and reworded up to ~half its words
      # and still be recognized; edit it past this and it reads as remove+add,
      # not drift. Ported byte-identically.
      SIMILARITY_THRESHOLD = 0.5
      TOKEN_RE = /[[:alnum:]]+/

      module_function

      # Do the two spans overlap at all (offset ranges intersect)? A candidate
      # paragraph relates to its planned example either way round: a header-bound
      # row sits inside its binding paragraph, while a merged example's span
      # covers each candidate it absorbed (ADR 0012). Overlap catches both.
      def overlaps?(span_a, span_b)
        span_a.start_offset < span_b.end_offset && span_b.start_offset < span_a.end_offset
      end

      # A candidate is "live" (still an example) if it overlaps at least one
      # planned example. A now-prose paragraph — one whose step def was renamed
      # or deleted — overlaps none (it became a delimiter, splitting any example
      # it was part of), so drift catches it.
      def live?(candidate_span, plan)
        plan.examples.any? { |pe| overlaps?(pe.span, candidate_span) }
      end

      # Lower-cased word tokens (letters/digits) — the unit of similarity.
      def tokenize(text)
        text.downcase.scan(TOKEN_RE).to_set
      end

      # Jaccard overlap |A∩B| / |A∪B|. 1 identical, 0 disjoint; two empty = 1.
      def similarity(set_a, set_b)
        return 1.0 if set_a.empty? && set_b.empty?

        intersection = (set_a & set_b).size
        union = set_a.size + set_b.size - intersection
        union.zero? ? 0.0 : intersection.to_f / union
      end

      # The current example-producing paragraphs, in document order.
      def live_examples(var_doc, plan)
        var_doc.examples.filter_map do |candidate|
          next unless live?(candidate.span, plan)

          BaselineExample.new(name: Plan.derive_example_name(candidate.body), line: candidate.span.start_line)
        end
      end

      def derive_spec_baseline(source, var_doc, plan)
        SpecBaseline.new(source_hash: Hash32.hash_source(source), examples: live_examples(var_doc, plan))
      end

      # Paragraphs the baseline recorded as examples that now match zero steps.
      # Each re-identified by the most word-similar current paragraph at/above
      # the threshold (exact name scores 1; ties break toward the nearest line).
      def detect_drift(baseline, var_doc, plan)
        return [] if baseline.nil?

        candidates = var_doc.examples
        tokens = candidates.map { |c| tokenize(Plan.derive_example_name(c.body)) }
        live = candidates.map { |c| live?(c.span, plan) }

        baseline.examples.filter_map do |b|
          b_tokens = tokenize(b.name)
          best_idx = -1
          best_score = 0.0
          candidates.each_with_index do |candidate, i|
            score = similarity(b_tokens, tokens[i])
            next if score < SIMILARITY_THRESHOLD

            line = candidate.span.start_line
            best_line = best_idx >= 0 ? candidates[best_idx].span.start_line : 0
            next unless best_idx.negative? || score > best_score ||
                        (score == best_score && (line - b.line).abs < (best_line - b.line).abs)

            best_idx = i
            best_score = score
          end
          next if best_idx.negative?
          next if live[best_idx]

          Drift.new(name: b.name, line: candidates[best_idx].span.start_line, span: candidates[best_idx].span)
        end
      end

      def drift_diagnostics(drifts)
        drifts.map { |d| Diagnostics.drift_detected(d.name, d.span) }
      end

      # One spec's baseline reconciliation against a BaselineStore. In update
      # mode, accept all drift (re-record, report nothing); otherwise detect
      # drift and rewrite the baseline only on a clean run, so an unacknowledged
      # drift keeps its old entry (and stays red).
      def reconcile_drift(store, spec_path, source, var_doc, plan, update: false)
        text = store.read
        lock = text ? parse_var_lock(text) : nil
        baseline = lock ? lock.specs[spec_path] : nil
        drifts = update ? [] : detect_drift(baseline, var_doc, plan)
        if update || drifts.empty?
          specs = lock ? lock.specs.dup : {}
          specs[spec_path] = derive_spec_baseline(source, var_doc, plan)
          store.write(stringify_var_lock(VarLock.new(version: 1, specs: specs)))
        end
        drifts
      end

      def parse_var_lock(text)
        parsed = JSON.parse(text)
        return nil unless parsed.is_a?(::Hash) && parsed['version'] == 1

        specs_raw = parsed['specs']
        return nil unless specs_raw.is_a?(::Hash)

        specs = {}
        specs_raw.each do |path, value|
          baseline = parse_spec_baseline(value)
          return nil if baseline.nil?

          specs[path] = baseline
        end
        VarLock.new(version: 1, specs: specs)
      rescue JSON::ParserError, TypeError
        nil
      end

      def parse_spec_baseline(value)
        return nil unless value.is_a?(::Hash)

        source_hash = value['sourceHash']
        examples_raw = value['examples']
        return nil unless source_hash.is_a?(String) && examples_raw.is_a?(Array)

        examples = []
        examples_raw.each do |item|
          parsed = parse_baseline_example(item)
          return nil if parsed.nil?

          examples << parsed
        end
        SpecBaseline.new(source_hash: source_hash, examples: examples)
      end

      def parse_baseline_example(value)
        return nil unless value.is_a?(::Hash)

        name = value['name']
        line = value['line']
        return nil unless name.is_a?(String) && line.is_a?(Integer)

        BaselineExample.new(name: name, line: line)
      end

      # Serialize varar.lock.json deterministically: spec paths sorted, examples
      # in document order, insertion-order keys otherwise (version, specs;
      # sourceHash, examples; name, line) — NOT canonical JSON's key sort.
      def stringify_var_lock(lock)
        specs = {}
        lock.specs.keys.sort.each do |path|
          baseline = lock.specs[path]
          specs[path] = {
            'sourceHash' => baseline.source_hash,
            'examples' => baseline.examples.map { |e| { 'name' => e.name, 'line' => e.line } }
          }
        end
        CanonicalJson.ordered_stringify({ 'version' => 1, 'specs' => specs })
      end
    end
  end
end
