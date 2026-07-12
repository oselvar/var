//! Yahtzee scoring (the `yahtzee.md` domain).
//!
//! A straight port of `examples/python-pytest/src/yahtzee_example` — `score`
//! takes the five dice and a category and returns the box's score.

use std::collections::HashMap;

pub fn score(dice: &[i64], category: &str) -> i64 {
    let mut counts: HashMap<i64, i64> = HashMap::new();
    for &d in dice {
        *counts.entry(d).or_insert(0) += 1;
    }
    let total: i64 = dice.iter().sum();

    let sum_of = |face: i64| counts.get(&face).copied().unwrap_or(0) * face;

    // n-of-a-kind: the highest face appearing at least n times, scored n*face.
    let of_a_kind = |n: i64| {
        counts
            .iter()
            .filter(|&(_, &c)| c >= n)
            .map(|(&face, _)| face)
            .max()
            .map_or(0, |face| n * face)
    };

    let mut sorted = dice.to_vec();
    sorted.sort_unstable();
    let sorted_dice: String = sorted.iter().map(|d| d.to_string()).collect();

    match category {
        "ones" => sum_of(1),
        "twos" => sum_of(2),
        "threes" => sum_of(3),
        "fours" => sum_of(4),
        "fives" => sum_of(5),
        "sixes" => sum_of(6),
        "pair" => of_a_kind(2),
        "two pairs" => {
            let pairs: Vec<i64> = counts
                .iter()
                .filter(|&(_, &c)| c >= 2)
                .map(|(&face, _)| face)
                .collect();
            if pairs.len() >= 2 {
                pairs.iter().map(|face| 2 * face).sum()
            } else {
                0
            }
        }
        "three of a kind" => of_a_kind(3),
        "four of a kind" => of_a_kind(4),
        "small straight" => {
            if sorted_dice == "12345" {
                15
            } else {
                0
            }
        }
        "large straight" => {
            if sorted_dice == "23456" {
                20
            } else {
                0
            }
        }
        "full house" => {
            let mut cs: Vec<i64> = counts.values().copied().collect();
            cs.sort_unstable();
            if counts.len() == 2 && cs == [2, 3] {
                total
            } else {
                0
            }
        }
        "Yahtzee" => {
            if counts.len() == 1 {
                50
            } else {
                0
            }
        }
        "chance" => total,
        other => panic!("Unknown category: {other}"),
    }
}
