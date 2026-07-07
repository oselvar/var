# frozen_string_literal: true

module Oselvar
  module Var
    module Core
      # One checked column of one header-bound row: the input the comparison
      # needs (the cell text and its source span). Port of cell-diff.ts's
      # RowCheck. (The diff verdicts CellDiff/CellMismatchError are added in the
      # trace stage.)
      RowCheck = Data.define(:column, :value, :span)
    end
  end
end
