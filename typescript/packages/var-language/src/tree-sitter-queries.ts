// Capture names follow cucumber/language-service's convention
// (@root/@function-name/@expression/@name) rather than inventing new ones.
//
// The leading `.` before `(string)` matters: without it, this query matches
// a string literal at *any* argument position (e.g. wrongly treating 'text'
// in `action(someVar, 'text', handler)` as the expression). Verified
// empirically. The current TS-compiler scanner only ever looks at
// arguments[0], so this anchors the same way.
export const STEP_DEFINITION_QUERY = `
(call_expression
  function: (identifier) @function-name
  arguments: (arguments
    .
    (string) @expression
    .
    (_)? @handler
  )
  (#match? @function-name "^(context|action|sensor)$")
) @root
`

// Var has no raw-regexp step definitions, so unlike cucumber/language-service
// this has no (regex)/(template_string) branch on @expression above. This
// query's own (regex) alternative below is unrelated: it's for a parameter
// type's *own* regexp property (e.g. `{ airport: { regexp: /[A-Z]{3}/ } }`),
// which is a real regexp regardless of the step-definition rule.
export const PARAMETER_TYPE_QUERY = `
(call_expression
  function: (identifier) @function-name
  arguments: (arguments
    .
    (_)
    .
    (object
      (pair
        key: (property_identifier) @name
        value: (object
          (pair
            key: (property_identifier) @regexp-key
            value: [(regex) (string)] @regexp-value
          )
        )
      )
    )
  )
  (#eq? @function-name "defineState")
  (#eq? @regexp-key "regexp")
) @root
`
