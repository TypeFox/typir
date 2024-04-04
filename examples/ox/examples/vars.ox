var x: number = 12;
var y: number = 32.32;
var z: boolean = true;
var w: number = 0;
var a: boolean = false;

fun returnSum(a: number, b: number): number {
    print a;
    return a + b;
}

var xx: number = returnSum(2, 3);
print xx;