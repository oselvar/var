require "varar"

# The two Given/And paragraphs each carry a table and are separated from each
# other by a blank line (valid GFM). They must merge into ONE example that
# shares state, so the sensor reads back 1 user and 1 asset. The second example
# — separated by the prose paragraph — starts from a fresh, empty basket and
# reads back 0 and 0, proving the prose paragraph is a delimiter. See ADR 0012.
steps(-> { { users: [], assets: [] } }) do
  stimulus("the following users have been imported") do |state, rows|
    state.merge(users: rows[1..].map { |row| row[0] || "" })
  end

  stimulus("the following assets have been imported") do |state, rows|
    state.merge(assets: rows[1..].map { |row| row[0] || "" })
  end

  sensor("the basket contains {int} user(s) and {int} asset(s)") do |state, _users, _assets|
    [state[:users].length, state[:assets].length]
  end
end
