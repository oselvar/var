Feature: Library member borrows a book

  Scenario: An available book is borrowed and a receipt comes back
    Given the library has these books:
      | title  | author      |
      | Lolita | Nabokov     |
      | 1984   | Orwell      |
    When the member borrows "Lolita"
    Then the receipt is:
      """json
      {"ok": true, "due": "2026-06-19"}
      """
