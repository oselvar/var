//! Groups the flat scanner output into [`Example`]s, tracking a heading scope
//! stack — port of `structurer.ts` / `Structurer.java`.

use crate::ast::{Block, Example, TableOrFence, VarDoc};
use crate::span::Span;

/// Groups `blocks` (scanned from `source`) into a [`VarDoc`].
///
/// This is pure syntax — it does NOT decide where one example ends and the next
/// begins. Instead each candidate records `preceded_by_delimiter` (a heading or
/// `---` sits before it), and the planner groups adjacent matching candidates
/// into examples using that flag plus which candidates match a step. See ADR
/// 0012.
pub fn structure(path: &str, source: &str, blocks: Vec<Block>) -> VarDoc {
    let mut examples: Vec<Example> = Vec::new();
    let mut orphan_attachments: Vec<TableOrFence> = Vec::new();
    let mut scope_stack: Vec<(usize, String)> = Vec::new();
    let mut last_example_idx: Option<usize> = None;
    let mut attachment_open = false;
    // A heading or thematic break seen since the previous candidate — the next
    // candidate is then delimiter-preceded. Starts true so the first candidate in
    // the file counts as delimiter-preceded (nothing to merge into).
    let mut delimiter_pending = true;

    for block in blocks {
        match &block {
            Block::Heading(heading) => {
                // Pop deeper-or-equal-level entries before pushing the new heading.
                while scope_stack.last().is_some_and(|e| e.0 >= heading.level) {
                    scope_stack.pop();
                }
                scope_stack.push((heading.level, heading.text.clone()));
                attachment_open = false;
                delimiter_pending = true;
            }
            Block::Paragraph(_) | Block::ListItem(_) | Block::Blockquote(_) => {
                let block_span = block.span();
                examples.push(Example {
                    scope_stack: scope_texts(&scope_stack),
                    span: block_span,
                    body: vec![block],
                    preceded_by_delimiter: delimiter_pending,
                });
                last_example_idx = Some(examples.len() - 1);
                attachment_open = true;
                delimiter_pending = false;
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
                delimiter_pending = true;
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
