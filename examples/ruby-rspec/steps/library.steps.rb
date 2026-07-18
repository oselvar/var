# frozen_string_literal: true

require 'date'
require 'varar'
require_relative '../lib/library'

# June 6, 2026 → Date; and the inverse (no day-padding flags — not portable).
to_date = ->(raw) { Date.strptime(raw, '%B %d, %Y') }
format_date = ->(d) { "#{d.strftime('%B')} #{d.day}, #{d.year}" }

# £2.50 and 50p, both as GBP Money.
to_money = ->(raw) { raw.end_with?('p') ? Library.gbp(raw[0...-1].to_f / 100) : Library.gbp(raw[1..].to_f) }
# The inverse: mismatches render as £2.60 / 50p, not as a Money dump.
format_money = ->(m) { m.value < 1 ? "#{(m.value * 100).round}p" : format('£%.2f', m.value) }

steps(loans: [], fee: Library.gbp(0), granted: false) do
  param('date', '[A-Z][a-z]+ \d{1,2}, \d{4}', parse: to_date, format: format_date)
  # The amount is cucumber-expressions' float regexp, minus scientific notation.
  param('money', '£(?=.*\d.*)[-+]?\d*(?:\.(?=\d.*))?\d*|\d+p', parse: to_money, format: format_money)
  # The emphasised run IS the parameter: the markers live in the pattern, parse
  # strips them, format restores them. Markup is notation, like £2.50.
  param('title', '\*[^*]+\*', parse: ->(raw) { raw[1...-1] }, format: ->(t) { "*#{t}*" })

  stimulus('borrowed {title}, due back on {date}') do |state, title, due|
    { loans: state[:loans] + [{ title: title, due: due }] }
  end

  stimulus('returns it on {date}') do |state, returned_on|
    fee = state[:loans].reduce(Library.gbp(0)) do |acc, loan|
      Library.add_money(acc, Library.late_fee(loan, returned_on))
    end
    { fee: fee }
  end

  sensor('owes a {money} late fee') { |state, _expected| state[:fee] }

  sensor('{money} for each day overdue') { |_state, _expected| Library::FEE_PER_DAY }

  stimulus('asks to borrow {title} on {date}') do |state, _title, on|
    { granted: Library.may_borrow(state[:loans], on) }
  end

  sensor('the library refuses') { |state| raise 'expected the library to refuse' if state[:granted] }

  sensor('the library agrees') { |state| raise 'expected the library to agree' unless state[:granted] }
end
