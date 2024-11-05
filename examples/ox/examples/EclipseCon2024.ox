// variables: numbers, booleans
var varNumber: number = 23;
var varBoolean: boolean = true;

// Operators
var add: number = 23 + 41;
var multiply: number = 13 * 4;
var negateMe: number = -add;
var less: boolean = add < multiply;
var isTrue: boolean = !false;
var andTrue: boolean = isTrue and !true;

// nesting expressions
var average: number = (add + multiply) / 2;

// Variables
add = 5;

// If branching
if (average < 5) {
    print 23;
    if (multiply < 30 and add > 3) {
        add = add + 15;
    }
}

// Functions
fun inc(a: number): number {
    return a + 1;
}
fun inc(b: boolean): number {
    return b + 1;
}

fun printSum(a: number, b: number): void {
    print inc(4) + inc(inc(b));
}

// print, call functions
// print printSum(3, 2);

// print true;
print 123;
