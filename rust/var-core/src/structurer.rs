//! Groups the flat scanner output into [`Example`]s, tracking a heading scope
//! stack — port of `structurer.ts` / `Structurer.java`.

use crate::ast::{Block, Example, TableOrFence, VarDoc};
use crate::offsets::utf16_slice;
use crate::span::Span;
use regex::Regex;
use std::sync::LazyLock;

static BLANK_LINE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n\s*\n").unwrap());

/// Groups `blocks` (scanned from `source`) into a [`VarDoc`].
pub fn structure(path: &str, source: &str, blocks: Vec<Block>) -> VarDoc {
    let mut examples: Vec<Example> = Vec::new();
    let mut orphan_attachments: Vec<TableOrFence> = Vec::new();
    let mut scope_stack: Vec<(usize, String)> = Vec::new();
    let mut last_example_idx: Option<usize> = None;
    let mut attachment_open = false;

    for block in blocks {
        match &block {
            Block::Heading(heading) => {
                // Pop deeper-or-equal-level entries before pushing the new heading.
                while scope_stack.last().is_some_and(|e| e.0 >= heading.level) {
                    scope_stack.pop();
                }
                scope_stack.push((heading.level, heading.text.clone()));
                attachment_open = false;
            }
            Block::Paragraph(_) | Block::ListItem(_) | Block::Blockquote(_) => {
                let block_span = block.span();
                // Merge when the previous example's last block is an attachment and
                // there's no blank line in the source between them.
                let do_merge = attachment_open
                    && last_example_idx.is_some_and(|idx| {
                        matches!(
                            examples[idx].body.last(),
                            Some(Block::Table(_)) | Some(Block::Fence(_))
                        ) && !BLANK_LINE_RE.is_match(utf16_slice(
                            source,
                            examples[idx].span.end_offset,
                            block_span.start_offset,
                        ))
                    });
                if do_merge {
                    let idx = last_example_idx.unwrap();
                    examples[idx].span = Span::from_offsets(
                        source,
                        examples[idx].span.start_offset,
                        block_span.end_offset,
                    );
                    examples[idx].body.push(block);
                } else {
                    examples.push(Example {
                        scope_stack: scope_texts(&scope_stack),
                        span: block_span,
                        body: vec![block],
                    });
                    last_example_idx = Some(examples.len() - 1);
                    attachment_open = true;
                }
            }
            Block::Table(_) | Block::Fence(_) => {
                let target = if attachment_open {
                    last_example_idx
                } else {
                    None
                };
                if let Some(idx) = target {
                    let block_span = block.span();
                    examples[idx].span = Span::from_offsets(
                        source,
                        examples[idx].span.start_offset,
                        block_span.end_offset,
                    );
                    examples[idx].body.push(block);
                } else {
                    orphan_attachments.push(match block {
                        Block::Table(t) => TableOrFence::Table(t),
                        Block::Fence(f) => TableOrFence::Fence(f),
                        _ => unreachable!(),
                    });
                }
            }
            Block::ThematicBreak(_) => {
                attachment_open = false;
            }
        }
    }

    VarDoc {
        path: path.to_string(),
        source: source.to_string(),
        examples,
        orphan_attachments,
    }
}

fn scope_texts(scope_stack: &[(usize, String)]) -> Vec<String> {
    scope_stack.iter().map(|e| e.1.clone()).collect()
}
