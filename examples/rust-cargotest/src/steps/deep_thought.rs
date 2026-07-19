use varar::{Steps, Value};

pub fn register(s: &mut Steps) {
    s.sensor("life, the universe and everything is {int}", |_state, _answer| {
        Ok(Some(Value::Int(42)))
    });
}
