use super::{as_int, as_str, smap};
use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.stimulus("I greet {string}", |state, name| {
        let mut m = smap(&state);
        m.insert("greeting".to_string(), Value::from(format!("Hello, {}!", as_str(&name))));
        Ok(Some(Value::Map(m)))
    });

    s.sensor("the greeting should be {string}", |state, _expected| {
        Ok(smap(&state).get("greeting").cloned())
    });

    s.stimulus("expression `{int}+{int}`", |state, a, b| {
        let mut m = smap(&state);
        m.insert("result".to_string(), Value::Int(as_int(&a) + as_int(&b)));
        Ok(Some(Value::Map(m)))
    });

    s.sensor("evaluate to `{int}`", |state, _expected| Ok(smap(&state).get("result").cloned()));
}
