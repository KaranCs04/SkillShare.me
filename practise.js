// Input: patterns = ["a","abc","bc","d"], word = "abc"
// Output: 3
// Explanation:
// - "a" appears as a substring in "abc".
// - "abc" appears as a substring in "abc".
// - "bc" appears as a substring in "abc".
// - "d" does not appear as a substring in "abc".
// 3 of the strings in patterns appear as a substring in word.


let patterns = ["a", "b", "c"];
let word = "aaaaabbbbb";
let count = 0;

for (let charac of patterns) {
    console.log(charac);

    if (word.includes(charac)) {
        count++;
    }
}

console.log(count);