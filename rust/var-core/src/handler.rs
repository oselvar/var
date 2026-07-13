//! Step handlers — the Rust replacement for Java's reflective arity-matched SAM
//! invocation (`Execute.invokeHandler`/`samMethod`). A handler is a boxed closure
//! over `(state, args)`; arity is validated at the constructor. `StepReturn`
//! carries the sync-or-`Future` channel (the analog of "an `Object` that might be
//! a `CompletableFuture`").

use crate::error::HandlerError;
use crate::value::Value;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;

/// A handler's resolved return: `Ok(None)` = "no assertion" (Java `null`),
/// `Ok(Some(v))` = a value, `Err(_)` = an author-signalled failure (Java `throw`).
pub type HandlerReturn = Result<Option<Value>, HandlerError>;

/// The sync-or-async return channel.
pub enum StepReturn {
    Ready(HandlerReturn),
    Pending(Pin<Box<dyn Future<Output = HandlerReturn>>>),
}

/// A registered step handler: a closure over `(state, args_after_state)`.
#[derive(Clone)]
pub struct Handler {
    f: Rc<dyn Fn(Value, Vec<Value>) -> StepReturn>,
}

impl Handler {
    /// A no-op handler (arity-agnostic) — used where a handler is never invoked.
    pub fn noop() -> Handler {
        Handler {
            f: Rc::new(|_state, _args| StepReturn::Ready(Ok(None))),
        }
    }

    /// A synchronous 0-argument handler `(state)`.
    pub fn sync0(f: impl Fn(Value) -> HandlerReturn + 'static) -> Handler {
        Handler {
            f: Rc::new(move |state, args| {
                if !args.is_empty() {
                    return StepReturn::Ready(Err(HandlerError::new(
                        "no handler with 0 parameter(s)",
                    )));
                }
                StepReturn::Ready(f(state))
            }),
        }
    }

    /// A synchronous 1-argument handler `(state, a)`.
    pub fn sync1(f: impl Fn(Value, Value) -> HandlerReturn + 'static) -> Handler {
        Handler {
            f: Rc::new(move |state, args| {
                if args.len() != 1 {
                    return StepReturn::Ready(Err(HandlerError::new(
                        "no handler with 1 parameter(s)",
                    )));
                }
                let mut it = args.into_iter();
                let a = it.next().unwrap();
                StepReturn::Ready(f(state, a))
            }),
        }
    }

    /// A synchronous 2-argument handler `(state, a, b)`.
    pub fn sync2(f: impl Fn(Value, Value, Value) -> HandlerReturn + 'static) -> Handler {
        Handler {
            f: Rc::new(move |state, args| {
                if args.len() != 2 {
                    return StepReturn::Ready(Err(HandlerError::new(
                        "no handler with 2 parameter(s)",
                    )));
                }
                let mut it = args.into_iter();
                let a = it.next().unwrap();
                let b = it.next().unwrap();
                StepReturn::Ready(f(state, a, b))
            }),
        }
    }

    /// An asynchronous 0-argument handler returning a `Future`.
    pub fn async0(
        f: impl Fn(Value) -> Pin<Box<dyn Future<Output = HandlerReturn>>> + 'static,
    ) -> Handler {
        Handler {
            f: Rc::new(move |state, args| {
                if !args.is_empty() {
                    return StepReturn::Ready(Err(HandlerError::new(
                        "no handler with 0 parameter(s)",
                    )));
                }
                StepReturn::Pending(f(state))
            }),
        }
    }

    /// A synchronous handler of any arity: `(state, args)` where `args` holds
    /// every capture plus the trailing table/doc string, in slot order. The
    /// general escape hatch matching Java's reflective any-arity invocation and
    /// Python's `*args` — use it for steps with three or more slots, where the
    /// fixed-arity conveniences above stop.
    pub fn sync_var(f: impl Fn(Value, Vec<Value>) -> HandlerReturn + 'static) -> Handler {
        Handler {
            f: Rc::new(move |state, args| StepReturn::Ready(f(state, args))),
        }
    }

    /// As [`Handler::sync_var`], returning a `Future` — the any-arity async form
    /// (an async handler with parameters is inexpressible via [`Handler::async0`]).
    pub fn async_var(
        f: impl Fn(Value, Vec<Value>) -> Pin<Box<dyn Future<Output = HandlerReturn>>> + 'static,
    ) -> Handler {
        Handler {
            f: Rc::new(move |state, args| StepReturn::Pending(f(state, args))),
        }
    }

    /// Invokes the handler with `state` + `args` (captures then trailing attachment).
    pub(crate) fn call(&self, state: Value, args: Vec<Value>) -> StepReturn {
        (self.f)(state, args)
    }
}
